"""대행사 주간 리포트(RAW 탭)로 marketing_data 를 기간 단위로 재구축한다.

앱의 업로드 경로(`POST /api/marketing/save-excel-task`)와 **같은 리더**(report_formats
레지스트리)를 쓰고, 저장·삭제·되돌리기도 같은 함수(`snapshot_periods` /
`delete_rows_by_period` / `save_mapped_dataframe`)를 거친다. 화면으로 올리기엔 기간이
많을 때(이 양식은 한 파일에 35개월이 들어 있다) 쓰는 도구다.

    # 무엇이 바뀔지만 보여준다 (기본값 — DB를 건드리지 않는다)
    python -m scripts.rebuild_from_weekly_raw "…/Weekly Report_26년11월4주차_1124.xlsb"

    # 파일에 없는 기간은 그대로 두고, 있는 기간만 교체
    python -m scripts.rebuild_from_weekly_raw <file> --apply

    # 특정 기간만
    python -m scripts.rebuild_from_weekly_raw <file> --apply --period "26년 11월"

**기간 단위 교체(replace)가 기본이다.** 이 양식은 그 시점의 스냅샷이 아니라 전 기간을
매주 다시 뽑아 주는 누적 원본이고, 소급 집계되는 구글 전환·매출도 최신값으로 들어 있다.
그래서 `backfill_from_excel` 과 달리 기존 기간을 덮어쓰는 것이 맞다 — 다만 지우기 전에
**전체 스냅샷을 하나 떠서 undo_id 를 남긴다**. 되돌리려면 그 id 로 복구하면 된다.

기간 단위로 나눠 저장한다 — 한 트랜잭션에 수천 행을 몰면 Supabase 풀러 연결이 중간에
끊길 때 어디까지 들어갔는지 알 수 없다. 기간별로 끊으면 실패해도 그 달만 다시 돌린다.
"""

import argparse
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.repositories.marketing_repo import MarketingRepository  # noqa: E402
from app.services.report_formats import detect  # noqa: E402

#: 지표 컬럼 — 미리보기 표에 쓴다
_SHOW = ("impressions", "clicks", "cost", "conversions", "conversion_revenue")


def _period_key(value) -> tuple[int, int]:
    day = pd.Timestamp(value).date()
    return (day.year, day.month)


def _label(year: int, month: int) -> str:
    return f"{year % 100}년 {month}월"


def _load(path: Path, periods: list[str] | None):
    """파일 → {(연,월): DataFrame}, {(연,월): 코멘트}."""
    content = path.read_bytes()
    svc = detect(content, path.name)
    print(f"양식 판별: {svc.label}")

    reports = svc.read_reports(content, periods=periods or None)
    frames: dict[tuple[int, int], pd.DataFrame] = {}
    comments: dict[tuple[int, int], str] = {}

    for report in reports:
        frame = svc.to_db_dataframe(report)
        if frame.empty:
            print(f"  ! {report['period']}: 실적 행이 없어 건너뜁니다")
            continue
        # 한 리포트는 한 달이지만, 기간 라벨을 믿지 않고 데이터의 날짜로 키를 잡는다.
        key = _period_key(frame["report_date"].min())
        frames[key] = frame
        text = (report.get("comment") or "").strip()
        if text:
            comments[key] = text

    return frames, comments


def _existing_counts(periods: list[tuple[int, int]]) -> dict[tuple[int, int], int]:
    db = SessionLocal()
    try:
        repo = MarketingRepository(db, 1)
        return {key: len(repo.get_rows_by_period(*key)) for key in periods}
    finally:
        db.close()


