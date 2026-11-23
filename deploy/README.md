# Production deployment (private)

SewerNet ships as an HTTP-only container stack. The compose files in this
folder bind the router to **loopback only**; they never terminate public TLS
and never bind a privileged port. Public HTTPS is terminated by the owner's
**existing** root Nginx, which is **never** edited or managed by this repo.

> **External HTTPS is mandatory.** The web client's service worker, WebCrypto /
> rust-crypto (E2EE) and OIDC callbacks only work in a secure browser context.
> Internal HTTP between the owner's Nginx and the router does **not** replace
> HTTPS on the public side. Do not expose the loopback port directly to users.

Nothing here performs a deploy or changes any running server. All server-side
steps below are instructions for the owner to review and run by hand.

## 1. Configuration

Copy the public template and fill in your hostnames:

```bash
cp .env.example .env
```

Required variables (all present in `.env.example`):

- `COMMON_DOMAIN` — shared external domain, e.g. `example.com`.
- `SITE_SUBDOMAIN` — marketing site subdomain, e.g. `sewer-net`.
- `APP_SUBDOMAIN` — web client subdomain, e.g. `sewer-net-app`.
- `ROUTER_PORT` — loopback port the router publishes on the host, e.g. `8082`
  (bound as `127.0.0.1:${ROUTER_PORT}:80`).
- `INGRESS_NETWORK` — only for the container-Nginx variant below; name of the
  owner's external Docker network, e.g. `nginx_proxy`.

Computed hosts are `${SITE_SUBDOMAIN}.${COMMON_DOMAIN}` (site) and
`${APP_SUBDOMAIN}.${COMMON_DOMAIN}` (app). DNS `A`/`AAAA` records for both must
point at the owner's root Nginx, **not** at the loopback port.

`.env` holds public hostnames and optional outbound proxy settings only. It
contains no secrets and is excluded from the Docker build context (see
`.dockerignore`).

## 2. Two supported ingress variants

Pick exactly one. The router always speaks plain HTTP internally with
`auto_https off`; no automatic certificate issuance, certificate material or
privileged port is part of this stack.

### A. Host-Nginx (default)

The router publishes `127.0.0.1:${ROUTER_PORT}:80`. In the owner's **existing**
root Nginx configuration, add a server block per hostname that reuses the
owner's existing TLS setup. Preserve the original Host header — the router
routes by `Host`:

```nginx
server {
    listen 80;
    server_name sewer-net.example.com sewer-net-app.example.com;
    # Redirect to HTTPS using the owner's existing HTTPS configuration.
    return 301 https://$host$request_uri;
}

server {
    # Owner's existing HTTPS listen directive + certificate setup lives here.
    server_name sewer-net.example.com sewer-net-app.example.com;

    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Use the value of `ROUTER_PORT` in place of `8082` if you changed it. The example
terminates public HTTPS in the owner's Nginx; do not move that termination into
this compose stack.

### B. Container-Nginx (named ingress network)

No host port is published at all. Attach the router to the owner's external
Docker network so the owner's containerised Nginx can reach it by service name:

```bash
INGRESS_NETWORK=nginx_proxy docker compose \
  -f compose.yaml -f deploy/compose.ingress.yaml up -d
```

`deploy/compose.ingress.yaml` resets the router's `ports` to `[]` and adds it to
the external `${INGRESS_NETWORK:-ingress}` network. Only `reverse-proxy`
joins this network; `backend` and `landing` stay on the private `services`
network. In the owner's container Nginx, point `proxy_pass` at the router's
container name on that network, again with `proxy_set_header Host $host;`.

Requires Docker Compose v2.24.4+ for the `!reset` YAML tag.

## 3. Backend access

`backend` listens on private `:3000`, publishes no port and exposes `/api/health`.
It is reachable only from inside the `services` network or via private
integration / VPN / SSH from the host. It must **not** receive a public route.
Public exposure of `/api/*` is a separate security task and is intentionally
out of scope here. The web client talks to the homeserver directly and never
calls `/api/matrix/*`.

## 4. Build, restart and health (non-destructive)

Run from the repository root:

```bash
# Build / rebuild images (only this project's images)
docker compose -f compose.yaml build

# Start or restart without deleting anything
docker compose -f compose.yaml up -d --wait

# Resolved config check (uses synthetic values, no secrets)
SITE_SUBDOMAIN=sewer-net APP_SUBDOMAIN=sewer-net-app \
COMMON_DOMAIN=example.test ROUTER_PORT=8082 \
  docker compose -f compose.yaml config
```

Health and logs:

```bash
docker compose -f compose.yaml exec -T backend node -e \
  "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)})"
docker compose -f compose.yaml logs --tail=100
```

HTTP smoke (requires a running stack; sends real `Host` headers):

```bash
node deploy/smoke.mjs --base-url http://127.0.0.1:8082 --domain example.com
```

These commands never remove volumes and never touch anything outside this
project. Avoid `down --volumes` on any environment that holds data you do not
own.

## 5. Blocked / not yet verified

The following have **not** been performed and must not be claimed as done:

- No Docker CLI, docker-compose/caddy or local toolchain run in the preparing
  environment — no image build, no real Caddy smoke, no GitHub Actions green run.
- No external HTTPS / Host-header / Nginx smoke was executed; no OIDC callback
  was exercised on the app subdomain.
- No server changes or production deploy were made. All external acceptance
  is pending the owner's review and an explicit separate authorisation.

Until those are done, the `docker-compose` item in `ROADMAP.md` stays unchecked.
