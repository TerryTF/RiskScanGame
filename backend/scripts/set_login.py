"""Choose the username and password for the game's one login; saved in backend/.env (run from the backend directory)."""

import getpass
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import ENV_FILE, update_env_file  # noqa: E402
from app.security import hash_password  # noqa: E402

MIN_PASSWORD_LENGTH = 8
MAX_USERNAME_LENGTH = 120


def main() -> None:
    username = input("Username: ").strip()
    if not username or len(username) > MAX_USERNAME_LENGTH:
        sys.exit(f"Enter a username of 1 to {MAX_USERNAME_LENGTH} characters.")
    password = getpass.getpass("Password: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        sys.exit(f"Use a password of at least {MIN_PASSWORD_LENGTH} characters.")
    if getpass.getpass("Repeat the password: ") != password:
        sys.exit("The passwords do not match. Nothing was changed.")
    update_env_file(
        ENV_FILE,
        {
            "RISKSCAN_AUTH_USERNAME": username,
            "RISKSCAN_AUTH_PASSWORD_HASH": hash_password(password),
            # A new key ends every open session, so the old password stops working everywhere at once.
            "RISKSCAN_SECRET_KEY": secrets.token_urlsafe(32),
        },
    )
    print(f"Saved the login for {username!r} in {ENV_FILE}. Restart the backend to use it.")


if __name__ == "__main__":
    main()
