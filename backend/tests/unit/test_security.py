import stat
from pathlib import Path

from app.config import Settings, read_env_file, update_env_file
from app.security import (
    SESSION_SECONDS,
    LoginThrottle,
    hash_password,
    is_password_hash,
    issue_token,
    read_token,
    verify_password,
)

CHEAP = 2**4


def test_a_password_hash_accepts_only_its_password() -> None:
    encoded = hash_password("open sesame", n=CHEAP)

    assert encoded.startswith(f"scrypt:{CHEAP}:")
    assert "open sesame" not in encoded
    assert verify_password("open sesame", encoded)
    assert not verify_password("open sesame!", encoded)
    assert hash_password("open sesame", n=CHEAP) != encoded  # salted


def test_damaged_password_hashes_are_rejected() -> None:
    for damaged in ["", "plain-text-password", "md5:1:2:3:abc:def", "scrypt:x:8:1:c2FsdA:aGFzaA", "scrypt:16:8:1:!!:aGFzaA"]:
        assert not is_password_hash(damaged)
        assert not verify_password("anything", damaged)


def test_a_session_token_names_its_user_until_it_expires() -> None:
    token = issue_token("moderator", "server key", now=1000)

    assert read_token(token, "server key", now=1000) == "moderator"
    assert read_token(token, "server key", now=1000 + SESSION_SECONDS - 1) == "moderator"
    assert read_token(token, "server key", now=1000 + SESSION_SECONDS) is None
    assert read_token(token, "another key", now=1000) is None


def test_a_changed_or_mangled_token_is_rejected() -> None:
    token = issue_token("moderator", "server key", now=1000)
    payload, _, signature = token.partition(".")
    other_payload = issue_token("someone", "server key", now=1000).partition(".")[0]

    for bad in [f"{other_payload}.{signature}", payload, f"{payload}.", "", "not a token", "é.ü"]:
        assert read_token(bad, "server key", now=1000) is None


def test_the_throttle_forgets_failures_after_its_window() -> None:
    now = [0.0]
    throttle = LoginThrottle(max_failures=2, window_seconds=60, clock=lambda: now[0])
    throttle.record_failure()
    throttle.record_failure()
    assert throttle.blocked()

    now[0] = 61
    assert not throttle.blocked()
    throttle.record_failure()
    throttle.reset()
    assert not throttle.blocked()


def test_the_env_file_keeps_other_lines_and_only_its_owner_can_read_it(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("# notes\nRISKSCAN_DICE_SEED=7\nRISKSCAN_AUTH_USERNAME=old\n")

    update_env_file(env_file, {"RISKSCAN_AUTH_USERNAME": "moderator", "RISKSCAN_SECRET_KEY": "k"})

    assert read_env_file(env_file) == {
        "RISKSCAN_DICE_SEED": "7",
        "RISKSCAN_AUTH_USERNAME": "moderator",
        "RISKSCAN_SECRET_KEY": "k",
    }
    assert "# notes" in env_file.read_text()
    assert stat.S_IMODE(env_file.stat().st_mode) == 0o600


def test_settings_read_the_env_file_but_real_variables_win(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    encoded = hash_password("open sesame", n=CHEAP)
    env_file.write_text(f"RISKSCAN_AUTH_USERNAME='from file'\nRISKSCAN_AUTH_PASSWORD_HASH={encoded}\n")

    settings = Settings.from_env(environ={"RISKSCAN_AUTH_USERNAME": "from environment"}, env_file=env_file)

    assert settings.auth_username == "from environment"
    assert settings.auth_password_hash == encoded
    assert settings.login_configured
    assert not Settings.from_env(environ={}, env_file=None).login_configured
