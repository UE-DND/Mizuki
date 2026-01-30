---
title: Mizuki 使用指南
published: 2024-04-01
description: "如何使用这个博客模板。"
image: "./cover.webp"
tags: ["Mizuki", "博客", "自定义"]
category: 指南
draft: false
---



本博客模板基于 [Astro](https://astro.build/) 构建。如果在本文中找不到你需要的答案，请查阅 [Astro 文档](https://docs.astro.build/)。

## 文章的前置元数据 (Front-matter)

```yaml
---
title: 我的第一篇博客文章
published: 2023-09-09
description: 这是我的新 Astro 博客的第一篇文章。
image: ./cover.jpg
tags: [Foo, Bar]
category: 前端
draft: false
---
```

<br>

| 属性 | 描述 |
|---|---|
| `title` | 文章标题。 |
| `published` | 文章发布日期。 |
| `pinned` | 是否将文章置顶。 |
| `priority` | 置顶文章的优先级。数值越小优先级越高 (0, 1, 2...)。 |
| `description` | 文章的简短描述。显示在首页列表中。 |
| `image` | 文章的封面图片路径。<br/>1. 以 `http://` 或 `https://` 开头：使用网络图片<br/>2. 以 `/` 开头：使用 `public` 目录下的图片<br/>3. 无前缀：相对于 markdown 文件的路径 |
| `tags` | 文章的标签。 |
| `category` | 文章的分类。 |
| `licenseName` | 文章内容的许可协议名称。 |
| `author` | 文章作者。 |
| `sourceLink` | 文章内容的来源链接或参考。 |
| `draft` | 如果为 true，则视为草稿，不会在已发布列表中显示。 |

## 文章文件放置位置



文章文件应放置在 `src/content/posts/` 目录下。你也可以创建子目录来更好地组织文章和资源。

```
src/content/posts/
├── post-1.md
└── post-2/
    ├── cover.webp
    └── index.md
```
