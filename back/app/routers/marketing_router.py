import logging
import math
import re
from urllib.parse import quote

import pandas as pd
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse

from app.core.database import SessionLocal
from app.core.security import get_current_user
from app.core.settings import settings
from app.core.uploads import (
    CSV_EXTENSIONS,
    EXCEL_EXTENSIONS,
    check_content_length,
    read_data_upload,
    read_data_uploads,
)
from app.models.user_model import User
from app.repositories.marketing_repo import MarketingRepository
from app.schemas.marketing_schema import (
    MediaDailyRow,
    MediaSummary,
    ReportResponse,
    RowDiff,
    RowUpsertBody,
    TaskStatus,
    TaskStatusResponse,
    UploadTaskResponse,
)
from app.services import storage_service, task_store
from app.services.analysis_service import AnalysisService
from app.services.comment_service import CommentService
from app.services.excel_service import ExcelService, resolve_period
from app.services.excel_reader_service import ExcelReaderService
from app.services.llm import build_llm
from app.services.mail import MailSendError, build_mail_sender, mail_config_error
from app.services.marketing_service import FileEntry, MarketingService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/marketing",
    tags=["Marketing"],
    dependencies=[Depends(get_current_user)],
)

# 백그라운드 작업 상태는 app.services.task_store를 통해 DB에 저장한다 (kind로 구분).
# 예전에는 모듈 전역 dict였는데, Cloud Run에서 인스턴스가 늘거나 재시작하면
# 폴링이 404를 받거나 진행 중이던 작업이 사라졌다.
_KIND_UPLOAD = "marketing_upload"
_KIND_EXPORT = "marketing_export"
_KIND_SAVE = "marketing_save"

# 엑셀을 메일로 보내는 경로(export-db-task?deliver_by=email)를 막아둔다.
# 다시 열 때 이 값만 False 로 되돌리면 된다 — 프론트 쪽 스위치는
# DbDashboard.tsx 의 EXPORT_EMAIL_UNDER_MAINTENANCE.
# (리포트 메일 /api/report-mail 은 별개이며 영향을 받지 않는다)
EXPORT_EMAIL_UNDER_MAINTENANCE: bool = True


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


def _periods_in_df(df: pd.DataFrame) -> list[tuple[int, int]]:
    """DataFrame에 실제로 담긴 (연, 월) 목록. 한 파일에 5월·6월이 같이 오면 둘 다 나온다."""
    dt = pd.to_datetime(df["report_date"])
    return sorted({(int(y), int(m)) for y, m in zip(dt.dt.year, dt.dt.month)})


def _excel_to_df(content: bytes, periods: list[str] | None) -> tuple[pd.DataFrame, list[str]]:
    """업로드된 엑셀 → DB 저장용 DataFrame + 읽은 기간 목록.

    periods 를 주면 그 기간 시트만, 없으면 파일 안의 모든 기간을 읽는다.
    """
    svc = ExcelReaderService()
    try:
        reports = svc.read_reports(content, periods=periods or None)
        df = svc.reports_to_db_dataframe(reports)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if df.empty:
        raise HTTPException(status_code=422, detail="저장할 데이터가 없습니다.")

    df["report_date"] = pd.to_datetime(df["report_date"])
    return df, [r["period"] for r in reports]


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
        task_store.update_task(task_id, status=TaskStatus.PROCESSING.value)
        svc = MarketingService(MarketingRepository(db))
        conv_files, media_files = svc._classify(files)
        result = await svc.process_and_analyze(conv_files, media_files)
        task_store.update_task(
            task_id,
            status=TaskStatus.COMPLETED.value,
            progress=100,
            result_patch={
                "processed_rows": result["processed_rows"],
                "ai_comment": result["ai_comment"],
            },
        )
    except Exception as exc:
        task_store.update_task(task_id, status=TaskStatus.FAILED.value, error=str(exc))
    finally:
        db.close()


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MAX_RECIPIENTS = 10


