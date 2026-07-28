import uuid as _uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import func, extract, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential
import pandas as pd

from app.core.database import SessionLocal, engine
from app.models.marketing_model import MarketingData, MarketingPeriodMeta
from app.repositories.undo_snapshot_repo import UndoSnapshotRepository
from app.services import storage_service

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
                    "conversions": int(row.get("total_conv") or 0),
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
        """
        has_authority_cols = "_has_media" in db_df.columns and "_has_conv" in db_df.columns
        combos = db_df[["report_date", "campaign_type"]].drop_duplicates()
        diff: dict[str, dict[str, list[str]]] = {}
        undo_rows: list[dict] = []
        undo_id = str(_uuid.uuid4())

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

                    conn.execute(
                        text(
                            "DELETE FROM marketing_data "
                            "WHERE report_date = :d AND campaign_type = :c"
                        ),
                        {"d": row["report_date"], "c": ct},
                    )

        if has_authority_cols:
            db_df = db_df.drop(columns=["_has_media", "_has_conv"])

        _insert_in_chunks(db_df)

        _save_undo_snapshot(undo_id, undo_rows)
        return len(db_df), diff, undo_id

    # ── 되돌리기 ──────────────────────────────────────────────────────────────

    def restore_undo(self, undo_id: str) -> tuple[bool, str]:
        saved_rows = _pop_undo_snapshot(undo_id)
        if saved_rows is None:
            return False, "되돌릴 수 없습니다. 시간이 초과되었거나 이미 되돌렸습니다."

        if not saved_rows:
            return True, "이전 상태로 되돌렸습니다. (저장된 항목이 없었으므로 해당 데이터를 삭제합니다.)"

        df = pd.DataFrame(saved_rows)
        df["report_date"] = pd.to_datetime(df["report_date"]).dt.date
        combos = df[["report_date", "campaign_type"]].drop_duplicates()

        with engine.begin() as conn:
            for _, row in combos.iterrows():
                conn.execute(
                    text(
                        "DELETE FROM marketing_data "
                        "WHERE report_date = :d AND campaign_type = :c"
                    ),
                    {"d": row["report_date"], "c": row["campaign_type"]},
                )

        _insert_in_chunks(df)

        return True, f"이전 상태로 되돌렸습니다. ({len(df)}개 행 복원)"

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
        excel_content: bytes | None = None,
    ) -> None:
        """엑셀 원본은 Supabase Storage에 업로드하고, DB에는 object path만 저장한다."""
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
            if excel_path is not None:
                row.excel_path = excel_path
        else:
            self.db.add(
                MarketingPeriodMeta(
                    year=year,
                    month=month,
                    comment=comment or "",
                    comment_updated_at=comment_updated_at,
                    excel_path=excel_path,
                )
            )

    def delete_rows_by_period(self, year: int, month: int) -> int:
        deleted = (
            self.db.query(MarketingData)
            .filter(
                extract("year", MarketingData.report_date) == year,
                extract("month", MarketingData.report_date) == month,
            )
            .delete(synchronize_session=False)
        )
        return int(deleted)

    def get_rows_by_period(self, year: int, month: int) -> list[MarketingData]:
        return (
            self.db.query(MarketingData)
            .filter(
                extract("year", MarketingData.report_date) == year,
                extract("month", MarketingData.report_date) == month,
            )
            .order_by(MarketingData.report_date, MarketingData.campaign_type)
            .all()
        )

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
            .filter(
                extract("year", MarketingData.report_date) == year,
                extract("month", MarketingData.report_date) == month,
            )
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
