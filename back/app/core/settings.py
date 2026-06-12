import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")  # "development" | "production"

    # CORS (쉼표 구분, 예: "https://example.com,https://admin.example.com")
    CORS_ORIGINS: list[str] = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
        if origin.strip()
    ]

    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://postgres:1234@localhost:5432/marketing_db",
    )

    # Supabase Storage (대용량 첨부파일 — bytea 대신 객체 스토리지에 저장)
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    SUPABASE_STORAGE_BUCKET: str = os.getenv("SUPABASE_STORAGE_BUCKET", "marketing-reports")

    # LLM
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    OPENAI_EMBEDDING_MODEL: str = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "openai")  # "openai" | "claude"
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

    # Mail
    MAIL_ENABLED: bool = os.getenv("MAIL_ENABLED", "true").lower() == "true"
    MAIL_PROVIDER: str = os.getenv("MAIL_PROVIDER", "smtp")  # "resend" | "smtp"
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    RESEND_FROM: str = os.getenv("RESEND_FROM", "")
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "465"))
    SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "")

    # Report auto-send schedule (APScheduler cron syntax fields)
    REPORT_CRON_HOUR: str = os.getenv("REPORT_CRON_HOUR", "9")
    REPORT_CRON_DAY: str = os.getenv("REPORT_CRON_DAY", "1")   # 매월 1일
    REPORT_AUTO_RECIPIENTS: str = os.getenv("REPORT_AUTO_RECIPIENTS", "")  # 쉼표 구분

    # Auth (JWT) — FastAPI가 발급/검증하는 access token 서명 키 (NextAuth의 AUTH_SECRET과는 독립된 값)
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))


settings = Settings()
