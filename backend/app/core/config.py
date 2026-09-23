from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Sign Language"
    environment: str = "development"
    database_url: str

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