def _clean_recipients(raw: list[str] | None, fallback: str) -> list[str]:
    """쉼표로 붙여 보내든 반복 파라미터로 보내든 받아 정리한다.

    빈 목록이면 로그인한 사용자 본인에게 보낸다(기존 동작).
    """
    parts: list[str] = []
    for item in raw or []:
        parts.extend(p.strip() for p in item.split(","))

    seen: list[str] = []
    for addr in parts:
        if addr and addr not in seen:
            seen.append(addr)

    if not seen:
        if not fallback:
            raise HTTPException(status_code=400, detail="받는 사람 이메일을 지정해 주세요.")
        return [fallback]

    invalid = [a for a in seen if not _EMAIL_RE.match(a)]
    if invalid:
        raise HTTPException(
            status_code=400, detail=f"이메일 형식이 올바르지 않습니다: {', '.join(invalid)}"
        )
    if len(seen) > _MAX_RECIPIENTS:
        raise HTTPException(
            status_code=400, detail=f"받는 사람은 최대 {_MAX_RECIPIENTS}명까지 지정할 수 있습니다."
        )
    return seen


def _send_export_email(recipients: list[str], period: str, filename: str, download_url: str) -> None:
    html = f"""
    <p>{period} 마케팅 데이터 엑셀 파일이 준비되었습니다.</p>
    <p><a href="{download_url}">{filename} 다운로드</a></p>
    <p style="color:#888;font-size:12px;">이 링크는 3일 후 만료됩니다.</p>
    """
    build_mail_sender().send(
        to=recipients, subject=f"[마케팅 AI] {period} 엑셀 파일 다운로드", html=html
    )


def _store_export_bytes(task_id: str, year: int, month: int, excel_bytes: bytes) -> dict:
    """완성된 엑셀을 보관하고 result에 넣을 패치를 반환한다.

    Supabase Storage가 설정돼 있으면 그쪽에 올리고 경로만 DB에 남긴다(인스턴스가 바뀌어도
    다운로드 가능). 스토리지가 없는 로컬 개발 환경에서는 작업 행의 바이너리 컬럼에 담는다.
    """
    if settings.SUPABASE_URL:
        path = storage_service.upload_bytes(f"exports/{year:04d}/{month:02d}/{task_id}.xlsx", excel_bytes)
        return {"storage_path": path}

    task_store.set_result_blob(task_id, excel_bytes)
    return {"storage_path": None}


def _export_context(year: int, month: int) -> dict:
    """엑셀의 일별 실적 외 나머지 칸을 채우는 데 필요한 DB 값을 한 번에 읽는다.

    템플릿은 어느 달의 데이터도 갖고 있지 않은 빈 파일이므로, 비교 행·예산·코멘트까지
    전부 여기서 넘겨줘야 한다. 넘기지 않은 칸은 0/빈칸으로 남는다.
    """
    prev_year, prev_month = (year - 1, 12) if month == 1 else (year, month - 1)
    db = SessionLocal()
    try:
        repo = MarketingRepository(db)
        budgets, _ = repo.get_media_budgets(year, month)
        comment, _ = repo.get_comment_meta(year, month)
        return {
            "prev_totals": repo.get_period_totals(prev_year, prev_month),
            "prev_media_totals": repo.get_media_totals(prev_year, prev_month),
            "yoy_media_totals": repo.get_media_totals(year - 1, month),
            "media_budgets": budgets,
            "comment": comment or None,
        }
    finally:
        db.close()


def _build_excel(media_kpis: dict, period: str, year: int, month: int) -> bytes:
    ctx = _export_context(year, month)
    return ExcelService().fill_template(
        media_kpis,
        period,
        year,
        month,
        ctx["prev_totals"],
        ctx["yoy_media_totals"],
        prev_media_totals=ctx["prev_media_totals"],
        media_budgets=ctx["media_budgets"],
        comment=ctx["comment"],
    )


