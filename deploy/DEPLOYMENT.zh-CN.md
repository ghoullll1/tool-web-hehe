# Tool Web 部署手册（中文）

本手册使用 Docker Compose 部署完整功能栈：MySQL、RustFS、MarkItDown Worker、Spring Boot 后端和 Nginx 前端。Compose 只对外发布前端端口；RustFS 控制台仅绑定到宿主机回环地址，数据库、S3 API、Worker 和后端只在容器网络中通信。

## 1. 环境要求

- 推荐 Linux x86_64 或 ARM64 服务器。
- Docker Engine 与 Docker Compose v2（使用 `docker compose` 命令）。
- 建议至少 4 核 CPU、8 GB 内存和 20 GB 可用磁盘；大型文档转换需要更多内存。
- 可访问容器镜像仓库和依赖仓库，首次构建会下载 Java、Node、Python、Maven、npm 和 Python 依赖。
- 对外服务需要域名、DNS 记录和可信 TLS 证书。

本 Compose 中的 RustFS 是单节点单磁盘模式，适合开发、小规模或非关键业务。它没有节点/磁盘冗余；关键生产环境应使用独立的多磁盘或多节点 RustFS，并制定备份和恢复流程。

## 2. 目录与端口

从项目根目录运行部署命令：

```text
backend/                 Java API
frontend/                React + Nginx
markitdown-worker/       文档转换 Worker
deploy/compose.yml       完整 Compose 栈
deploy/.env              本机私密配置（不会提交）
```

默认端口：

| 端口 | 用途 | 暴露范围 |
|---|---|---|
| `8088` | Tool Web 前端及反向代理后的 API | 默认仅 `127.0.0.1` |
| `9001` | RustFS 管理控制台 | 仅 `127.0.0.1` |
| `3306` | MySQL | 仅 Compose 网络 |
| `9000` | RustFS S3 API | 仅 Compose 网络 |
| `8091` | MarkItDown Worker | 仅 Compose 网络 |
| `8080` | Java 后端 | 仅 Compose 网络 |

## 3. 创建部署配置

```bash
cd deploy
cp .env.example .env
chmod 600 .env
```

生成互不相同的随机值：

```bash
# MySQL、管理员密码、RustFS Secret Key、Worker Token
openssl rand -hex 32

# RustFS Access Key：只使用 A-Z 和 0-9
openssl rand -hex 12 | tr '[:lower:]' '[:upper:]'
```

编辑 `deploy/.env`，至少设置：

- `MYSQL_PASSWORD` 与 `MYSQL_ROOT_PASSWORD`
- `ADMIN_USERNAME` 与 `ADMIN_PASSWORD`
- `RUSTFS_ACCESS_KEY` 与 `RUSTFS_SECRET_KEY`
- `OBJECT_STORAGE_ACCESS_KEY` 与 `OBJECT_STORAGE_SECRET_KEY`
- `DOCUMENT_CONVERSION_WORKER_TOKEN`（至少 32 个字符）
- `PUBLIC_ORIGIN`

第一次私有部署时，可暂时让 `OBJECT_STORAGE_ACCESS_KEY/SECRET_KEY` 与 RustFS 管理员凭据相同。正式生产环境应在 RustFS 中创建仅能访问指定 Bucket 的服务账号，再把 `OBJECT_STORAGE_*` 替换为该账号凭据。

如果通过域名提供 HTTPS：

```dotenv
WEB_BIND_ADDRESS=127.0.0.1
WEB_PORT=8088
PUBLIC_ORIGIN=https://tools.example.com
```

检查 Compose 展开后的配置。该命令不会启动服务：

```bash
docker compose --env-file .env -f compose.yml config
```

任何必填变量为空时，Compose 会直接报错，而不是使用公开默认密码。

## 4. 启动基础服务并创建 Bucket

先构建并启动 MySQL、RustFS 和文档转换 Worker：

```bash
docker compose --env-file .env -f compose.yml up -d --build \
  mysql rustfs markitdown-worker
docker compose --env-file .env -f compose.yml ps
```

RustFS 控制台默认位于服务器的 `127.0.0.1:9001`。本机部署可直接打开 `http://127.0.0.1:9001`。远程服务器请建立 SSH 隧道：

```bash
ssh -L 9001:127.0.0.1:9001 user@server
```

随后打开 `http://127.0.0.1:9001`，使用 `RUSTFS_ACCESS_KEY` 和 `RUSTFS_SECRET_KEY` 登录，并创建名称与 `OBJECT_STORAGE_BUCKET` 一致的私有 Bucket（默认 `temp-files`）。不要把 Bucket 设置为公开读取。

如果已经使用外部 RustFS：

1. 从 Compose 中移除或停用 `rustfs` 服务。
2. 将后端的 `OBJECT_STORAGE_ENDPOINT` 改为容器可访问的 HTTPS/S3 地址。
3. 使用 Bucket 级最小权限账号，至少允许 list、head、get、put、delete。
4. 保持 `OBJECT_STORAGE_PATH_STYLE_ACCESS=true`，除非外部服务明确配置了虚拟主机模式。

## 5. 启动完整应用

```bash
docker compose --env-file .env -f compose.yml up -d --build
docker compose --env-file .env -f compose.yml ps
```

首次启动时，后端会通过 Flyway 自动创建或升级 MySQL 表。不要手工修改 `flyway_schema_history`。

查看启动日志：

```bash
docker compose --env-file .env -f compose.yml logs -f --tail=200 \
  mysql rustfs markitdown-worker backend frontend
```

