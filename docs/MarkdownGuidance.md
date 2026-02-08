# Markdown 渲染与管线指导

## 1. 目标与适用范围

本文档用于统一团队对 Markdown 全链路的认知与接入方式，避免出现以下问题：

- 重复造轮子（新增平行渲染器、平行复制逻辑、平行 TOC 逻辑）
- 多重实现并存（同一能力分散在多个不一致入口）
- 新旧链路混用导致的样式、功能与安全不一致

适用范围：

- 页面正文 Markdown（文章、日记、关于、友链说明等）
- RSS/Atom Feed Markdown 输出
- 密码保护内容解密后的 Markdown 增强行为
- 与 Markdown 强绑定的客户端增强（TOC、代码复制、Mermaid、GitHub 卡片）

不适用范围：

- 普通 HTML 片段（例如页脚自定义 HTML）
- 与 Markdown 无关的 UI 组件

---

## 2. 单一真相（Single Source of Truth）

### 2.1 服务端渲染唯一入口

统一使用 `src/server/markdown/render.ts`：

- `renderMarkdown(markdown, { target })`
- `renderMarkdownHtml(markdown)`（`target: "page"` 的语义别名）
- `renderMarkdownForFeed(markdown, site)`（`target: "feed"` 的语义别名）

业务页面不得自行创建 `unified().use(...)` 新链路。

### 2.2 插件配置唯一来源

统一插件定义在 `src/server/markdown/pipeline.ts`：

- `remarkPlugins`
- `rehypePlugins`

`astro.config.mjs` 与 `render.ts` 都引用该文件，确保插件逻辑一致。

### 2.3 安全净化唯一入口

统一净化函数：`src/server/markdown/sanitize.ts` 中的 `sanitizeMarkdownHtml()`。

禁止绕过此函数直接输出未净化 HTML。

### 2.4 客户端增强统一入口

- 代码复制：`src/scripts/code-copy.ts` 的 `setupCodeCopyDelegation()`
- TOC 标题收集：`src/utils/markdown-toc.ts`
- 锚点偏移滚动：`src/utils/hash-scroll.ts` + `src/utils/toc-offset.ts`
- Mermaid：`src/scripts/mermaid-runtime.ts`
- GitHub 卡片：`src/scripts/github-card-runtime.ts`

---

## 3. 全链路架构（从输入到展示）

```text
Directus body_markdown / 本地文章正文
  -> renderMarkdown()                        [src/server/markdown/render.ts]
     -> remarkParse
     -> remarkPlugins                        [src/server/markdown/pipeline.ts]
     -> remarkRehype + rehypeRaw
     -> rehypePlugins                        [src/server/markdown/pipeline.ts]
     -> rehypeStringify
     -> sanitizeMarkdownHtml()               [src/server/markdown/sanitize.ts]
     -> (page/encrypted) expressive-code 二次处理（有 <pre><code> 时）
     -> 页面 <Fragment set:html={html}>
     -> <Markdown/> 容器样式与 runtime 注入 [src/components/misc/Markdown.astro]
     -> 客户端增强（复制/TOC/Mermaid/GitHub 卡片/Swup 重初始化）
```

---

## 4. 服务端渲染管线详解

### 4.1 `renderMarkdown()` 分支行为

文件：`src/server/markdown/render.ts`

- `target: "feed"`：
  - 走 Markdown 主管线 + sanitize
  - 不注入 Expressive Code UI 包装
  - 处理图片地址绝对化（`normalizeFeedHtml`）
- `target: "page"`：
  - 走 Markdown 主管线 + sanitize
  - 若含 `<pre><code>`，再走 `rehype-expressive-code` 高亮增强
- `target: "encrypted"`：
  - 当前行为与 `page` 一致（保留同样增强能力）

备注：`render.ts` 中 `MarkdownRenderTarget = "page" | "feed" | "encrypted"`，但当前仅 `feed` 有独立分支，其余走统一页面逻辑。

### 4.2 remark 插件顺序与职责

文件：`src/server/markdown/pipeline.ts`

当前顺序（不可随意打乱）：

