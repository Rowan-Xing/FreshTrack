# 云端 API（Railway）

## 当前部署

| 项目 | 当前值 |
| --- | --- |
| Railway project | `FreshTrack` |
| Service | `freshtrack-api` |
| Plan | Trial（30 天或 5 美元额度） |
| Source | `Rowan-Xing/FreshTrack` 的 `main` |
| Deployed commit | `b061168` |
| Region | Southeast Asia Metal（Singapore） |
| Public URL | `https://freshtrack-api-production.up.railway.app` |
| Health | `GET /health` 返回 200 |

截至 2026-07-30，远端构建、Prisma migration、容器启动和 Railway 健康检查均已成功。公网响应头 `x-railway-upstream-zone` 已确认服务运行在 `railway/asia-southeast1-eqsg3a`。

## 部署结构

FreshTrack 后端使用 Railway Trial / Free 的 Node.js 服务，部署区域固定为 Southeast Asia Metal（Singapore）。后端通过 TLS 连接现有的 Neon Singapore PostgreSQL，移动端只访问 Railway 提供的 HTTPS API，不直接连接数据库。

```text
Android 真机或模拟器
        │ HTTPS
        ▼
Railway Singapore / FreshTrack API
        │ PostgreSQL over TLS
        ▼
Neon Singapore / neondb / public
```

Railway 直接运行现有的 `apps/api/src/server.ts`，不需要为平台复制一套 serverless 入口。API 同时支持本地的 `API_PORT` 和云平台注入的 `PORT`，其中 `PORT` 优先。

## 免费额度

新账号可使用无银行卡的 Railway Trial：

- 一次性 5 美元资源额度，最长 30 天。
- Trial 结束后转为 `$0/月` 的 Free，包含每月 1 美元资源额度。
- Free / Trial 是实验和临时演示用途，不作为正式生产可用性承诺。
- Free 在各区域当地时间 08:00–20:00 不能发起新部署；已经运行的服务不因这个时段自动停止。

如果 GitHub 自动验证未通过，Limited Trial 会限制出站网络，API 可能无法连接 Neon。此时不绑定银行卡、不升级付费套餐，改用其他无卡方案。

## Railway 配置

仓库根目录的 `railway.json` 是版本化的部署配置：

| 项目 | 值 |
| --- | --- |
| Builder | Railpack |
| Build command | `pnpm db:generate` |
| Pre-deploy command | `pnpm db:migrate` |
| Start command | `pnpm --filter @freshtrack/api run start` |
| Region | Singapore（`asia-southeast1-eqsg3a`） |
| Replicas | 1 |
| Health check | `GET /health` |
| Restart policy | `ON_FAILURE`，最多 3 次 |

这是共享 pnpm monorepo，因此 Railway 的构建根目录保持为仓库根目录，不能改成 `apps/api`。

## 环境变量

Railway Production 环境需要：

- `DATABASE_URL`：现有 Neon 数据库连接串。
- `SESSION_TTL_DAYS=30`
- `LOG_LEVEL=info`
- `NODE_ENV=production`

`DATABASE_URL` 只保存在 Railway Variables 中，不能写进 Git、日志或本文档。Railway 自动注入 `PORT`，不需要手动设置 `API_PORT`。

## 数据库 migration

当前 Neon 数据库已经部署所有已提交 migration。Railway 每次发布前执行 `pnpm db:migrate`，只会部署已提交但尚未应用的 migration。

本地仍可显式执行：

```bash
set -a
source .env
set +a
pnpm db:migrate
```

不要让 `TEST_DATABASE_URL` 指向共享 Neon 的 `public` schema，详细规则见 [cloud-database.md](cloud-database.md)。

## 移动端接入

仓库根目录本地 `.env` 已把 `EXPO_PUBLIC_API_URL` 指向 Railway HTTPS 地址：

```dotenv
EXPO_PUBLIC_API_URL=https://freshtrack-api-production.up.railway.app
```

Expo 会在打包时读取这个变量。修改后需要重启 Metro；已构建 APK 若要永久使用新地址，需要重新构建并安装。

## 运行注意事项

- 可以启用 Railway Serverless（App Sleeping）降低空闲资源消耗，但 Prisma 的空闲数据库连接可能延迟休眠。
- Railway 与 Neon 都固定在 Singapore，以减少 API 到数据库之间的跨区域延迟。
- 中国大陆访问 Railway 公网域名仍依赖当前跨境网络。
