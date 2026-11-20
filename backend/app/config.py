import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from app.security import is_password_hash

DEFAULT_DATABASE_URL = "sqlite:///riskscan.db"
# Written by scripts/set_login.py; real environment variables take precedence over it.
ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


def read_env_file(path: Path | None) -> dict[str, str]:
    """`KEY=value` lines of a .env file. Blank lines and lines starting with # are skipped."""
    if path is None or not path.is_file():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text().splitlines():
        key, separator, value = line.strip().partition("=")
        if separator and key and not key.startswith("#"):
            values[key.strip()] = value.strip().strip("'\"")
    return values


def update_env_file(path: Path, values: Mapping[str, str]) -> None:
    """Set `values` in a .env file and keep its other lines. Only the file's owner can read it."""
    lines = path.read_text().splitlines() if path.is_file() else []
    kept = [line for line in lines if line.partition("=")[0].strip() not in values]
    text = "\n".join([*kept, *(f"{key}={value}" for key, value in values.items())]) + "\n"
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as file:
        path.chmod(0o600)
        file.write(text)


@dataclass(frozen=True)
class Settings:
    database_url: str = DEFAULT_DATABASE_URL
    # When set, dice are reproducible (seeded); otherwise OS entropy is used.
    dice_seed: int | None = None
    auto_migrate: bool = True
    cors_origins: tuple[str, ...] = ()
    # The one login. Only a hash of the password is kept (see app/security.py).
    auth_username: str | None = None
    auth_password_hash: str | None = None
    # Signs session cookies. Without it a random key is used, so restarting the server logs everyone out.
    secret_key: str | None = None

    @property
    def login_configured(self) -> bool:
        return bool(self.auth_username) and is_password_hash(self.auth_password_hash or "")

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None, env_file: Path | None = ENV_FILE) -> "Settings":
        env = {**read_env_file(env_file), **(os.environ if environ is None else environ)}
        seed = env.get("RISKSCAN_DICE_SEED")
        origins = env.get("RISKSCAN_CORS_ORIGINS", "")
        return cls(
            database_url=env.get("RISKSCAN_DATABASE_URL", DEFAULT_DATABASE_URL),
            dice_seed=int(seed) if seed else None,
            auto_migrate=env.get("RISKSCAN_AUTO_MIGRATE", "1") != "0",
            cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip()),
            auth_username=env.get("RISKSCAN_AUTH_USERNAME") or None,
            auth_password_hash=env.get("RISKSCAN_AUTH_PASSWORD_HASH") or None,
            secret_key=env.get("RISKSCAN_SECRET_KEY") or None,
        )