1. `remarkMath`：数学语法解析
2. `remarkGfm`：GFM（表格、删除线、任务列表等）
3. `remarkContent`：提取摘要、阅读时长、字数（写入 frontmatter）
4. `remarkGithubAdmonitionsToDirectives`：GitHub admonition 转 directive
5. `remarkDirective`：启用 directive 语法
6. `remarkSectionize`：章节化结构
7. `parseDirectiveNode`：directive AST 到 hName/hProperties
8. `remarkMermaid`：` ```mermaid ` 代码块转 Mermaid 占位节点

### 4.3 rehype 插件顺序与职责

文件：`src/server/markdown/pipeline.ts`

当前顺序：

1. `rehypeKatex`：公式 HTML 化
2. `rehypeSlug`：为标题生成 id
3. `rehypeWrapTable`：表格包裹 `.table-wrapper`
4. `rehypeMermaid`：Mermaid 占位节点转渲染容器
5. `rehypeImageWidth`：图片宽度语法与 figure/figcaption 处理
6. `rehype-components`：`note/tip/.../github` 指令组件映射
7. `rehype-autolink-headings`：标题锚点 `#` 注入（含 `data-no-swup`）

---

## 5. 语法能力到实现文件映射

| 能力 | 关键实现 |
| --- | --- |
| GFM（表格、删除线） | `remark-gfm` in `src/server/markdown/pipeline.ts` |
| 数学公式 | `remark-math` + `rehype-katex` in `src/server/markdown/pipeline.ts` |
| admonition（`> [!NOTE]` 等） | `remark-github-admonitions-to-directives` + `rehype-component-admonition.mjs` |
| directive（`::github`、`:spoiler[]`） | `remark-directive` + `parseDirectiveNode` + `rehype-components` |
| Mermaid | `remark-mermaid.js` + `rehype-mermaid.mjs` + `src/scripts/mermaid-runtime.ts` |
| 表格滚动与对齐 | `rehype-wrap-table.mjs` + `src/styles/markdown.css` |
| 标题锚点与跳转 | `rehype-autolink-headings` + `hash-scroll.ts` + TOC 三组件 |
| 代码高亮与 UI | `rehype-expressive-code` in `src/server/markdown/render.ts` |
| 复制按钮 | `custom-copy-button.ts` + `src/scripts/code-copy.ts` + `src/styles/expressive-code.css` |
| 语言徽标 | `language-badge.ts` + `src/styles/expressive-code.css` |
| spoiler 样式 | `src/styles/main.css` + `src/styles/markdown.css` + sanitize 允许 `spoiler` |

---

## 6. 页面接入标准（必须遵循）

### 6.1 页面正文接入（page）

标准流程：

1. 服务端取 Markdown 原文（例如 `body_markdown`）
2. 调用 `renderMarkdown(source, { target: "page" })`
3. 使用 `<Markdown>` 包裹并 `set:html`

参考：

- `src/pages/posts/[id].astro`
- `src/pages/[username]/diary/[id].astro`
- `src/pages/about.astro`
- `src/pages/friends.astro`

示例：

```astro
---
import Markdown from "@components/misc/Markdown.astro";
import { renderMarkdown } from "@/server/markdown/render";

const html = await renderMarkdown(String(markdownSource || ""), {
	target: "page",
});
---

<Markdown class="markdown-content">
	<Fragment set:html={html} />
</Markdown>
```

### 6.2 Feed 接入（feed）

统一使用 `target: "feed"` 或 `renderMarkdownForFeed()`，由渲染层负责：

- 不注入 Expressive Code 交互 UI
- 图片地址绝对化
- 安全净化

参考：

- `src/pages/rss.xml.ts`
- `src/pages/atom.xml.ts`

### 6.3 加密内容接入（encrypted）

密码保护场景需保证解密后内容与普通 Markdown 体验一致：

- 解密后内容插入 `#decrypted-content`
- 调用既有 runtime（TOC、复制等）
- 锚点跳转统一走 `hash-scroll.ts`

参考：`src/components/PasswordProtection.astro`。

---

## 7. 客户端增强链路说明

### 7.1 Markdown 容器组件

文件：`src/components/misc/Markdown.astro`

职责：

- 提供统一容器类 `.custom-md`
- 引入 Markdown 样式（`markdown.css` / `markdown-extend.styl`）
- 初始化代码复制事件委托（`setupCodeCopyDelegation()`）

### 7.2 TOC 系统

核心组成：

- 标题收集：`src/utils/markdown-toc.ts`
- 偏移基线：`src/utils/toc-offset.ts`
- 锚点滚动：`src/utils/hash-scroll.ts`
- 三种 TOC UI：
  - `src/components/widget/TOC.astro`
  - `src/components/control/FloatingTOC.astro`
  - `src/components/MobileTOC.svelte`

