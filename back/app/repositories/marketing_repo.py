import logging
import uuid as _uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import func, extract, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential
import pandas as pd

from app.core.database import SessionLocal, engine
from app.models.marketing_model import (
    MarketingData,
    MarketingPeriodMeta,
    in_month,
    resolve_total_conv,
)
from app.repositories.undo_snapshot_repo import UndoSnapshotRepository
from app.services import storage_service

logger = logging.getLogger(__name__)

# Supabase 풀러의 트랜잭션/메시지 크기 제한에 걸리지 않도록 청크 단위로 INSERT
_INSERT_CHUNK_SIZE = 500


def _json_safe(value):
    """JSONB 컬럼에 넣을 수 있는 형태로 변환 (date/Decimal 등)."""
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _save_undo_snapshot(undo_id: str, rows: list[dict]) -> None:
    """되돌리기 스냅샷을 DB에 저장한다.

    이 클래스는 self.db가 None인 채로도 쓰이므로(save_mapped_dataframe 경로)
    스냅샷 저장은 항상 자체 세션으로 처리한다.
    """
    db = SessionLocal()
    try:
        UndoSnapshotRepository(db).create(undo_id, rows)
        db.commit()
    finally:
        db.close()


def _pop_undo_snapshot(undo_id: str) -> list[dict] | None:
    """스냅샷을 꺼내고 삭제한다. 없거나 만료됐으면 None."""
    from app.services.task_store import UNDO_TTL_SECONDS  # 순환 임포트 방지용 지연 임포트

    db = SessionLocal()
    try:
        repo = UndoSnapshotRepository(db)
        snapshot = repo.get(undo_id)
        if snapshot is None:
            return None

        age = (datetime.now(timezone.utc) - snapshot.created_at).total_seconds()
        rows = list(snapshot.rows or [])
        repo.delete(undo_id)
        db.commit()
        return None if age > UNDO_TTL_SECONDS else rows
    finally:
        db.close()


