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
  title: "Mizuki",
  subtitle: "One demo website",
  
  lang: "zh_CN", // 语言代码，用于HTML lang属性和RSS等
  
  themeColor: {
    hue: 210, // 主题色的默认色相，范围从 0 到 360
  },
  banner: {
    enable: true, // 启用横幅功能

    // 支持桌面和移动端不同的横幅图片
    src: {
      desktop: [
        "assets/desktop-banner/1.webp",
        "assets/desktop-banner/2.webp",
        // 更多图片...
      ], // 桌面横幅图片
      mobile: [
        "assets/mobile-banner/1.webp",
        "assets/mobile-banner/2.webp",
        // 更多图片...
      ], // 移动横幅图片
    },

    position: "center", // 图片位置：'top', 'center', 'bottom'

    carousel: {
      enable: true, // 启用轮播功能
      interval: 2, // 轮播间隔时间（秒）
    },

    homeText: {
      enable: true, // 在主页显示自定义文本
      title: "Mizuki", // 主页横幅主标题
      subtitle: [
        "One demo website",
        "Carousel Text1",
        "Carousel Text2",
      ], // 主页横幅副标题，支持多文本
      typewriter: {
        enable: true, // 启用副标题打字机效果
        speed: 100, // 打字速度（毫秒）
        deleteSpeed: 50, // 删除速度（毫秒）
        pauseTime: 2000, // 完全显示后的暂停时间（毫秒）
      },
    },
  },
  toc: {
    enable: true, // 启用目录功能
    depth: 3, // 目录深度，1-6
  },
};
```

### 配置选项详解

#### 基本信息

- **title**: 博客标题，显示在页面标题和导航栏
- **subtitle**: 博客副标题，显示在首页
- **lang**: 站点语言标识（用于HTML lang属性，系统已移除i18n功能）

#### 主题色系统

- **hue**: 默认主题色相值（仅作为初始值）
- **自动轮换**: 系统采用基于 Material Design 3 规范的自动主题色轮换
  - 每天自动切换不同的主题色（基于星期几）
  - 使用7种科学配色方案，确保良好的视觉体验

#### 横幅设置

- **enable**: 是否启用横幅
- **src**: 横幅图片路径，支持桌面和移动端不同配置
- **position**: 图片位置（'top', 'center', 'bottom'）
- **carousel.enable**: 是否启用轮播功能
- **carousel.interval**: 轮播间隔时间（秒）
- **homeText**: 主页文本配置，包含标题、副标题和打字机效果

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
