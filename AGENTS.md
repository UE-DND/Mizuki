# FOR AGENTS

## 项目定位与现状

- 项目是 Astro + Svelte + Tailwind + TypeScript（Material Design 3 风格）的全栈博客
- 原项目是开源的静态博客框架。本项目将此框架全面重构为 **Directus 数据驱动全栈站点**
- 仅使用 `pnpm` 作为包管理器

## 你的能力

- 你可以通过 Directus MCP Tools 直接操控后端数据库，无需经过用户同意

## 必须遵守

- 在添加一项新功能前，务必检查代码库中是否已经有相关的实现，尽量复用现有的体系、架构和功能，避免出现“多重实现、新旧并存”的混乱局面
- 与 Markdown 有关的使用及链路接入方法请参考文档 `docs/MarkdownGuidance.md`
- 与后端通讯优先使用 SDK 能力。文档见 `docs/Directus/Directus_SDK.md`

## 架构与数据流

- 页面层：`src/pages/**`
- BFF/API 入口：`src/pages/api/v1/[...segments].ts` -> `src/server/api/v1.ts`
- API 路由与分域处理：
  - `src/server/api/v1/router.ts`
  - `src/server/api/v1/public.ts`
  - `src/server/api/v1/me.ts`
  - `src/server/api/v1/comments.ts`
  - `src/server/api/v1/admin.ts`
  - `src/server/api/v1/uploads.ts`
  - `src/server/api/v1/shared.ts`
  - `src/server/api/v1/shared/author-cache.ts`
- Directus 访问层：`src/server/directus/client.ts`
- 认证与会话：`src/server/directus-auth.ts`、`src/server/auth/session.ts`
- ACL：`src/server/auth/acl.ts`
- 环境校验入口：`src/middleware.ts`、`src/server/env/required.ts`
- 类型：`src/types/app.ts`、`src/server/directus/schema.ts`

统一链路：

1. 前端页面请求 `/api/v1/**`
2. API 层执行参数校验 + ACL
3. 服务端使用 `DIRECTUS_STATIC_TOKEN` 访问 Directus
4. 返回前端可直接渲染的数据

## Directus 业务集合

统一使用 `app_*` 集合（避免和系统集合冲突）：

- `app_user_profiles`
- `app_user_permissions`
- `app_articles`
- `app_article_comments`
- `app_diaries`
- `app_diary_images`
- `app_diary_comments`
- `app_anime_entries`
- `app_albums`
- `app_album_photos`

约束：

- 所有业务集合按既定结构包含 `status/sort/user_created/date_created/user_updated/date_updated`。

## 权限与可见性规则

ACL 判定顺序固定：

1. 未登录拒绝写
2. `is_suspended` 拒绝
3. admin 放行
4. 功能开关校验
5. owner 校验

公开读取规则：

- 列表/详情默认 `status=published && is_public=true`
- 用户主页额外要求：模块隐私开关 + 单条 `show_on_profile=true`

## 资源（图片/文件）规则

- Directus 资源默认可能是私有的，前端不可直连 `https://<directus>/assets/...`
- 必须通过站内代理：`/api/v1/public/assets/:id`
- 构建图片 URL 统一使用 `buildDirectusAssetUrl()`（`src/server/directus-auth.ts`）
- 新增封面/头像/相册图渲染时，优先使用 `cover_file/file_id` + 代理链路

## 标签与 CSV 字段规范

- `tags/genres` 在 Directus 中可能是 JSON 字符串、CSV 字符串或数组。
- 读取时必须走统一解析逻辑：
  - API 层：`safeCsv`（`src/server/api/v1/shared.ts`）
  - 页面聚合层：`normalizeTags`（`src/utils/content-utils.ts`）
- 不得直接假设字段一定是 `string[]`

## TypeScript / Astro / Svelte 规范

### TypeScript

- 保持 strict 思维，避免对 `undefined` 做隐式假设
- 导出函数与公共工具优先显式返回类型
- 强类型优先，禁止新增 `any`、隐式 `any`、`as any`、类型错误抑制注释

### 导入规范

- 类型导入使用 `import type`
- 外部导入在前，内部导入在后，中间空行分组
- 路径别名优先（`@components/*`、`@utils/*`、`@server/*` 等）

### Astro / Svelte

- Astro 组件使用 frontmatter 管理导入与 props
- 条件类优先 `class:list`
- 需要客户端交互时使用 `client:only="svelte"`
- `.astro` 内联脚本要保证 DOM 安全访问和兜底行为

## 安全与内容渲染规范

- Markdown 输出必须经过服务端 sanitize（`src/server/markdown/sanitize.ts`）
- 禁止在 markdown 渲染链路引入内联 `<script>` 注入逻辑
- 密码保护内容使用 `MZK2:` 版本化密文，浏览器端通过 Web Crypto 解密

## 错误处理

- 外部请求与异步流程必须 `try/catch`。
- 日志需包含上下文：`console.error/warn("[module] ...", error)`
- 禁止静默吞错；可恢复错误要返回明确 fallback

## 环境变量

必需：

- `DIRECTUS_URL`
- `DIRECTUS_STATIC_TOKEN`

登录限流（生产强依赖，开发可回退内存限流）：

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

可选：

- `UMAMI_API_KEY`
- `INDEXNOW_KEY`
- `INDEXNOW_HOST`
- `DIRECTUS_EXPORT_INCLUDE_DRAFTS`
- `DIRECTUS_EXPORT_CLEAN`

## 构建与输出语义

- 当前 Astro 配置为 `output: "static"`（Astro 5.17+ 不再接受 `hybrid`）
- 需要静态化的页面通过 `export const prerender = true` 显式声明

## 命令与校验

改动代码后必须通过：

```bash
pnpm check && pnpm lint && pnpm build && pnpm format
```

常用命令参考：`CONTRIBUTING.md`

## 脚本与迁移约束

- 新脚本放在 `scripts/` 并接入 `package.json`
- 一次性迁移脚本若仅用于当次导入，完成后应删除，避免仓库长期残留
