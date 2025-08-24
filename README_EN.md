# 🌸 Mizuki

![Node.js >= 20](https://img.shields.io/badge/node.js-%3E%3D20-brightgreen)
![pnpm >= 9](https://img.shields.io/badge/pnpm-%3E%3D9-blue)
![Astro](https://img.shields.io/badge/Astro-5.12.8-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-blue)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Language Versions / 语言版本**: English | [中文](README.md)

![Mizuki Preview](README.webp)

A modern, feature-rich static blog template built with [Astro](https://astro.build), featuring advanced functionality and beautiful design.

[**🖥️ Live Demo**](https://mizuki.mysqil.com/)
[**📝 User Documentation**](https://docs.mizuki.mysqil.com/)

---

## ✨ Features

### 🎨 Design & Interface

- [x] Built with [Astro](https://astro.build) and [Tailwind CSS](https://tailwindcss.com)
- [x] Smooth animations and page transitions using [Swup](https://swup.js.org/)
- [x] Light/dark theme toggle with system preference detection
- [x] Customizable theme colors and dynamic banner carousel
- [x] Fully responsive design for all devices
- [x] Beautiful typography using JetBrains Mono font

### 🔍 Content & Search

- [x] Advanced search functionality powered by [Pagefind](https://pagefind.app/)
- [x] [Enhanced Markdown features](#-markdown-extensions) with syntax highlighting
- [x] Interactive table of contents with auto-scroll
- [x] RSS feed generation
- [x] Reading time estimation
- [x] Article categorization and tagging system

### 🌐 Internationalization Support

- [x] **Responsive design** for all devices
- [x] **Dark/Light theme** with automatic switching
- [x] **Modern interface** with clean and elegant design
- [x] **Fast loading** with optimized performance

### Special Pages

- [x] **Anime Page** - Track anime watching progress and ratings
- [x] **Friends Page** - Beautiful card display for friend websites
- [x] **Diary Page** - Share life moments, social media style
- [x] **Archive Page** - Organized timeline view of articles
- [x] **About Page** - Customizable personal introduction

### 🛠 Technical Features

- [x] **Enhanced code blocks** powered by [Expressive Code](https://expressive-code.com/)
- [x] **Math formula support** with KaTeX rendering
- [x] **Image optimization** with PhotoSwipe gallery integration
- [x] **SEO optimization** including sitemap and meta tags
- [x] **Performance optimization** with lazy loading and caching
- [x] **Comment system** with Twikoo integration support

## 🚀 Quick Start

### 📦 Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/matsuzaka-yuki/mizuki.git
   cd mizuki
   ```

2. **Install dependencies:**

   ```bash
   # Install pnpm if you haven't already
   npm install -g pnpm

   # Install project dependencies
   pnpm install
   ```

3. **Configure your blog:**

   - Edit `src/config.ts` to customize blog settings
   - Update site information, theme colors, banner images, and social links
   - Configure translation settings and special page features
   - For detailed configuration instructions, please refer to: [📖 Configuration Documentation](docs/CONFIGURATION_EN.md)

4. **Start the development server:**

   ```bash
   pnpm dev
   ```

   The site will be available at `http://localhost:4321`

### 📝 Content Management

- **Create new posts:** `pnpm new-post <filename>`
- **Edit articles:** Modify files in `src/content/posts/`
- **Custom pages:** Edit special pages in `src/content/spec/`
- **Add images:** Place images in `src/assets/` or `public/`

### 🚀 Deployment

Deploy your blog to any static hosting platform:

- **Vercel:** Connect your GitHub repository to Vercel
- **Netlify:** Deploy directly from GitHub
- **GitHub Pages:** Use the included GitHub Actions workflow
- **Cloudflare Pages:** Connect your repository

Before deployment, update the `site` URL in `astro.config.mjs`.

## 🧩 Markdown Extensions

Mizuki supports enhanced features beyond standard GitHub Flavored Markdown:

### 📝 Enhanced Writing

- **Callout boxes:** Use `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]` etc. to create beautiful callout boxes
- **Math formulas:** Write LaTeX math using `$inline$` and `$$block$$` syntax
- **Code highlighting:** Advanced syntax highlighting with line numbers and copy buttons
- **GitHub cards:** Embed repository cards using `::github{repo="user/repo"}`

### 🎨 Visual Elements

- **Image galleries:** Automatic PhotoSwipe integration for image viewing
- **Collapsible sections:** Create expandable content blocks
- **Custom components:** Enhance content with special directives

### 📊 Content Organization

- **Table of contents:** Auto-generated from headings with smooth scrolling
- **Reading time:** Automatically calculated and displayed
- **Article metadata:** Rich frontmatter support including categories and tags

## ⚡ Commands

All commands are run from the root of the project:

| Command                    | Action                                           |
|:---------------------------|:------------------------------------------------|
| `pnpm install`             | Install dependencies                            |
| `pnpm dev`                 | Start local dev server at `localhost:4321`     |
| `pnpm build`               | Build production site to `./dist/`             |
| `pnpm preview`             | Preview build locally before deploying         |
| `pnpm check`               | Run Astro error checking                        |
| `pnpm format`              | Format code with Biome                          |
| `pnpm lint`                | Check and fix code issues                       |
| `pnpm new-post <filename>` | Create a new blog post                          |
| `pnpm astro ...`           | Run Astro CLI commands                          |

## 🎯 Configuration Guide

For detailed configuration instructions, please refer to: [📖 Configuration Documentation](docs/CONFIGURATION_EN.md)

## ✏️ Contributing

We welcome contributions! Feel free to submit issues and pull requests.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

## 🙏 Acknowledgments

- Based on the original [Fuwari](https://github.com/saicaca/fuwari) template
- Built with [Astro](https://astro.build) and [Tailwind CSS](https://tailwindcss.com)
- Inspired by [Yukina](https://github.com/WhitePaper233/yukina) - A beautiful and elegant blog template
- Built with modern frontend technology stack
- Icons from [Iconify](https://iconify.design/)

### Special Thanks

- **[Yukina](https://github.com/WhitePaper233/yukina)** - Thanks for providing design inspiration and creativity that helped shape this project. Yukina is an elegant blog template that demonstrates excellent design principles and user experience.

---

⭐ If you find this project helpful, please consider giving it a star!
