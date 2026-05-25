import time
import uuid as _uuid

from sqlalchemy import func, extract, text
from sqlalchemy.orm import Session
import pandas as pd

from app.core.database import engine
from app.models.marketing_model import MarketingData, MarketingPeriodMeta

# 되돌리기용 임시 저장소 — {undo_id: {"created_at": float, "rows": [dict, ...]}}
undo_store: dict[str, dict] = {}
_UNDO_TTL = 1800  # 30분


def _purge_expired() -> None:
    now = time.time()
    expired = [k for k, v in undo_store.items() if now - v["created_at"] > _UNDO_TTL]
    for k in expired:
        del undo_store[k]


class MarketingRepository:
    def __init__(self, db: Session):
        self.db = db

    # ── 저장 ──────────────────────────────────────────────────────────────────

    def save_from_kpis(self, media_kpis: dict[str, pd.DataFrame]) -> tuple[int, dict, str]:
        """media_kpis dict → DB row 변환 후 UPSERT"""
        if not media_kpis:
            return 0, {}, ""
        records = []
        for campaign_type, daily_df in media_kpis.items():
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

    def _upsert(self, db_df: pd.DataFrame) -> tuple[int, dict, str]:
        """(report_date, campaign_type) 기준 UPSERT.
        삭제된 행을 undo_store에 보관, (삽입 수, diff, undo_id) 반환.
        """
        _purge_expired()
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
                        undo_rows.append(dict(r._mapping))
                    conn.execute(
                        text(
                            "DELETE FROM marketing_data "
                            "WHERE report_date = :d AND campaign_type = :c"
                        ),
                        {"d": row["report_date"], "c": ct},
                    )

            db_df.to_sql("marketing_data", con=conn, if_exists="append", index=False)

        undo_store[undo_id] = {"created_at": time.time(), "rows": undo_rows}
        return len(db_df), diff, undo_id

    # ── 되돌리기 ──────────────────────────────────────────────────────────────

    def restore_undo(self, undo_id: str) -> tuple[bool, str]:
        _purge_expired()
        entry = undo_store.get(undo_id)
        if not entry:
            return False, "되돌릴 수 없습니다. 시간이 초과되었거나 이미 되돌렸습니다."

        del undo_store[undo_id]
        saved_rows: list[dict] = entry["rows"]

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
            df.to_sql("marketing_data", con=conn, if_exists="append", index=False)

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

    def get_comment(self, year: int, month: int) -> str:
        row = self._get_period_meta(year, month)
        return row.comment if row else ""

    def get_excel_content(self, year: int, month: int) -> bytes | None:
        row = self._get_period_meta(year, month)
        return row.excel_content if row else None

    def upsert_period_meta(
        self,
        year: int,
        month: int,
        *,
        comment: str | None = None,
        excel_content: bytes | None = None,
    ) -> None:
        row = self._get_period_meta(year, month)
        if row:
            if comment is not None:
                row.comment = comment
            if excel_content is not None:
                row.excel_content = excel_content
        else:
            self.db.add(
                MarketingPeriodMeta(
                    year=year,
                    month=month,
                    comment=comment or "",
                    excel_content=excel_content,
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
