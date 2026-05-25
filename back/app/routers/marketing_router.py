import math
import uuid
from urllib.parse import quote

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from app.core.database import SessionLocal
from app.repositories.marketing_repo import MarketingRepository, undo_store
from app.schemas.marketing_schema import (
    MediaDailyRow,
    MediaSummary,
    ReportResponse,
    RowDiff,
    TaskStatus,
    TaskStatusResponse,
    UploadTaskResponse,
)
from app.services.excel_service import ExcelService
from app.services.excel_reader_service import ExcelReaderService
from app.services.marketing_service import FileEntry, MarketingService

router = APIRouter(prefix="/api/marketing", tags=["Marketing"])

task_store: dict[str, dict] = {}
export_store: dict[str, dict] = {}  # {task_id: {status, progress, data?, filename, error?}}
save_task_store: dict[str, dict] = {}  # {task_id: {status, saved_rows?, deleted_rows?, undo_id?, message?, error?}}


def _safe(v) -> float:
    if v is None:
        return 0.0
    f = float(v)
    return 0.0 if (math.isnan(f) or math.isinf(f)) else f


def _df_to_summary(label: str, df: pd.DataFrame) -> MediaSummary:
    imp = _safe(df["impressions"].sum())
    clk = _safe(df["clicks"].sum())
    cost = _safe(df["cost"].sum())
    return MediaSummary(
        label=label,
        impressions=imp,
        clicks=clk,
        cost=cost,
        ctr=_safe(clk / imp) if imp else 0.0,
        cpc=_safe(cost / clk) if clk else 0.0,
        total_conv=_safe(df["total_conv"].sum()),
        signup=_safe(df["signup"].sum()),
        purchase=_safe(df["purchase"].sum()),
        revenue=_safe(df["revenue"].sum()),
        apply=_safe(df["apply"].sum()) if "apply" in df.columns else 0.0,
        roas=_safe(df["revenue"].sum() / cost) if cost else 0.0,
    )


def _df_to_daily(df: pd.DataFrame) -> list[MediaDailyRow]:
    rows = []
    for _, r in df.iterrows():
        rows.append(MediaDailyRow(
            date=str(r["date"])[:10],
            impressions=_safe(r.get("impressions")),
            clicks=_safe(r.get("clicks")),
            cost=_safe(r.get("cost")),
            ctr=_safe(r.get("ctr")),
            cpc=_safe(r.get("cpc")),
            total_conv=_safe(r.get("total_conv")),
            conv_rate=_safe(r.get("conv_rate")),
            conv_cost=_safe(r.get("conv_cost")),
            signup=_safe(r.get("signup")),
            purchase=_safe(r.get("purchase")),
            revenue=_safe(r.get("revenue")),
            apply=_safe(r.get("apply")),
            roas=_safe(r.get("roas")),
        ))
    return rows


def _enrich_daily_df(daily: pd.DataFrame) -> pd.DataFrame:
    daily = daily.copy()
    imp = daily["impressions"].replace(0, float("nan"))
    clk = daily["clicks"].replace(0, float("nan"))
    tc = daily["total_conv"].replace(0, float("nan"))
    cst = daily["cost"].replace(0, float("nan"))
    for col in ("signup", "purchase", "apply"):
        if col not in daily.columns:
            daily[col] = 0.0
    daily["ctr"] = (daily["clicks"] / imp).fillna(0)
    daily["cpc"] = (daily["cost"] / clk).fillna(0)
    daily["conv_rate"] = (daily["total_conv"] / clk).fillna(0)
    daily["conv_cost"] = (daily["cost"] / tc).fillna(0)
    daily["roas"] = (daily["revenue"] / cst).fillna(0)
    daily["date"] = daily["date"].astype(str).str[:10]
    return daily


def _db_rows_to_media_kpis(rows: list) -> dict[str, pd.DataFrame]:
    if not rows:
        return {}

    records = [
        {
            "date": r.report_date,
            "campaign_type": r.campaign_type,
            "impressions": r.impressions or 0,
            "clicks": r.clicks or 0,
            "cost": float(r.cost or 0),
            "total_conv": r.conversions or 0,
            "revenue": float(r.conversion_revenue or 0),
            "signup": float(getattr(r, "signup", 0) or 0),
            "purchase": float(getattr(r, "purchase", 0) or 0),
            "apply": float(getattr(r, "apply", 0) or 0),
        }
        for r in rows
    ]
    df = pd.DataFrame(records)
    media_kpis: dict[str, pd.DataFrame] = {}
    for label, grp in df.groupby("campaign_type"):
        daily = grp.groupby("date", as_index=False)[
            ["impressions", "clicks", "cost", "total_conv", "revenue", "signup", "purchase", "apply"]
        ].sum()
        media_kpis[label] = _enrich_daily_df(daily)
    return media_kpis


