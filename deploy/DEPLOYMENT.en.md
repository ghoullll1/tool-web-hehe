# Tool Web Deployment Guide (English)

This guide deploys the complete stack with Docker Compose: MySQL, RustFS, the MarkItDown worker, the Spring Boot backend, and the Nginx-served frontend. Compose publishes only the frontend port. The RustFS console is bound to host loopback, while the database, S3 API, worker, and backend communicate only on the Compose network.

## 1. Requirements

- Linux x86_64 or ARM64 is recommended.
- Docker Engine and Docker Compose v2 (`docker compose`).
- At least 4 CPU cores, 8 GB RAM, and 20 GB of free disk are recommended; large document conversions need additional memory.
- Access to container registries and dependency repositories during the first build.
- A domain, DNS record, and trusted TLS certificate for an internet-facing deployment.

The bundled RustFS service is single-node/single-disk. It is suitable for development, small deployments, or non-critical workloads, but it has no node or disk redundancy. Critical production deployments should use a separately managed multi-disk or multi-node RustFS service with tested backup and recovery procedures.

## 2. Layout and ports

Run deployment commands from the `deploy` directory:

```text
backend/                 Java API
frontend/                React + Nginx
markitdown-worker/       Document conversion worker
deploy/compose.yml       Complete Compose stack
deploy/.env              Private local configuration (not committed)
```

Default ports:

| Port | Purpose | Exposure |
|---|---|---|
| `8088` | Tool Web frontend and proxied API | `127.0.0.1` by default |
| `9001` | RustFS administration console | `127.0.0.1` only |
| `3306` | MySQL | Compose network only |
| `9000` | RustFS S3 API | Compose network only |
| `8091` | MarkItDown worker | Compose network only |
| `8080` | Java backend | Compose network only |

## 3. Create the deployment configuration

```bash
cd deploy
cp .env.example .env
chmod 600 .env
```

Generate distinct random values:

```bash
# MySQL passwords, administrator password, RustFS secret, worker token
openssl rand -hex 32

# RustFS access key: use A-Z and 0-9 only
openssl rand -hex 12 | tr '[:lower:]' '[:upper:]'
```

Edit `deploy/.env` and set at least:

- `MYSQL_PASSWORD` and `MYSQL_ROOT_PASSWORD`
- `ADMIN_USERNAME` and `ADMIN_PASSWORD`
- `RUSTFS_ACCESS_KEY` and `RUSTFS_SECRET_KEY`
- `OBJECT_STORAGE_ACCESS_KEY` and `OBJECT_STORAGE_SECRET_KEY`
- `DOCUMENT_CONVERSION_WORKER_TOKEN` (at least 32 characters)
- `PUBLIC_ORIGIN`

For an initial private deployment, the `OBJECT_STORAGE_*` values may temporarily match the RustFS administrator credentials. For production, create a service account restricted to the configured bucket and replace `OBJECT_STORAGE_*` with those scoped credentials.

For HTTPS behind a reverse proxy:

```dotenv
WEB_BIND_ADDRESS=127.0.0.1
WEB_PORT=8088
PUBLIC_ORIGIN=https://tools.example.com
```

Validate the expanded Compose configuration without starting anything:

```bash
docker compose --env-file .env -f compose.yml config
```

Compose fails immediately when a required value is empty instead of falling back to a public default password.

## 4. Start infrastructure and create the bucket

Build and start MySQL, RustFS, and the document worker first:

```bash
docker compose --env-file .env -f compose.yml up -d --build \
  mysql rustfs markitdown-worker
docker compose --env-file .env -f compose.yml ps
```

The RustFS console listens at `127.0.0.1:9001` on the server. Open `http://127.0.0.1:9001` for a local deployment. For a remote server, create an SSH tunnel:

```bash
ssh -L 9001:127.0.0.1:9001 user@server
```

Open `http://127.0.0.1:9001`, sign in with `RUSTFS_ACCESS_KEY` and `RUSTFS_SECRET_KEY`, and create a private bucket whose name matches `OBJECT_STORAGE_BUCKET` (default: `temp-files`). Do not enable anonymous/public reads.

When using an external RustFS installation:

1. Remove or disable the Compose `rustfs` service.
2. Point `OBJECT_STORAGE_ENDPOINT` at an HTTPS/S3 endpoint reachable from the backend container.
3. Use a least-privilege bucket account with list, head, get, put, and delete permissions.
4. Keep path-style access enabled unless the external service is explicitly configured for virtual-host style access.

## 5. Start the complete application

```bash
docker compose --env-file .env -f compose.yml up -d --build
docker compose --env-file .env -f compose.yml ps
```

On first startup, the backend runs Flyway to create or upgrade the MySQL schema. Do not edit `flyway_schema_history` manually.

Follow startup logs:

```bash
docker compose --env-file .env -f compose.yml logs -f --tail=200 \
  mysql rustfs markitdown-worker backend frontend
```

## 6. Verify the deployment

```bash
curl --fail http://127.0.0.1:8088/actuator/health
curl --fail http://127.0.0.1:8088/api/v1/tools
```

Browser smoke tests:

1. Open `http://127.0.0.1:8088` and confirm the tool catalog loads.
2. Refresh a `/tools/...` route and confirm it does not return 404.
3. Upload a small test document and confirm Markdown conversion succeeds.
4. Create a temporary file share, claim it with its eight-digit pickup code or QR link, and confirm a second download is rejected.
5. Create and join a temporary chat from two browser windows; confirm WebSocket messages flow both ways and that the server offers no message history after leaving.
6. Confirm MySQL, the RustFS S3 API, the worker, and the backend container ports are not directly reachable from the public network.

## 7. Add an HTTPS reverse proxy

`nginx.example.conf` is an optional outer TLS reverse-proxy template. Replace the domain and certificate paths, install it on the host, and keep `WEB_BIND_ADDRESS=127.0.0.1` in Compose.

```bash
sudo cp nginx.example.conf /etc/nginx/conf.d/tool-web.conf
sudo nginx -t
sudo systemctl reload nginx
```

When using Caddy, Traefik, Cloudflare Tunnel, or a load balancer, forward HTTPS traffic to `127.0.0.1:8088`, preserve the `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto` headers, and enable WebSocket Upgrade for `/ws/v1/temporary-chat`. The room registry is local to one backend process; do not horizontally scale backend replicas until a shared routing layer is added.

## 8. Main environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `PUBLIC_ORIGIN` | Yes | Browser origin, for example `https://tools.example.com` |
| `MYSQL_PASSWORD` | Yes | Application database password |
| `MYSQL_ROOT_PASSWORD` | Yes | MySQL administration and backups only |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Yes | Credentials for `/api/v1/admin/**` |
| `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` | Yes | RustFS administrator credentials |
| `OBJECT_STORAGE_ACCESS_KEY` / `OBJECT_STORAGE_SECRET_KEY` | Yes | Backend object-storage credentials |
| `OBJECT_STORAGE_BUCKET` | No | Private bucket; default `temp-files` |
| `DOCUMENT_CONVERSION_WORKER_TOKEN` | Yes | Internal token shared by backend and worker |
| `TEMPORARY_FILE_SHARE_PICKUP_CODE_SECRET` | Yes | Pickup-code HMAC secret, at least 32 random characters; rotating it invalidates existing codes |
| `TEMPORARY_FILE_SHARE_MAX_FILE_SIZE` | No | Per-file limit; default 30 MB |
| `TEMPORARY_FILE_SHARE_MAX_STORED_BYTES` | No | Total temporary-file quota; default 1 GB |
| `TEMPORARY_CHAT_MAX_ACTIVE_SESSIONS` | No | Maximum active rooms in the single backend process; default 1000 |
| `TEMPORARY_CHAT_MAX_MESSAGE_CHARACTERS` | No | Per-message character limit; default 4000 |
| `HTTP_DIAGNOSTICS_ALLOWED_PORTS` | No | Allowed diagnostic target ports; default `80,443` |

See `.env.example` for all defaults. Never commit real passwords, tokens, certificates, private keys, or the deployment `.env` file.

## 9. Update, roll back, and stop

Back up data before updating, then run:

```bash
docker compose --env-file .env -f compose.yml pull
docker compose --env-file .env -f compose.yml build --pull
docker compose --env-file .env -f compose.yml up -d
```

Stop containers while retaining data:

```bash
docker compose --env-file .env -f compose.yml down
```

Do not run `docker compose down -v` in production; it deletes the MySQL and RustFS named volumes. Application images can be rolled back, but Flyway migrations are forward-only by default. Releases with schema changes need a tested forward-fix or database restore plan.

## 10. Backups

Example MySQL logical backup:

```bash
mkdir -p backups
docker compose --env-file .env -f compose.yml exec -T mysql sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
  > "backups/tool_web_$(date +%Y%m%d_%H%M%S).sql"
```

Back up RustFS through a tested S3 replication workflow, object version/lifecycle policy, or consistent storage-volume snapshots. Do not copy a live data directory while RustFS is writing unless the underlying snapshot mechanism guarantees consistency. Test restores regularly.

## 11. Troubleshooting

### Compose reports a missing variable

Confirm that `--env-file .env` is present and all required values are non-empty:

```bash
docker compose --env-file .env -f compose.yml config
```

### Backend never becomes healthy

```bash
docker compose --env-file .env -f compose.yml logs --tail=200 mysql backend
```

Check MySQL health, matching credentials, and Flyway migration errors.

### Temporary file sharing fails

Confirm that `OBJECT_STORAGE_BUCKET` exists, the backend credentials can access it, and `TEMPORARY_FILE_SHARE_PICKUP_CODE_SECRET` contains at least 32 random characters:

```bash
docker compose --env-file .env -f compose.yml logs --tail=200 rustfs backend
```

### Temporary chat cannot connect

Confirm that `/ws/v1/temporary-chat` receives a WebSocket `101 Switching Protocols` response, that the outer reverse proxy forwards the `Upgrade` and `Connection` headers, and inspect:

```bash
docker compose --env-file .env -f compose.yml logs --tail=200 frontend backend
```

The current room registry lives in backend memory. Keep one backend replica; a multi-replica deployment first needs shared session routing, which ordinary HTTP load balancing or sticky sessions alone cannot provide.

### Document conversion is unavailable

```bash
docker compose --env-file .env -f compose.yml logs --tail=200 markitdown-worker backend
docker compose --env-file .env -f compose.yml exec markitdown-worker \
  python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8091/health/ready').read().decode())"
```

Confirm that the worker image was built with `INSTALL_MARKITDOWN=true` and both services use the exact same token.

## 12. Production security checklist

- Expose only the TLS reverse proxy's ports 80/443 to the internet.
- Keep the RustFS console loopback-bound and access it through an SSH tunnel when needed.
- Use a bucket-scoped object-storage service account instead of long-term RustFS administrator credentials.
- Never commit `.env`, database dumps, certificates, private keys, or logs.
- Use and back up a dedicated random pickup-code HMAC secret; rotating it immediately invalidates unclaimed existing codes.
- Update base images regularly; replace RustFS `latest` with a tested version or digest in production.
- Configure MySQL and RustFS backups and verify restoration.
- Put OIDC/SSO or another access-control layer in front of the administration API before exposing it broadly.
