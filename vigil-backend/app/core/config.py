from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "VIGIL Backend"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    DATABASE_URL: str = ""

    GITHUB_APP_ID: str = ""
    GITHUB_PRIVATE_KEY: str = ""
    GITHUB_PRIVATE_KEY_PATH: str = ""
    GITHUB_WEBHOOK_SECRET: str = ""
    GITHUB_INSTALLATION_ID: int = 0
    GITHUB_API_BASE_URL: str = "https://api.github.com"
    REVIEWER_IDENTITY_HMAC_SECRET: str = ""

    # CORS configuration - default to open for local development
    CORS_ORIGINS: list[str] = ["*"]

    # ── Legacy commit-analysis Groq config (retained for its existing endpoint) ──
    LLM_PROVIDER: str = "groq"
    LLM_MODEL: str = "llama3-8b-8192"
    LLM_API_KEY: str = ""

    # ── Canonical AI gateway configuration ──
    AI_PROVIDER: str = "groq"
    AI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    AI_BASE_URL: str = "https://api.groq.com/openai/v1"
    AI_MODEL: str = "openai/gpt-oss-120b"
    AI_FALLBACK_MODEL: str = "openai/gpt-oss-20b"
    AI_TIMEOUT_SECONDS: float = 90.0
    AI_MAX_RETRIES: int = 3
    AI_TEMPERATURE: float = 0.1
    AI_MAX_OUTPUT_TOKENS: int = 6144
    SECURITY_ASSUMPTIONS_MAX_ITEMS: int = 30
    SECURITY_ASSUMPTIONS_MAX_CONTEXT_CHARS: int = 80_000
    SECURITY_ASSUMPTIONS_CONFIDENCE_THRESHOLD: float = 0.5
    SECURITY_ASSUMPTIONS_EXTRACTION_MODE: str = "changed_code"
    SECURITY_ASSUMPTIONS_AMBIGUITY_THRESHOLD: float = 0.15
    SECURITY_ASSUMPTIONS_DETERMINISTIC_MATCH_THRESHOLD: float = 1.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
