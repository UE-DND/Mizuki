# FOR CLAUDE

## 项目概述

- Astro + Svelte + Tailwind + TypeScript（Material Design 3 风格）的 Directus 数据驱动全栈博客
- 仅使用 `pnpm` 作为包管理器

## 你的能力

- 你可以通过 Directus MCP Tools 直接操控后端数据库，无需经过用户同意
- 当用户要求删除某些字段时，数据库和前端链路不需要设计任何旧字段的兼容性处理

## 必须遵守

- 添加新功能前，务必检查代码库中是否已有相关实现，复用现有体系，避免多重实现
- 所有注释均使用中文编写
- Markdown 相关请参考 [Markdown Guidance](DaCapo.wiki/Markdown-Guidance.md)
- 后端通讯优先使用 Directus SDK，文档见 [Directus Overview](DaCapo.wiki/Directus-Overview.md)

## Wiki 文档索引

项目 Wiki（`DaCapo.wiki/`）提供完整文档，请按需查阅：

| 文档 | 内容 |
| ------ | ------ |
| [Architecture Overview](DaCapo.wiki/Architecture-Overview.md) | 系统架构、分层设计、请求链路 |
| [Data Model](DaCapo.wiki/Data-Model.md) | 全部 Directus 集合、字段定义、关系 |
| [API Reference](DaCapo.wiki/API-Reference.md) | BFF 路由、端点、请求/响应格式 |
| [Auth and Permissions](DaCapo.wiki/Auth-and-Permissions.md) | 认证流程、会话管理、ACL 规则 |
| [Directus Overview](DaCapo.wiki/Directus-Overview.md) | SDK 用法、客户端封装、资源代理 |
| [Markdown Guidance](DaCapo.wiki/Markdown-Guidance.md) | Markdown 渲染管线、插件、sanitize |
| [Layout State Machine](DaCapo.wiki/Layout-State-Machine.md) | 布局状态机、导航栏行为 |
| [Business Flows](DaCapo.wiki/Business-Flows.md) | 业务流程：注册、发布、评论、点赞等 |
| [Repository Structure](DaCapo.wiki/Repository-Structure.md) | 目录结构与文件职责 |
| [Configuration](DaCapo.wiki/Configuration.md) | 环境变量、站点配置 |
| [Getting Started](DaCapo.wiki/Getting-Started.md) | 开发环境搭建 |
| [Deployment](DaCapo.wiki/Deployment.md) | 部署流程 |
| [Operations and Troubleshooting](DaCapo.wiki/Operations-and-Troubleshooting.md) | 运维与排障 |
| [Glossary](DaCapo.wiki/Glossary.md) | 术语表 |

## 架构快速参考

详细架构见 [Architecture Overview](DaCapo.wiki/Architecture-Overview.md)。

关键路径：

- 页面层：`src/pages/**`
- BFF 入口：`src/pages/api/v1/[...segments].ts` → `src/server/api/v1.ts`
- API 路由：`src/server/api/v1/router.ts`
  - 分域：`public.ts`、`public-data.ts`、`me.ts`、`comments.ts`、`admin.ts`、`uploads.ts`
  - 共享：`shared.ts`、`shared/author-cache.ts`、`shared/file-cleanup.ts`
- Directus 客户端：`src/server/directus/client.ts`
- 认证与会话：`src/server/directus-auth.ts`、`src/server/auth/session.ts`
- ACL：`src/server/auth/acl.ts`
- 中间件：`src/middleware.ts`
- Schema 类型：`src/types/app.ts`、`src/server/directus/schema.ts`

统一链路：前端 → `/api/v1/**` → 参数校验 + ACL → `DIRECTUS_STATIC_TOKEN` 访问 Directus → 返回前端可渲染数据

## Directus 业务集合

统一使用 `app_*` 前缀（完整列表见 `src/server/directus/schema.ts`）：

