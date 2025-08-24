# 🎯 Mizuki 配置指南

本文档详细介绍了 Mizuki 博客模板的所有配置选项和自定义方法。

## 📋 目录

- [基础配置](#-基础配置)
- [文章前言格式](#-文章前言格式)
- [特色页面配置](#-特色页面配置)
- [部署配置](#-部署配置)
- [内容管理](#-内容管理)
- [Markdown 扩展语法](#-markdown-扩展语法)

## 🔧 基础配置

### 站点配置文件

编辑 `src/config.ts` 自定义您的博客：

```typescript
export const siteConfig: SiteConfig = {
  title: "您的博客名称",
  subtitle: "您的博客描述",
  lang: "zh-CN", // 或 "en"、"ja" 等
  themeColor: {
    hue: 210, // 0-360，主题色调
    fixed: false, // 隐藏主题色选择器
  },
  banner: {
    enable: true,
    src: ["assets/banner/1.webp"], // 横幅图片
    carousel: {
      enable: true,
      interval: 0.8, // 秒
    },
  },
};
```

### 配置选项详解

#### 基本信息

- **title**: 博客标题，显示在页面标题和导航栏
- **subtitle**: 博客副标题，显示在首页
- **lang**: 站点默认语言，支持 `zh-CN`、`en-US`、`ja-JP` 等

#### 主题色彩

- **hue**: 主题色调值（0-360度）
  - 0: 红色
  - 60: 黄色
  - 120: 绿色
  - 180: 青色
  - 240: 蓝色
  - 300: 紫色
- **fixed**: 是否隐藏主题色选择器，设为 `true` 时用户无法更改主题色

#### 翻译功能

- **enable**: 是否启用实时翻译功能
- **service**: 翻译服务类型，目前支持 `"client.edge"`
- **defaultLanguage**: 默认翻译语言
  - `"chinese_simplified"`: 简体中文
  - `"english"`: 英语
  - `"japanese"`: 日语
  - `"korean"`: 韩语

#### 横幅设置

- **enable**: 是否启用横幅
- **src**: 横幅图片路径数组，支持多张图片轮播
- **carousel.enable**: 是否启用轮播功能
- **carousel.interval**: 轮播间隔时间（秒）

## 📝 文章前言格式

### 标准 Frontmatter

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
lang: zh-CN      # 仅当文章语言与 config.ts 中的站点语言不同时设置
---
```

### Frontmatter 字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| **title** | string | ✅ | 文章标题 |
| **published** | date | ✅ | 发布日期（YYYY-MM-DD 格式） |
| **description** | string | ❌ | 文章描述，用于 SEO 和预览 |
| **image** | string | ❌ | 封面图片路径（相对于文章文件） |
| **tags** | array | ❌ | 标签数组，用于分类 |
| **category** | string | ❌ | 文章分类 |
| **draft** | boolean | ❌ | 设置为 `true` 在生产环境中隐藏文章 |
| **pinned** | boolean | ❌ | 设置为 `true` 将文章置顶 |
| **lang** | string | ❌ | 文章语言（仅当与站点默认语言不同时设置） |

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

## 📱 特色页面配置

### 追番页面

- **文件位置**: `src/pages/anime.astro`
- **功能**: 追踪动画观看进度和评分
- **配置**: 直接编辑文件中的动画列表数据

### 友链页面

- **文件位置**: `src/content/spec/friends.md`
- **功能**: 精美卡片展示朋友网站
- **配置**: 编辑 Markdown 文件中的朋友数据

### 日记页面

- **文件位置**: `src/pages/diary.astro`
- **功能**: 分享生活瞬间，类似社交媒体
- **配置**: 编辑文件中的动态内容

### 关于页面

- **文件位置**: `src/content/spec/about.md`
- **功能**: 可自定义的个人介绍
- **配置**: 编辑 Markdown 文件内容

## 🚀 部署配置

### 部署前准备

在部署前，请在 `astro.config.mjs` 中更新 `site` URL：

```javascript
export default defineConfig({
  site: 'https://yourdomain.com', // 更新为您的域名
  // 其他配置...
});
```

### 支持的部署平台

- **Vercel**: 连接 GitHub 仓库到 Vercel
- **Netlify**: 直接从 GitHub 部署
- **GitHub Pages**: 使用包含的 GitHub Actions 工作流
- **Cloudflare Pages**: 连接您的仓库

## 📝 内容管理

### 文件结构

```markdown
src/
├── content/
│   ├── posts/          # 博客文章
│   └── spec/           # 特殊页面
├── assets/             # 资源文件
└── config.ts           # 配置文件

public/
└── images/             # 公共图片
```

### 内容管理操作

- **创建新文章**: `pnpm new-post <文件名>`
- **编辑文章**: 修改 `src/content/posts/` 中的文件
- **自定义页面**: 编辑 `src/content/spec/` 中的特殊页面
- **添加图片**: 将图片放在 `src/assets/` 或 `public/` 中

### 图片管理

#### 文章图片

- 放置在 `src/assets/` 目录下
- 在文章中使用相对路径引用
- 支持自动优化和懒加载

#### 公共图片

- 放置在 `public/` 目录下
- 直接使用 `/images/` 路径引用
- 适合静态资源和图标

## 🧩 Markdown 扩展语法

Mizuki 支持超越标准 GitHub Flavored Markdown 的增强功能：

### 📝 增强写作

#### 提示框

使用特殊语法创建精美的标注框：

```markdown
> [!NOTE]
> 这是一个提示信息

> [!TIP]
> 这是一个技巧提示

> [!WARNING]
> 这是一个警告信息

> [!DANGER]
> 这是一个危险警告
```

#### 数学公式

支持 LaTeX 数学公式：

```markdown
行内公式：$E = mc^2$

块级公式：
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$
```

#### GitHub 卡片

嵌入 GitHub 仓库卡片：

```markdown
::github{repo="用户名/仓库名"}
```

### 🎨 视觉元素

#### 图片画廊

- 自动 PhotoSwipe 集成
- 支持图片放大查看
- 自动生成缩略图

#### 可折叠部分

创建可展开的内容块：

```markdown
<details>
<summary>点击展开</summary>

这里是折叠的内容

</details>
```

### 📊 内容组织

#### 自动目录

- 从文章标题自动生成
- 支持平滑滚动定位
- 显示阅读进度

#### 阅读时间

- 自动计算文章阅读时间
- 基于平均阅读速度
- 显示在文章头部

## ⚡ 开发命令

| 命令 | 操作 |
|:-----|:-----|
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 构建生产版本 |
| `pnpm preview` | 预览构建结果 |
| `pnpm check` | 运行类型检查 |
| `pnpm format` | 格式化代码 |
| `pnpm lint` | 代码质量检查 |
| `pnpm new-post <文件名>` | 创建新文章 |

## 🔍 故障排除

### 常见问题

1. **图片不显示**
   - 检查图片路径是否正确
   - 确认图片文件存在
   - 验证图片格式支持

2. **翻译功能不工作**
   - 检查网络连接
   - 确认翻译服务配置
   - 查看浏览器控制台错误

3. **样式异常**
   - 清除浏览器缓存
   - 重新构建项目
   - 检查 CSS 文件完整性

### 性能优化建议

1. **图片优化**
   - 使用 WebP 格式
   - 压缩图片大小
   - 启用懒加载

2. **代码优化**
   - 定期运行 `pnpm format`
   - 使用 TypeScript 类型检查
   - 遵循代码规范

3. **构建优化**
   - 启用生产模式构建
   - 使用 CDN 加速
   - 配置缓存策略
