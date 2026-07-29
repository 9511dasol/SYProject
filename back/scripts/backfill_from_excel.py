"""과거 리포트 엑셀(여러 달이 한 파일에 쌓인 것)을 DB로 백필한다.

앱의 업로드 경로(`POST /api/marketing/save-excel-task`)와 **같은 파서**(ExcelReaderService)를
쓰고, 저장도 같은 함수(`save_mapped_dataframe` / `set_media_budgets`)를 거친다.
화면으로 올리기엔 파일이 크거나(수십 MB) 기간이 많을 때 쓰는 일회성 도구다.

    # 무엇이 들어갈지만 보여준다 (기본값 — DB를 건드리지 않는다)
    python -m scripts.backfill_from_excel example/ref2.xlsx

    # 일별 실적 저장
    python -m scripts.backfill_from_excel example/ref2.xlsx --apply

    # 매체별 예산까지 (일별 실적은 이미 넣었다면 --skip-data)
    python -m scripts.backfill_from_excel example/ref2.xlsx --apply --skip-data --with-budgets

**이미 DB에 일별 실적이 있는 기간은 기본적으로 건너뛴다.** 과거 파일은 그 시점의
스냅샷이라 나중에 소급 집계되는 값(구글 전환수·매출 등)이 DB보다 낮은 경우가 있고,
그대로 덮어쓰면 최신 실적이 옛 숫자로 되돌아간다. 정말 덮어써야 할 때만 --overwrite 를 준다.

예산은 반대로 **파일 쪽이 원본**이다(그 달의 계약 금액이지 집계값이 아니다). 그래도
관리자가 화면에서 손대 놓은 값을 조용히 되돌리지 않도록, 이미 값이 있는 기간은
--overwrite-budgets 없이는 건드리지 않는다.

기간 단위로 나눠 저장한다 — 한 트랜잭션에 수천 행을 몰면 Supabase 풀러 연결이
중간에 끊길 때 어디까지 들어갔는지 알 수 없다. 기간별로 끊으면 실패해도 그 달만 다시 돌린다.
"""

import argparse
import sys
from pathlib import Path

import pandas as pd
import sqlalchemy as sa

from app.core.database import SessionLocal, engine
from app.repositories.marketing_repo import MarketingRepository
from app.services.excel_reader_service import ExcelReaderService

# summary '■ 매체별 예산' 구간의 카테고리 라벨 → DB 매체 레이블.
# SA total / SA+BS total / TOAL 같은 소계 행은 여기 없으므로 자연히 걸러진다.
BUDGET_CATEGORY_TO_MEDIA: dict[str, str] = {
    "naver_SA":    "네이버SA",
    "kakao_SA":    "카카오SA",
    "google_SA":   "구글SA",
    "naver_BS":    "네이버BS",
    "naver_Power": "네이버PSA",
}


def _existing() -> tuple[dict[str, int], dict[str, dict]]:
    """DB 현재 상태 — (연월별 행 수, 연월별 매체 예산)"""
    with engine.connect() as conn:
        rows = conn.execute(sa.text(
            "SELECT to_char(report_date, 'YYYY-MM') AS ym, COUNT(*) AS n "
            "FROM marketing_data GROUP BY 1"
        )).all()
        budgets = conn.execute(sa.text(
            "SELECT year, month, media_budgets FROM marketing_period_meta "
            "WHERE media_budgets IS NOT NULL"
        )).all()
    return (
        {r.ym: r.n for r in rows},
        {f"{r.year}-{r.month:02d}": r.media_budgets for r in budgets},
    )


def _budgets_of(report: dict) -> dict[str, float]:
    """summary 예산 구간 → {매체: 금액}.

    0 이하는 '설정 안 함'으로 본다 — 파서가 빈 셀을 0.0 으로 돌려주기 때문에 빈칸과
    구분할 방법이 이것뿐이고, 예산 0원은 어차피 의미가 없다.
    """
    out: dict[str, float] = {}
    for row in report.get("budget_table", []):
        media = BUDGET_CATEGORY_TO_MEDIA.get(str(row.get("category", "")).strip())
        amount = row.get("budget") or 0
        if media and amount > 0:
            out[media] = float(amount)
    return out