Swup 下重初始化：

- `src/scripts/layout/swup-hooks.ts`
- `src/scripts/layout/swup-hooks-legacy.ts`

### 7.3 代码复制

插入按钮：

- `src/plugins/expressive-code/custom-copy-button.ts`

点击复制：

- `src/scripts/code-copy.ts`

策略：

- 首选 `navigator.clipboard.writeText`
- 失败回退 `document.execCommand("copy")`
- 使用事件委托，支持 Swup 内容替换后继续生效

### 7.4 Mermaid 图表

服务端仅产出容器与 `data-mermaid-code`，客户端统一渲染：

- `src/plugins/remark-mermaid.js`
- `src/plugins/rehype-mermaid.mjs`
- `src/scripts/mermaid-runtime.ts`

### 7.5 GitHub 卡片

服务端指令生成骨架，客户端请求 GitHub API 回填：

- `src/plugins/rehype-component-github-card.mjs`
- `src/scripts/github-card-runtime.ts`

---

## 8. 样式分层与职责

建议按职责定位样式文件，避免叠加冲突：

- `src/styles/markdown.css`：
  - 通用 Markdown 基础样式
  - 行内/行间代码区分
  - 表格、列表、引用、标题锚点
- `src/styles/markdown-extend.styl`：
  - admonition、GitHub 卡片、Mermaid 扩展样式
- `src/styles/expressive-code.css`：
  - 代码块 UI（复制按钮、折叠按钮、动画）
- `src/styles/encrypted-content.css`：
  - 解密容器下的局部补丁样式
- `src/styles/main.css`：
  - 全局级补充（例如 spoiler 主题色效果）

---

## 9. 扩展新 Markdown 能力的标准流程（Playbook）

新增能力时先判断归属层：

1. 语法解析变化 -> `remark` 层（`pipeline.ts` 或 remark 插件）
2. HTML 结构变换 -> `rehype` 层（`pipeline.ts` 或 rehype 插件）
3. 安全边界变化 -> `sanitize.ts`
4. 代码块视觉与交互 -> `render.ts`（expressive-code）+ `expressive-code.css`
5. 运行时交互（需要 DOM/异步）-> `src/scripts/*runtime*.ts`
6. 仅样式变化 -> `markdown.css` / `markdown-extend.styl` / `main.css`

标准步骤：

1. 在 `pipeline.ts` 或插件中实现最小变更
2. 确认 `render.ts` 是否需要分支处理（feed/page）
3. 更新 `sanitize.ts` 白名单（若新增标签/属性）
4. 添加或调整样式文件
5. 如需交互，接入统一 runtime 初始化机制（`setupPageInit` 或现有初始化链）
6. 更新本文档与 `docs/README.md`（若新增能力属于公共规则）

---

## 10. 禁止事项（必须避免）

1. 在页面文件里直接写新的 `unified()` 渲染器
2. 跳过 `sanitizeMarkdownHtml()` 直接输出 Markdown 转 HTML 结果
3. 自己再写一套代码复制按钮绑定逻辑
4. 自己再写一套 TOC 标题抓取与锚点滚动逻辑
5. 在 Markdown 锚点跳转中直接使用 `scrollIntoView()` 作为最终方案（需走 `hash-scroll.ts`）
6. 将同一语法在多个插件重复处理（例如同时在 remark 与 rehype 做重复转换）

---

## 11. 常见问题排障（Troubleshooting）

### 11.1 GFM 删除线 `~~` 不生效

检查：

- `pipeline.ts` 是否包含 `remarkGfm`
- 渲染入口是否经过 `renderMarkdown()`
- sanitize 是否允许 `del`（`sanitize.ts`）

### 11.2 表格对齐不生效

检查：

- 输出的 `th/td` 是否含 `align` 属性
- `sanitize.ts` 是否允许 `th/td` 的 `align`
- `markdown.css` 中对 `[align]` 与 `style*="text-align"` 的选择器是否被覆盖

### 11.3 spoiler 不生效

检查：

- `remark-directive` + `parseDirectiveNode` 是否在链路中
- 输出标签是否为 `spoiler`
- sanitize 是否允许 `spoiler`
- 样式是否加载：`main.css` / `markdown.css`

### 11.4 代码块无高亮或无 UI 包装

检查：