def _run_export_task(
    task_id: str,
    rows: list,
    period: str,
    year: int,
    month: int,
    deliver_by: str = "download",
    recipients: list[str] | None = None,
) -> None:
    """동기 함수 → FastAPI BackgroundTasks가 스레드풀에서 실행.

    실패 메시지 앞에 어느 단계에서 깨졌는지를 붙인다 — 예전에는 메일 발송이 실패해도
    프론트가 'Excel 생성 실패'로만 보여줘서, 엑셀은 멀쩡히 만들어졌는데도 원인을
    엉뚱한 곳에서 찾게 됐다.
    """
    stage = "Excel 생성"
    try:
        if task_store.is_cancelled(task_id):
            task_store.update_task(task_id, status="cancelled")
            return
        task_store.update_task(task_id, status="processing", progress=15)
        media_kpis = _db_rows_to_media_kpis(rows)

        if task_store.is_cancelled(task_id):
            task_store.update_task(task_id, status="cancelled")
            return
        task_store.update_task(task_id, progress=45)
        excel_bytes = _build_excel(media_kpis, period, year, month)

        if task_store.is_cancelled(task_id):
            task_store.update_task(task_id, status="cancelled")
            return
        filename = f"마케팅분석_{period.replace(' ', '')}.xlsx"

        if deliver_by == "email" and recipients:
            task_store.update_task(task_id, progress=70)
            stage = "파일 업로드"
            path = storage_service.upload_bytes(f"exports/{year:04d}/{month:02d}/{task_id}.xlsx", excel_bytes)
            download_url = storage_service.create_signed_url(path)

            task_store.update_task(task_id, progress=85)
            stage = "메일 발송"
            _send_export_email(recipients, period, filename, download_url)
            task_store.update_task(
                task_id,
                status="done",
                progress=100,
                message=f"{', '.join(recipients)} 으로 보냈습니다.",
                result_patch={
                    "filename": filename,
                    "delivered_by": "email",
                    "storage_path": path,
                    "recipients": recipients,
                },
            )
        else:
            stage = "파일 보관"
            patch = _store_export_bytes(task_id, year, month, excel_bytes)
            task_store.update_task(
                task_id,
                status="done",
                progress=100,
                result_patch={"filename": filename, "delivered_by": "download", **patch},
            )
    except MailSendError as exc:
        # 원인별 안내 문구가 이미 담겨 있으므로 그대로 노출한다
        logger.warning("export 메일 발송 실패 (task=%s): %s", task_id, exc)
        task_store.update_task(task_id, status="error", progress=0, error=f"메일 발송 실패: {exc}")
    except Exception as exc:
        logger.exception("export 태스크 실패 (task=%s, 단계=%s)", task_id, stage)
        task_store.update_task(task_id, status="error", progress=0, error=f"{stage} 실패: {exc}")


def _delete_periods(periods: list[tuple[int, int]]) -> int:
    """여러 (연, 월)의 기존 행을 한 트랜잭션으로 삭제하고 삭제 건수를 반환."""
    db_del = SessionLocal()
    try:
        repo = MarketingRepository(db_del)
        deleted = sum(repo.delete_rows_by_period(y, m) for y, m in periods)
        db_del.commit()
        return deleted
    except Exception:
        db_del.rollback()
        raise
    finally:
        db_del.close()


def _run_save_task(
    task_id: str, df: pd.DataFrame, periods: list[tuple[int, int]], replace: bool
) -> None:
    """Excel DataFrame → DB UPSERT 백그라운드 작업.

    periods 는 파일에 담긴 모든 (연, 월) — 5월·6월이 한 파일에 있으면 두 기간 모두
    덮어쓰기 대상이 된다.

    delete_rows_by_period(Session) 와 save_mapped_dataframe(_upsert 내부의 engine.begin())이
    서로 다른 커넥션을 사용하므로, 삭제를 먼저 커밋해 락을 해제한 뒤 저장해야 데드락을 피할 수 있다.
    """
    try:
        task_store.update_task(task_id, status="processing", progress=10)

        # ── 1단계: replace 시 기존 행 삭제 (독립 트랜잭션으로 먼저 커밋) ──────────
        deleted = _delete_periods(periods) if replace else 0

        task_store.update_task(task_id, progress=50)

        # ── 2단계: 새 데이터 저장 (_upsert 내부에서 engine.begin() 사용) ─────────
        saved, _, undo_id = MarketingRepository(None).save_mapped_dataframe(df)  # type: ignore[arg-type]

        task_store.update_task(task_id, progress=90)

        scope = ", ".join(_period_label(y, m) for y, m in periods)
        if replace:
            msg = f"{scope}: 기존 {deleted}개 행을 삭제하고 {saved}개 행으로 교체했습니다."
        else:
            msg = f"{scope}: {saved}개 행을 저장했습니다."

        task_store.update_task(
            task_id,
            status="done",
            progress=100,
            message=msg,
            result_patch={
                "saved_rows": saved,
                "deleted_rows": deleted if replace else 0,
                "undo_id": undo_id,
            },
        )
    except Exception as exc:
        task_store.update_task(task_id, status="error", progress=0, error=str(exc))