def _load(path: Path, periods: list[str] | None) -> tuple[pd.DataFrame, dict[str, dict], dict[str, str]]:
    """엑셀 → (DB 컬럼으로 매핑된 DataFrame, {연월: 예산}, {연월: 코멘트})

    시트 이름의 기간 라벨은 연도가 빠져 있기도 하다("3월" = 2025년 3월). 실제 연월은
    매체 시트의 날짜 값에서 오므로, 시트별로 따로 읽어 그 기준으로 묶는다.

    일별 데이터가 하나도 없는 시트는 통째로 버린다 — 짝이 되는 매체 시트가 없는
    유령 summary(예: 이름을 잘못 지은 중복 시트)가 예산만 덮어쓰는 일을 막는다.
    """
    svc = ExcelReaderService()
    reports = svc.read_reports(path.read_bytes(), periods=periods)

    frames: list[pd.DataFrame] = []
    budgets: dict[str, dict] = {}
    comments: dict[str, str] = {}
    for report in reports:
        frame = svc.to_db_dataframe(report)
        if frame.empty:
            continue
        frame["report_date"] = pd.to_datetime(frame["report_date"])
        frame["ym"] = frame["report_date"].dt.strftime("%Y-%m")
        frames.append(frame)

        ym = frame["ym"].mode().iloc[0]
        if found := _budgets_of(report):
            budgets[ym] = found
        if text := (report.get("comment") or "").strip():
            comments[ym] = text

    if not frames:
        return pd.DataFrame(), {}, {}
    return pd.concat(frames, ignore_index=True), budgets, comments


def _plan(df, budgets, db_rows, db_budgets, args) -> list[dict]:
    grouped = (
        df.groupby("ym")
        .agg(rows=("report_date", "size"),
             media=("campaign_type", "nunique"),
             days=("report_date", "nunique"))
        .reset_index()
        .sort_values("ym")
    )
    plan = []
    for _, r in grouped.iterrows():
        ym = r["ym"]
        in_db = db_rows.get(ym)

        if args.skip_data:
            data_action = "-"
        elif in_db is None:
            data_action = "저장"
        elif args.overwrite:
            data_action = "덮어씀"
        else:
            data_action = "건너뜀"

        file_budget = budgets.get(ym)
        if not args.with_budgets:
            budget_action = "-"
        elif not file_budget:
            budget_action = "파일없음"
        elif ym not in db_budgets:
            budget_action = "저장"
        elif args.overwrite_budgets:
            budget_action = "덮어씀"
        else:
            budget_action = "건너뜀"

        plan.append({
            "ym": ym, "rows": int(r["rows"]), "media": int(r["media"]), "days": int(r["days"]),
            "in_db": in_db, "data": data_action,
            "budget": file_budget, "db_budget": db_budgets.get(ym), "budget_action": budget_action,
        })
    return plan


def _fmt_budget(b: dict | None) -> str:
    if not b:
        return "-"
    order = list(BUDGET_CATEGORY_TO_MEDIA.values())
    return "/".join(
        f"{b[m] / 10000:,.0f}" if m in b else "·"
        for m in order
    ) + "만"