def _period_label(year: int, month: int) -> str:
    return f"{year % 100}년 {month}월"


def _empty_report(period: str) -> ReportResponse:
    empty = MediaSummary(
        label="TOTAL",
        impressions=0,
        clicks=0,
        cost=0,
        ctr=0,
        cpc=0,
        total_conv=0,
        signup=0,
        purchase=0,
        revenue=0,
        apply=0,
        roas=0,
    )
    return ReportResponse(period=period, total=empty, by_media=[], daily={})


def _build_report(
    media_kpis: dict[str, pd.DataFrame],
    period: str,
    diff: dict | None = None,
    undo_id: str = "",
) -> ReportResponse:
    if not media_kpis:
        return _empty_report(period)

    by_media = [_df_to_summary(label, df) for label, df in media_kpis.items()]

    all_df = pd.concat(list(media_kpis.values()), ignore_index=True)
    total_df = all_df.groupby("date", as_index=False).sum(numeric_only=True)
    total = _df_to_summary("TOTAL", total_df)

    daily = {label: _df_to_daily(df) for label, df in media_kpis.items()}

    row_diff = {
        ct: RowDiff(added=v.get("added", []), updated=v.get("updated", []))
        for ct, v in (diff or {}).items()
    }
    return ReportResponse(period=period, total=total, by_media=by_media, daily=daily, diff=row_diff, undo_id=undo_id)


async def _run_analysis(task_id: str, files: list[FileEntry]) -> None:
    db = SessionLocal()
    try:
        task_store[task_id]["status"] = TaskStatus.PROCESSING
        svc = MarketingService(MarketingRepository(db))
        conv_files, media_files = svc._classify(files)
        result = await svc.process_and_analyze(conv_files, media_files)
        task_store[task_id].update({
            "status": TaskStatus.COMPLETED,
            "processed_rows": result["processed_rows"],
            "ai_comment": result["ai_comment"],
        })
    except Exception as exc:
        task_store[task_id].update({
            "status": TaskStatus.FAILED,
            "error": str(exc),
        })
    finally:
        db.close()


def _run_export_task(task_id: str, rows: list, period: str) -> None:
    """동기 함수 → FastAPI BackgroundTasks가 스레드풀에서 실행"""
    try:
        export_store[task_id]["progress"] = 15
        media_kpis = _db_rows_to_media_kpis(rows)
        export_store[task_id]["progress"] = 45
        excel_bytes = ExcelService().fill_template(media_kpis, period)
        filename = f"마케팅분석_{period.replace(' ', '')}.xlsx"
        export_store[task_id].update({
            "status": "done",
            "progress": 100,
            "data": excel_bytes,
            "filename": filename,
        })
    except Exception as exc:
        export_store[task_id].update({
            "status": "error",
            "progress": 0,
            "error": str(exc),
        })


def _run_save_task(task_id: str, df: pd.DataFrame, year: int, month: int, replace: bool) -> None:
    """Excel DataFrame → DB UPSERT 백그라운드 작업.

    delete_rows_by_period(Session) 와 save_mapped_dataframe(_upsert 내부의 engine.begin())이
    서로 다른 커넥션을 사용하므로, 삭제를 먼저 커밋해 락을 해제한 뒤 저장해야 데드락을 피할 수 있다.
    """
    try:
        save_task_store[task_id].update({"status": "processing", "progress": 10})

        # ── 1단계: replace 시 기존 행 삭제 (독립 트랜잭션으로 먼저 커밋) ──────────
        deleted = 0
        if replace:
            db_del = SessionLocal()
            try:
                deleted = MarketingRepository(db_del).delete_rows_by_period(year, month)
                db_del.commit()
            except Exception:
                db_del.rollback()
                raise
            finally:
                db_del.close()

        save_task_store[task_id]["progress"] = 50

        # ── 2단계: 새 데이터 저장 (_upsert 내부에서 engine.begin() 사용) ─────────
        saved, _, undo_id = MarketingRepository(None).save_mapped_dataframe(df)  # type: ignore[arg-type]

        save_task_store[task_id]["progress"] = 90

        if replace:
            msg = f"기존 {deleted}개 행을 삭제하고 {saved}개 행으로 교체했습니다."
        else:
            msg = f"{saved}개 행을 저장했습니다."

        save_task_store[task_id].update({
            "status": "done",
            "progress": 100,
            "saved_rows": saved,
            "deleted_rows": deleted if replace else 0,
            "undo_id": undo_id,
            "message": msg,
        })
    except Exception as exc:
        save_task_store[task_id].update({"status": "error", "progress": 0, "error": str(exc)})