@router.post("/save-excel-task")
async def start_save_excel_task(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    replace: bool = Query(False),
    period: list[str] | None = Query(
        None, description="저장할 기간 시트 (예: period=26년 5월&period=26년 6월). 생략 시 전체"
    ),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Excel DB 저장을 백그라운드로 시작하고 task_id 반환.

    period 를 주면 고른 달만, 없으면 파일에 담긴 모든 달을 저장한다.
    replace=true 이면 저장 대상 달들의 기존 행을 각각 지우고 교체한다.
    """
    check_content_length(request)
    content = await read_data_upload(file, allowed_extensions=EXCEL_EXTENSIONS)
    df, _ = _excel_to_df(content, period)
    periods = _periods_in_df(df)

    task_id = task_store.create_task(_KIND_SAVE, user_id=current_user.id)
    background_tasks.add_task(_run_save_task, task_id, df, periods, replace)

    return {"task_id": task_id}


@router.get("/save-excel-task/{task_id}")
async def get_save_excel_task_status(task_id: str) -> dict:
    task = task_store.get_task(task_id, kind=_KIND_SAVE)
    if task is None:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    return {
        "status": task["status"],
        "progress": task["progress"],
        "message": task["message"] or None,
        "error": task["error"],
        **task["result"],
    }


@router.post("/export-db-task")
async def start_export_db_task(
    year: int = Query(...),
    month: int = Query(...),
    deliver_by: str = Query("download", pattern="^(download|email)$"),
    recipient: list[str] | None = Query(
        None, description="받는 사람 이메일. 반복 지정하거나 쉼표로 묶을 수 있고, 생략 시 로그인 계정"
    ),
    background_tasks: BackgroundTasks = ...,
    current_user: User = Depends(get_current_user),
) -> dict:
    """DB 데이터 → Excel 변환을 백그라운드로 시작하고 task_id 반환.

    deliver_by="email"이면 완료된 파일을 메모리로 내려주는 대신 Supabase Storage에 올리고
    지정한 받는 사람(기본값: 로그인한 사용자)에게 다운로드 링크를 보낸다.
    """
    recipients: list[str] = []
    if deliver_by == "email":
        if EXPORT_EMAIL_UNDER_MAINTENANCE:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="엑셀 이메일 발송 기능은 현재 서비스 준비중입니다.",
            )
        # 엑셀을 다 만든 뒤에 설정 문제로 실패하면 시간만 버린다 — 시작 전에 걸러낸다
        config_error = mail_config_error()
        if config_error:
            raise HTTPException(status_code=400, detail=config_error)
        recipients = _clean_recipients(recipient, current_user.email)

    db = SessionLocal()
    try:
        rows = MarketingRepository(db).get_rows_by_period(year, month)
    finally:
        db.close()

    if not rows:
        raise HTTPException(status_code=404, detail="해당 기간의 데이터가 없습니다.")

    period = _period_label(year, month)
    task_id = task_store.create_task(
        _KIND_EXPORT, progress=5, user_id=current_user.id, result={"delivered_by": deliver_by},
    )
    background_tasks.add_task(
        _run_export_task, task_id, rows, period, year, month, deliver_by, recipients,
    )

    return {
        "task_id": task_id,
        "filename": f"마케팅분석_{period.replace(' ', '')}.xlsx",
        "deliver_by": deliver_by,
        "recipients": recipients,
    }


@router.get("/export-db-task/{task_id}")
async def get_export_task_status(task_id: str) -> dict:
    """백그라운드 export 진행률 조회"""
    task = task_store.get_task(task_id, kind=_KIND_EXPORT)
    if task is None:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    return {
        "status": task["status"],
        "progress": task["progress"],
        "message": task["message"] or None,
        "error": task["error"],
        "delivered_by": task["result"].get("delivered_by"),
        "recipients": task["result"].get("recipients", []),
    }


@router.delete("/export-db-task/{task_id}")
async def cancel_export_task(task_id: str) -> dict:
    """진행 중인 export 태스크를 취소 요청.

    작업 행은 지우지 않고 취소 플래그만 세운다 — 워커가 단계마다 이 플래그를 읽어
    스스로 멈춰야 하기 때문이다. 행 자체는 TTL 정리 잡이 나중에 삭제한다.
    """
    if not task_store.cancel_task(task_id):
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    return {"message": "취소되었습니다."}


@router.get("/export-db-result/{task_id}")
async def get_export_task_result(task_id: str) -> StreamingResponse:
    """완료된 export 파일 다운로드 (1회용 — 내려준 뒤 보관본을 제거)"""
    task = task_store.get_task(task_id, kind=_KIND_EXPORT)
    if task is None or task["status"] != "done":
        raise HTTPException(status_code=404, detail="아직 완료되지 않았거나 작업을 찾을 수 없습니다.")

    result = task["result"]
    if result.get("delivered_by") != "download":
        # 이메일 전달 건은 3일짜리 서명 URL로 이미 발송됐다. 여기서 내려주면서 파일을
        # 지워버리면 메일 안의 링크가 죽으므로 다운로드 경로로는 서비스하지 않는다.
        raise HTTPException(status_code=404, detail="다운로드용 작업이 아닙니다.")

    storage_path = result.get("storage_path")
    if storage_path:
        excel_bytes = storage_service.download_bytes(storage_path)
        if excel_bytes is not None:
            try:
                storage_service.delete_object(storage_path)
            except Exception:
                logger.exception("export 임시 파일 삭제 실패: %s", storage_path)
    else:
        excel_bytes = task_store.pop_result_blob(task_id)

    if excel_bytes is None:
        raise HTTPException(status_code=404, detail="이미 내려받았거나 파일이 만료되었습니다.")

    task_store.delete_task(task_id)
    filename = result.get("filename", "마케팅분석.xlsx")

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

    excel_bytes = _build_excel(media_kpis, period, year, month)
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
        report_dict['comment'], report_dict['comment_updated_at'] = repo.get_comment_meta(year, month)
        return ReportResponse(**report_dict)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"리포트 집계 중 오류가 발생했습니다: {exc}")
    finally:
        db.close()


@router.post("/comment")
async def update_comment(
    year: int = Query(...),
    month: int = Query(...),
) -> dict:
    """해당 연월 vs 직전월 누적 DB 데이터를 비교해 AI 코멘트를 새로 생성하고 저장"""
    prev_year, prev_month = (year - 1, 12) if month == 1 else (year, month - 1)

    db = SessionLocal()
    try:
        comparison = AnalysisService(db).compare(year, month, prev_year, prev_month)
        comment = CommentService(llm=build_llm()).generate(comparison)
        repo = MarketingRepository(db)
        repo.upsert_period_meta(year, month, comment=comment)
        db.commit()
        _, comment_updated_at = repo.get_comment_meta(year, month)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"코멘트 생성 실패: {exc}")
    finally:
        db.close()
    return {"comment": comment, "comment_updated_at": comment_updated_at}


@router.post("/upload", response_model=UploadTaskResponse)
async def upload_files(
    request: Request,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
) -> UploadTaskResponse:
    check_content_length(request)
    file_data: list[FileEntry] = await read_data_uploads(files, allowed_extensions=CSV_EXTENSIONS)

    task_id = task_store.create_task(
        _KIND_UPLOAD, status=TaskStatus.PENDING.value, user_id=current_user.id,
    )
    background_tasks.add_task(_run_analysis, task_id, file_data)

    return UploadTaskResponse(
        task_id=task_id,
        status=TaskStatus.PENDING,
        message=f"{len(file_data)}개 파일 수신 완료. 백그라운드 분석을 시작합니다.",
    )


@router.get("/status/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(task_id: str) -> TaskStatusResponse:
    task = task_store.get_task(task_id, kind=_KIND_UPLOAD)
    if task is None:
        raise HTTPException(status_code=404, detail="태스크를 찾을 수 없습니다.")
    return TaskStatusResponse(
        task_id=task_id,
        status=TaskStatus(task["status"]),
        processed_rows=task["result"].get("processed_rows"),
        ai_comment=task["result"].get("ai_comment"),
        error=task["error"],
    )


@router.post("/preview", response_model=ReportResponse)
async def preview_report(
    request: Request,
    files: list[UploadFile] = File(...),
) -> ReportResponse:
    """CSV → DB 저장 + KPI 계산 후 JSON 리포트 반환"""
    check_content_length(request)
    file_data: list[FileEntry] = await read_data_uploads(files, allowed_extensions=CSV_EXTENSIONS)

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
    request: Request,
    file: UploadFile = File(...),
) -> dict:
    """Excel 파일(.xlsx)을 읽어 기간별 리포트 데이터 JSON 반환.

    한 파일에 5월·6월처럼 여러 달이 들어 있으면 달마다 하나씩 reports 에 담아 준다.
    """
    check_content_length(request)
    content = await read_data_upload(file, allowed_extensions=EXCEL_EXTENSIONS)
    try:
        reports = ExcelReaderService().read_reports(content)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    return {"periods": [r["period"] for r in reports], "reports": reports}


@router.post("/save-excel-data")
async def save_excel_data(
    request: Request,
    file: UploadFile = File(...),
    replace: bool = Query(False),
    period: list[str] | None = Query(
        None, description="저장할 기간 시트 (예: period=26년 5월&period=26년 6월). 생략 시 전체"
    ),
) -> dict:
    """Excel 파일 매체 시트 데이터를 DB에 저장.

    period 를 주면 고른 달만, 없으면 파일에 담긴 모든 달을 저장한다.
    replace=true 이면 저장 대상 달들의 기존 데이터를 각각 먼저 삭제하고 교체.
    """
    check_content_length(request)
    content = await read_data_upload(file, allowed_extensions=EXCEL_EXTENSIONS)
    df, _ = _excel_to_df(content, period)
    periods = _periods_in_df(df)

    deleted = 0
    if replace:
        try:
            deleted = _delete_periods(periods)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"기존 데이터 삭제 실패: {exc}")

    try:
        saved, _, _undo_id = MarketingRepository(None).save_mapped_dataframe(df)  # type: ignore[arg-type]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB 저장 실패: {exc}")

    scope = ", ".join(_period_label(y, m) for y, m in periods)
    if replace:
        msg = f"{scope}: 기존 {deleted}개 행을 삭제하고 {saved}개 행으로 교체했습니다."
    else:
        msg = f"{scope}: {saved}개 행을 저장했습니다."
    return {
        "saved_rows": saved,
        "deleted_rows": deleted if replace else 0,
        "periods": [_period_label(y, m) for y, m in periods],
        "message": msg,
    }


@router.post("/rows")
async def upsert_row(body: RowUpsertBody) -> dict:
    """단일 행 (report_date, campaign_type) UPSERT"""
    df = pd.DataFrame([{
        "report_date": body.report_date,
        "campaign_type": body.campaign_type,
        "impressions": body.impressions,
        "clicks": body.clicks,
        "cost": body.cost,
        "conversions": body.conversions,
        "conversion_revenue": body.conversion_revenue,
        "signup": body.signup,
        "purchase": body.purchase,
        "apply": body.apply,
    }])
    try:
        saved, _, _ = MarketingRepository(None).save_mapped_dataframe(df)  # type: ignore[arg-type]
        return {"saved": saved, "message": "저장되었습니다."}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"저장 실패: {exc}")


@router.delete("/rows")
async def delete_row(
    report_date: str = Query(...),
    campaign_type: str = Query(...),
) -> dict:
    """단일 행 삭제 — (report_date, campaign_type) 기준"""
    from sqlalchemy import text as _text
    from app.core.database import engine as _engine
    try:
        with _engine.begin() as conn:
            result = conn.execute(
                _text(
                    "DELETE FROM marketing_data "
                    "WHERE report_date = :d AND campaign_type = :c"
                ),
                {"d": report_date, "c": campaign_type},
            )
        deleted = result.rowcount
        if deleted == 0:
            raise HTTPException(status_code=404, detail="삭제할 행을 찾을 수 없습니다.")
        return {"deleted": deleted, "message": "삭제되었습니다."}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"삭제 실패: {exc}")


@router.post("/export")
async def export_excel(
    request: Request,
    files: list[UploadFile] = File(...),
) -> StreamingResponse:
    """CSV → Excel 템플릿 채운 뒤 다운로드"""
    check_content_length(request)
    file_data: list[FileEntry] = await read_data_uploads(files, allowed_extensions=CSV_EXTENSIONS)

    db = SessionLocal()
    try:
        svc = MarketingService(MarketingRepository(db))
        conv_files, media_files = svc._classify(file_data)
        media_kpis, period = await svc.process_for_export(conv_files, media_files)
    finally:
        db.close()

    # 일별 실적은 방금 올린 CSV에서 오지만, 비교 행·예산·코멘트는 DB에만 있다.
    # 기간은 라벨("26년 7월")에서 읽는다.
    year, month = resolve_period(period, None, None)
    excel_bytes = _build_excel(media_kpis, period, year, month)

    filename = f"마케팅분석_{period.replace(' ', '')}.xlsx"
    return StreamingResponse(
        iter([excel_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )
