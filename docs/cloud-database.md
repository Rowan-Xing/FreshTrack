# 云数据库（Neon）

## 当前部署

FreshTrack 的共享开发数据库已经部署到 Neon。它用于让开发者在本地运行 API 时直接连接云端 PostgreSQL，不再要求本机安装 PostgreSQL、Docker 或 Colima。

| 项目 | 当前值 |
| --- | --- |
| 服务 | Neon Free |
| 云与区域 | AWS Asia Pacific 1（Singapore，`ap-southeast-1`） |
| PostgreSQL | 18.4，主版本 18 |
| 数据库 | `neondb` |
| Schema | `public` |
| ORM | Prisma 6.19.2 |
| 存储额度 | 0.5 GB |
| 空闲行为 | 空闲后自动缩容到零，下一次查询自动唤醒 |

截至 2026-07-30，以下正式 migration 已部署成功：

- `202607280001_auth_foundation`
- `202607280002_food_lifecycle`

当前业务表包括：

- `users`
- `auth_sessions`
- `foods`

## 本地连接与启动

真实连接串只放在仓库根目录的本地 `.env` 中，由 `DATABASE_URL` 提供。连接串从 Neon Console 的 Connect 面板复制，并使用 TLS 和 `public` schema；不要把真实连接串写入仓库或文档。

加载本地环境并启动 API：

```bash
set -a
source .env
set +a
pnpm api:dev
```

使用 Neon 后，不需要执行：

```bash
pnpm db:up
```

本地运行链路为：

```text
Android 真机或模拟器
        │ HTTP（本地开发）
        ▼
开发电脑上的 API :3000
        │ PostgreSQL over TLS
        ▼
Neon Singapore / neondb / public
```

移动端通过 `EXPO_PUBLIC_API_URL` 访问 API（当前为 Railway 云端 API），不直接连接数据库。

## Schema 变更

数据库结构以 `apps/api/prisma/schema.prisma` 和已提交的 migration SQL 为准。部署已提交 migration：

```bash
set -a
source .env
set +a
pnpm db:migrate
```

共享数据库的 migration 由一名开发者统一执行，避免多人同时修改结构。不要用 `prisma db push` 代替正式 migration。

## 集成测试隔离

`TEST_DATABASE_URL` 绝不能指向 Neon 的 `public` schema。

`pnpm test:integration` 会先执行：

```text
prisma migrate reset --force
```

这会重置测试 schema。运行集成测试时，必须使用名称包含 `test` 的独立 schema，或者为每位开发者创建独立的 Neon 测试分支。也可以继续使用本地 Docker PostgreSQL 运行集成测试。

## 其他开发者接入

其他开发者首次运行：

1. 执行 `cp .env.example .env`。
2. 从项目维护者处获取开发数据库连接串，写入本地 `DATABASE_URL`。
3. 执行 `pnpm install --frozen-lockfile`。
4. 跳过 `pnpm db:up`。
5. 加载 `.env` 并执行 `pnpm api:dev`。

普通单元测试不需要数据库。需要运行集成测试时，按上一节配置独立的 `TEST_DATABASE_URL`。

## 运行注意事项

- Neon Free 会在空闲后缩容到零，因此长时间未使用后的第一次数据库请求可能稍慢。
- 数据库位于新加坡，中国大陆到数据库的连接质量取决于当前跨境网络。
- Neon 服务状态可在 [Neon Status](https://neonstatus.com/) 查看。
- 免费实例用于共享开发和演示，不作为正式生产环境的可用性承诺。
