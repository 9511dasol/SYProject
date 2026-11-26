from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.keyword_watch_model import KeywordRankSnapshot, KeywordWatch
from app.models.rank_alert_log_model import RankAlertLog
from app.services.rank.report_parser import normalize_keyword


class KeywordWatchRepository:
    """감시 키워드 저장소 — 요청 경로는 반드시 company_id 를 들고 들어온다.

    company_id=None 은 크론(수집·알림) 같은 시스템 경로 전용이다: 전 기업의 감시를
    한 번에 돌리되, 각 감시의 소속은 watch.company_id 가 들고 있어 기록이 섞이지
    않는다. 요청 핸들러에서 None 으로 만들면 격리가 깨진다 — 금지.
    """

    def __init__(self, db: Session, company_id: int | None = None):
        self.db = db
        self.company_id = company_id

    def _scope(self, query):
        if self.company_id is not None:
            query = query.filter(KeywordWatch.company_id == self.company_id)
        return query

    # ── 감시 대상 ──────────────────────────────────────────────────────────────

    def list_all(self) -> list[KeywordWatch]:
        return self._scope(self.db.query(KeywordWatch)).order_by(KeywordWatch.id.asc()).all()

    def get(self, watch_id: int) -> KeywordWatch | None:
        watch = self.db.get(KeywordWatch, watch_id)
        if watch is None:
            return None
        # 타기업 감시는 "없는 것"이다 — 라우터가 그대로 404 를 내게 None 을 돌려준다.
        if self.company_id is not None and watch.company_id != self.company_id:
            return None
        return watch

    def lock_for_alert(self, watch_ids: list[int]) -> dict[int, KeywordWatch]:
        """알림 후보 행만 잠그고 다시 읽는다 — 같은 하락이 두 번 발송되는 걸 막는다.

        업로드 직후 평가와 매일 도는 크론이 각자의 세션으로 동시에 돌 수 있다.
        둘 다 "아직 안 알림"을 보고 각각 메일을 보내면 같은 내용이 두 번 나간다.
        후보가 정해진 뒤 그 행들만 잠그므로 전체를 잠그지 않는다.
        (SQLite 는 FOR UPDATE 를 무시한다 — 단일 쓰기라 애초에 경합이 없다.)
        """
        if not watch_ids:
            return {}
        rows = (
            self.db.query(KeywordWatch)
            .filter(KeywordWatch.id.in_(watch_ids))
            .with_for_update()
            .all()
        )
        return {row.id: row for row in rows}

    def existing_pairs(self) -> set[tuple[str, str]]:
        """(정규화 키워드, device) 등록 현황 — 대량 등록의 중복 판정용.

        정규화해서 비교하는 이유: 적재는 정규화한 키워드로 매칭하므로
        'Nike' 와 'nike' 를 따로 등록하면 보고서 한 줄이 두 감시에 동시에 꽂혀
        이력과 연속 이탈 카운터가 갈라진다 — 어느 쪽이 진짜인지 알 수 없게 된다.
        """
        rows = self._scope(self.db.query(KeywordWatch.keyword, KeywordWatch.device)).all()
        return {(normalize_keyword(k), d) for k, d in rows}

    def add(self, watch: KeywordWatch) -> KeywordWatch:
        if self.company_id is not None and watch.company_id is None:
            watch.company_id = self.company_id
        self.db.add(watch)
        return watch

    def delete(self, watch: KeywordWatch) -> None:
        # FK 의 ondelete 에 기대지 않고 직접 처리한다 — SQLite(테스트·로컬)는
        # 기본 설정에서 FK 를 강제하지 않아 이력이 고아로 남는다.
        self.db.query(KeywordRankSnapshot).filter(
            KeywordRankSnapshot.watch_id == watch.id
        ).delete(synchronize_session=False)
        # 알림 이력은 지우지 않는다 — "그때 이런 알림이 나갔다"는 기록은 남아야 한다.
        self.db.query(RankAlertLog).filter(RankAlertLog.watch_id == watch.id).update(
            {RankAlertLog.watch_id: None}, synchronize_session=False
        )
        self.db.delete(watch)

    # ── 알림 이력 ──────────────────────────────────────────────────────────────

    def _alerts_query(self, watch_id: int | None):
        query = self.db.query(RankAlertLog)
        if self.company_id is not None:
            # 알림 이력은 감시가 지워져도(watch_id NULL) 남으므로, watch 조인이 아니라
            # 이력 자신의 company_id 로 거른다.
            query = query.filter(RankAlertLog.company_id == self.company_id)
        if watch_id is not None:
            query = query.filter(RankAlertLog.watch_id == watch_id)
        return query

    def list_alerts(
        self, *, watch_id: int | None = None, limit: int = 50, offset: int = 0
    ) -> list[RankAlertLog]:
        return (
            self._alerts_query(watch_id)
            .order_by(RankAlertLog.created_at.desc(), RankAlertLog.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def count_alerts(self, *, watch_id: int | None = None) -> int:
        return self._alerts_query(watch_id).count()

    # ── 순위 이력 ──────────────────────────────────────────────────────────────

    def get_snapshot(
        self, watch_id: int, stat_date: date, source: str
    ) -> KeywordRankSnapshot | None:
        return (
            self.db.query(KeywordRankSnapshot)
            .filter(
                KeywordRankSnapshot.watch_id == watch_id,
                KeywordRankSnapshot.stat_date == stat_date,
                KeywordRankSnapshot.source == source,
            )
            .one_or_none()
        )

    def get_snapshots_bulk(
        self, watch_ids: list[int], stat_date: date, source: str
    ) -> dict[int, KeywordRankSnapshot]:
        """같은 날짜·출처의 스냅샷을 감시 여러 건에 대해 한 쿼리로.

        적재 핫패스용 — 감시마다 get_snapshot 을 부르면 보고서 업로드 한 번에
        감시 수만큼 왕복이 생긴다. (watch_id, stat_date, source) 는 유니크라
        감시당 최대 1건이다.
        """
        if not watch_ids:
            return {}
        rows = (
            self.db.query(KeywordRankSnapshot)
            .filter(
                KeywordRankSnapshot.watch_id.in_(watch_ids),
                KeywordRankSnapshot.stat_date == stat_date,
                KeywordRankSnapshot.source == source,
            )
            .all()
        )
        return {row.watch_id: row for row in rows}

    def latest_snapshots(self, watch_ids: list[int]) -> dict[int, KeywordRankSnapshot]:
        """감시별 가장 최근 스냅샷 — 목록 화면의 '현재 순위' 열.

        최근 날짜가 같은 행이 둘(출처가 다름)이면 나중에 수집된 쪽을 쓴다.
        """
        if not watch_ids:
            return {}
        latest_dates = (
            self.db.query(
                KeywordRankSnapshot.watch_id,
                func.max(KeywordRankSnapshot.stat_date).label("max_date"),
            )
            .filter(KeywordRankSnapshot.watch_id.in_(watch_ids))
            .group_by(KeywordRankSnapshot.watch_id)
            .subquery()
        )
        rows = (
            self.db.query(KeywordRankSnapshot)
            .join(
                latest_dates,
                (KeywordRankSnapshot.watch_id == latest_dates.c.watch_id)
                & (KeywordRankSnapshot.stat_date == latest_dates.c.max_date),
            )
            .order_by(
                KeywordRankSnapshot.collected_at.asc(), KeywordRankSnapshot.id.asc()
            )
            .all()
        )
        # 나중 수집분이 앞선 것을 덮도록 오름차순으로 돌며 갱신한다.
        result: dict[int, KeywordRankSnapshot] = {}
        for row in rows:
            result[row.watch_id] = row
        return result

    def history(self, watch_id: int, limit: int = 90) -> list[KeywordRankSnapshot]:
        """최근 limit건을 날짜 오름차순으로 — 그래프는 왼쪽이 과거여야 한다."""
        rows = (
            self.db.query(KeywordRankSnapshot)
            .filter(KeywordRankSnapshot.watch_id == watch_id)
            .order_by(
                KeywordRankSnapshot.stat_date.desc(), KeywordRankSnapshot.id.desc()
            )
            .limit(limit)
            .all()
        )
        return list(reversed(rows))

    @staticmethod
    def _dedupe_dates_desc(
        rows: list[KeywordRankSnapshot], limit: int
    ) -> list[KeywordRankSnapshot]:
        """내림차순 행에서 날짜당 1건(먼저 나온 = 나중 수집분)만 limit개 남긴다."""
        deduped: list[KeywordRankSnapshot] = []
        seen_dates: set[date] = set()
        for row in rows:
            if row.stat_date in seen_dates:
                continue
            seen_dates.add(row.stat_date)
            deduped.append(row)
            if len(deduped) >= limit:
                break
        return deduped

    def recent_desc(self, watch_id: int, limit: int = 30) -> list[KeywordRankSnapshot]:
        """연속 이탈 재계산용 — 날짜 내림차순, 날짜당 1건(나중 수집분 우선)."""
        rows = (
            self.db.query(KeywordRankSnapshot)
            .filter(KeywordRankSnapshot.watch_id == watch_id)
            .order_by(
                KeywordRankSnapshot.stat_date.desc(),
                KeywordRankSnapshot.collected_at.desc(),
                KeywordRankSnapshot.id.desc(),
            )
            .limit(limit * 2)  # 날짜당 출처가 2개여도 limit일치를 확보
            .all()
        )
        return self._dedupe_dates_desc(rows, limit)

    def recent_desc_bulk(
        self, watch_ids: list[int], limit: int = 30
    ) -> dict[int, list[KeywordRankSnapshot]]:
        """recent_desc 를 감시 여러 건에 대해 한 쿼리로 — 정렬·중복 제거 규칙은 같다.

        적재·알림 평가가 감시마다 이력을 따로 조회하면 업로드 한 번에 감시 수만큼
        왕복이 생긴다. 윈도 함수(row_number)로 감시별 최근 limit×2 건만 끊어 온 뒤
        파이썬에서 recent_desc 와 같은 규칙으로 날짜당 1건을 남긴다.
        (SQLite 3.25+/PostgreSQL 모두 지원.)
        """
        if not watch_ids:
            return {}
        rn = (
            func.row_number()
            .over(
                partition_by=KeywordRankSnapshot.watch_id,
                order_by=(
                    KeywordRankSnapshot.stat_date.desc(),
                    KeywordRankSnapshot.collected_at.desc(),
                    KeywordRankSnapshot.id.desc(),
                ),
            )
            .label("rn")
        )
        ranked = (
            self.db.query(KeywordRankSnapshot.id.label("snap_id"), rn)
            .filter(KeywordRankSnapshot.watch_id.in_(watch_ids))
            .subquery()
        )
        rows = (
            self.db.query(KeywordRankSnapshot)
            .join(ranked, KeywordRankSnapshot.id == ranked.c.snap_id)
            .filter(ranked.c.rn <= limit * 2)
            .order_by(
                KeywordRankSnapshot.watch_id.asc(),
                KeywordRankSnapshot.stat_date.desc(),
                KeywordRankSnapshot.collected_at.desc(),
                KeywordRankSnapshot.id.desc(),
            )
            .all()
        )
        grouped: dict[int, list[KeywordRankSnapshot]] = {}
        for row in rows:
            grouped.setdefault(row.watch_id, []).append(row)
        return {
            watch_id: self._dedupe_dates_desc(group, limit)
            for watch_id, group in grouped.items()
        }
