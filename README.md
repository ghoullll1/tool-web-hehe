# Tool Web

Tool Web is a full-stack collection of browser-local and server-backed utilities. This public distribution contains the complete React frontend, Spring Boot backend, document-conversion worker, database migrations, automated tests, and a container-first deployment bundle.

## 中文

### 项目结构

- `frontend/`：React 19、TypeScript 6、Vite 8 和非 root Nginx 运行镜像。
- `backend/`：Java 25、Spring Boot 4、MyBatis-Plus、Flyway、MySQL 和 S3/RustFS 集成。
- `markitdown-worker/`：隔离的 FastAPI + MarkItDown 文档转换 Worker。
- `deploy/`：MySQL、RustFS、Worker、后端和前端的完整 Docker Compose 部署。

完整中文部署步骤见 [`deploy/DEPLOYMENT.zh-CN.md`](deploy/DEPLOYMENT.zh-CN.md)。

### 本地验证

```bash
cd backend
./mvnw verify

cd ../frontend
npm ci
npm run lint
npm test
npm run build

cd ../markitdown-worker
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows: .venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
pytest
ruff check .
mypy
```

本地开发默认使用文件系统保存临时分享；生产配置使用私有 RustFS Bucket。所有真实密码、Token、域名和基础设施地址都必须通过本地环境变量或未提交的 `deploy/.env` 提供。

## English

### Repository layout

- `frontend/`: React 19, TypeScript 6, Vite 8, and an unprivileged Nginx runtime image.
- `backend/`: Java 25, Spring Boot 4, MyBatis-Plus, Flyway, MySQL, and S3/RustFS integration.
- `markitdown-worker/`: isolated FastAPI + MarkItDown document-conversion worker.
- `deploy/`: complete Docker Compose deployment for MySQL, RustFS, worker, backend, and frontend.

See [`deploy/DEPLOYMENT.en.md`](deploy/DEPLOYMENT.en.md) for complete English deployment instructions.

### Local verification

Use the commands in the Chinese section above. On Windows, run `mvnw.cmd verify` instead of `./mvnw verify` if necessary.

Local development defaults to filesystem-backed temporary sharing. Production uses a private RustFS bucket. Supply real passwords, tokens, domains, and infrastructure addresses only through local environment variables or the uncommitted `deploy/.env` file.

## Publication note

This sanitized tree intentionally excludes private Git history, credentials, logs, build outputs, editor settings, local caches, legacy environment-specific deployment files, and unrelated reference material. Choose and add the project's open-source license before publishing the repository.
