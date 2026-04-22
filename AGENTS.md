# AGENTS

This repository uses `main` as the primary branch.

## Project

Lilo is a monorepo with:

- `frontend/`: React + Vite + TypeScript + Tailwind + Zustand chat UI.
- `backend/`: Hono + TypeScript server that uses the Pi SDK for persistent multi-session chats and streams events to the frontend via SSE.

## Frontend Preferences

- Favor small components.
- Put each component in its own file.
- Keep everything organized well into directories.

## Coding Agent

The coding agent used in this product is Pi Mono:

- Repository: <https://github.com/badlogic/pi-mono>
- Pi SDK docs: <https://raw.githubusercontent.com/badlogic/pi-mono/refs/heads/main/packages/coding-agent/docs/sdk.md>

When changing Pi SDK integration code in this repo, use the Pi SDK docs above as the primary reference for supported session options and APIs.

## Local Development

- Never edit `.env` directly.

From the repo root:

```bash
pnpm install
pnpm run dev:backend
pnpm run dev:frontend
```

Default local URLs:

- Frontend: `http://localhost:5800`
- Backend: `http://localhost:8787`

Workspace apps should be opened over HTTP via:

- `http://localhost:8787/workspace/<app-name>`

## Agent Runtime

The backend runs Pi sessions through the Pi SDK and translates agent events into SSE events for the frontend.
