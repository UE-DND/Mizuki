# 🎯 Mizuki Configuration Guide

This document provides detailed instructions for all configuration options and customization methods for the Mizuki blog template.

## 📋 Table of Contents

- [Basic Configuration](#-basic-configuration)
- [Article Frontmatter Format](#-article-frontmatter-format)
- [Special Pages Configuration](#-special-pages-configuration)
- [Deployment Configuration](#-deployment-configuration)
- [Content Management](#-content-management)
- [Markdown Extensions](#-markdown-extensions)

## 🔧 Basic Configuration

### Site Configuration File

Edit `src/config.ts` to customize your blog:

```typescript
export const siteConfig: SiteConfig = {
  title: "Mizuki",
  subtitle: "One demo website",
  
  lang: "zh_CN", // Language code, used for HTML lang attribute and RSS
  
  themeColor: {
    hue: 210, // Default theme hue, range from 0 to 360
  },
  banner: {
    enable: true, // Enable banner functionality
    
    // Support different banner images for desktop and mobile
    src: {
      desktop: [
        "assets/desktop-banner/1.webp",
        "assets/desktop-banner/2.webp",
        // More images...
      ], // Desktop banner images
      mobile: [
        "assets/mobile-banner/1.webp",
        "assets/mobile-banner/2.webp",
        // More images...
      ], // Mobile banner images
    },
    
    position: "center", // Image position: 'top', 'center', 'bottom'
    
    carousel: {
      enable: true, // Enable carousel functionality
      interval: 2, // Carousel interval time (seconds)
    },
    
    homeText: {
      enable: true, // Display custom text on homepage
      title: "Mizuki", // Homepage banner main title
      subtitle: [
        "One demo website",
        "Carousel Text1",
        "Carousel Text2",
      ], // Homepage banner subtitle, supports multiple texts
      typewriter: {
        enable: true, // Enable subtitle typewriter effect
        speed: 100, // Typing speed (milliseconds)
        deleteSpeed: 50, // Deletion speed (milliseconds)
        pauseTime: 2000, // Pause time after full display (milliseconds)
      },
    },
  },
  toc: {
    enable: true, // Enable table of contents functionality
    depth: 3, // TOC depth, 1-6
  },
};
```

### Configuration Options Explained

#### Basic Information

- **title**: Blog title, displayed in page title and navigation bar
- **subtitle**: Blog subtitle, displayed on homepage
- **lang**: Site language identifier (for HTML lang attribute, i18n functionality has been removed)

#### Theme Color System

- **hue**: Default theme hue value (used as initial value only)
- **Auto Rotation**: System uses automatic theme color rotation based on Material Design 3 specifications
  - Automatically switches different theme colors daily (based on day of week)
  - Uses 7 scientific color schemes to ensure good visual experience

#### Banner Settings

- **enable**: Whether to enable banner
- **src**: Banner image paths, supports different configurations for desktop and mobile
- **position**: Image position ('top', 'center', 'bottom')
- **carousel.enable**: Whether to enable carousel functionality
- **carousel.interval**: Carousel interval time (seconds)
- **homeText**: Homepage text configuration, including title, subtitle and typewriter effect

## 📝 Article Frontmatter Format

### Standard Frontmatter

```yaml
---
title: My First Blog Post
published: 2023-09-09
description: This is my first post on my new blog.
image: ./cover.jpg
tags: [tag1, tag2]
category: Frontend
draft: false
pinned: false
lang: en-US      # Only set if article language differs from site language in config.ts
---
```

### Frontmatter Fields Explanation

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| **title** | string | ✅ | Article title |
| **published** | date | ✅ | Publication date (YYYY-MM-DD format) |
| **description** | string | ❌ | Article description for SEO and preview |
| **image** | string | ❌ | Cover image path (relative to article file) |
| **tags** | array | ❌ | Array of tags for categorization |
| **category** | string | ❌ | Article category |
| **draft** | boolean | ❌ | Set to `true` to hide article in production |
| **pinned** | boolean | ❌ | Set to `true` to pin article to top |
| **lang** | string | ❌ | Article language (only set if different from site default) |

### Pinned Articles Feature

The `pinned` field allows you to pin important articles to the top of your blog list. Pinned articles will always appear before regular articles, regardless of their publication date.

**Usage:**

```yaml
pinned: true  # Pin this article to top
pinned: false # Regular article (default)
```

**Sorting Rules:**

1. Pinned articles appear first, sorted by publication date (newest first)
2. Regular articles follow, sorted by publication date (newest first)

## 📱 Special Pages Configuration

### Anime Page

- **File Location**: `src/pages/anime.astro`
- **Function**: Track anime watching progress and ratings
- **Configuration**: Edit anime list data directly in the file

### Friends Page

- **File Location**: `src/content/spec/friends.md`
- **Function**: Beautiful card display for friend websites
- **Configuration**: Edit friend data in the Markdown file

### Diary Page

- **File Location**: `src/pages/diary.astro`
- **Function**: Share life moments, social media style
- **Configuration**: Edit dynamic content in the file

### About Page

- **File Location**: `src/content/spec/about.md`
- **Function**: Customizable personal introduction
- **Configuration**: Edit Markdown file content

## 🚀 Deployment Configuration

### Pre-deployment Setup

Before deployment, update the `site` URL in `astro.config.mjs`:

```javascript
export default defineConfig({
  site: 'https://yourdomain.com', // Update to your domain
  // Other configurations...
});
```

### Supported Deployment Platforms

- **Vercel**: Connect your GitHub repository to Vercel
- **Netlify**: Deploy directly from GitHub
- **GitHub Pages**: Use the included GitHub Actions workflow
- **Cloudflare Pages**: Connect your repository

## 📝 Content Management

### File Structure

```markdown
src/
├── content/
│   ├── posts/          # Blog articles
│   └── spec/           # Special pages
├── assets/             # Asset files
└── config.ts           # Configuration file

public/
└── images/             # Public images
```

### Content Management Operations

- **Create new posts**: `pnpm new-post <filename>`
- **Edit articles**: Modify files in `src/content/posts/`
- **Custom pages**: Edit special pages in `src/content/spec/`
- **Add images**: Place images in `src/assets/` or `public/`

### Image Management

#### Article Images

- Place in `src/assets/` directory
- Reference using relative paths in articles
- Supports automatic optimization and lazy loading

#### Public Images

- Place in `public/` directory
- Reference directly using `/images/` path
- Suitable for static resources and icons