- `render.ts` 是否检测到 `<pre><code>`
- `rehype-expressive-code` 是否执行成功（查看日志）
- 页面是否加载 `expressive-code.css`（`Layout.astro`）

### 11.5 复制按钮点击无效

检查：

- HTML 是否有 `.copy-btn`（插件是否注入）
- `setupCodeCopyDelegation()` 是否执行
- `code-copy.ts` 是否被重复初始化（委托标记 `__mzkCodeCopyDelegated`）

### 11.6 TOC 不生成或高亮错乱

检查：

- 标题是否存在 id（`rehypeSlug`）
- Markdown 容器选择器是否匹配（`markdown-toc.ts`）
- Swup 切页后是否触发 TOC reinit（`swup-hooks*.ts`）

### 11.7 TOC 跳转被导航栏遮挡

检查：

- 是否通过 `scrollToHashBelowTocBaseline`/`scrollElementBelowTocBaseline`
- `toc-offset.ts` 是否正确计算 `#navbar-wrapper` / `#navbar`
- 是否有旁路使用原生 `scrollIntoView`

### 11.8 Mermaid 不渲染

检查：

- Markdown 中代码块语言是否为 `mermaid`
- `remark-mermaid` 与 `rehype-mermaid` 是否执行
- `mermaid-runtime.ts` 是否加载且 CDN 可用

### 11.9 GitHub 卡片一直 loading/error

检查：

- 指令 `::github{repo="owner/repo"}` 语法
- 运行时是否触发 `initGithubCards`
- GitHub API 是否被限流或请求失败

---

## 12. 开发与评审 Checklist

- [ ] 新功能是否复用 `renderMarkdown()`，未新增平行渲染器
- [ ] 是否保持 `pipeline.ts` 为唯一插件定义源
- [ ] 是否更新了 `sanitize.ts`（如涉及新标签/属性）
- [ ] 是否在 `page/feed` 两类输出语义下验证行为
- [ ] 是否复用现有 runtime（复制/TOC/hash/Mermaid/GitHub 卡片）
- [ ] 是否避免引入新的“临时 DOM 脚本绑定”
- [ ] 是否补充本文档对应章节（若为公共能力变更）

---

## 13. 关键文件总览

### 渲染与安全

- `src/server/markdown/render.ts`
- `src/server/markdown/pipeline.ts`
- `src/server/markdown/sanitize.ts`

### 自定义插件

- `src/plugins/remark-content.mjs`
- `src/plugins/remark-mermaid.js`
- `src/plugins/remark-directive-rehype.js`
- `src/plugins/rehype-wrap-table.mjs`
- `src/plugins/rehype-image-width.mjs`
- `src/plugins/rehype-mermaid.mjs`
- `src/plugins/rehype-component-admonition.mjs`
- `src/plugins/rehype-component-github-card.mjs`
- `src/plugins/expressive-code/custom-copy-button.ts`
- `src/plugins/expressive-code/language-badge.ts`

### 客户端增强

- `src/components/misc/Markdown.astro`
- `src/scripts/code-copy.ts`
- `src/scripts/mermaid-runtime.ts`
- `src/scripts/github-card-runtime.ts`
- `src/utils/markdown-toc.ts`
- `src/utils/toc-offset.ts`
- `src/utils/hash-scroll.ts`
- `src/components/widget/TOC.astro`
- `src/components/control/FloatingTOC.astro`
- `src/components/MobileTOC.svelte`
- `src/scripts/layout/swup-hooks.ts`
- `src/scripts/layout/swup-hooks-legacy.ts`

### 样式

- `src/styles/markdown.css`
- `src/styles/markdown-extend.styl`
- `src/styles/expressive-code.css`
- `src/styles/encrypted-content.css`
- `src/styles/main.css`

### 接入页面示例

- `src/pages/posts/[id].astro`
- `src/pages/[username]/diary/[id].astro`
- `src/pages/about.astro`
- `src/pages/friends.astro`
- `src/pages/rss.xml.ts`
- `src/pages/atom.xml.ts`

---

## 14. 结语

当你准备新增 Markdown 能力时，请先回答两个问题：

1. 这个能力属于哪一层（remark/rehype/render/sanitize/runtime/style）？
2. 现有链路里有没有已经能复用的入口？

如果这两个问题没有明确答案，不要开始改代码。先回到本文档和对应文件核对，保证“单一实现、统一接入、稳定可维护”。
