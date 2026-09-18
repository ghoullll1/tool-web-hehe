# Deployment

- 中文部署手册：[DEPLOYMENT.zh-CN.md](DEPLOYMENT.zh-CN.md)
- English deployment guide: [DEPLOYMENT.en.md](DEPLOYMENT.en.md)
- Docker Compose stack: [compose.yml](compose.yml)
- Safe configuration template: [.env.example](.env.example)
- Optional TLS reverse-proxy example: [nginx.example.conf](nginx.example.conf)

The Compose stack contains MySQL, RustFS, the MarkItDown worker, the Java backend, and the Nginx-served frontend. Only the frontend port and a loopback-only RustFS console port are published.