- `app_user_profiles` — 用户档案
- `app_user_permissions` — 用户权限
- `app_articles` — 文章
- `app_article_comments` — 文章评论
- `app_article_likes` — 文章点赞
- `app_diaries` — 日记
- `app_diary_images` — 日记图片
- `app_diary_comments` — 日记评论
- `app_diary_likes` — 日记点赞
- `app_anime_entries` — 追番
- `app_albums` — 相册
- `app_album_photos` — 相册照片
- `app_friends` — 友链
- `app_user_blocks` — 用户屏蔽
- `app_content_reports` — 内容举报
- `app_user_registration_requests` — 注册申请
- `app_site_settings` — 站点设置

系统集合：`directus_users`、`directus_files`

约束：所有业务集合包含标准字段 `status/sort/user_created/date_created/user_updated/date_updated`。

## 权限与可见性

详见 [Auth and Permissions](DaCapo.wiki/Auth-and-Permissions.md)。

ACL 判定顺序：未登录拒绝写 → `is_suspended` 拒绝 → admin 放行 → 功能开关校验 → owner 校验

公开读取：`status=published && is_public=true`；用户主页额外要求模块隐私开关 + `show_on_profile=true`

## 资源代理

- 前端不可直连 Directus 资源，必须通过代理：`/api/v1/public/assets/:id`
- 构建图片 URL 统一使用 `buildDirectusAssetUrl()`（`src/server/directus-auth.ts`）

## 标签字段

`tags/genres` 字段为 `json` 类型，存储原生 JSON 数组。读取端使用以下函数确保返回 `string[]`：

- API 层：`safeCsv`（`src/server/api/v1/shared.ts`）
- 页面层：`normalizeTags`（`src/utils/content-utils.ts`）

## 客户端导航

- 页面跳转统一使用 `navigateToPage()`（`src/utils/navigation-utils.ts`）
- 受保护链接使用 `data-auth-target-href` / `data-needs-login` 属性（参见 `src/components/Navbar.astro`）

## TypeScript / Astro / Svelte 规范

### TypeScript

- strict 模式，避免对 `undefined` 做隐式假设
- 导出函数优先显式返回类型
- 禁止新增 `any`、隐式 `any`、`as any`、类型错误抑制注释

### 导入规范

- 类型导入使用 `import type`
- 外部导入在前，内部导入在后，中间空行分组
- 路径别名优先：`@components/*`、`@assets/*`、`@constants/*`、`@utils/*`、`@i18n/*`、`@layouts/*`、`@/*`
- 服务端模块通过 `@/server/*` 访问（**注意：不存在 `@server/*` 别名**）

### Astro / Svelte

- Astro 组件使用 frontmatter 管理导入与 props
- 条件类优先 `class:list`
- 客户端交互使用 `client:only="svelte"`
- `.astro` 内联脚本保证 DOM 安全访问和兜底行为

## 安全与渲染

- Markdown 输出必须经 `sanitizeMarkdownHtml()`（`src/server/markdown/sanitize.ts`）
- 禁止在 Markdown 渲染链路引入内联 `<script>`
- 密码保护内容使用 `DC2:` 版本化密文，浏览器端 Web Crypto 解密

## 错误处理

- 外部请求与异步流程必须 `try/catch`
- 日志包含上下文：`console.error/warn("[module] ...", error)`
- 禁止静默吞错；可恢复错误返回明确 fallback

## 环境变量

详见 [Configuration](DaCapo.wiki/Configuration.md)。

必需：`DIRECTUS_URL`、`DIRECTUS_STATIC_TOKEN`

## 构建与校验

- Astro `output: "static"`，需静态化的页面通过 `export const prerender = true` 声明
- 改动代码后必须通过：

```bash
pnpm check && pnpm lint && pnpm build && pnpm format
```

## 脚本与迁移

- 新脚本放 `scripts/` 并接入 `package.json`
- 一次性迁移脚本完成后应删除