def _print_plan(plan: list[dict], with_budgets: bool) -> None:
    print(f"\n{'기간':<9} {'행수':>6} {'일수':>4} {'DB행':>6}  {'실적':<7}", end="")
    if with_budgets:
        print(f" {'예산':<7} 파일 예산 (SA/카카오/구글/BS/파워)", end="")
    print()
    print("-" * (95 if with_budgets else 42))

    for p in plan:
        in_db = p["in_db"] if p["in_db"] is not None else "-"
        print(f"{p['ym']:<9} {p['rows']:>6} {p['days']:>4} {in_db:>6}  {p['data']:<7}", end="")
        if with_budgets:
            print(f" {p['budget_action']:<7} {_fmt_budget(p['budget'])}", end="")
        print()

    data_todo = [p for p in plan if p["data"] in ("저장", "덮어씀")]
    print(f"\n실적: {len(data_todo)}개 기간 / {sum(p['rows'] for p in data_todo):,}행")
    if with_budgets:
        b_todo = [p for p in plan if p["budget_action"] in ("저장", "덮어씀")]
        print(f"예산: {len(b_todo)}개 기간")
        for p in b_todo:
            if p["db_budget"]:
                print(f"  ! {p['ym']} 기존값 덮어씀: {_fmt_budget(p['db_budget'])}"
                      f" → {_fmt_budget(p['budget'])}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="리포트 엑셀 → DB 백필")
    parser.add_argument("xlsx", type=Path, help="리포트 엑셀 경로")
    parser.add_argument("--apply", action="store_true", help="실제로 저장한다 (없으면 미리보기)")
    parser.add_argument("--period", action="append",
                        help="저장할 시트 기간 라벨 (반복 지정, 예: --period '26년 3월')")
    parser.add_argument("--skip-data", action="store_true",
                        help="일별 실적(marketing_data)은 저장하지 않는다")
    parser.add_argument("--overwrite", action="store_true",
                        help="이미 일별 실적이 있는 기간도 파일 값으로 덮어쓴다")
    parser.add_argument("--with-budgets", action="store_true",
                        help="summary '■ 매체별 예산'도 저장한다")
    parser.add_argument("--overwrite-budgets", action="store_true",
                        help="이미 예산이 저장된 기간도 파일 값으로 덮어쓴다")
    parser.add_argument("--with-comments", action="store_true",
                        help="summary B32 코멘트도 저장한다")
    args = parser.parse_args(argv)

    if not args.xlsx.exists():
        print(f"파일을 찾을 수 없습니다: {args.xlsx}", file=sys.stderr)
        return 1

    print(f"파일: {args.xlsx}  ({args.xlsx.stat().st_size / 1024 / 1024:.1f}MB)")
    print("파싱 중…", flush=True)

    df, budgets, comments = _load(args.xlsx, args.period)
    if df.empty:
        print("파싱된 데이터가 없습니다.", file=sys.stderr)
        return 1

    db_rows, db_budgets = _existing()
    plan = _plan(df, budgets, db_rows, db_budgets, args)
    _print_plan(plan, args.with_budgets)

    data_targets = {p["ym"] for p in plan if p["data"] in ("저장", "덮어씀")}
    budget_targets = {p["ym"] for p in plan if p["budget_action"] in ("저장", "덮어씀")}
    if not data_targets and not budget_targets:
        print("\n저장할 것이 없습니다.")
        return 0

    if not args.apply:
        print("\n미리보기입니다. 실제로 저장하려면 --apply 를 붙이세요.")
        return 0

    print()
    # 기간 단위로 나눠 저장한다 — 실패해도 그 달만 다시 돌리면 된다.
    repo = MarketingRepository(None)  # type: ignore[arg-type]  # _upsert 는 engine 을 직접 쓴다
    total = 0
    for ym in sorted(data_targets):
        chunk = df[df["ym"] == ym].drop(columns=["ym"])
        saved, _, undo_id = repo.save_mapped_dataframe(chunk)
        total += saved
        print(f"  실적 {ym}  {saved:>4}행  (undo_id={undo_id})", flush=True)
    if data_targets:
        print(f"  → 총 {total:,}행 저장\n")

    if budget_targets or (args.with_comments and comments):
        db = SessionLocal()
        try:
            meta_repo = MarketingRepository(db)
            for ym in sorted(budget_targets):
                year, month = int(ym[:4]), int(ym[5:])
                meta_repo.set_media_budgets(year, month, budgets[ym])
                print(f"  예산 {ym}  {_fmt_budget(budgets[ym])}")
            if args.with_comments:
                for ym, text in sorted(comments.items()):
                    year, month = int(ym[:4]), int(ym[5:])
                    meta_repo.upsert_period_meta(year, month, comment=text)
                    print(f"  코멘트 {ym}  {len(text)}자")
            db.commit()
        finally:
            db.close()

    print("\n되돌리려면 관리자 화면 '업로드 데이터 관리'에서 해당 기간을 삭제하세요.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
