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
  title: "Your Blog Name",
  subtitle: "Your Blog Description",
  lang: "en-US", // or "zh-CN", "ja", etc.
  themeColor: {
    hue: 210, // 0-360, theme hue
    fixed: false, // Hide theme color picker
  },
  banner: {
    enable: true,
    src: ["assets/banner/1.webp"], // Banner images
    carousel: {
      enable: true,
      interval: 0.8, // seconds
    },
  },
};
```

### Configuration Options Explained

#### Basic Information

- **title**: Blog title, displayed in page title and navigation bar
- **subtitle**: Blog subtitle, displayed on homepage
- **lang**: Site default language, supports `en-US`, `zh-CN`, `ja-JP`, etc.

#### Theme Colors

- **hue**: Theme hue value (0-360 degrees)
  - 0: Red
  - 60: Yellow
  - 120: Green
  - 180: Cyan
  - 240: Blue
  - 300: Purple
- **fixed**: Whether to hide theme color picker, when set to `true` users cannot change theme color

#### Translation Feature

- **enable**: Whether to enable real-time translation
- **service**: Translation service type, currently supports `"client.edge"`
- **defaultLanguage**: Default translation language
  - `"english"`: English
  - `"chinese_simplified"`: Simplified Chinese
  - `"japanese"`: Japanese
  - `"korean"`: Korean

#### Banner Settings

- **enable**: Whether to enable banner
- **src**: Banner image path array, supports multiple images for carousel
- **carousel.enable**: Whether to enable carousel functionality
- **carousel.interval**: Carousel interval time (seconds)

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

## 🧩 Markdown Extensions

Mizuki supports enhanced features beyond standard GitHub Flavored Markdown:

### 📝 Enhanced Writing

#### Callout Boxes

Use special syntax to create beautiful callout boxes:

```markdown
> [!NOTE]
> This is a note information

> [!TIP]
> This is a tip

> [!WARNING]
> This is a warning

> [!DANGER]
> This is a danger warning
```

#### Math Formulas

Support LaTeX math formulas:

```markdown
Inline formula: $E = mc^2$

Block formula:
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$
```

#### GitHub Cards

Embed GitHub repository cards:

```markdown
::github{repo="username/repository"}
```

### 🎨 Visual Elements

#### Image Galleries

- Automatic PhotoSwipe integration
- Support image zoom viewing
- Auto-generate thumbnails

#### Collapsible Sections

Create expandable content blocks:

```markdown
<details>
<summary>Click to expand</summary>

This is the collapsed content

</details>
```

### 📊 Content Organization

#### Auto Table of Contents

- Auto-generated from article headings
- Support smooth scroll positioning
- Display reading progress

#### Reading Time

- Automatically calculate article reading time
- Based on average reading speed
- Display in article header

## ⚡ Development Commands

| Command | Action |
|:--------|:-------|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start development server |
| `pnpm build` | Build production version |
| `pnpm preview` | Preview build results |
| `pnpm check` | Run type checking |
| `pnpm format` | Format code |
| `pnpm lint` | Code quality check |
| `pnpm new-post <filename>` | Create new article |

## 🔍 Troubleshooting

### Common Issues

1. **Images not displaying**
   - Check if image path is correct
   - Confirm image file exists
   - Verify image format support

2. **Translation feature not working**
   - Check network connection
   - Confirm translation service configuration
   - Check browser console for errors

3. **Style abnormalities**
   - Clear browser cache
   - Rebuild project
   - Check CSS file integrity

### Performance Optimization Tips

1. **Image Optimization**
   - Use WebP format
   - Compress image size
   - Enable lazy loading

2. **Code Optimization**
   - Run `pnpm format` regularly
   - Use TypeScript type checking
   - Follow coding standards

3. **Build Optimization**
   - Enable production mode build
   - Use CDN acceleration
   - Configure caching strategy
