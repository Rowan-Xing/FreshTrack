# 鲜知 FreshTrack

> [!IMPORTANT]
> **📦 [直接下载 FreshTrack v0.1.0 Release](https://github.com/Rowan-Xing/FreshTrack/releases/tag/v0.1.0)**
>
> 已提供可直接安装的 Android APK，连接 Railway 在线演示环境；也可以[直接下载 `freshtrack-preview.apk`](https://github.com/Rowan-Xing/FreshTrack/releases/download/v0.1.0/freshtrack-preview.apk)。

FreshTrack 是一个 Android 食品管理应用，支持账号登录、食品增删改查、到期筛选、处理历史、恢复和本地到期提醒。

## 选择演示方式

| 目标 | Android 应用 | 后端 |
| --- | --- | --- |
| 直接体验 | EAS `preview` APK | Railway 在线演示环境 |
| 本地开发 | EAS `development` APK + Metro | 本机 API + Docker PostgreSQL |

完整的本地链路演示使用“路线二”。`preview` APK 的 API 地址固定为云端，本机联调则使用 `development` APK。

### 路线一：安装 APK 直接体验

1. 下载并安装 [Android preview APK](https://expo.dev/artifacts/eas/36ReedFxcAIQdEQYP-bvxZc0_6sGAhKsMEvPvCyAfjo.apk)（[EAS 构建详情](https://expo.dev/accounts/rowanxingyys-team/projects/freshtrack/builds/bca94f9c-cbbd-476b-a3ae-b60caac72f1c)）。
2. 启动 FreshTrack，注册账号后即可使用。

该 APK 连接 Railway 在线演示环境，可通过 [API 健康检查](https://freshtrack-api-production.up.railway.app/health) 查看服务状态，不需要启动本地后端或 Metro。

> **由于在线演示后端部署在 Railway 国际云平台，演示设备需要具备国际网络访问能力。**
>
> EAS 内部分发产物有有效期，路线一可以提前下载并安装 APK。

## 路线二：启动本地整套服务

以下命令均从仓库根目录执行。macOS 示例基于 Terminal 的 `zsh`，Windows 示例基于 Git for Windows 自带的 **Git Bash**；PowerShell 和 CMD 的语法不同。

### 0. 环境要求

| 项目 | 要求 |
| --- | --- |
| macOS | Docker Desktop 支持的 macOS 版本（当前及前两个大版本），至少 4 GB 内存 |
| Windows | 64 位 Windows 10 22H2（build 19045）或 Windows 11 23H2（build 22631）及以上；WSL `>= 2.1.5`、至少 8 GB 内存，并在 BIOS/UEFI 开启硬件虚拟化 |
| Shell | macOS Terminal `zsh`；Windows Git Bash |
| Git | Git for macOS，或 Git for Windows |
| Node.js | `22.x`，且 `>= 22.13.0` |
| pnpm | `11.17.0` |
| Docker | Docker Desktop 已启动，使用 `docker compose`（Compose v2）；Windows 使用 Linux containers |
| Android | Android 真机，允许安装 EAS APK，并与开发机处于允许设备互访的同一局域网 |
| Expo | 可登录的 Expo 账号和 FreshTrack 团队项目权限 |
| 网络 | 安装和构建阶段能访问 GitHub、npm registry、Docker Hub 与 Expo/EAS；手机和开发机所在局域网允许设备互访 |
| 端口 | 本机 `3000`、`8081`、`55435` 未被其他程序占用 |

Docker Desktop 的操作系统要求会随版本调整，安装前以 [macOS 官方要求](https://docs.docker.com/desktop/setup/install/mac-install/#system-requirements) 或 [Windows 官方要求](https://docs.docker.com/desktop/setup/install/windows-install/#system-requirements) 为准。

本地整套演示不需要 Android Studio、JDK 或本地 Android SDK。路线二会通过 EAS 云端构建并安装 `development` APK，路线一提供的 `preview` APK 用于快速查看。

### 1. 获取代码并安装依赖

```bash
git clone https://github.com/Rowan-Xing/FreshTrack.git
cd FreshTrack

corepack enable
corepack prepare pnpm@11.17.0 --activate

pnpm install --frozen-lockfile
cp .env.example .env
```

先确认版本和 Docker daemon 可用：

```bash
node --version
pnpm --version
docker version
docker compose version
```

这里使用的版本组合是 `v22.13.0` 或更新的 `v22.x`，以及 pnpm `11.17.0`。`docker version` 同时显示 Client 和 Server 时，表示 Docker Desktop 已正常运行；只显示 Client 通常表示 Docker Desktop 尚未启动。

### 2. 写入开发机的局域网 IPv4

macOS：

```bash
LAN_INTERFACE="$(route -n get default | awk '/interface:/{print $2}')"
ipconfig getifaddr "$LAN_INTERFACE"
```

Windows：在 Git Bash 中执行 `ipconfig`，找到当前正在使用的 Wi-Fi 或以太网适配器下的 `IPv4 Address`。WSL、Docker、VPN 或已断开适配器的地址通常不对应真机访问的局域网。

```bash
ipconfig
```

编辑根目录 `.env`，只把 `EXPO_PUBLIC_API_URL` 中的示例地址换成刚查到的 IPv4，其余本地数据库配置保持不变：

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.23:3000
```

真机访问开发机时使用开发机的局域网 IPv4；`localhost` 和 `127.0.0.1` 在手机上指向手机自身。电脑切换网络后 IPv4 可能变化，演示前可以再核对一次。

### 3. 通过 EAS 构建并安装 development APK

正式本地演示在这里构建 `development` APK；路线一的 `preview` APK 仍保持连接云端 API：

```bash
cd apps/mobile
pnpm dlx eas-cli@21.4.0 login --browser
pnpm dlx eas-cli@21.4.0 build --platform android --profile development
cd ../..
```

浏览器登录后，确认账号属于 FreshTrack 团队项目。构建上传成功后可以另开终端继续步骤 4；EAS 云端构建可能排队。状态变为 `Finished` 后，从构建页下载 APK 到 Android 真机并安装。

### 4. 启动 PostgreSQL 和 API

终端 A：

```bash
set -a
source .env
set +a

pnpm db:up
pnpm db:migrate
pnpm api:dev
```

API 成功启动时会输出 `api_started`，其中 `host` 为 `0.0.0.0`、`port` 为 `3000`。保持终端 A 运行。

先在电脑的另一个终端验证局域网地址：

```bash
curl --fail "http://192.168.1.23:3000/health"
```

把示例 IP 换成 `.env` 中的实际值。预期返回：

```json
{"status":"ok","requestId":"..."}
```

再用手机浏览器打开同一个 `/health` 地址。手机也能看到 JSON 后再继续；这一步同时验证了局域网、API 监听地址和防火墙。

### 5. 启动 Metro 和移动端

终端 B：

```bash
set -a
source .env
set +a

pnpm mobile:start --dev-client --lan
```

Metro 成功启动后会显示二维码和连接地址，正常情况下是开发机的局域网 IPv4 与端口 `8081`。打开真机上的 FreshTrack development build，选择发现的 Metro 服务或扫描二维码。进入应用后注册一个新账号，即可验证本地前端、API 和 PostgreSQL 全链路。

每个新终端先执行 `set -a`、`source .env`、`set +a`。根目录 `.env` 不会自动注入 API 或 Metro 进程。

### 6. 停止服务

在 API 和 Metro 终端按 `Ctrl+C`，再从仓库根目录执行：

```bash
pnpm db:down
```

该命令停止 PostgreSQL，但保留本地数据库数据，下一次启动可继续使用。

## 正式演示完成标准

现场按路线二执行后，可以通过以下结果确认整套服务：

1. `pnpm install --frozen-lockfile` 成功，Docker Desktop 正常运行。
2. Expo 账号可以登录 FreshTrack 团队项目，演示网络可以访问 EAS。
3. `.env` 中是电脑当前的局域网 IPv4。
4. EAS `development` 构建状态为 `Finished`，生成的 APK 能在演示手机安装。
5. `pnpm db:up`、`pnpm db:migrate`、`pnpm api:dev` 均成功。
6. 手机和电脑处于允许互访的同一局域网，手机浏览器能访问 `http://<局域网 IPv4>:3000/health`。
7. Metro 二维码中的地址是同一局域网 IPv4，端口为 `8081`。
8. 本次 EAS 构建的 `development` APK 能连接 Metro，并完成注册、登录、添加食品和刷新列表。

## EAS 构建配置

EAS 配置位于 `apps/mobile/eas.json`。

| Profile | 用途 | API |
| --- | --- | --- |
| `development` | 连接本机 Metro 和 API | Metro 启动时读取根目录 `.env` |
| `preview` | 独立安装体验 | Railway 在线演示环境 |

`development` profile 对应正式的本地演示，`preview` profile 对应路线一的快速查看。

## 启动问题

### Docker 报 `port is already allocated`

默认 PostgreSQL 端口是 `55435`。选择一个未占用端口，并在 `.env` 中同时修改以下三处为相同端口：

- `POSTGRES_PORT`
- `DATABASE_URL`
- `TEST_DATABASE_URL`

然后重新执行 `pnpm db:up`。API 的 `3000` 或 Metro 的 `8081` 被占用时，先停止占用端口的程序，再按 README 启动。

### 手机无法访问本地 API

- `.env` 中填写开发机当前的局域网 IPv4。
- 确认手机与开发机位于允许设备互访的同一网络；访客 Wi-Fi、校园网或公司网可能启用设备隔离。
- macOS/Windows 防火墙放行 Node.js 对当前专用网络的访问，涉及端口 `3000` 和 `8081`。Windows 首次弹窗时可勾选“专用网络”并允许访问。
- 先用手机浏览器访问 `http://<开发机局域网 IPv4>:3000/health`。

### development build 找不到 Metro

- 确认 Metro 使用 `--dev-client --lan` 启动。
- 确认手机安装的是 `development` APK，而不是 `preview` APK。
- 确认二维码中的 Metro 地址使用开发机当前的局域网 IPv4，而不是 VPN、WSL 或 Docker 地址。
- 重新扫描 Metro 终端中的二维码。

### 提示 `EXPO_PUBLIC_API_URL` 缺失

说明当前终端没有加载根目录 `.env`。执行：

```bash
set -a
source .env
set +a
```

然后在同一个终端重新运行原命令。

## 项目结构

```text
apps/mobile        Expo / React Native Android 应用
apps/api           Hono / Prisma API
packages/contracts 前后端共享 Zod contracts
```

更多信息：

- [产品需求](docs/prd.md)
- [云端 API](docs/cloud-api.md)
- [云端数据库](docs/cloud-database.md)
