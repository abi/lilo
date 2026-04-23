# Lilo

<img src="./frontend/public/favicon.svg" alt="Lilo" width="96" />

**Your personal OS. True personal computing.**

**Edit every app so it fits perfectly into your life, and use it everywhere (desktop, mobile, email, WhatsApp, Telegram).**

[![Join the Lilo Discord](https://img.shields.io/badge/Discord-Join%20the%20community-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/RAKmnS2G)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](./LICENSE)

https://github.com/user-attachments/assets/2094e7f6-4cb7-4d38-8371-eab8d76f39e5



[Features](#features) · [Quick start](#quick-start) · [Configuration](#configuration) · [Workspace apps](#workspace-apps) · [External messaging](#external-messaging) · [Deployment](#deployment)

---

## Features


|                                   |                                                                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **🧱 Apps on demand**             | Ships with a starter set (Desktop launcher, Todo, Calories, Calculator, Wordpad, Minesweeper) and you can ask the agent to build more. All apps have full agentic capabilities.                                  |
| **💬 Talk to Lilo anywhere**      | Inbound message webhooks for **Email** (Resend), **WhatsApp** (Twilio), and **Telegram**. The agent replies in the same channel and keeps a persistent chat per contact.                                         |
| **🎨 Rich tool suite**            | Image generation (Replicate), web search & scraping (Firecrawl), headless browser automation (Browserbase), filesystem ops, shell execution, network fetch — all callable by apps and the agent when configured. |
| **🗂️ Full workspace**            | Store anything as files in the filesystem and preview markdown, code, images, and PDFs inline — accessible to both you and the agent.                                                                            |
| **🧠 Memory**                     | Remembers details about you, your tasks, and your work.                                                                                                                                                          |
| **📱 Mobile-ready**               | Optimized for phones. All apps render seamlessly on both.                                                                                                                                                        |
| **🔐 Password-gated and private** | One env var locks down the entire web app and all backend APIs (REST + WebSocket). Webhooks stay accessible with their own provider-signed requests.                                                             |
| **🧰 Model-agnostic**             | Pick between **GPT 5.4** (OpenAI) and **Claude Opus 4.7** (Anthropic) per chat. Switch mid-conversation.                                                                                                         |
| **🔄 Git-backed cloud sync**      | Optionally sync your workspace to a git remote so the entire workspace (apps, data, and memories) is versioned and portable across devices.                                                                      |
| **⌨️ Keyboard-first UX**          | `⌘K` / `Ctrl+K` command palette for instant app switching. Browser back/forward navigates between previously opened apps.                                                                                        |


---

## Quick start

### Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io) 10+
- An API key for at least one of: OpenAI, Anthropic

### 1. Install

```bash
git clone https://github.com/abi/lilo.git
cd lilo
pnpm install
```

### 2. Configure

Create a `.env.local` at the repo root:

```bash
# Required
LILO_WORKSPACE_DIR=./workspace          # where the agent's files live
LILO_SESSIONS_DIR=./.lilo-sessions      # persistent chat session storage

# At least one chat model
OPENAI_API_KEY=sk-...                   # enables GPT 5.4
ANTHROPIC_API_KEY=sk-ant-...            # enables Claude Opus 4.7

# Recommended
LILO_AUTH_PASSWORD=choose-a-strong-password   # locks down the whole app
```

See [Configuration](#configuration) for the full list.

### 3. Run

```bash
pnpm run dev   # backend (http://localhost:8787) + frontend (http://localhost:5800) + typechecks
```

Open `http://localhost:5800`. If you set `LILO_AUTH_PASSWORD`, you'll get a
login screen on first visit.

Your workspace should be auto-bootstrapped from the bundled  
`[workspace-template/](./workspace-template)`, so you'll immediately have a  
Desktop, TODO list, Calories tracker, and a handful of other apps to play with.

---

## Configuration

All env vars are read from (in order of precedence):

1. Shell-exported variables
2. `.env.local` at the repo root
3. `.env` at the repo root

### Core


| Variable                   | Required | Default              | Description                                                                                                 |
| -------------------------- | -------- | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `LILO_WORKSPACE_DIR`       | ✅        | —                    | Directory the agent works in. Auto-bootstrapped from `workspace-template/` if empty.                        |
| `LILO_SESSIONS_DIR`        | ✅        | —                    | Where persistent Pi chat sessions (`chats/`) and app sessions (`apps/`) are stored.                         |
| `LILO_AUTH_PASSWORD`       | —        | unset (open)         | Single-password login for the web app + all APIs + WebSockets. Leave unset for a fully open local instance. |
| `LILO_AUTH_SESSION_SECRET` | —        | `LILO_AUTH_PASSWORD` | HMAC secret for the session cookie. Rotate to invalidate all existing sessions.                             |
| `PORT`                     | —        | `8787`               | Backend HTTP port.                                                                                          |


### Chat models

At least one is required to actually use Lilo.


| Variable            | Enables         |
| ------------------- | --------------- |
| `OPENAI_API_KEY`    | GPT 5.4, GPT 5.4 Mini |
| `ANTHROPIC_API_KEY` | Claude Opus 4.7 |

Limit the chat dropdown/API to specific models with a comma-separated allowlist:

```bash
LILO_CHAT_MODEL_ALLOWLIST=gpt-5.4-mini
```

Supported model ids: `claude-opus-4-7`, `gpt-5.4`, `gpt-5.4-mini`.


### Agent tools (optional)

Each one unlocks a corresponding agent tool. Missing keys just disable the
tool — the agent keeps working without them.


| Variable                   | Tool                                                                      |
| -------------------------- | ------------------------------------------------------------------------- |
| `REPLICATE_API_KEY`        | `generate_images`, `remove_background`                                    |
| `LILO_DEFAULT_IMAGE_MODEL` | Image model — `nano-banana` (default), `nano-banana-2`, `flux-2-klein-4b` |
| `FIRECRAWL_API_KEY`        | `web_search`, `web_scrape`                                                |
| `BROWSERBASE_API_KEY`      | `browser_automate`                                                        |
| `BROWSERBASE_PROJECT_ID`   | Optional project id; usually inferred                                     |


### Git sync (optional)

Point `PI_WORKSPACE_REPO` at a git repo to auto-clone it into
`LILO_WORKSPACE_DIR` on first boot and keep your workspace (apps, data, and
memories) versioned and portable across hosts. The frontend shows a manual
"Sync" button for push/pull; hide it with `VITE_DISABLE_WORKSPACE_SYNC` when
you aren't using this flow.


| Variable                      | Scope    | Description                                                  |
| ----------------------------- | -------- | ------------------------------------------------------------ |
| `PI_WORKSPACE_REPO`           | backend  | Git remote to clone into `LILO_WORKSPACE_DIR` on first boot. |
| `VITE_DISABLE_WORKSPACE_SYNC` | frontend | Hide the Sync button in the UI (build-time Vite flag).       |


### Frontend observability (optional)

Set at build time — Vite only inlines `VITE_*` vars.


| Variable                                          | Description                          |
| ------------------------------------------------- | ------------------------------------ |
| `VITE_ENABLE_SENTRY` / `VITE_SENTRY_DSN`          | Opt in to Sentry for browser errors. |
| `VITE_ENABLE_LOGROCKET` / `VITE_LOGROCKET_APP_ID` | Opt in to LogRocket session replay.  |


### Backend observability (optional)


| Variable        | Default | Description                          |
| --------------- | ------- | ------------------------------------ |
| `ENABLE_SENTRY` | `false` | Opt in to Sentry for backend errors. |
| `SENTRY_DSN`    | unset   | Backend Sentry DSN.                  |


---

## Workspace apps

The most distinctive thing about Lilo: **the agent builds its own apps**. Each
app lives as a directory of HTML + assets under `$LILO_WORKSPACE_DIR/`, runs
in a sandboxed iframe, and can read/write its own files, open chats, and make
HTTP calls through a built-in `window.lilo` API. Ask the agent *"build me a
habit tracker"* and it scaffolds one — no build step.

**→ [Full guide: docs/workspace-apps.md*](./docs/workspace-apps.md)* (directory
layout, the `window.lilo` API surface, and the in-viewer element picker).

---

## External messaging

Lilo can be an email/SMS/Telegram chatbot. Each channel is an opt-in plugin —
leave its env vars unset and it's disabled.

### Email (Resend)

```bash
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...
LILO_EMAIL_TO=hi@yourdomain.com        # your bot's inbound address
LILO_EMAIL_FROM="Lilo <lilo@yourdomain.com>"
EMAIL_ALLOWED_EMAILS=you@yours.com,partner@theirs.com   # allowlist
```

1. Set up a receiving domain in Resend.
2. Create a webhook pointing to `https://your-lilo/api/inbound-email` with the
  `email.received` event.
3. Send Lilo an email; it replies in-thread.

Replies set `Reply-To: LILO_EMAIL_TO`, so the recipient's reply round-trips
back into the same inbox.

### WhatsApp (Twilio)

```bash
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM_NUMBER=whatsapp:+15555550123
WHATSAPP_ALLOWED_FROM=whatsapp:+15555550124
```

Point a Twilio WhatsApp webhook at `https://your-lilo/api/inbound-whatsapp`.

### Telegram

```bash
TELEGRAM_BOT_TOKEN=123456:ABC-...
```

Point your Telegram bot webhook at `https://your-lilo/api/inbound-telegram`.

> Each contact gets their own persistent chat, so the agent remembers your
> conversation across messages.

---

## Deployment

### Railway (recommended)

```bash
./scripts/setup-railway.sh
```

The interactive setup script will:

- Link or create a Railway project named `lilo`
- Prompt for the GitHub repo to connect
- Set core env vars
- Mount a persistent volume at `/data` for `LILO_WORKSPACE_DIR` +
`LILO_SESSIONS_DIR`
- Generate a public domain on port `8080`

You still configure the optional message-channel keys (Resend / Twilio /  
Telegram / Firecrawl / etc.) from the Railway dashboard.

---

## Development

```bash
pnpm run dev            # run backend + frontend + live typechecks in parallel
pnpm run dev:backend    # port 8787
pnpm run dev:frontend   # port 5800
pnpm run dev:template   # like `dev` but with LILO_WORKSPACE_DIR pointed at the bundled template (useful for trying out the default apps without polluting your own workspace)
pnpm run build          # build both packages
pnpm run lint           # oxlint across the repo
pnpm run format         # oxfmt across the repo
```

---

## Contributing

This is an open source project. Issues and PRs welcome — keep components small
and one-file-per-concern (see [AGENTS.md](./AGENTS.md)).

Join us on **[Discord](https://discord.gg/RAKmnS2G)** to ask questions, share
workspace apps you've built, or follow development.

## License

MIT
