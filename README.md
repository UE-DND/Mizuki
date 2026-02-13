# 🌸 DaCapo

<img align='right' src='assets/Logo.png' width='200px' alt="DaCapo logo">

一个现代化、功能丰富的静态博客模板，基于 [Astro](https://astro.build) 构建，具有先进的功能和精美的设计。

![DaCapo Preview](assets/Preview.png)

## 功能特性

### 设计与界面

- [x] 基于 [Astro](https://astro.build) 和 [Tailwind CSS](https://tailwindcss.com) 构建
- [x] 使用 [Swup](https://swup.js.org/) 实现流畅的动画和页面过渡
- [x] 明暗主题切换，支持系统偏好检测
- [x] 可自定义主题色彩和动态横幅轮播
- [x] 顶部横幅图片，支持轮播与自定义配置
- [x] 全设备响应式设计
- [x] 使用 JetBrains Mono 字体的优美排版

### 内容特性

- [x] [增强的 Markdown 功能](#markdown-扩展语法)，支持语法高亮
- [x] 交互式目录，支持自动滚动
- [x] RSS 订阅生成
- [x] 阅读时间估算
- [x] 文章分类和标签系统

### 特色页面

- [x] **追番页面** - 追踪动画观看进度和评分
- [x] **友链页面** - 精美卡片展示朋友网站
- [x] **日记页面** - 分享生活瞬间，类似社交媒体
- [x] **归档页面** - 有序的文章时间线视图
- [x] **关于页面** - 可自定义的个人介绍

### 技术特性

- [x] **增强代码块**，基于 [Expressive Code](https://expressive-code.com/)
- [x] **数学公式支持**，KaTeX 渲染
- [x] **图片优化**，PhotoSwipe 画廊集成
- [x] **SEO 优化**，包含站点地图和元标签
- [x] **性能优化**，懒加载和缓存机制
- [x] **评论系统**，基于 Directus 数据（文章/日记二级回复）

### 内容管理

- **创建/编辑文章：** 使用站内工作台 `/me/` 或调用 `/api/v1/me/articles`
- **自定义页面：** 在 Directus 的 `app_articles` 维护 `slug=about` / `slug=friends` 页面内容
- **添加图片：** 将图片放在 `src/assets/` 或 `public/` 中

## 部署页面

将博客部署到任何静态托管平台：

- **Vercel：** 连接 GitHub 仓库到 Vercel
- **Netlify：** 直接从 GitHub 部署
- **GitHub Pages：** 使用包含的 GitHub Actions 工作流
- **Cloudflare Pages：** 连接您的仓库

### 例：使用 Vercel 部署

1. **在Vercel上导入你的仓库**:
   - 登录 [Vercel](https://vercel.com)
   - 点击 `Import Project`
   - 选择 `Import Git Repository` 并连接你的GitHub账号
   - 选择 DaCapo 仓库

2. **配置环境变量（可选）**:
   - 在部署设置页面，找到 `Environment Variables` 部分
   - 添加或修改必要的环境变量；`siteURL`/`lang` 等系统级参数在 `src/config.ts` 的 `systemSiteConfig` 中维护

    ```bash
    # Umami API 密钥，用于访问 Umami 统计数据
    # 站点设置中启用 Umami 时，建议配置 API 密钥
    UMAMI_API_KEY=your_umami_api_key_here
    # bcrypt 盐值轮数（10-14 推荐，默认 12）
    BCRYPT_SALT_ROUNDS=12
    ```

3. **部署应用**:
   - 点击 `Deploy` 按钮
   - Vercel 将自动构建和部署你的应用

## 文章前言格式

```yaml
---
title: 我的第一篇博客文章
published: 2023-09-09
description: 这是我新博客的第一篇文章。
image: ./cover.jpg
tags: [标签1, 标签2]
category: 前端
draft: false
pinned: false
lang: zh-CN      # 仅当文章语言与系统默认语言（systemSiteConfig.lang）不同时设置
---
```

### Frontmatter 字段说明

- **title**: 文章标题（必需）
- **published**: 发布日期（必需）
- **description**: 文章描述，用于 SEO 和预览
- **image**: 封面图片路径（相对于文章文件）
- **tags**: 标签数组，用于分类
- **category**: 文章分类
- **draft**: 设置为 `true` 在生产环境中隐藏文章
- **pinned**: 设置为 `true` 将文章置顶
- **lang**: 文章语言（仅当与站点默认语言不同时设置）

### 置顶文章功能

`pinned` 字段允许您将重要文章置顶到博客列表的顶部。置顶文章将始终显示在普通文章之前，无论其发布日期如何。

**使用方法：**

```yaml
pinned: true  # 将此文章置顶
pinned: false # 普通文章（默认）
```

**排序规则：**

1. 置顶文章优先显示，按发布日期排序（最新在前）
2. 普通文章随后显示，按发布日期排序（最新在前）

## Markdown 扩展语法

DaCapo 支持超越标准 GitHub Flavored Markdown 的增强功能：

### 增强写作

- **提示框：** 使用 `> [!NOTE]`、`> [!TIP]`、`> [!WARNING]` 等创建精美的标注框
- **数学公式：** 使用 `$行内$` 和 `$$块级$$` 语法编写 LaTeX 数学公式
- **代码高亮：** 高级语法高亮，支持行号和复制按钮
- **GitHub 卡片：** 使用 `::github{repo="用户/仓库"}` 嵌入仓库卡片

### 视觉元素

- **图片画廊：** 自动 PhotoSwipe 集成，支持图片查看
- **可折叠部分：** 创建可展开的内容块
- **自定义组件：** 使用特殊指令增强内容

### 内容组织

- **目录：** 从标题自动生成，支持平滑滚动
- **阅读时间：** 自动计算和显示
- **文章元数据：** 丰富的前言支持，包含分类和标签

## 配置指南

### 基础配置

系统级配置（如 `siteURL`、`lang`、主题与字体）在 `src/config.ts` 维护。  
运营配置（站点标题、导航、Banner、TOC、页脚、统计等）在管理台维护：`/admin/settings/site`。

```typescript
export const systemSiteConfig = {
  siteURL: "https://example.com/",
  lang: "zh_CN",
  themeColor: { hue: 285, fixed: true },
  experimental: { layoutStateMachineV2: true },
};
```

### 特色页面配置

- **友链页面内容：** 在 `src/data/friends.ts` 中编辑朋友数据
- **关于页面：** 在 Directus 的 `app_articles` 中维护 `slug=about` 内容

### 数据源说明

当前项目已改为 Directus 数据驱动，不再使用“代码内容分离”模式。

**核心环境变量**:

- `DIRECTUS_URL`: Directus 实例地址
- `DIRECTUS_STATIC_TOKEN`: 服务端访问 Directus 的静态 Token

**更多文档**: [文档索引](docs/README.md)

## 贡献者

感谢以下源项目作者对本项目做出的贡献

[![源项目贡献者](https://contrib.rocks/image?repo=matsuzaka-yuki/Mizuki)](https://github.com/matsuzaka-yuki/Mizuki/graphs/contributors)

感谢以下本项目作者对本项目做出的贡献

[![本项目贡献者](https://contrib.rocks/image?repo=CiaLliChannel-Dev/DaCapo)](https://github.com/CiaLliChannel-Dev/DaCapo/graphs/contributors)

## 致谢

- **[Fuwari](https://github.com/saicaca/fuwari)** by saicaca - 本项目所基于的原始模板。感谢您创建了如此漂亮且功能强大的模板
- **[Yukina](https://github.com/WhitePaper233/yukina)** - 感谢提供设计灵感和创意，帮助塑造了这个项目。Yukina 是一个优雅的博客模板，展现了出色的设计原则和用户体验
- **[Firefly](https://github.com/CuteLeaf/Firefly)** - 感谢提供优秀的布局设计思路，双侧边栏布局、文章双列网格等布局，及部分小组件的设计与实现，让 DaCapo 的界面更加丰富
- **[Twilight](https://github.com/spr-aachen/Twilight)** - 感谢提供灵感和技术支持。Twilight 的响应式设计与过渡效果显著提升了 DaCapo 的使用体验
- **[Iconify](https://iconify.design/)** 精美的图标

## 许可证

本项目基于 Apache 许可证 2.0 - 查看 [LICENSE](LICENSE) 文件了解详情。

### 原始项目许可证

本项目基于 [Fuwari](https://github.com/saicaca/fuwari) 开发，该项目使用 MIT 许可证。根据 MIT 许可证要求，原始版权声明和许可声明已包含在 [LICENSE.MIT](LICENSE.MIT) 中。

---

⭐ 如果您觉得这个项目有帮助，请考虑给它一个星标!