@retry(
    retry=retry_if_exception_type(OperationalError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
)
def _insert_chunk(df_chunk: pd.DataFrame) -> None:
    with engine.begin() as conn:
        df_chunk.to_sql("marketing_data", con=conn, if_exists="append", index=False, method="multi")


def _insert_in_chunks(db_df: pd.DataFrame, chunk_size: int = _INSERT_CHUNK_SIZE) -> None:
    """대량 INSERT를 작은 트랜잭션으로 나눠 커넥션 리셋(WinError 10054) 위험을 줄인다."""
    for start in range(0, len(db_df), chunk_size):
        _insert_chunk(db_df.iloc[start : start + chunk_size])


def _delete_combo(conn, report_date, campaign_type) -> None:
    conn.execute(
        text("DELETE FROM marketing_data WHERE report_date = :d AND campaign_type = :c"),
        {"d": report_date, "c": campaign_type},
    )


def _rewrite_rows(rows: list[dict], clear_combos: pd.DataFrame | None = None) -> int:
    """비울 범위를 지운 뒤 rows 를 그대로 되돌려 놓는다.

    clear_combos 를 주면 그 (날짜, 매체) 범위를, 주지 않으면 rows 가 덮는 범위를
    비운다. 업서트 실패 복구는 더 넓은 범위를 비워야 한다 — 청크 INSERT 가 중간에
    깨지면 먼저 들어간 청크가 남는데, 원래 값이 없던 조합(되돌릴 행도 없는 조합)에
    들어간 새 행은 rows 범위만 비워서는 지워지지 않기 때문이다.

    되돌리기(restore_undo)와 업서트 실패 복구가 같은 동작을 해야 해서 한 곳에 둔다.
    """
    df = None
    if rows:
        df = pd.DataFrame(rows)
        df["report_date"] = pd.to_datetime(df["report_date"]).dt.date

    combos = clear_combos
    if combos is None:
        if df is None:
            return 0
        combos = df[["report_date", "campaign_type"]].drop_duplicates()

    with engine.begin() as conn:
        for _, row in combos.iterrows():
            _delete_combo(conn, row["report_date"], str(row["campaign_type"]))

    if df is None:
        return 0

    _insert_in_chunks(df)
    return len(df)


_SNAPSHOT_FIELDS = (
    "report_date", "campaign_type", "impressions", "clicks", "cost",
    "conversions", "conversion_revenue", "signup", "purchase", "apply",
)


def _model_to_snapshot(row: MarketingData) -> dict:
    """ORM 행 → 되돌리기 스냅샷 dict. _upsert 가 SELECT 로 만드는 것과 같은 모양."""
    snapshot = {}
    for field in _SNAPSHOT_FIELDS:
        value = getattr(row, field)
        if value is None and field in ("signup", "purchase", "apply"):
            value = 0  # SELECT 쪽 COALESCE(...,0) 과 맞춘다
        snapshot[field] = _json_safe(value)
    return snapshot


def restore_rows(rows: list[dict]) -> int:
    """스냅샷 행을 DB 에 되돌린다 — 삭제가 이미 커밋된 뒤 실패했을 때 쓰는 진입점."""
    return _rewrite_rows(rows)


class MarketingRepository:
    def __init__(self, db: Session):
        self.db = db

    # ── 저장 ──────────────────────────────────────────────────────────────────

    def save_from_kpis(
        self,
        media_kpis: dict[str, pd.DataFrame],
        media_authority: dict[str, bool] | None = None,
        conv_authority: dict[str, bool] | None = None,
    ) -> tuple[int, dict, str]:
        """media_kpis dict → DB row 변환 후 UPSERT.

        media_authority/conv_authority: 라벨별로 "이번 업로드가 노출/클릭/비용(media)
        또는 전환(conv) 데이터를 실제로 갖고 있었는지"를 표시. 파일을 하나씩 나눠
        올리는 경우(예: 전환 파일만 업로드) 그 그룹은 값이 0으로 계산되는데, 이 정보가
        없으면 UPSERT가 기존 행을 통째로 지우고 0으로 덮어써 이전에 저장된 값을
        잃어버린다. 미지정 시 기존 동작대로 항상 덮어씀(회귀 없음).
        """
        if not media_kpis:
            return 0, {}, ""
        media_authority = media_authority or {}
        conv_authority = conv_authority or {}
        records = []
        for campaign_type, daily_df in media_kpis.items():
            has_media = media_authority.get(campaign_type, True)
            has_conv = conv_authority.get(campaign_type, True)
            for _, row in daily_df.iterrows():
                records.append({
                    "report_date": pd.to_datetime(str(row["date"])[:10]).date(),
                    "campaign_type": campaign_type,
                    "impressions": int(row.get("impressions") or 0),
                    "clicks": int(row.get("clicks") or 0),
                    "cost": float(row.get("cost") or 0),
                    # 정수 컬럼이라 소수 전환수(구글)는 여기서 반올림된다. 온전한 값은
                    # signup/purchase/apply 에 남고 읽을 때 resolve_total_conv 가 합산한다.
                    "conversions": int(round(float(row.get("total_conv") or 0))),
                    "conversion_revenue": float(row.get("revenue") or 0),
                    "signup": float(row.get("signup") or 0),
                    "purchase": float(row.get("purchase") or 0),
                    "apply": float(row.get("apply") or 0),
                    "_has_media": has_media,
                    "_has_conv": has_conv,
                })
        if not records:
            return 0, {}, ""
        return self._upsert(pd.DataFrame(records))

    def save_dataframe(self, df: pd.DataFrame) -> tuple[int, dict, str]:
        """CSV DataFrame을 DB 컬럼명으로 변환 후 UPSERT (레거시 경로 호환용)"""
        mapping = {
            "일별": "report_date",
            "시트명": "campaign_type",
            "노출수": "impressions",
            "클릭수": "clicks",
            "총비용": "cost",
            "총 전환수": "conversions",
            "총 전환매출액(원)": "conversion_revenue",
        }
        db_df = df.rename(columns=mapping).copy()
        for col in mapping.values():
            if col not in db_df.columns:
                db_df[col] = 0
        for col in ("signup", "purchase", "apply"):
            if col not in db_df.columns:
                db_df[col] = 0.0
        db_df = db_df[list(mapping.values()) + ["signup", "purchase", "apply"]]
        db_df["report_date"] = pd.to_datetime(db_df["report_date"]).dt.date
        return self._upsert(db_df)

    def save_mapped_dataframe(self, df: pd.DataFrame) -> tuple[int, dict, str]:
        """이미 DB 컬럼명으로 매핑된 DataFrame을 UPSERT (Excel 불러오기용)"""
        db_df = df.copy()
        db_df["report_date"] = pd.to_datetime(db_df["report_date"]).dt.date
        return self._upsert(db_df)

    _MEDIA_FIELDS = ("impressions", "clicks", "cost")
    _CONV_FIELDS = ("conversions", "conversion_revenue", "signup", "purchase", "apply")

    def _upsert(self, db_df: pd.DataFrame) -> tuple[int, dict, str]:
        """(report_date, campaign_type) 기준 UPSERT.
        삭제된 행을 undo_snapshots 테이블에 보관, (삽입 수, diff, undo_id) 반환.

        db_df에 _has_media/_has_conv 컬럼이 있으면(save_from_kpis 경유), 이번 업로드가
        해당 그룹(노출/클릭/비용 또는 전환)의 데이터를 실제로 갖고 있지 않은 행은
        기존 DB 값을 그대로 유지한다 — 파일을 하나씩 나눠 올릴 때 이전에 저장된
        값이 0으로 덮어써지는 것을 방지.

        쓰기 순서가 중요하다. 예전에는 DELETE 를 먼저 커밋하고 INSERT 한 다음
        마지막에 스냅샷을 저장해서, INSERT 가 끝내 실패하면 기존 행은 이미
        지워졌는데 되돌릴 스냅샷도 없어 복구가 불가능했다. 지금은
        읽기 → 스냅샷 저장 → (삭제+삽입) 순서로 하고, 쓰기가 실패하면
        스냅샷으로 되돌린다. INSERT 를 작은 트랜잭션으로 쪼개는 것은 Supabase
        풀러의 커넥션 리셋을 피하려는 의도라 그대로 둔다.
        """
        has_authority_cols = "_has_media" in db_df.columns and "_has_conv" in db_df.columns
        combos = db_df[["report_date", "campaign_type"]].drop_duplicates()
        diff: dict[str, dict[str, list[str]]] = {}
        undo_rows: list[dict] = []
        stale_combos: list[tuple] = []
        undo_id = str(_uuid.uuid4())

        # 1단계 — 읽기만. 덮어쓸 기존 행을 모아 스냅샷과 diff 를 만든다.
        with engine.begin() as conn:
            for _, row in combos.iterrows():
                ct = str(row["campaign_type"])
                ds = str(row["report_date"])

                existing = conn.execute(
                    text(
                        "SELECT report_date, campaign_type, impressions, clicks, cost, "
                        "conversions, conversion_revenue, "
                        "COALESCE(signup,0) AS signup, COALESCE(purchase,0) AS purchase, "
                        "COALESCE(apply,0) AS apply "
                        "FROM marketing_data WHERE report_date = :d AND campaign_type = :c"
                    ),
                    {"d": row["report_date"], "c": ct},
                ).fetchall()

                bucket = "updated" if existing else "added"
                diff.setdefault(ct, {"added": [], "updated": []})[bucket].append(ds)

                if existing:
                    stale_combos.append((row["report_date"], ct))
                    for r in existing:
                        undo_rows.append({k: _json_safe(v) for k, v in r._mapping.items()})

                    if has_authority_cols:
                        existing_row = dict(existing[0]._mapping)
                        mask = (db_df["report_date"] == row["report_date"]) & (db_df["campaign_type"] == ct)
                        for i in db_df.index[mask]:
                            if not db_df.at[i, "_has_media"]:
                                for f in self._MEDIA_FIELDS:
                                    db_df.at[i, f] = existing_row[f]
                            if not db_df.at[i, "_has_conv"]:
                                for f in self._CONV_FIELDS:
                                    db_df.at[i, f] = existing_row[f]

        if has_authority_cols:
            db_df = db_df.drop(columns=["_has_media", "_has_conv"])

        # 2단계 — 아무것도 지우기 전에 스냅샷부터 남긴다.
        try:
            _save_undo_snapshot(undo_id, undo_rows)
        except Exception:
            if undo_rows:
                # 덮어쓸 기존 행이 있는데 복구 지점을 못 남겼다면 지우면 안 된다 —
                # 되돌릴 수단 없이 기존 데이터를 날리는 것이 바로 이 순서가 막으려는 상황이다.
                logger.exception("되돌리기 스냅샷 저장 실패 — 기존 데이터를 보호하기 위해 업서트를 중단합니다.")
                raise
            # 덮어쓸 기존 행이 없으면 잃을 것도 없다. 되돌리기 기능의 장애가
            # 업로드 자체를 막지 않도록 여기서는 계속 진행한다.
            logger.exception("되돌리기 스냅샷 저장 실패 — 되돌릴 기존 데이터가 없어 업로드는 계속합니다.")
            undo_id = ""

        # 3단계 — 덮어쓰기. 실패하면 방금 남긴 스냅샷으로 되돌리고 그대로 올린다.
        try:
            if stale_combos:
                with engine.begin() as conn:
                    for report_date, ct in stale_combos:
                        _delete_combo(conn, report_date, ct)

            _insert_in_chunks(db_df)
        except Exception:
            logger.exception("업서트 실패 — 스냅샷(undo_id=%s)으로 복구를 시도합니다.", undo_id)
            try:
                # 비울 범위는 스냅샷이 아니라 이번 업서트가 건드린 전체 범위다 —
                # 원래 값이 없던 조합에도 청크 INSERT 로 새 행이 들어갔을 수 있다.
                _rewrite_rows(undo_rows, clear_combos=combos)
            except Exception:
                # 복구까지 실패하면 스냅샷은 DB 에 남아 있으므로 undo_id 로 되돌릴 수 있다.
                logger.exception("복구 실패 — undo_id=%s 로 수동 복구가 필요합니다.", undo_id)
            raise

        return len(db_df), diff, undo_id

    # ── 되돌리기 ──────────────────────────────────────────────────────────────

    def restore_undo(self, undo_id: str) -> tuple[bool, str]:
        saved_rows = _pop_undo_snapshot(undo_id)
        if saved_rows is None:
            return False, "되돌릴 수 없습니다. 시간이 초과되었거나 이미 되돌렸습니다."

        if not saved_rows:
            # 덮어쓸 기존 데이터가 없던 업로드다. 되돌릴 것이 없다는 사실을 그대로
            # 알린다 — 예전에는 "삭제합니다" 라고 했지만 실제로 지우는 코드가 없어,
            # 아무 일도 하지 않고 성공했다고 보고하고 있었다.
            return False, "되돌릴 이전 데이터가 없습니다. (이 기간에 처음 저장된 업로드입니다.)"

        restored = _rewrite_rows(saved_rows)
        return True, f"이전 상태로 되돌렸습니다. ({restored}개 행 복원)"

    # ── 조회 ──────────────────────────────────────────────────────────────────

    def get_available_periods(self) -> list[dict]:
        rows = (
            self.db.query(
                extract("year", MarketingData.report_date).label("year"),
                extract("month", MarketingData.report_date).label("month"),
            )
            .distinct()
            .order_by(
                extract("year", MarketingData.report_date).desc(),
                extract("month", MarketingData.report_date).desc(),
            )
            .all()
        )
        return [{"year": int(r.year), "month": int(r.month)} for r in rows]

    def _get_period_meta(self, year: int, month: int) -> MarketingPeriodMeta | None:
        return (
            self.db.query(MarketingPeriodMeta)
            .filter(MarketingPeriodMeta.year == year, MarketingPeriodMeta.month == month)
            .first()
        )

    def get_comment_meta(self, year: int, month: int) -> tuple[str, datetime | None]:
        row = self._get_period_meta(year, month)
        if not row:
            return "", None
        return row.comment, row.comment_updated_at

    def get_media_budgets(self, year: int, month: int) -> tuple[dict[str, float], tuple[int, int] | None]:
        """(매체별 예산, 그 값을 가져온 연월). 값이 없으면 ({}, None).

        요청한 기간에 예산이 없으면 그 이전에 입력된 가장 최근 기간의 값을 이어받는다.
        예산은 계약이 바뀌지 않는 한 매달 같은 값이라, 매달 다시 입력하게 하면
        입력을 건너뛴 달의 예산소진율·잔여광고비가 통째로 0이 되기 때문이다.
        """
        # 예전에는 기간 메타를 전부 메모리로 읽어 파이썬에서 걸렀다. 엑셀을 내보낼
        # 때마다 호출되는 경로라, 기간이 쌓일수록 매번 전체 스캔이 됐다. 정렬·범위
        # 조건을 SQL 로 내리고, 쓸 수 있는 값이 나오는 첫 행에서 멈춘다.
        #
        # "값이 있는 행" 판정을 SQL 의 IS NOT NULL 로만 할 수는 없다. 예산을 비우면
        # (set_media_budgets 에 빈 dict) 컬럼에 파이썬 None 이 들어가는데, JSON 타입은
        # 그걸 SQL NULL 이 아니라 **JSON null** 로 저장할 수 있다. 그런 행이 "가장 최근"
        # 으로 뽑히면 그 달부터 이후 전부가 예산 0 이 된다 — 이 함수가 막으려던 바로 그
        # 상황이다. 최종 판정은 파이썬 truthiness 로 한다.
        ordinal = MarketingPeriodMeta.year * 12 + MarketingPeriodMeta.month
        candidates = (
            self.db.query(MarketingPeriodMeta)
            .filter(ordinal <= year * 12 + month)
            .order_by(ordinal.desc())
        )

        for row in candidates:
            if not row.media_budgets:
                continue  # 비워 둔 달은 건너뛰고 그 이전 값을 이어받는다
            budgets = {str(k): float(v) for k, v in row.media_budgets.items() if v is not None}
            if budgets:
                return budgets, (row.year, row.month)

        return {}, None

    def set_media_budgets(self, year: int, month: int, budgets: dict[str, float]) -> None:
        """해당 기간의 매체별 예산을 통째로 교체한다. 빈 dict 를 주면 설정을 지운다."""
        value = {str(k): float(v) for k, v in budgets.items()} or None

        row = self._get_period_meta(year, month)
        if row:
            row.media_budgets = value
        else:
            self.db.add(
                MarketingPeriodMeta(year=year, month=month, comment="", media_budgets=value)
            )

    def get_excel_content(self, year: int, month: int) -> bytes | None:
        """Supabase Storage에서 해당 연월의 엑셀 원본을 가져온다."""
        row = self._get_period_meta(year, month)
        if not row or not row.excel_path:
            return None
        return storage_service.download_excel(row.excel_path)

    def upsert_period_meta(
        self,
        year: int,
        month: int,
        *,
        comment: str | None = None,
        comment_prompt_hash: str | None = None,
        excel_content: bytes | None = None,
    ) -> datetime | None:
        """엑셀 원본은 Supabase Storage에 업로드하고, DB에는 object path만 저장한다.

        comment_prompt_hash 는 AI 가 그 코멘트를 만들 때 쓴 프롬프트의 지문이다.
        코멘트를 쓰면서 지문을 주지 않으면 **지문을 비운다** — 사람이 엑셀에서 넣은
        코멘트를 AI 산출물로 착각해 재사용하면 안 되기 때문이다.

        코멘트를 저장했으면 그 시각을 돌려준다(화면이 "n분 전 생성"을 표시한다).
        """
        excel_path = (
            storage_service.upload_excel(year, month, excel_content)
            if excel_content is not None
            else None
        )

        comment_updated_at = datetime.now(timezone.utc) if comment is not None else None

        row = self._get_period_meta(year, month)
        if row:
            if comment is not None:
                row.comment = comment
                row.comment_updated_at = comment_updated_at
                row.comment_prompt_hash = comment_prompt_hash
            if excel_path is not None:
                row.excel_path = excel_path
        else:
            self.db.add(
                MarketingPeriodMeta(
                    year=year,
                    month=month,
                    comment=comment or "",
                    comment_updated_at=comment_updated_at,
                    comment_prompt_hash=comment_prompt_hash if comment is not None else None,
                    excel_path=excel_path,
                )
            )
        return comment_updated_at

    def get_comment_for_prompt(self, year: int, month: int, prompt_hash: str) -> str | None:
        """같은 프롬프트로 이미 받아 둔 코멘트. 없거나 지문이 다르면 None."""
        row = self._get_period_meta(year, month)
        if row is None or not row.comment or row.comment_prompt_hash != prompt_hash:
            return None
        return row.comment

    def list_period_overview(self) -> list[dict]:
        """관리자 화면용 연월별 요약 — 행 수, 데이터 기간, 코멘트/엑셀 보유 여부.

        데이터 행은 지웠지만 코멘트만 남은 연월도 목록에 나와야 정리할 수 있으므로,
        marketing_data 집계와 marketing_period_meta 를 합집합으로 만든다.
        """
        year_col = extract("year", MarketingData.report_date)
        month_col = extract("month", MarketingData.report_date)

        rows = (
            self.db.query(
                year_col.label("year"),
                month_col.label("month"),
                func.count(MarketingData.id).label("row_count"),
                func.min(MarketingData.report_date).label("first_date"),
                func.max(MarketingData.report_date).label("last_date"),
            )
            .group_by(year_col, month_col)
            .all()
        )
        overview: dict[tuple[int, int], dict] = {
            (int(r.year), int(r.month)): {
                "year": int(r.year),
                "month": int(r.month),
                "row_count": int(r.row_count),
                "first_date": r.first_date.isoformat() if r.first_date else None,
                "last_date": r.last_date.isoformat() if r.last_date else None,
                "has_comment": False,
                "comment_updated_at": None,
                "has_excel": False,
                "has_budget": False,
            }
            for r in rows
        }

        for meta in self.db.query(MarketingPeriodMeta).all():
            key = (meta.year, meta.month)
            entry = overview.setdefault(key, {
                "year": meta.year,
                "month": meta.month,
                "row_count": 0,
                "first_date": None,
                "last_date": None,
                "has_comment": False,
                "comment_updated_at": None,
                "has_excel": False,
                "has_budget": False,
            })
            entry["has_comment"] = bool(meta.comment)
            entry["comment_updated_at"] = meta.comment_updated_at
            entry["has_excel"] = bool(meta.excel_path)
            entry["has_budget"] = bool(meta.media_budgets)

        return sorted(overview.values(), key=lambda e: (e["year"], e["month"]), reverse=True)

    def delete_period(self, year: int, month: int) -> dict:
        """연월 데이터를 통째로 삭제한다 — 행 + 메타(코멘트) + Storage 엑셀 원본.

        Storage 삭제가 실패해도 DB 정리는 진행한다. 남은 객체는 고아가 되지만,
        여기서 멈추면 화면에서 지울 방법이 사라지기 때문이다.
        """
        deleted_rows = self.delete_rows_by_period(year, month)

        meta = self._get_period_meta(year, month)
        excel_deleted = False
        if meta is not None:
            if meta.excel_path:
                try:
                    storage_service.delete_object(meta.excel_path)
                    excel_deleted = True
                except Exception:
                    logger.exception("엑셀 원본 삭제 실패 (메타는 삭제 진행): %s", meta.excel_path)
            self.db.delete(meta)

        return {
            "deleted_rows": deleted_rows,
            "deleted_meta": meta is not None,
            "deleted_excel": excel_deleted,
        }

    def snapshot_periods(self, periods: list[tuple[int, int]]) -> tuple[str, list[dict]]:
        """여러 기간의 현재 행을 되돌리기 스냅샷으로 남기고 (undo_id, rows) 반환.

        기간을 통째로 지우고 다시 넣는 엑셀 교체 경로에서, 지우기 전에 복구 지점을
        확보하려고 쓴다. 저장이 실패하면 호출자가 rows 로 즉시 되돌리고, 그마저
        실패해도 undo_id 로 수동 복구할 수 있도록 DB 에도 남긴다.
        """
        rows = [
            _model_to_snapshot(row)
            for year, month in periods
            for row in self.get_rows_by_period(year, month)
        ]
        undo_id = str(_uuid.uuid4())
        _save_undo_snapshot(undo_id, rows)
        return undo_id, rows

    def delete_rows_by_period(self, year: int, month: int) -> int:
        deleted = (
            self.db.query(MarketingData)
            .filter(in_month(year, month))
            .delete(synchronize_session=False)
        )
        return int(deleted)

    def get_rows_by_period(self, year: int, month: int) -> list[MarketingData]:
        return (
            self.db.query(MarketingData)
            .filter(in_month(year, month))
            .order_by(MarketingData.report_date, MarketingData.campaign_type)
            .all()
        )

    def get_period_totals(self, year: int, month: int) -> dict | None:
        """해당 연월 전체 합계. 데이터가 없으면 None.

        엑셀 summary 시트의 '전월' 행을 채우는 데 쓴다 — 템플릿에 그 달 시트가 없어
        다른 달을 복사해 만들 때, 복사본에 남은 옛 전월 숫자를 이걸로 덮어쓴다.
        """
        r = (
            self.db.query(
                func.sum(MarketingData.impressions).label("impressions"),
                func.sum(MarketingData.clicks).label("clicks"),
                func.sum(MarketingData.cost).label("cost"),
                func.sum(MarketingData.conversions).label("conversions"),
                func.sum(MarketingData.conversion_revenue).label("revenue"),
                func.sum(MarketingData.signup).label("signup"),
                func.sum(MarketingData.purchase).label("purchase"),
                func.sum(MarketingData.apply).label("apply"),
            )
            .filter(in_month(year, month))
            .one()
        )
        if r.impressions is None and r.clicks is None and r.cost is None:
            return None
        return {
            "impressions": int(r.impressions or 0),
            "clicks": int(r.clicks or 0),
            "cost": float(r.cost or 0),
            "conversions": resolve_total_conv(r.conversions, r.signup, r.purchase, r.apply),
            "revenue": float(r.revenue or 0),
            "signup": float(r.signup or 0),
            "purchase": float(r.purchase or 0),
            "apply": float(r.apply or 0),
        }

    def get_media_totals(self, year: int, month: int) -> dict[str, dict]:
        """해당 연월의 매체별 합계 {campaign_type: get_period_totals 형태}. 없으면 빈 dict.

        엑셀 매체 시트의 '전년동월' 행을 채우는 데 쓴다 — 템플릿은 그 행을 외부
        통합문서에서 끌어오는데, 받는 사람에게 그 파일이 없어 빈칸이 되기 때문이다.
        """
        rows = (
            self.db.query(
                MarketingData.campaign_type,
                func.sum(MarketingData.impressions).label("impressions"),
                func.sum(MarketingData.clicks).label("clicks"),
                func.sum(MarketingData.cost).label("cost"),
                func.sum(MarketingData.conversions).label("conversions"),
                func.sum(MarketingData.conversion_revenue).label("revenue"),
                func.sum(MarketingData.signup).label("signup"),
                func.sum(MarketingData.purchase).label("purchase"),
                func.sum(MarketingData.apply).label("apply"),
            )
            .filter(in_month(year, month))
            .group_by(MarketingData.campaign_type)
            .all()
        )
        return {
            r.campaign_type: {
                "impressions": int(r.impressions or 0),
                "clicks": int(r.clicks or 0),
                "cost": float(r.cost or 0),
                "conversions": resolve_total_conv(r.conversions, r.signup, r.purchase, r.apply),
                "revenue": float(r.revenue or 0),
                "signup": float(r.signup or 0),
                "purchase": float(r.purchase or 0),
                "apply": float(r.apply or 0),
            }
            for r in rows
        }

    def get_summary_by_period(self, year: int, month: int) -> list[dict]:
        rows = (
            self.db.query(
                MarketingData.campaign_type,
                func.sum(MarketingData.impressions).label("impressions"),
                func.sum(MarketingData.clicks).label("clicks"),
                func.sum(MarketingData.cost).label("cost"),
                func.sum(MarketingData.conversions).label("conversions"),
                func.sum(MarketingData.conversion_revenue).label("conversion_revenue"),
            )
            .filter(in_month(year, month))
            .group_by(MarketingData.campaign_type)
            .all()
        )
        return [
            {
                "campaign_type": r.campaign_type,
                "impressions": int(r.impressions or 0),
                "clicks": int(r.clicks or 0),
                "cost": float(r.cost or 0),
                "conversions": int(r.conversions or 0),
                "conversion_revenue": float(r.conversion_revenue or 0),
            }
            for r in rows
        ]