@router.post("/save-excel-task")
async def start_save_excel_task(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    replace: bool = Query(False),
) -> dict:
    """Excel DB 저장을 백그라운드로 시작하고 task_id 반환"""
    content = await file.read()
    try:
        svc = ExcelReaderService()
        report = svc.read_report(content)
        df = svc.to_db_dataframe(report)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if df.empty:
        raise HTTPException(status_code=422, detail="저장할 데이터가 없습니다.")

    df["report_date"] = pd.to_datetime(df["report_date"])
    year = int(df["report_date"].dt.year.iloc[0])
    month = int(df["report_date"].dt.month.iloc[0])

    task_id = str(uuid.uuid4())
    save_task_store[task_id] = {"status": "pending"}
    background_tasks.add_task(_run_save_task, task_id, df, year, month, replace)

    return {"task_id": task_id}


@router.get("/save-excel-task/{task_id}")
async def get_save_excel_task_status(task_id: str) -> dict:
    task = save_task_store.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    return task


@router.post("/export-db-task")
async def start_export_db_task(
    year: int = Query(...),
    month: int = Query(...),
    background_tasks: BackgroundTasks = ...,
) -> dict:
    """DB 데이터 → Excel 변환을 백그라운드로 시작하고 task_id 반환"""
    db = SessionLocal()
    try:
        rows = MarketingRepository(db).get_rows_by_period(year, month)
    finally:
        db.close()

    if not rows:
        raise HTTPException(status_code=404, detail="해당 기간의 데이터가 없습니다.")

    task_id = str(uuid.uuid4())
    period = _period_label(year, month)
    export_store[task_id] = {"status": "pending", "progress": 5}
    background_tasks.add_task(_run_export_task, task_id, rows, period)

    return {"task_id": task_id, "filename": f"마케팅분석_{period.replace(' ', '')}.xlsx"}


@router.get("/export-db-task/{task_id}")
async def get_export_task_status(task_id: str) -> dict:
    """백그라운드 export 진행률 조회"""
    task = export_store.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    return {
        "status": task["status"],
        "progress": task.get("progress", 0),
        "error": task.get("error"),
    }


