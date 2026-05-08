import { createServer } from "node:http";

const DEFAULT_PORT = 8788;
const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const parsePort = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
};

const readCsvEnv = (name) =>
  (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const isHttpsUrl = (value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const isWorkspaceViewerPath = (value) =>
  value.startsWith("/workspace/") || value.startsWith("/workspace-file/");

const sendText = (response, status, body, headers = {}) => {
  response.writeHead(status, {
    "Content-Length": Buffer.byteLength(body),
    ...headers,
  });
  response.end(body);
};

const sendJson = (response, status, payload, headers = {}) => {
  sendText(response, status, JSON.stringify(payload), {
    ...JSON_HEADERS,
    ...headers,
  });
};

const appleAppSiteAssociationPayload = () => ({
  applinks: {
    apps: [],
    details: readCsvEnv("LILO_IOS_UNIVERSAL_LINK_APP_IDS").map((appID) => ({
      appID,
      paths: ["/open", "/open/*"],
    })),
  },
});

const sendAppleAppSiteAssociation = (response) => {
  sendJson(response, 200, appleAppSiteAssociationPayload(), {
    "Cache-Control": "public, max-age=3600",
  });
};

const sendOpenPage = (response, requestUrl) => {
  const workspaceUrl = requestUrl.searchParams.get("workspace") ?? "";
  const viewerPath = requestUrl.searchParams.get("viewer") ?? "";

  if (!isHttpsUrl(workspaceUrl) || !isWorkspaceViewerPath(viewerPath)) {
    sendJson(response, 400, { error: "Invalid open link" });
    return;
  }

  const fallbackUrl = new URL(workspaceUrl);
  fallbackUrl.pathname = "/";
  fallbackUrl.search = "";
  fallbackUrl.hash = "";
  fallbackUrl.searchParams.set("viewer", viewerPath);

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Open in Lilo</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: -apple-system-body; background: #f7f7f8; color: #111827; }
      main { width: min(88vw, 420px); padding: 28px; border-radius: 24px; background: white; box-shadow: 0 20px 60px rgb(15 23 42 / 0.14); text-align: center; }
      a { display: block; margin-top: 14px; padding: 14px 16px; border-radius: 999px; color: white; background: #147efb; text-decoration: none; font-weight: 700; }
      p { color: #4b5563; line-height: 1.4; }
      code { word-break: break-all; }
    </style>
  </head>
  <body>
    <main>
      <h1>Open in Lilo</h1>
      <p>This link opens <code>${escapeHtml(viewerPath)}</code> in a Lilo workspace.</p>
      <a href="${escapeHtml(fallbackUrl.toString())}">Open in browser</a>
    </main>
  </body>
</html>`;

  sendText(response, 200, html, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
};

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed" }, { Allow: "GET, HEAD" });
    return;
  }

  if (requestUrl.pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (
    requestUrl.pathname === "/.well-known/apple-app-site-association" ||
    requestUrl.pathname === "/apple-app-site-association"
  ) {
    sendAppleAppSiteAssociation(response);
    return;
  }

  if (requestUrl.pathname === "/open" || requestUrl.pathname.startsWith("/open/")) {
    sendOpenPage(response, requestUrl);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

const port = parsePort(process.env.PORT);
server.listen(port, () => {
  console.log(`[link-broker] listening on port ${port}`);
});
