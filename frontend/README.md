# RiskScan frontend

React 19 + TypeScript + Vite interface for the moderator-led RiskScan game. It follows
`RiskScan visualisation storyboard_final.pdf` and talks to the FastAPI backend in `../backend` (`/api/v1`).
Game rules stay in the backend; this app only displays state and sends the moderator's commands.

## Run it

```
# 1. backend (from backend/)
.venv/bin/uvicorn app.main:create_app --factory

# 2. frontend (from frontend/)
npm install
npm run dev        # http://localhost:5173
```

The dev server proxies `/api` to `http://127.0.0.1:8000`. Point it elsewhere with
`RISKSCAN_BACKEND_URL=http://host:port npm run dev`. Use Node 24 LTS (22.12+ also works). Vitest 5 lists Node 22, 24 and
26+ as supported, so Node 25 may print engine warnings.

For a production build, `npm run build` writes `dist/`. Serve it with any static host and route `/api` to the backend
on the same origin (the client uses relative URLs).

## Screens

| Route | Who | What |
| --- | --- | --- |
| `/` | Everyone | Choose a mode: Moderator, Player (open a board by game id) or Editor |
| `/moderator` | Moderator | Step 1 "Start a game" (destination, geographic scope, 4 or 5 rounds) and a list of games this browser knows |
| `/editor` | Editor | Editor mode: every page of the game with a sample game, where any text can be reworded (see below) |
| `/games/:id` | Moderator | Setup steps 2-5 (elements, hazards, vulnerability matrix, event cards), team roles, priorities, Round 0 practice, every regular round, final review and game history |
| `/board/:id` | Participants | Read-only live board. Waits during setup, polls every 2.5 s, never shows events that have not taken effect |

The moderator page follows the game's phase, so reloading or opening it on another device resumes exactly where the
game is. Storyboard slide to screen:

| Storyboard | Screen |
| --- | --- |
| 01-05 setup | `features/setup/*` (`StartStep`, `ElementsStep`, `HazardsStep`, `VulnerabilitiesStep`, `EventsStep`) |
| 06 introduce the teams | `TeamsStage` (role cards, moderator-only event queue, share link) |
| 07 team priorities | `TeamsStage` priorities editor; elements nobody chooses leave the board. Next to "Start Round 0" it offers "Skip Round 0" (`SkipRoundZero`, confirmed first) to go straight to Round 1 |
| 08 how action cards work | `Round0Intro` (also offers "Skip Round 0" before the first practice action) |
| 09-11 practice actions and Round 0 resolution | `PracticeScreen`, `RollHazardsScreen`, `RoundZeroResultScreen` (only the first two triggered hazards cause damage) |
| 12-13 allocation, actions, funding | `AllocationScreen`, `ActionPhaseScreen` + `FundingForm` |
| 23 diversification | `ActionPhaseScreen` + `DiversifyDetails` (name, starting status (7 by default), vulnerability row, one marker choice per team) + `FundingForm`; the new row is highlighted on the board |
| hazards, event, scores | `RollHazardsScreen`, `HazardResultsScreen`, `EventResultScreen`, `ScoresScreen` |
| continue or finish, final, debrief | `ScoresScreen` (continue / finish with confirmation), `FinalScreen` (winners, history; the winners get a confetti celebration, see below) |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `preview` | Dev server, type-checked production build, preview of the build |
| `npm run typecheck` / `lint` | `tsc --noEmit` and ESLint (including the React hooks rules) |
| `npm test` | Vitest + Testing Library: client, logic, components and pages with a fake API |
| `RISKSCAN_E2E_URL=http://127.0.0.1:8000 npm test -- src/e2e` | Opt-in: plays a full game through the real API with the typed client |
| `npm run api:types` | Regenerate `src/api/schema.d.ts` from `../backend/openapi.json` |

After any backend API change run `python scripts/export_openapi.py` in `backend/`, then `npm run api:types` here, and
commit both generated files. TypeScript is pinned to 5.9: `typescript-eslint` and `openapi-typescript` do not support
TypeScript 7 yet.

## Editor mode

Every text on every page can be reworded without a developer. Open **Editor mode** on the start page:

