"""The single login: password hashing, signed session tokens and a brake on password guessing (standard library only)."""

import base64
import hashlib
import hmac
import json
import secrets
import time
from collections import deque
from collections.abc import Callable

SESSION_COOKIE = "riskscan_session"
SESSION_SECONDS = 12 * 60 * 60

_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_LENGTH = 32


def _encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _decode(text: str) -> bytes:
    return base64.b64decode(text + "=" * (-len(text) % 4), altchars=b"-_", validate=True)


def hash_password(password: str, *, n: int = _SCRYPT_N) -> str:
    """`scrypt:n:r:p:salt:hash`; the cost is stored with the hash so it can be raised later."""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=n, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_SCRYPT_LENGTH)
    return f"scrypt:{n}:{_SCRYPT_R}:{_SCRYPT_P}:{_encode(salt)}:{_encode(digest)}"


def _parse_hash(encoded: str) -> tuple[int, int, int, bytes, bytes]:
    scheme, n, r, p, salt, digest = encoded.split(":")
    if scheme != "scrypt":
        raise ValueError(f"Unknown password hash scheme {scheme!r}")
    return int(n), int(r), int(p), _decode(salt), _decode(digest)


def is_password_hash(encoded: str) -> bool:
    try:
        _parse_hash(encoded)
    except ValueError:
        return False
    return True


def verify_password(password: str, encoded: str) -> bool:
    try:
        n, r, p, salt, expected = _parse_hash(encoded)
        digest = hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p, dklen=len(expected))
    except ValueError:
        return False
    return hmac.compare_digest(digest, expected)


def _sign(payload: str, secret: str) -> str:
    return _encode(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())


def issue_token(username: str, secret: str, now: float | None = None) -> str:
    expires = int((time.time() if now is None else now) + SESSION_SECONDS)
    payload = _encode(json.dumps({"u": username, "exp": expires}).encode())
    return f"{payload}.{_sign(payload, secret)}"


def read_token(token: str, secret: str, now: float | None = None) -> str | None:
    """The username in a token this server signed, or None when it is forged, damaged or expired."""
    payload, _, signature = token.partition(".")
    if not hmac.compare_digest(signature.encode(), _sign(payload, secret).encode()):
        return None
    try:
        data = json.loads(_decode(payload))
        username, expires = data["u"], data["exp"]
    except (ValueError, KeyError, TypeError):
        return None
    if not isinstance(username, str) or not isinstance(expires, int):
        return None
    return username if expires > (time.time() if now is None else now) else None


class LoginThrottle:
    """Refuses logins for a while after too many wrong passwords. Counted for everyone: there is only one account."""

    def __init__(
        self, max_failures: int = 10, window_seconds: float = 300, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._clock = clock
        self._failures: deque[float] = deque()

    def blocked(self) -> bool:
        cutoff = self._clock() - self.window_seconds
        while self._failures and self._failures[0] <= cutoff:
            self._failures.popleft()
        return len(self._failures) >= self.max_failures

    def record_failure(self) -> None:
        self._failures.append(self._clock())

    def reset(self) -> None:
        self._failures.clear()


class Auth:
    """The configured login. Without a username and password hash nobody can log in."""

    def __init__(self, username: str | None, password_hash: str | None, secret_key: str) -> None:
        self._username = username
        self._password_hash = password_hash
        self._secret = secret_key
        self.throttle = LoginThrottle()

    def check(self, username: str, password: str) -> bool:
        if not self._username or not self._password_hash:
            return False
        # Both are always checked, so the time taken does not tell whether the username was right.
        right_user = hmac.compare_digest(username.encode(errors="surrogatepass"), self._username.encode())
        right_password = verify_password(password, self._password_hash)
        return right_user and right_password

    def issue(self) -> str:
        if not self._username:
            raise RuntimeError("No login is configured.")
        return issue_token(self._username, self._secret)

    def user_for(self, token: str | None) -> str | None:
        if not token or not self._username:
            return None
        username = read_token(token, self._secret)
        return username if username == self._username else None
