# Workspace apps

The most distinctive thing about Lilo: **the agent builds its own apps**.

A workspace app is just a directory under `$LILO_WORKSPACE_DIR/`:

```
workspace/
├── todo/
│   ├── index.html
│   ├── manifest.json    # { "name": "TODO", "icon": "icon.png" }
│   └── icon.png
├── calories/
│   └── index.html
└── …
```

Each app is served at `http://localhost:8787/workspace/<app-name>/` and
rendered inside the Lilo viewer in a sandboxed iframe. Apps can:

- **Read/write their own files** through a built-in `window.lilo.fs` API
- **Open new chats** via `window.lilo.os.chats.create(...)` — used by the
default Desktop's "Chat with Lilo" prompt box
- **Call other apps** (e.g. open another file in the viewer)
- **Make HTTP requests** through the backend's proxy, so they can talk to
external APIs without CORS pain

Just ask the agent *"build me a habit tracker"* and it'll scaffold the app
directory, write HTML + JS, and open it in the viewer. No build step.

## Element picker

Click the cursor icon in the composer while an app is open, hover any element
in the app, and click. Its HTML, tag, text preview, and screenshot are
attached to your next message — so *"make this button bigger"* actually means
something.
