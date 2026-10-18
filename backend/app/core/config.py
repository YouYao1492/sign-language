from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Sign Language"
    environment: str = "development"
    database_url: str

    jwt_secret_key: str
    jwt_algorithm: str = "HS256"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )
    ai_api_url: str = ""  # 空字串 = 使用內建 mock；填入網址 = 呼叫真正的 AI
    ai_timeout_seconds: int = 30


settings = Settings()
