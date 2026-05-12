from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "sqlite:///./docfill.db"
    host_url: str = "http://host.docker.internal:8002"

    onlyoffice_url: str = "http://localhost:8080"
    jwt_secret: str = "onlyoffice-jwt-secret"
    jwt_enabled: bool = False

    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"

    @property
    def upload_dir(self) -> Path:
        return Path(__file__).parent.parent.parent / "uploads"

    @property
    def processed_dir(self) -> Path:
        return Path(__file__).parent.parent.parent / "processed"


settings = Settings()
