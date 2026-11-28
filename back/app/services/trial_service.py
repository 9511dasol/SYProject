"""체험(trial) 계정 — "유통기한 있는 샌드박스 기업" (기획 확정 7장).

체험을 특별 권한으로 만들지 않는다. 발급 1회가 ① 샌드박스 기업(is_trial, 만료 시각)
② trial 계정 1개 ③ 샘플 마케팅 데이터 시드 ④ 소액 AI 예산을 함께 만들므로,
"실데이터 접근 불가"는 별도 규칙이 아니라 테넌시 격리 자체로 보장된다.

자동 삭제는 2중이다:
  - 즉시 차단 — 로그인·refresh·매 요청의 ensure_company_access 가 만료를 검사한다.
  - 물리 삭제 — purge_expired_trials 를 일일 크론이 돌려 기업째 지운다.

삭제는 FK CASCADE 에 기대지 않고 테이블을 명시적으로 지운다 — 로컬 SQLite 는
FK 를 강제하지 않아 고아 행이 남고, 운영(Postgres)에서도 "무엇을 지웠는지"가
코드에 보이는 편이 낫다.
"""

import logging
import secrets
import uuid
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.core.settings import settings
from app.models.ai_tool_usage_log_model import AIToolUsageLog
from app.models.ai_usage_budget_model import AIUsageBudget
from app.models.background_task_model import BackgroundTask
from app.models.company_model import Company
from app.models.embedding_model import DocumentEmbedding
from app.models.heading_suggestion_model import HeadingSuggestion
from app.models.image_edit_record_model import ImageEditRecord
from app.models.keyword_watch_model import KeywordRankSnapshot, KeywordWatch
from app.models.marketing_model import MarketingData, MarketingPeriodMeta
from app.models.rank_alert_log_model import RankAlertLog
from app.models.report_log_model import ReportLog
from app.models.undo_snapshot_model import UndoSnapshot
from app.models.user_model import User
from app.services.rank_monitor_service import compute_streak, is_breached

logger = logging.getLogger(__name__)

# 기업 물리 삭제 시 지우는 테넌트 테이블 — company_id 를 가진 모든 모델.
# audit_logs 는 일부러 제외한다: 기업이 사라져도 "무슨 일이 있었는지"는 남아야 한다.
# 새 테넌트 모델이 생기면 여기 추가해야 한다 (test_dev_api 가 모델 목록과 대조한다).
_TENANT_MODELS = (
    MarketingData,
    MarketingPeriodMeta,
    AIToolUsageLog,
    AIUsageBudget,
    ReportLog,
    HeadingSuggestion,
    ImageEditRecord,
    KeywordRankSnapshot,
    KeywordWatch,
    RankAlertLog,
    UndoSnapshot,
    BackgroundTask,
    DocumentEmbedding,
)


