from fastapi import APIRouter, HTTPException, Request, Response, status

from app.api.deps import AuthDep, UserDep
from app.schemas.auth import LoginRequest, SessionOut
from app.security import SESSION_COOKIE, SESSION_SECONDS

router = APIRouter(prefix="/auth", tags=["login"])


def _secure(request: Request) -> bool:
    # Browsers drop Secure cookies on plain http, which local development uses.
    return request.url.scheme == "https"


@router.post("/login", summary="Log in; sets the session cookie that the other requests need")
def login(body: LoginRequest, request: Request, response: Response, auth: AuthDep) -> SessionOut:
    if auth.throttle.blocked():
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many wrong attempts. Try again in a few minutes.")
    if not auth.check(body.username, body.password):
        auth.throttle.record_failure()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong username or password.")
    auth.throttle.reset()
    response.set_cookie(
        SESSION_COOKIE,
        auth.issue(),
        max_age=SESSION_SECONDS,
        httponly=True,
        samesite="strict",
        secure=_secure(request),
        path="/",
    )
    return SessionOut(username=body.username)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Log out; removes the session cookie",
)
def logout(request: Request) -> Response:
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(SESSION_COOKIE, httponly=True, samesite="strict", secure=_secure(request), path="/")
    return response


@router.get("/session", summary="Who is logged in; 401 when nobody is")
def session(username: UserDep) -> SessionOut:
    return SessionOut(username=username)
