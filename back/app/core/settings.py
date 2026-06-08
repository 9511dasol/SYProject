import os


class Settings:
    # LLM
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "openai")  # "openai" | "claude"
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

    # Mail
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


settings = Settings()
