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
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.core.settings import settings
from app.models.ai_tool_usage_log_model import AIToolUsageLog
from app.models.ai_usage_budget_model import AIUsageBudget
from app.models.background_task_model import BackgroundTask
from app.models.company_model import Company
from app.models.embedding_model import DocumentEmbedding
from app.models.heading_suggestion_model import HeadingSuggestion
from app.models.keyword_watch_model import KeywordRankSnapshot, KeywordWatch
from app.models.marketing_model import MarketingData, MarketingPeriodMeta
from app.models.rank_alert_log_model import RankAlertLog
from app.models.report_log_model import ReportLog
from app.models.undo_snapshot_model import UndoSnapshot
from app.models.user_model import User

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
    db.commit()

    logger.info("체험 발급 — 기업 %s(id=%d), 샘플 %d행, 만료 %s", name, company.id, seeded, expires_at)
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
