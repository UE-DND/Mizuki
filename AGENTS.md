# FOR AGENTS

## 范围

- 本项目是使用 Astro、Svelte、Tailwind 和 TypeScript 构建的静态博客，采用 Material Design 3 风格。
- 本仓库复刻自上游并作大量个性化更改，需要拉取上游的功能更新并合并冲突（仅当用户要求进行此操作时）。
- 进行合并上游版本操作后，需更新 [CONTRIBUTING.md](CONTRIBUTING.md#合并上游更改) 的对应哈希值与更新日期。
- 内容位于 src/content 下的 Astro 内容集合中，可从独立内容仓库同步。
- 仅使用 pnpm 作为包管理器；npm/yarn 在 preinstall 阶段被阻止。

## 工具链

- 需要 Node.js >= 20（见 CONTRIBUTING）。
- pnpm >= 9，packageManager 固定为 pnpm@10.22.0。
- TypeScript 使用 ESNext + bundler 模块解析。

## 格式化

- 项目使用 Prettier 进行一致格式化，配置在 .prettierrc.js。

## 常见使用命令

```bash
# 提交前必须通过以下检查
pnpm check
pnpm lint
pnpm format
```

其余见 [CONTRIBUTING.md](CONTRIBUTING.md#基本命令)

## 仓库结构

- src/: Astro 页面、组件、工具与配置。
- src/content/posts 与 src/content/spec: 文章与特殊页面。
- src/types: 共享 TypeScript 类型。
- public/: 静态资源。
- scripts/: Node 自动化脚本。
- docs/: 项目开发与部署文档。
- ref-upstream/: 上游项目的 master 分支。

## 导入

- 类型请使用 `import type`（见 src/config.ts、src/types/config.ts）。
- 跨包导入使用 tsconfig 路径别名：
- @components/*、@assets/*、@constants/*、@utils/*、@i18n/*、@layouts/*、@/*
- 同文件夹或紧密本地模块使用相对导入。
- 外部导入在前、内部导入在后，中间以空行分组。

## TypeScript

- 启用 strictNullChecks，避免对 undefined 的假设，并做好空值保护。
- 导出的函数与公共工具优先显式返回类型。
- 配置项使用联合类型与字面量类型（见 src/types/config.ts）。
- 导出稳定配置映射时使用 `as const`。

## Astro 与 Svelte

- Astro 组件使用 frontmatter 块进行导入与 props。
- 条件类组合使用 `class:list`。
- 需要时 Svelte 组件以 `client:only="svelte"` 使用。
- .astro 内联脚本通常包含兜底行为并确保 DOM 访问安全。

## Tailwind/CSS

- Tailwind 配置在 tailwind.config.cjs；深色模式使用 class 策略。
- 优先使用工具类布局与间距；主题值用 CSS 变量（如 var(--primary)）。
- 全局 CSS 与字体加载位于 src/styles；新增 CSS 文件需注册到 PostCSS。

## 命名规范

- 组件：PascalCase 文件名（如 PostCard.astro、Navbar.astro）。
- 工具：kebab-case 文件名（如 date-utils.ts、permalink-utils.ts）。
- 变量与函数：camelCase；类型/接口：PascalCase。
- CSS 自定义属性使用 --kebab-case。

## 错误处理

- 对外部资源的异步工作使用 try/catch，并通过 console.error/warn 携带上下文记录。
- 失败时提供兜底（见导航栏 Pagefind loader 与图标 loader）。
- 不要静默吞掉错误；需要由调用方处理时应重新抛出。

## 内容与数据

- 文章位于 src/content/posts，并使用 frontmatter（title、published、tags、category、draft、pinned、lang）。
- 特殊页面位于 src/content/spec（about、friends 等）。
- 使用 getCollection("posts")，并在 import.meta.env.PROD 下屏蔽草稿。

## 环境

- 启用内容分离或设置分析密钥时，将 .env.example 复制为 .env。
- CONTENT_REPO_URL 与 CONTENT_DIR 配置内容仓库。
- UMAMI_API_KEY 与 INDEXNOW_* 为可选项，来自 env。

## 备注

- predev 与 prebuild 运行 scripts/sync-content.js 并使用 "|| true" 避免阻塞本地开发。
- 构建输出在 dist/，pagefind 索引依赖它。
- 新脚本请放在 scripts/ 并接入 package.json。

## 注意事项

- pagefind 为构建期依赖，确保 PATH 可用。
- scripts/update-anime.mjs 可能访问外部服务，离线 CI 中避免运行。