def _preview(frames: dict, existing: dict) -> None:
    print()
    print(f"{'기간':<10} {'기존행':>7} {'새행':>6}  {'노출':>12} {'클릭':>9} {'광고비':>13} {'전환':>8} {'매출':>14}")
    print("-" * 92)
    total = defaultdict(float)
    for key in sorted(frames):
        frame = frames[key]
        sums = {col: float(frame[col].sum()) for col in _SHOW}
        for col, value in sums.items():
            total[col] += value
        total["rows"] += len(frame)
        print(
            f"{_label(*key):<10} {existing.get(key, 0):>7} {len(frame):>6}  "
            f"{sums['impressions']:>12,.0f} {sums['clicks']:>9,.0f} {sums['cost']:>13,.0f} "
            f"{sums['conversions']:>8,.0f} {sums['conversion_revenue']:>14,.0f}"
        )
    print("-" * 92)
    print(
        f"{'합계':<10} {sum(existing.values()):>7} {int(total['rows']):>6}  "
        f"{total['impressions']:>12,.0f} {total['clicks']:>9,.0f} {total['cost']:>13,.0f} "
        f"{total['conversions']:>8,.0f} {total['conversion_revenue']:>14,.0f}"
    )

    labels = sorted({c for frame in frames.values() for c in frame["campaign_type"].unique()})
    print()
    print(f"매체 레이블 {len(labels)}종: {', '.join(labels)}")


def _snapshot_and_delete(periods: list[tuple[int, int]]) -> tuple[int, str]:
    """교체 대상 기간의 현재 상태를 한 스냅샷으로 떠 두고 지운다.

    라우터의 `_delete_periods` 와 같은 순서다 — 삭제를 먼저 커밋해 락을 풀어야
    뒤따르는 저장(engine.begin())과 데드락이 나지 않는다.
    """
    db = SessionLocal()
    try:
        repo = MarketingRepository(db, 1)
        undo_id, _rows = repo.snapshot_periods(periods)
        deleted = sum(repo.delete_rows_by_period(y, m) for y, m in periods)
        db.commit()
        return deleted, undo_id
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _save_comments(comments: dict[tuple[int, int], str]) -> int:
    if not comments:
        return 0
    db = SessionLocal()
    try:
        repo = MarketingRepository(db, 1)
        for (year, month), text in comments.items():
            repo.upsert_period_meta(year, month, comment=text)
        db.commit()
        return len(comments)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("path", type=Path, help="주간 리포트 파일 (.xlsb/.xlsx)")
    parser.add_argument("--apply", action="store_true", help="실제로 DB에 쓴다 (없으면 미리보기만)")
    parser.add_argument("--period", action="append", help="이 기간만 (예: --period '26년 11월'), 반복 가능")
    parser.add_argument("--skip-comments", action="store_true", help="기간 코멘트는 저장하지 않는다")
    args = parser.parse_args()

    if not args.path.exists():
        print(f"파일이 없습니다: {args.path}")
        return 1

    frames, comments = _load(args.path, args.period)
    if not frames:
        print("저장할 데이터가 없습니다.")
        return 1

    existing = _existing_counts(sorted(frames))
    _preview(frames, existing)

    if not args.apply:
        print()
        print("미리보기만 했습니다. 실제로 쓰려면 --apply 를 주세요.")
        return 0

    periods = sorted(frames)
    print()
    print(f"교체 대상 {len(periods)}개 기간의 스냅샷을 뜨고 기존 행을 지웁니다…")
    deleted, undo_id = _snapshot_and_delete(periods)
    print(f"  삭제 {deleted}행 · 되돌리기 undo_id = {undo_id}")

    saved_total = 0
    failed: list[tuple[int, int]] = []
    for key in periods:
        try:
            saved, _diff, _undo = MarketingRepository(None, 1).save_mapped_dataframe(frames[key])
            saved_total += saved
            print(f"  {_label(*key):<10} {saved:>5}행 저장")
        except Exception as exc:  # 한 기간이 실패해도 나머지는 계속 — 끝에 모아서 알린다
            failed.append(key)
            print(f"  {_label(*key):<10} 실패: {exc}")

    print()
    print(f"저장 {saved_total}행 (삭제 {deleted}행)")

    if not args.skip_comments:
        try:
            count = _save_comments(comments)
            if count:
                print(f"기간 코멘트 {count}개 저장")
        except Exception as exc:
            print(f"코멘트 저장 실패 (데이터는 저장됨): {exc}")

    if failed:
        print()
        print(f"!! 실패한 기간 {len(failed)}개: {', '.join(_label(*k) for k in failed)}")
        print(f"!! 전체를 되돌리려면 undo_id={undo_id} 로 복구하세요.")
        return 1

    print(f"되돌리려면 undo_id={undo_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
