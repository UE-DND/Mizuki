# Mizuki 部署指南（Directus 数据源）

本文档说明如何部署当前的 Mizuki 全栈前端（Astro + Directus 数据源）。

## 部署前准备

1. 更新站点地址（`astro.config.mjs` 的 `site`）。
2. 在部署平台配置环境变量：

- `DIRECTUS_URL`：Directus 实例地址（例如 `https://cms.example.com`）
- `DIRECTUS_STATIC_TOKEN`：服务端访问 Directus 的静态 Token
- `UMAMI_API_KEY`（可选）
- `INDEXNOW_KEY` / `INDEXNOW_HOST`（可选）

## 构建命令

```bash
pnpm install
pnpm build
```

本项目不会在构建阶段执行内容仓库同步（`sync-content` 已移除）。

## 平台部署

### Vercel

- Framework: Astro
- Build Command: `pnpm build`
- Output: `dist`
- Node.js: 20+

### Netlify

- Build command: `pnpm build`
- Publish directory: `dist`
- Node.js: 20+

### Cloudflare Pages

- Build command: `pnpm build`
- Build output: `dist`
- Node.js: 20+

### GitHub Actions / 自托管

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm build
```

## 故障排查

### 构建时报 `DIRECTUS_URL 未配置` 或 `DIRECTUS_STATIC_TOKEN 未配置`

检查部署平台环境变量是否已正确设置。

### 页面无数据

1. 确认 `DIRECTUS_URL` 指向可访问实例。
2. 确认 `DIRECTUS_STATIC_TOKEN` 具备对应集合读取权限。
3. 确认 Directus 中 `app_*` 集合已有数据。

### 登录后接口返回 401/403

1. 确认 Directus 账号状态为 `active`。
2. 检查 `app_user_permissions` 中 `is_suspended` 与功能开关。
3. 检查站内 ACL 路径 `/api/v1/**` 是否命中正确角色。