## 6. 验证

```bash
curl --fail http://127.0.0.1:8088/actuator/health
curl --fail http://127.0.0.1:8088/api/v1/tools
```

浏览器检查：

1. 打开 `http://127.0.0.1:8088`，工具目录正常加载。
2. 刷新任意 `/tools/...` 路由不会返回 404。
3. 上传一个小型测试文档，确认能够转换为 Markdown。
4. 创建一个临时文件分享并下载一次，确认第二次下载被拒绝。
5. 确认公网无法直接访问 MySQL、RustFS S3 API、Worker 和后端容器端口。

## 7. 配置 HTTPS 反向代理

`nginx.example.conf` 是可选的外层 TLS 反向代理模板。将域名和证书路径替换后安装到宿主机 Nginx，并保持 Compose 的 `WEB_BIND_ADDRESS=127.0.0.1`。

```bash
sudo cp nginx.example.conf /etc/nginx/conf.d/tool-web.conf
sudo nginx -t
sudo systemctl reload nginx
```

如果使用 Caddy、Traefik、Cloudflare Tunnel 或负载均衡器，只需把 HTTPS 流量转发到 `127.0.0.1:8088`，并保留 `Host`、`X-Forwarded-For` 和 `X-Forwarded-Proto` 请求头。

## 8. 主要环境变量

| 变量 | 必填 | 说明 |
|---|---:|---|
| `PUBLIC_ORIGIN` | 是 | 浏览器访问源，例如 `https://tools.example.com` |
| `MYSQL_PASSWORD` | 是 | 应用数据库账号密码 |
| `MYSQL_ROOT_PASSWORD` | 是 | 仅用于 MySQL 管理和备份 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 是 | 后端 `/api/v1/admin/**` 的管理凭据 |
| `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` | 是 | RustFS 管理员凭据 |
| `OBJECT_STORAGE_ACCESS_KEY` / `OBJECT_STORAGE_SECRET_KEY` | 是 | 后端访问对象存储的凭据 |
| `OBJECT_STORAGE_BUCKET` | 否 | 私有 Bucket，默认 `temp-files` |
| `DOCUMENT_CONVERSION_WORKER_TOKEN` | 是 | 后端和 Worker 共用的内部 Token |
| `TEMPORARY_FILE_SHARE_MAX_FILE_SIZE` | 否 | 单个临时文件上限，默认 30 MB |
| `TEMPORARY_FILE_SHARE_MAX_STORED_BYTES` | 否 | 临时文件总配额，默认 1 GB |
| `HTTP_DIAGNOSTICS_ALLOWED_PORTS` | 否 | HTTP 诊断允许的目标端口，默认 `80,443` |

完整默认项见 `.env.example`。不要把真实密码、Token、证书或 `.env` 提交到 Git。

## 9. 更新、回滚和停止

更新前先备份，然后执行：

```bash
docker compose --env-file .env -f compose.yml pull
docker compose --env-file .env -f compose.yml build --pull
docker compose --env-file .env -f compose.yml up -d
```

停止但保留数据：

```bash
docker compose --env-file .env -f compose.yml down
```

不要在生产环境运行 `docker compose down -v`，它会删除 MySQL 和 RustFS 命名卷。应用镜像可以回滚，但 Flyway 迁移默认是前向演进；包含数据库变更的版本必须准备前向修复或已验证的数据恢复方案。

## 10. 备份

MySQL 逻辑备份示例：

```bash
mkdir -p backups
docker compose --env-file .env -f compose.yml exec -T mysql sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
  > "backups/tool_web_$(date +%Y%m%d_%H%M%S).sql"
```

RustFS 数据应通过经过验证的 S3 复制、对象版本/生命周期策略或存储卷快照备份。不要在 RustFS 正在写入时直接复制活动数据目录，除非底层快照能保证一致性。定期执行恢复演练。

## 11. 常见故障

### Compose 提示变量缺失

确认使用了 `--env-file .env`，并且 `.env` 中所有必填项非空：

```bash
docker compose --env-file .env -f compose.yml config
```

### 后端一直不健康

```bash
docker compose --env-file .env -f compose.yml logs --tail=200 mysql backend
```

检查 MySQL 是否健康、账号是否匹配，以及 Flyway 是否报告迁移失败。

### 临时文件分享失败

确认 RustFS 中已创建 `OBJECT_STORAGE_BUCKET`，后端凭据能够访问该 Bucket，并查看：

```bash
docker compose --env-file .env -f compose.yml logs --tail=200 rustfs backend
```

### 文档转换不可用

```bash
docker compose --env-file .env -f compose.yml logs --tail=200 markitdown-worker backend
docker compose --env-file .env -f compose.yml exec markitdown-worker \
  python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8091/health/ready').read().decode())"
```

确认 Worker 镜像使用 `INSTALL_MARKITDOWN=true` 构建，且两端 Token 完全一致。

## 12. 上线安全清单

- 仅将 TLS 反向代理的 80/443 端口暴露到公网。
- RustFS 控制台保持回环绑定，必要时通过 SSH 隧道访问。
- 为对象存储使用 Bucket 级服务账号，不长期使用 RustFS 管理员凭据。
- 禁止提交 `.env`、数据库备份、证书、私钥和日志。
- 定期更新基础镜像；生产环境将 RustFS `latest` 替换为验证过的版本或镜像摘要。
- 配置 MySQL 与 RustFS 备份，并验证恢复流程。
- 管理 API 面向互联网前，建议接入 OIDC/SSO 或额外访问控制。
