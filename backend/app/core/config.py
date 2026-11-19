from typing import Literal

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
    ai_mode: Literal["mock", "real"] | None = None
    ai_api_url: str = ""
    ai_timeout_seconds: int = 30


settings = Settings()