@router.get("/export-db-result/{task_id}")
async def get_export_task_result(task_id: str) -> StreamingResponse:
    """완료된 export 파일 다운로드 (1회용 — 다운로드 후 메모리에서 제거)"""
    task = export_store.get(task_id)
    if task is None or task.get("status") != "done":
        raise HTTPException(status_code=404, detail="아직 완료되지 않았거나 작업을 찾을 수 없습니다.")

    excel_bytes: bytes = task.pop("data")
    filename = task.get("filename", "마케팅분석.xlsx")

    return StreamingResponse(
        iter([excel_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.get("/export-db")
async def export_db_excel(
    year: int = Query(...),
    month: int = Query(...),
) -> StreamingResponse:
    """DB에 저장된 연월 데이터를 Excel 템플릿으로 내려받기"""
    db = SessionLocal()
    try:
        repo = MarketingRepository(db)
        rows = repo.get_rows_by_period(year, month)
    finally:
        db.close()

    media_kpis = _db_rows_to_media_kpis(rows)
    period = _period_label(year, month)

    if not media_kpis:
        raise HTTPException(status_code=404, detail="해당 기간의 데이터가 없습니다.")

    excel_bytes = ExcelService().fill_template(media_kpis, period)
    filename = f"마케팅분석_{period.replace(' ', '')}.xlsx"
    return StreamingResponse(
        iter([excel_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.get("/periods")
async def get_periods() -> list[dict]:
    """저장된 연월 목록 반환"""
    db = SessionLocal()
    try:
        return MarketingRepository(db).get_available_periods()
    finally:
        db.close()


@router.get("/summary", response_model=ReportResponse)
async def get_summary(
    year: int = Query(...),
    month: int = Query(...),
) -> ReportResponse:
    """특정 연월 DB 데이터를 preview 리포트와 동일한 형태로 반환"""
    db = SessionLocal()
    try:
        repo = MarketingRepository(db)
        rows = repo.get_rows_by_period(year, month)
        report = _build_report(_db_rows_to_media_kpis(rows), _period_label(year, month))
        report_dict = report.model_dump()
        report_dict['comment'] = repo.get_comment(year, month)
        return ReportResponse(**report_dict)
    finally:
        db.close()


@router.post("/upload", response_model=UploadTaskResponse)
async def upload_files(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
) -> UploadTaskResponse:
    file_data: list[FileEntry] = [
        (await f.read(), f.filename or "") for f in files
    ]

    task_id = str(uuid.uuid4())
    task_store[task_id] = {"status": TaskStatus.PENDING}
    background_tasks.add_task(_run_analysis, task_id, file_data)

    return UploadTaskResponse(
        task_id=task_id,
        status=TaskStatus.PENDING,
        message=f"{len(file_data)}개 파일 수신 완료. 백그라운드 분석을 시작합니다.",
    )


@router.get("/status/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(task_id: str) -> TaskStatusResponse:
    task = task_store.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="태스크를 찾을 수 없습니다.")
    return TaskStatusResponse(task_id=task_id, **task)


@router.post("/preview", response_model=ReportResponse)
async def preview_report(
    files: list[UploadFile] = File(...),
) -> ReportResponse:
    """CSV → DB 저장 + KPI 계산 후 JSON 리포트 반환"""
    file_data: list[FileEntry] = [
        (await f.read(), f.filename or "") for f in files
    ]

    db = SessionLocal()
    try:
        svc = MarketingService(MarketingRepository(db))
        conv_files, media_files = svc._classify(file_data)
        result = await svc.process_and_analyze(conv_files, media_files)
    finally:
        db.close()

    return _build_report(result["media_kpis"], result["period"], result.get("diff"), result.get("undo_id", ""))


@router.post("/undo/{undo_id}")
async def undo_upload(undo_id: str) -> dict:
    """CSV 업로드 되돌리기 — 이전 DB 상태로 복원"""
    db = SessionLocal()
    try:
        ok, msg = MarketingRepository(db).restore_undo(undo_id)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        db.close()
    if not ok:
        raise HTTPException(status_code=404, detail=msg)
    return {"message": msg}


@router.post("/load-excel")
async def load_excel(
    file: UploadFile = File(...),
) -> dict:
    """Excel 파일(.xlsx)을 읽어 전체 리포트 데이터 JSON 반환"""
    content = await file.read()
    try:
        return ExcelReaderService().read_report(content)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/save-excel-data")
async def save_excel_data(
    file: UploadFile = File(...),
    replace: bool = Query(False),
) -> dict:
    """Excel 파일 매체 시트 데이터를 DB에 저장.
    replace=true 이면 해당 연월 기존 데이터를 먼저 삭제하고 교체.
    """
    content = await file.read()
    try:
        svc = ExcelReaderService()
        report = svc.read_report(content)
        df = svc.to_db_dataframe(report)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if df.empty:
        raise HTTPException(status_code=422, detail="저장할 데이터가 없습니다.")

    df["report_date"] = pd.to_datetime(df["report_date"])
    year = int(df["report_date"].dt.year.iloc[0])
    month = int(df["report_date"].dt.month.iloc[0])

    deleted = 0
    if replace:
        db_del = SessionLocal()
        try:
            deleted = MarketingRepository(db_del).delete_rows_by_period(year, month)
            db_del.commit()
        except Exception as exc:
            db_del.rollback()
            raise HTTPException(status_code=500, detail=f"기존 데이터 삭제 실패: {exc}")
        finally:
            db_del.close()

    try:
        saved, _, _undo_id = MarketingRepository(None).save_mapped_dataframe(df)  # type: ignore[arg-type]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB 저장 실패: {exc}")

    if replace:
        msg = f"기존 {deleted}개 행을 삭제하고 {saved}개 행으로 교체했습니다."
    else:
        msg = f"{saved}개 행을 저장했습니다."
    return {"saved_rows": saved, "deleted_rows": deleted if replace else 0, "message": msg}


@router.post("/export")
async def export_excel(
    files: list[UploadFile] = File(...),
) -> StreamingResponse:
    """CSV → Excel 템플릿 채운 뒤 다운로드"""
    file_data: list[FileEntry] = [
        (await f.read(), f.filename or "") for f in files
    ]

    db = SessionLocal()
    try:
        svc = MarketingService(MarketingRepository(db))
        conv_files, media_files = svc._classify(file_data)
        media_kpis, period = await svc.process_for_export(conv_files, media_files)
    finally:
        db.close()

    excel_bytes = ExcelService().fill_template(media_kpis, period)

    filename = f"마케팅분석_{period.replace(' ', '')}.xlsx"
    return StreamingResponse(
        iter([excel_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )
