"""애플리케이션 설정.

pydantic-settings로 타입 검증을 하고, 운영(ENVIRONMENT=production)에서는 위험한
기본값으로 서버가 조용히 뜨지 않도록 필수값을 강제한다. 예전 구현은 SECRET_KEY가
비어 있어도 그대로 기동해서 빈 문자열로 JWT를 서명했고, DB URL에는 실제로
접속 가능한 비밀번호가 하드코딩돼 있었다.
"""

import logging
import secrets
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

_BACK_DIR = Path(__file__).resolve().parents[2]  # back/
_DEV_DATABASE_URL = "postgresql+psycopg2://postgres:postgres@localhost:5432/marketing_db"


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
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_IMAGE_MODEL: str = "gemini-2.5-flash-image"

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

    @property
    def CORS_ORIGINS(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS_RAW.split(",") if origin.strip()]

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
