"""애플리케이션 설정.

pydantic-settings로 타입 검증을 하고, 운영(ENVIRONMENT=production)에서는 위험한
기본값으로 서버가 조용히 뜨지 않도록 필수값을 강제한다. 예전 구현은 SECRET_KEY가
비어 있어도 그대로 기동해서 빈 문자열로 JWT를 서명했고, DB URL에는 실제로
접속 가능한 비밀번호가 하드코딩돼 있었다.
"""

import codecs
import logging
import secrets
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

_BACK_DIR = Path(__file__).resolve().parents[2]  # back/
_DEV_DATABASE_URL = "postgresql+psycopg2://postgres:postgres@localhost:5432/marketing_db"
_BOM = codecs.BOM_UTF8.decode("utf-8")  # U+FEFF — 소스에 보이지 않는 문자를 직접 넣지 않는다


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_BACK_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
        populate_by_name=True,  # 테스트에서 CORS_ORIGINS_RAW 필드명으로도 주입할 수 있게
    )

    # Environment
    ENVIRONMENT: str = "development"  # "development" | "production"
    LOG_LEVEL: str = "INFO"  # 기동 진단 로그가 INFO — 낮추면 원인 추적이 어려워진다

    # CORS (쉼표 구분, 예: "https://example.com,https://admin.example.com")
    # 리스트 필드로 선언하면 pydantic-settings가 환경변수를 JSON으로 파싱하려 들기 때문에
    # 원문 문자열로 받고 CORS_ORIGINS 프로퍼티에서 쪼갠다.
    CORS_ORIGINS_RAW: str = Field(default="http://localhost:3000", validation_alias="CORS_ORIGINS")

    # Database
    DATABASE_URL: str = _DEV_DATABASE_URL

    # 커넥션 풀 크기. 블로킹 엔드포인트를 스레드풀에서 돌리게 되면서 DB 를 동시에
    # 때리는 요청 수가 늘었다 — 예전에는 이벤트 루프에서 직렬 처리돼 사실상 1개였다.
    # anyio 기본 워커 스레드(40)보다 작게 두되, 폴링성 조회가 풀 고갈로 막히지
    # 않을 만큼은 확보한다. Supabase 풀러 상한에 맞춰 조정할 것.
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    # 기동 시 `alembic upgrade head` 를 자동 실행할지.
    # 기본값은 개발 True / 운영 False (아래 _validate 에서 결정) — 운영에서는
    # 배포 파이프라인의 별도 단계에서 적용하고, 앱은 상태 점검만 한다.
    RUN_MIGRATIONS_ON_STARTUP: bool | None = None

    # Supabase Storage (대용량 첨부파일 — bytea 대신 객체 스토리지에 저장)
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_STORAGE_BUCKET: str = "marketing-reports"

    # LLM
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    LLM_PROVIDER: str = "openai"  # "openai" | "claude" | "gemini"
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-opus-4-8"
    GEMINI_API_KEY: str = ""
    # 이미지 모델 전용 키 — 게이트웨이가 모델별로 키를 끊어 발급하면 둘로 나뉜다.
    # 비우면 GEMINI_API_KEY 하나로 텍스트·이미지 모두 호출한다.
    GEMINI_IMAGE_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_IMAGE_MODEL: str = "gemini-2.5-flash-image"
    # 게이트웨이(사내 라우터 등)를 거칠 때만 지정 — 비우면 공급자 기본 엔드포인트.
    GEMINI_BASE_URL: str = ""
    ANTHROPIC_BASE_URL: str = ""

    # LLM 호출 상한 — 지정하지 않으면 SDK 기본값이 사실상 무한대라, 공급자가
    # 응답을 멈추면 요청 스레드가 영원히 매달린다. 이미지 생성은 텍스트보다
    # 훨씬 오래 걸려 한도를 따로 둔다.
    LLM_TIMEOUT_SECONDS: float = 60.0
    LLM_IMAGE_TIMEOUT_SECONDS: float = 180.0
    LLM_MAX_RETRIES: int = 2

    # Mail
    MAIL_ENABLED: bool = True
    MAIL_PROVIDER: str = "smtp"  # "resend" | "smtp"
    RESEND_API_KEY: str = ""
    RESEND_FROM: str = ""
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 465
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""

    # Report auto-send schedule (APScheduler cron syntax fields)
    REPORT_CRON_HOUR: str = "9"
    REPORT_CRON_DAY: str = "1"   # 매월 1일
    REPORT_AUTO_RECIPIENTS: str = ""  # 쉼표 구분

    # 키워드 순위 하락 알림
    RANK_ALERT_RECIPIENTS: str = ""  # 쉼표 구분. 비어 있으면 알림을 보내지 않는다.
    RANK_ALERT_CRON_HOUR: str = "9"  # 매일 이 시각에 평가 (업로드 직후에도 평가한다)

    # 네이버 검색광고 API (M2 자동 수집). 비어 있으면 수집기가 비활성화되고
    # 보고서 업로드만으로 동작한다 — 키 없이도 기능 전체가 돌아가야 한다.
    NAVER_SEARCHAD_API_KEY: str = ""
    NAVER_SEARCHAD_SECRET_KEY: str = ""
    NAVER_SEARCHAD_CUSTOMER_ID: str = ""
    NAVER_SEARCHAD_BASE_URL: str = "https://api.searchad.naver.com"
    # 매일 이 시각에 전일 확정치를 수집한다. 알림 평가는 수집 직후 이어서 돈다.
    RANK_COLLECT_CRON_HOUR: str = "8"

    # ── 수집 튜닝 — 코드에 박아 두면 매체 정책이 바뀔 때마다 배포가 필요해진다 ──
    # 통계 한 번에 묶는 키워드 ID 수 (매체 호출량 한도에 맞춰 조정)
    NAVER_STATS_CHUNK: int = 100
    # 디바이스 분리(breakdown)가 허용되는 기간. 매체 공지는 "최근 7일 이내"인데
    # 경계일에서 거부되는 일이 없도록 하루 여유를 둔다. 이 값이 틀려도 수집기는
    # 거부 응답을 받으면 합산 조회로 스스로 전환한다 — 이 값은 "뻔히 실패할 호출을
    # 보내지 않는" 최적화일 뿐이다.
    NAVER_BREAKDOWN_MAX_AGE_DAYS: int = 6
    # 저장해 둔 광고 키워드 ID 를 며칠까지 믿을지 (광고그룹 개편 대비 재확인 주기)
    RANK_ID_CACHE_DAYS: int = 7
    # 월간 리포트의 순위 현황에 싣는 최대 키워드 수 (넘치면 "외 N개"로 알린다)
    RANK_REPORT_MAX_ROWS: int = 8

    @property
    def is_naver_searchad_configured(self) -> bool:
        return bool(
            self.NAVER_SEARCHAD_API_KEY
            and self.NAVER_SEARCHAD_SECRET_KEY
            and self.NAVER_SEARCHAD_CUSTOMER_ID
        )

    # Auth (JWT) — FastAPI가 발급/검증하는 access token 서명 키 (NextAuth의 AUTH_SECRET과는 독립된 값)
    SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    # 업로드 상한
    # CSV·Excel 업로드 한 건(그리고 다중 업로드의 합계) 상한
    MAX_DATA_UPLOAD_MB: int = 50
    # 모든 요청의 본문 상한 — 미들웨어가 Content-Length로 먼저 거른다.
    # 이미지 업로드(50MB)와 다중 CSV 업로드를 모두 수용할 수 있게 넉넉히 잡는다.
    MAX_REQUEST_MB: int = 100

    # 로그인 무차별 대입 방어 — 연속 실패가 임계값에 닿으면 계정을 일시 잠근다.
    LOGIN_MAX_FAILED_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15

    # 요청 빈도 제한 (slowapi)
    RATE_LIMIT_ENABLED: bool = True
    # 기본값은 프로세스 메모리 — 인스턴스를 여러 개 띄우면 "redis://host:6379/0"으로 바꿔야
    # 카운터가 공유된다.
    RATE_LIMIT_STORAGE_URI: str = "memory://"
    RATE_LIMIT_LOGIN: str = "10/minute"
    RATE_LIMIT_AI: str = "30/hour"
    # 프록시(Cloud Run/Vercel) 뒤에 있으면 X-Forwarded-For로 클라이언트 IP를 판별한다.
    TRUST_PROXY_HEADERS: bool = True

    @field_validator("*", mode="before")
    @classmethod
    def _strip_bom_and_space(cls, value):
        """모든 문자열 설정값에서 BOM과 앞뒤 공백을 제거한다.

        시크릿을 UTF-8 BOM으로 저장하면 값 맨 앞에 U+FEFF가 붙는다. 그 값이 HTTP 헤더로
        들어가는 순간 한참 뒤에서 터진다 — 실제로 Supabase Storage 업로드가
        "'ascii' codec can't encode character '\\ufeff' in position 7" 로 실패했다.
        ("Bearer "가 7글자라 키의 첫 글자가 position 7이다.)
        로컬 .env는 BOM이 없어 운영에서만 재현되고, 메시지에 원인이 드러나지 않는다.
        """
        if isinstance(value, str):
            return value.replace(_BOM, "").strip()
        return value

    @property
    def CORS_ORIGINS(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS_RAW.split(",") if origin.strip()]

    @property
    def GEMINI_IMAGE_KEY(self) -> str:
        """이미지 모델 호출에 실제로 쓰는 키 — 전용 키가 없으면 공용 키로 폴백.

        "키가 설정됐는가" 판단과 클라이언트 생성이 서로 다른 키를 보면
        이미지 전용 키만 설정한 배포에서 기능이 조용히 죽는다. 해석을 이
        한 곳에 모은다.
        """
        return self.GEMINI_IMAGE_API_KEY or self.GEMINI_API_KEY

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @model_validator(mode="after")
    def _validate(self) -> "Settings":
        if self.RUN_MIGRATIONS_ON_STARTUP is None:
            # 개발에서는 켜두는 편이 편하고, 운영에서는 배포 단계가 책임진다.
            # 명시적으로 지정하면 그 값이 우선한다.
            self.RUN_MIGRATIONS_ON_STARTUP = not self.is_production

        if self.is_production:
            problems: list[str] = []
            if len(self.SECRET_KEY) < 32:
                problems.append(
                    "SECRET_KEY가 비어 있거나 너무 짧습니다 (32자 이상 필요). "
                    "생성 예: openssl rand -base64 32"
                )
            if self.DATABASE_URL == _DEV_DATABASE_URL or "localhost" in self.DATABASE_URL:
                problems.append("DATABASE_URL이 개발용 기본값(localhost)입니다.")
            if not self.CORS_ORIGINS:
                problems.append("CORS_ORIGINS가 비어 있습니다.")
            if problems:
                raise ValueError(
                    "ENVIRONMENT=production 인데 필수 설정이 올바르지 않습니다:\n  - "
                    + "\n  - ".join(problems)
                )
        elif not self.SECRET_KEY:
            # 개발 환경에서는 기동을 막지 않되, 재시작할 때마다 키가 바뀌어
            # 기존 토큰이 무효해진다는 점을 분명히 알린다.
            self.SECRET_KEY = secrets.token_urlsafe(32)
            logger.warning(
                "SECRET_KEY가 설정되지 않아 임시 키를 생성했습니다 — 서버를 재시작하면 "
                "발급된 토큰이 모두 무효해집니다. .env에 SECRET_KEY를 지정하세요."
            )
        return self


settings = Settings()
