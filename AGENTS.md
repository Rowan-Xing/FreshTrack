# FreshTrack 工程指南

## 范围与结构

- 保持仓库为单一的 pnpm TypeScript monorepo，并仅在根目录维护一个锁文件。
- 运行时应用只能位于 `apps/mobile` 和 `apps/api`。
- `packages/contracts` 中只能存放 API 与移动端共享的 Zod 契约、DTO，以及纯日历日期规则。
- 仅在明确分配的里程碑范围内工作；不要实现无关的未来功能，也不要在缺少需求的情况下扩展产品行为。

## 质量要求

- 所有工作区和手写脚本都必须启用 TypeScript 严格模式，包括 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`useUnknownInCatchVariables`、`noFallthroughCasesInSwitch` 和 `noImplicitReturns`。
- 绝不能使用未经检查的类型断言或非空断言绕过校验。
- 在 API 边界使用共享的 Zod schema 校验请求和响应。
- 保持错误码稳定。日志可以包含请求元数据和不透明标识符，但绝不能包含密码、Bearer Token、凭据哈希或数据库 URL。
- 数据库变更必须包含经过审查的 Prisma schema 和已提交的迁移 SQL。迁移必须在空数据库或空 schema 上进行验证。

## 移动端规范

- 通过明确的子路径导入 ZKit 组件。`zkit-ui`、`zkit-tools`、Reanimated 和 Worklets 必须作为移动端的直接依赖。
- 应用启动时只配置一次 ZKit 和 `zkit-tools`，设计宽度设为 375。
- 手写的像素尺寸使用 `wp`；字号和行高使用 `sp`。flex、透明度、动画时长和零值等非像素值无需缩放。
- 身份验证凭据只能存放在 Expo SecureStore 中。服务端会话无效时应清除本地身份验证状态；临时网络故障不得静默删除可能仍然有效的凭据。
- 表单必须处理键盘避让、校验、服务端/网络错误、加载状态和重复点击。

## 命令

在仓库根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm db:up
TEST_DATABASE_URL=... pnpm test:integration
```

运行 Expo 命令时，应将 `EXPO_PUBLIC_API_URL` 设置为目标设备可以访问的地址。