def _seed_sample_data(db: Session, company_id: int) -> int:
    """샌드박스에 "이렇게 작동됩니다"를 보여줄 샘플 실적을 깐다.

    최근 2개월 × 매체 3종 × 일별 — 대시보드 KPI·MoM 비교·AI 코멘트·엑셀 내보내기가
    전부 그럴듯하게 동작할 최소 분량이다. 값은 결정적 공식으로 만든다(난수를 쓰면
    문제가 생겼을 때 재현할 수 없다).
    """
    media = ("네이버SA", "카카오SA", "구글SA")
    today = date.today()
    months: list[tuple[int, int]] = []
    year, month = today.year, today.month
    for _ in range(max(1, settings.TRIAL_SAMPLE_MONTHS)):
        months.append((year, month))
        year, month = (year - 1, 12) if month == 1 else (year, month - 1)

    rows = 0
    for year, month in months:
        next_first = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
        days = min((next_first - date(year, month, 1)).days, 28)
        for day in range(1, days + 1):
            for idx, campaign in enumerate(media):
                base = 800 + idx * 350 + day * 17 + month * 5
                clicks = max(10, base // 12)
                db.add(
                    MarketingData(
                        company_id=company_id,
                        report_date=date(year, month, day),
                        campaign_type=campaign,
                        impressions=base * 9,
                        clicks=clicks,
                        cost=float(clicks * (900 + idx * 150)),
                        conversions=max(1, clicks // 14),
                        conversion_revenue=float(clicks * (3200 + idx * 400)),
                        signup=float(max(1, clicks // 20)),
                        purchase=float(max(1, clicks // 25)),
                        apply=0.0,
                    )
                )
                rows += 1
    return rows


# 체험 샌드박스에 깔아 두는 순위 감시 예시 — (키워드, 목표 순위, 허용 범위, 일별 평균
# 노출 순위). 순위는 과거→최신 순이고 None 은 "그날 노출 없음"이다. 난수를 쓰지 않는
# 이유는 _seed_sample_data 와 같다 — 문제가 생겼을 때 재현할 수 있어야 한다.
#
# 네 가지 상태를 일부러 모두 담았다. 체험 손님이 처음 보는 화면에서 "이 제품이 무엇을
# 잡아 주는지"가 한눈에 보여야 하고, 그 핵심은 하락 감지다:
#   마케팅대행     — 하락 (최근 4일 연속 목표 이탈 → 하락 상태로 보인다)
#   온라인광고     — 안정 (목표 안에서 유지)
#   브랜드마케팅   — 회복 (이탈했다가 목표 안으로 돌아옴)
#   퍼포먼스마케팅 — 노출이 없던 날이 섞인 이력
_SAMPLE_RANK_WATCHES: tuple[tuple[str, float, float, list[float | None]], ...] = (
    ("마케팅대행", 3.0, 0.5,
     [2.4, 2.6, 2.5, 2.8, 2.7, 3.0, 2.9, 3.1, 3.2, 3.4, 4.1, 4.4, 4.6, 4.9]),
    ("온라인광고", 5.0, 1.0,
     [4.2, 4.0, 4.4, 4.1, 3.9, 4.3, 4.5, 4.2, 3.8, 4.0, 4.4, 4.6, 4.3, 4.1]),
    ("브랜드마케팅", 2.0, 0.5,
     [3.5, 3.4, 3.1, 2.9, 3.0, 2.8, 2.7, 2.6, 2.5, 2.4, 2.6, 2.3, 2.1, 1.9]),
    ("퍼포먼스마케팅", 10.0, 2.0,
     [9.4, 11.2, None, 10.8, 9.9, 10.4, None, 11.6, 10.2, 9.7, 10.1, 11.3, 10.6, 9.8]),
)


def _seed_sample_rank_watches(
    db: Session, company_id: int, recipient: str
) -> tuple[int, int, int]:
    """샌드박스에 순위 감시와 그 이력·알림 기록을 깐다. (감시 수, 이력 행 수, 알림 수).

    마케팅 실적만 깔아 두면 순위 모니터링 화면이 비어 있어, 체험 손님이 제품의 핵심
    가치(하락 감지)를 보기도 전에 "지금 수집"을 눌러보게 된다 — 체험 기업에는 광고
    계정이 연결돼 있지 않으니 그 길은 안내만 돌려준다. 예시 이력을 먼저 깔아
    "이렇게 하락을 잡아 줍니다"를 보여주는 것이 순서다.
    """
    # 전일까지만 쌓는다 — 실제 수집이 전일 확정치 기준이라, 오늘 자 행이 있으면
    # 체험 화면만 운영과 다른 모습이 된다.
    last_day = date.today() - timedelta(days=1)
    now = datetime.now(timezone.utc)
    watch_count = 0
    snapshot_count = 0
    alert_count = 0

    for keyword, target_rank, tolerance, ranks in _SAMPLE_RANK_WATCHES:
        watch = KeywordWatch(
            company_id=company_id,
            keyword=keyword,
            device="all",
            target_rank=target_rank,
            tolerance=tolerance,
            status="active",
        )
        db.add(watch)
        db.flush()  # watch.id 확보 — 스냅샷이 참조한다
        watch_count += 1

        span = len(ranks)
        snapshots: list[KeywordRankSnapshot] = []
        for idx, avg_rank in enumerate(ranks):
            # 순위가 좋을수록 노출·클릭이 많게. 두 축이 서로 어긋나 보이면 예시인 걸
            # 눈치채기 전에 "데이터가 이상하다"로 읽힌다.
            impressions = 0 if avg_rank is None else int(1800 / avg_rank) + idx * 12
            snapshots.append(
                KeywordRankSnapshot(
                    company_id=company_id,
                    watch_id=watch.id,
                    stat_date=last_day - timedelta(days=span - 1 - idx),
                    avg_rank=avg_rank,
                    impressions=impressions,
                    clicks=max(1, impressions // 15) if impressions else 0,
                    # 체험 기업에는 광고 계정이 없다 — "api" 로 두면 하지도 않은
                    # 자동 수집을 했다고 표시된다.
                    source="upload",
                )
            )
        db.add_all(snapshots)
        snapshot_count += len(snapshots)

        # 하락 상태를 숫자로 박지 않고 판정 로직에 물어본다. 박아 두면 목표·허용값을
        # 손볼 때 이력과 표시가 어긋나고, 그 어긋남은 화면에서만 드러난다.
        watch.breach_streak = compute_streak(watch, list(reversed(snapshots)))
        watch.last_checked_at = now

        # 알림 기록도 함께 깐다. 하락 표시만 있고 이력이 비어 있으면 화면이 스스로
        # 모순된다 — "연속 이탈 4회"와 "2회에 도달하면 알림이 나갑니다"가 나란히 뜬다.
        # 기록을 지어내지 않기 위해 엔진 규칙(decide_alert)을 날짜순으로 되짚어,
        # **그날 실제로 나갔을 알림만** 남긴다. 하락 한 번만 알리고 목표로 돌아오면
        # 회복을 한 번 알리는 흐름이 그대로 재현된다.
        streak = 0
        alerted = False
        for idx, snap in enumerate(snapshots):
            streak = streak + 1 if is_breached(watch, snap.avg_rank, snap.impressions) else 0
            if streak >= watch.breaches_required and not alerted:
                alert_type, alerted = "drop", True
            elif alerted and streak == 0:
                alert_type, alerted = "recovered", False
            else:
                continue
            # 수집·평가는 전일 확정치를 들고 다음 날 아침에 돈다.
            sent_at = datetime.combine(
                snap.stat_date + timedelta(days=1), time(8, 5), tzinfo=timezone.utc
            )
            db.add(
                RankAlertLog(
                    company_id=company_id,
                    watch_id=watch.id,
                    keyword=watch.keyword,
                    device=watch.device,
                    alert_type=alert_type,
                    target_rank=watch.target_rank,
                    curr_rank=snap.avg_rank,
                    prev_rank=snapshots[idx - 1].avg_rank if idx else None,
                    breach_streak=streak,
                    # 체험 계정 자신이 수신자다 — 쓰지 않는 주소를 적으면 "누구한테
                    # 간 메일이지?"가 된다.
                    recipients=recipient,
                    status="sent",
                    created_at=sent_at,
                )
            )
            alert_count += 1
            watch.last_alerted_at = sent_at

        # 되짚기가 끝난 시점의 상태가 곧 현재 상태다. 이렇게 두지 않으면 체험 손님이
        # 보고서를 한 번 올리는 순간 예시 하락이 한꺼번에 알림으로 나간다.
        watch.alerted = alerted

    return watch_count, snapshot_count, alert_count


def create_trial(
    db: Session,
    *,
    days: int | None = None,
    company_name: str | None = None,
    email: str | None = None,
    password: str | None = None,
) -> dict:
    """체험 샌드박스를 발급한다. 반환 dict 의 password 는 평문 — 이 자리에서만 노출된다."""
    days = days or settings.TRIAL_DEFAULT_DAYS
    suffix = uuid.uuid4().hex[:6]
    name = company_name or f"체험-{suffix}"
    # 도메인은 설정값이다 — .test/.local 같은 특수용 TLD 를 쓰면 EmailStr 검증이
    # 거부해 "발급은 되는데 로그인이 안 되는" 계정이 된다 (실기동에서 발견).
    login_email = email or f"trial-{suffix}@{settings.TRIAL_EMAIL_DOMAIN}"
    plain_password = password or secrets.token_urlsafe(9)
    expires_at = datetime.now(timezone.utc) + timedelta(days=days)

    company = Company(name=name, is_trial=True, expires_at=expires_at)
    db.add(company)
    db.flush()  # company.id 확보

    db.add(
        User(
            email=login_email,
            name="체험 계정",
            hashed_password=hash_password(plain_password),
            role="trial",
            company_id=company.id,
        )
    )
    db.add(
        AIUsageBudget(company_id=company.id, monthly_token_budget=settings.TRIAL_TOKEN_BUDGET)
    )
    seeded = _seed_sample_data(db, company.id)
    watches, snapshots, alerts = _seed_sample_rank_watches(db, company.id, login_email)
    db.commit()

    logger.info(
        "체험 발급 — 기업 %s(id=%d), 실적 샘플 %d행 · 순위 감시 %d건(이력 %d행, 알림 %d건), 만료 %s",
        name, company.id, seeded, watches, snapshots, alerts, expires_at,
    )
    return {
        "company_id": company.id,
        "company_name": name,
        "email": login_email,
        "password": plain_password,
        "expires_at": expires_at,
    }


def delete_company_cascade(db: Session, company_id: int) -> None:
    """기업과 그 하위 데이터를 전부 지운다. commit 은 호출부가 한다.

    체험 정리 전용이다 — 실기업은 soft delete(is_active=False)가 기본이고,
    물리 삭제 허용 여부는 호출부(라우터·크론)가 is_trial 로 판단한다.
    """
    # 이미지 편집 결과는 스토리지에 객체가 따로 산다 — DB 행만 지우면 객체가
    # 고아로 쌓인다. 실패해도 삭제 자체는 진행한다(과금되는 건 저장 공간뿐이고,
    # 일일 보관 기간 정리가 만료분을 계속 줄여 준다).
    from app.repositories.image_edit_record_repo import ImageEditRecordRepository
    from app.services import storage_service

    for path in ImageEditRecordRepository(db).list_paths_for_company(company_id):
        try:
            storage_service.delete_object(path)
        except Exception:
            logger.exception("기업 삭제 중 이미지 객체 삭제 실패 (path=%s)", path)

    for model in _TENANT_MODELS:
        db.query(model).filter(model.company_id == company_id).delete(
            synchronize_session=False
        )
    db.query(User).filter(User.company_id == company_id).delete(synchronize_session=False)
    db.query(Company).filter(Company.id == company_id).delete(synchronize_session=False)


def purge_expired_trials(db: Session) -> int:
    """만료된 체험 기업을 기업째 지우고 삭제한 기업 수를 돌려준다."""
    now = datetime.now(timezone.utc)
    expired: list[Company] = []
    for company in db.query(Company).filter(Company.is_trial.is_(True)).all():
        expires = company.expires_at
        if expires is None:
            continue
        if expires.tzinfo is None:  # SQLite 는 시간대를 잃는다
            expires = expires.replace(tzinfo=timezone.utc)
        if expires <= now:
            expired.append(company)

    for company in expired:
        logger.info("만료 체험 삭제 — %s (id=%d)", company.name, company.id)
        delete_company_cascade(db, company.id)

    if expired:
        db.commit()
    return len(expired)