- Use **Previous / Next** or the page list to go through every page of the game (setup, teams, Round 0, a regular round,
  the final review and the player board). Pages show a sample game that the backend plays with the real rules
  (`GET /api/v1/editor/sample-game`); nothing in the preview can change a real game.
- With the **pen** on, click any text on the page to edit it in the panel on the right. The panel lists every text on the
  page, including ones that are not visible as text (tooltips, screen-reader labels). **All texts** searches everything,
  including texts that only appear in special situations.
- `{name}` in a text is filled in by the game (a round number, a team, a score). Keep it, but move it wherever it reads best.
- Changes are a draft until **Save** (or Ctrl/Cmd+S). **Quit** warns about unsaved changes. Restore default undoes an edit.
- **Undo last save** puts the texts back as they were before the last save. It works once: only that one earlier
  version is kept, so saving several times in a row and then undoing only goes back to the save before the last.

Saved texts are stored in the backend database (`text_overrides`, only the changed texts) and apply to every game and
board for everyone. The catalogue is editable too: element groups, element names, hazard names, action cards, team
interests and event templates. A game copies catalogue names and event wording when the moderator sets it up, so
renaming an element or hazard, or rewording an event template, changes new games, not games already set up. Event
templates follow renamed elements and hazards, so their suggested events still apply.

For developers: shipped wording lives in `src/texts/keys/*.ts` (key → default). Render with `<T k="..." />`, or use
`useT()` where a plain string is needed (attributes, `<option>`). Never hard-code user-visible text in components.

## How it is built

- `src/api`: generated types, a small typed `fetch` client (`client.ts`) and TanStack Query hooks (`queries.ts`).
  Every mutation returns the full game state, which is stored in the query cache, so all views update together.
  Commands never reject; they resolve to the new state or to `null` and expose the API's message as `error`.
- `src/lib`: pure logic with no React: selectors (`derive.ts`), screen copy from the storyboard (`copy.ts`), change
  detection used to highlight what just changed (`diffStates`, `useChanges`).
- `src/components`: board, tokens, cards. `src/features`: setup wizard and round screens. `src/pages`: routes.
- Winner celebration: `FinalSide` (moderator final screen and participant board) mounts `components/Celebration` when the
  game is over and has a winner. It is dependency-free CSS confetti (party poppers from the bottom corners plus confetti
  rain, about 6 s), described by the pure `lib/confetti.ts` and styled in `styles/celebration.css`, which also pops in the
  winners' badge and highlights the winners' name cell in the score table. It plays every time the final screen opens, is
  hidden from assistive technology, never blocks clicks, and is switched off for people who prefer reduced motion (the
  winners stay highlighted).
- Standard content (19 elements, 8 hazards, role cards, action costs, event examples) and rule limits come from
  `GET /api/v1/catalogue`, so nothing about the rules is hard-coded here. The UI only guides: payments must be exact,
  4-5 hazards, at most two events a round. The API still validates everything.
- `src/assets/icons.tsx` holds the placeholder artwork. Replace a component in `RESOURCE_ICON` / `TEAM_ICON` (or the
  card art in `ActionCardView.tsx`) with real illustrations and the whole app picks them up.

## Limits to know about

- There is no login. Participants only get the read-only board by convention: the UI hides future events, but the API
  returns the whole game state to anyone who has the game id.
- The shared board polls; there is no websocket push.
- Teams, roles and markers use placeholder artwork until real card art is supplied.
- `SKILL.md` and `references/frontend.md` still describe an Angular frontend. This app is React, as requested.

## Troubleshooting

- `dyld: Library not loaded ... libllhttp` when running `node` on macOS means the Homebrew Node build and its
  `llhttp` library are out of step. `brew reinstall node` fixes it, or install Node from nodejs.org / a version manager.
- Keep `node_modules` out of folders synced by OneDrive or similar: tens of thousands of small files make the sync slow
  and can create conflict copies.
- A blank page from `npm run dev`, with `504 (Outdated Optimize Dep)` in the browser console, means Vite's dependency
  cache was renamed (a folder called `deps 2`, with `com.apple.fileprovider.before-bounce` as its extended attribute).
  OneDrive does this to any folder a tool deletes and recreates, `dist/assets 2` after a build included. The cache
  therefore lives in the OS temp folder (`cacheDir` in `vite.config.ts`). Moving the whole project out of the synced
  folder avoids the other cases too.
