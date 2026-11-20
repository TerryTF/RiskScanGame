# RiskScan backend

FastAPI + SQLAlchemy 2 (SQLite) + Alembic. All game logic is deterministic; dice come from an injected provider.

## Layout
- `app/api/` – thin HTTP routes (`/api/v1`), dependency wiring, error mapping (domain errors -> 404/409/422)
- `app/schemas/` – Pydantic request and response models
- `app/domain/` – enums, rules, state machine (`phases.py`), dice providers, pure calculations (costs, hazards, scoring, events)
- `app/services/` – use cases; one transaction per mutation (`@transactional`)
- `app/repositories/`, `app/db/` – persistence boundary, SQLAlchemy models, migration runner
- `alembic/` – migrations; `openapi.json` – exported contract for the frontend

## Commands (run in `backend/`)
```
python -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:create_app --factory --reload   # migrates the DB on startup
.venv/bin/pytest
.venv/bin/ruff check . && .venv/bin/mypy
.venv/bin/python scripts/export_openapi.py                 # refresh openapi.json (a test fails if stale)
.venv/bin/alembic revision --autogenerate -m "message"     # after changing app/db/models.py
```

Environment: `RISKSCAN_DATABASE_URL` (default `sqlite:///riskscan.db`), `RISKSCAN_DICE_SEED` (reproducible dice),
`RISKSCAN_AUTO_MIGRATE=0` (skip startup migration), `RISKSCAN_CORS_ORIGINS` (comma separated).

## Game flow
`GET catalogue` (standard content and rule limits) -> `POST /games` (destination, geographic scope, rounds)
-> `PUT elements|hazards|vulnerabilities|teams|events` -> `POST setup/complete` -> `PUT priorities`
-> `POST rounds/0/start` -> Round 0 actions `predict`, `adapt`, `invest` (free, each advances the phase)
-> `rounds/0/resolve-hazards` -> `rounds/0/score` -> `rounds/0/complete` -> per regular round: `allocate-resources`,
actions (`predict`, `adapt`, `invest`, `diversify`, `reduce-emissions`) with `payments`, `close-actions`,
`resolve-hazards`, `apply-event`, `score`, then `complete` (next round) or
`POST /games/{id}/finish` (end the game; the last scored round is the final score).

Round 0 is optional: `POST rounds/0/skip` goes straight to Round 1's `allocate-resources`. It works once the priorities
are saved, from `PRIORITIES` or right after `rounds/0/start` and before the first practice action, and then Round 0 never
happens (no actions, dice or changes). Repeating it, or `rounds/0/start`, once Round 1 has begun changes nothing. Before
the priorities are saved it is refused with 422, and during setup or once practice has begun with 409.

Every mutation returns the full game state. Close/resolve/event/score/complete/finish/allocate steps are idempotent.

Rules worth knowing:
- **Round 0 damage limit:** only the first two triggered hazards (board order, left to right) deal damage. Others are
  still `triggered` but `applied: false`.
- **Priorities define the active destination:** elements no team prioritised become `active: false`. They take no
  damage, ignore events, and cannot be targeted. Re-submitting priorities recomputes this.
- **Guidance vs limits:** the API accepts 3-6 rounds and 1-8 hazards. The storyboard's 4-5 rounds, 4-5 hazards and at
  most two events per round are published in `GET /catalogue` (`limits`) for clients to enforce.
- **Diversification:** `POST /actions/diversify` (regular rounds only; Round 0 just explains it) adds an active element,
  by default at status 7 (`limits.diversification_status`). The moderator may set `status` anywhere from 0 to the usual
  starting status 10. The request carries the element's `name` (unique, ignoring case), its
  `vulnerabilities` (one value per hazard) and optional `marker_changes`: at most one `move` or `split` per team. A
  moved marker, large or small, keeps its size on the new element; a split turns a large marker into a small one that
  stays and a small one on the new element. Small markers cannot be split and a team holds one marker per element, so
  after a split a team has more than four markers. One payment (2 money + 1 knowledge + 1 authority) covers all of it,
  and the card can be repeated while teams can afford it. Moving a team's last marker off an element does not remove
  that element from the board.

## Editor mode
`GET /texts` returns the texts edited in the frontend's editor mode (key -> wording); `PUT /texts` saves changes
(`null` restores a text's default). Defaults live in the frontend, so only edited texts are stored (`text_overrides`).
Each save first keeps the texts as they were before it (`text_undo`, one row); `POST /texts/undo` puts that version back
once. Only the version before the last save is kept, so older saves cannot be undone.
`GET /editor/sample-game` plays a scripted game with the real services on a throwaway in-memory database and returns a
snapshot per phase, so the editor can preview every screen; it never touches the application database.

## Concurrency
Every SQLite transaction starts with `BEGIN IMMEDIATE` (engine events in `app/db/session.py`), so requests are served
one after another and each sees the previous one's committed result. That is what keeps simultaneous or repeated
allocate/resolve/score/complete calls idempotent and stops two payments from spending the same resources
(`tests/api/test_concurrency_api.py`). Reads take the same lock. Moving to PostgreSQL needs an equivalent row lock
(`SELECT ... FOR UPDATE` on the game in `GameRepository.get`).
