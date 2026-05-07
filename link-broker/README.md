# Lilo Link Broker

Minimal public service for Lilo Universal Links.

The broker owns one stable associated domain for the iOS app and forwards open
instructions to the native app through Universal Links. Workspace servers can
stay self-hosted and only generate broker URLs.

## Routes

- `GET /health`
- `GET /.well-known/apple-app-site-association`
- `GET /apple-app-site-association`
- `GET /open?workspace=<https-url>&viewer=<workspace-viewer-path>`

`viewer` must start with `/workspace/` or `/workspace-file/`.

## Environment

```bash
LILO_IOS_UNIVERSAL_LINK_APP_IDS=M3A8944T2H.com.getwhimsyworks.lilo
PORT=8788
```

## Railway

Create a separate Railway service with this directory as the service root, or
use the `link-broker/railway.toml` config from the repo root.

The iOS entitlement should use the broker service domain:

```text
applinks:<broker-domain>
```

Workspace servers that send messaging buttons should set:

```bash
LILO_LINK_BROKER_URL=https://<broker-domain>
LILO_PUBLIC_APP_URL=https://<workspace-domain>
```
