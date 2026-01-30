---
title: Markdown 教程
published: 2025-01-20
pinned: true
description: 一个简单的 Markdown 博客文章示例。
tags: [Markdown, 博客]
category: 示例
licenseName: "Unlicensed"
author: emn178
sourceLink: "https://github.com/emn178/markdown"
draft: false
---

# Markdown 教程

这是一个展示如何编写 Markdown 文件的示例。本文档集成了核心语法和扩展 (GMF)。

- [块级元素](#block-elements)
  - [段落和换行](#paragraphs-and-line-breaks)
  - [标题](#headers)
  - [引用](#blockquotes)
  - [列表](#lists)
  - [代码块](#code-blocks)
  - [水平分割线](#horizontal-rules)
  - [表格](#table)
- [行内元素](#span-elements)
  - [链接](#links)
  - [强调](#emphasis)
  - [代码](#code)
  - [图片](#images)
  - [删除线](#strikethrough)
- [其他](#miscellaneous)
  - [自动链接](#automatic-links)
  - [反斜杠转义](#backslash-escapes)
- [内联 HTML](#inline-html)

## 块级元素

### 段落和换行

#### 段落

HTML 标签：`<p>`

一个或多个空行。（包含空格或制表符的行也被视为空行。）

代码：

    This will be
    inline.

    This is second paragraph.

预览：

---

This will be
inline.

This is second paragraph.

---

#### 换行

HTML 标签：`<br />`

在一行的末尾添加**两个或更多空格**。

代码：

    This will be not
    inline.

预览：

---

This will be not  
inline.

---

### 标题

Markdown 支持两种标题样式：Setext 和 atx。

#### Setext

HTML 标签：`<h1>`, `<h2>`

使用**等号 (=)** 表示 `<h1>`，使用**连字符 (-)** 表示 `<h2>`，数量不限。

代码：

    This is an H1
    =============
    This is an H2
    -------------

预览：

---

# This is an H1

## This is an H2

---

#### atx

HTML 标签：`<h1>`, `<h2>`, `<h3>`, `<h4>`, `<h5>`, `<h6>`

在行首使用 1-6 个**井号 (#)**，分别对应 `<h1>` - `<h6>`。

代码：

    # This is an H1
    ## This is an H2
    ###### This is an H6

预览：

---

# This is an H1

## This is an H2

###### This is an H6

---

可选地，你可以“闭合” atx 样式的标题。闭合的井号**不需要匹配**开启标题时的井号数量。

代码：

    # This is an H1 #
    ## This is an H2 ##
    ### This is an H3 ######

预览：

---

# This is an H1

## This is an H2

### This is an H3

---

### 引用

HTML 标签：`<blockquote>`

Markdown 使用邮件风格的 **>** 字符进行引用。最好对文本进行硬换行，并在每一行前加一个 >。

代码：

    > This is a blockquote with two paragraphs. Lorem ipsum dolor sit amet,
    > consectetuer adipiscing elit. Aliquam hendrerit mi posuere lectus.
    > Vestibulum enim wisi, viverra nec, fringilla in, laoreet vitae, risus.
    >
    > Donec sit amet nisl. Aliquam semper ipsum sit amet velit. Suspendisse
    > id sem consectetuer libero luctus adipiscing.

预览：

---

> This is a blockquote with two paragraphs. Lorem ipsum dolor sit amet,
> consectetuer adipiscing elit. Aliquam hendrerit mi posuere lectus.
> Vestibulum enim wisi, viverra nec, fringilla in, laoreet vitae, risus.
>
> Donec sit amet nisl. Aliquam semper ipsum sit amet velit. Suspendisse
> id sem consectetuer libero luctus adipiscing.

---

Markdown 允许你偷懒，只在硬换行段落的第一行前加 >。

代码：

    > This is a blockquote with two paragraphs. Lorem ipsum dolor sit amet,
    consectetuer adipiscing elit. Aliquam hendrerit mi posuere lectus.
    Vestibulum enim wisi, viverra nec, fringilla in, laoreet vitae, risus.

    > Donec sit amet nisl. Aliquam semper ipsum sit amet velit. Suspendisse
    id sem consectetuer libero luctus adipiscing.

预览：

---

> This is a blockquote with two paragraphs. Lorem ipsum dolor sit amet,
> consectetuer adipiscing elit. Aliquam hendrerit mi posuere lectus.
> Vestibulum enim wisi, viverra nec, fringilla in, laoreet vitae, risus.

> Donec sit amet nisl. Aliquam semper ipsum sit amet velit. Suspendisse
> id sem consectetuer libero luctus adipiscing.

---

引用可以嵌套（即引用中的引用），只需添加额外的 > 层级。

代码：

    > This is the first level of quoting.
    >
    > > This is nested blockquote.
    >
    > Back to the first level.

预览：

---

> This is the first level of quoting.
>
> > This is nested blockquote.
>
> Back to the first level.

---

引用可以包含其他 Markdown 元素，包括标题、列表和代码块。

代码：

    > ## This is a header.
    >
    > 1.   This is the first list item.
    > 2.   This is the second list item.
    >
    > Here's some example code:
    >
    >     return shell_exec("echo $input | $markdown_script");

预览：

---

> ## This is a header.
>
> 1.  This is the first list item.
> 2.  This is the second list item.
>
> Here's some example code:
>
>     return shell_exec("echo $input | $markdown_script");

---

### 列表

Markdown 支持有序（编号）和无序（项目符号）列表。

#### 无序列表

HTML 标签：`<ul>`

无序列表使用**星号 (\*)**、**加号 (+)** 和**减号 (-)**。

代码：

    *   Red
    *   Green
    *   Blue

预览：

---

- Red
- Green
- Blue

---

等同于：

代码：

    +   Red
    +   Green
    +   Blue

以及：

代码：

    -   Red
    -   Green
    -   Blue

#### 有序列表

HTML 标签：`<ol>`

有序列表使用数字后跟句点：

代码：

    1.  Bird
    2.  McHale
    3.  Parish

预览：

---

1.  Bird
2.  McHale
3.  Parish

---

如果不小心写成这样，可能会意外触发有序列表：

代码：

    1986. What a great season.

预览：

---

1986. What a great season.

---

你可以对句点进行**反斜杠转义 (\\)**：

代码：

    1986\. What a great season.

预览：

---

1986\. What a great season.

---

#### 缩进

##### 引用

要将引用放入列表项中，引用的 > 分隔符需要缩进：

代码：

    *   A list item with a blockquote:
    
        > This is a blockquote
        > inside a list item.

预览：

---

- A list item with a blockquote:

  > This is a blockquote
  > inside a list item.

---

##### 代码块

要将代码块放入列表项中，代码块需要缩进两次 — **8 个空格**或**两个制表符**：

代码：

    *   A list item with a code block:
    
            <code goes here>

预览：

---

- A list item with a code block:

      <code goes here>

---

##### 嵌套列表

代码：

    * A
      * A1
      * A2
    * B
    * C

预览：

---

- A
  - A1
  - A2
- B
- C

---

### 代码块

HTML 标签：`<pre>`

将块的每一行缩进至少**4 个空格**或**1 个制表符**。

代码：

    This is a normal paragraph:
    
        This is a code block.

预览：

---

This is a normal paragraph:

    This is a code block.

---

代码块一直持续到没有缩进的行（或文章末尾）。

在代码块内，**_和号 (&)_** 和 **尖括号 (< 和 >)** 会自动转换为 HTML 实体。

代码：

        <div class="footer">
            &copy; 2004 Foo Corporation
        </div>

预览：

---

    <div class="footer">
        &copy; 2004 Foo Corporation
    </div>

---

接下来的围栏代码块和语法高亮是扩展功能，你可以使用另一种方式编写代码块。

#### 围栏代码块

只需用 ` ``` ` 包裹你的代码（如下所示），你就不需要缩进 4 个空格了。

代码：

    Here's an example:
    
    ```
    function test() {
      console.log("notice the blank line before this function?");
    }
    ```

预览：

---

Here's an example:

```
function test() {
  console.log("notice the blank line before this function?");
}
```

---

#### 语法高亮

在围栏块中，添加可选的语言标识符，我们会对其进行语法高亮 ([支持的语言](https://github.com/github/linguist/blob/master/lib/linguist/languages.yml))。

代码：

    ```ruby
    require 'redcarpet'
    markdown = Redcarpet.new("Hello World!")
    puts markdown.to_html
    ```

预览：

---

```ruby
require 'redcarpet'
markdown = Redcarpet.new("Hello World!")
puts markdown.to_html
```

---

### 水平分割线

HTML 标签：`<hr />`

在单独的一行上放置**三个或更多连字符 (-)、星号 (\*) 或下划线 (\_)**。你可以在连字符或星号之间使用空格。

代码：

    * * *
    ***
    *****
    - - -
    ---------------------------------------
    ___

预览：

---

---

---

---

---

---

---

### 表格

HTML 标签：`<table>`

这是一个扩展功能。

使用**竖线 (|)** 分隔列，使用**连字符 (-)** 分隔表头，并使用**冒号 (:)** 进行对齐。

外部的**竖线 (|)** 和对齐是可选的。每个单元格至少有 **3 个分隔符** 来分隔表头。

代码：

```
| Left | Center | Right |
|:-----|:------:|------:|
|aaa   |bbb     |ccc    |
|ddd   |eee     |fff    |

 A | B
---|---
123|456


A |B
--|--
12|45
```

预览：

---

| Left | Center | Right |
| :--- | :----: | ----: |
| aaa  |  bbb   |   ccc |
| ddd  |  eee   |   fff |

| A   | B   |
| --- | --- |
| 123 | 456 |

| A   | B   |
| --- | --- |
| 12  | 45  |

---

## 行内元素

### 链接

HTML 标签：`<a>`

Markdown 支持两种链接样式：行内和引用。

#### 行内

行内链接格式如下：`[链接文本](URL "标题")`

标题是可选的。

代码：

    This is [an example](http://example.com/ "Title") inline link.
    
    [This link](http://example.net/) has no title attribute.

预览：

---

This is [an example](http://example.com/ "Title") inline link.

[This link](http://example.net/) has no title attribute.

---

如果你引用的是同一服务器上的本地资源，可以使用相对路径：

代码：

    See my [About](/about/) page for details.

预览：

---

See my [About](/about/) page for details.

---

#### 引用

你可以预定义链接引用。格式如下：`[id]: URL "标题"`

标题也是可选的。然后在引用链接时，格式如下：`[链接文本][id]`

代码：

    [id]: http://example.com/  "Optional Title Here"
    This is [an example][id] reference-style link.

预览：

---

[id]: http://example.com/ "Optional Title Here"

This is [an example][id] reference-style link.

---

即：

- 方括号包含链接标识符（**不区分大小写**，可选地从左边距缩进最多三个空格）；
- 接着是冒号；
- 接着是一个或多个空格（或制表符）；
- 接着是链接的 URL；
- 链接 URL 可以可选地用尖括号括起来。
- 可选地跟在链接的标题属性之后，用双引号或单引号括起来，或用圆括号括起来。

以下三个链接定义是等效的：

代码：

    [foo]: http://example.com/  "Optional Title Here"
    [foo]: http://example.com/  'Optional Title Here'
    [foo]: http://example.com/  (Optional Title Here)
    [foo]: <http://example.com/>  "Optional Title Here"

使用一组空的方括号，链接文本本身用作名称。

代码：

    [Google]: http://google.com/
    [Google][]

预览：

---

[Google]: http://google.com/

[Google][]

---

### 强调

HTML 标签：`<em>`, `<strong>`

Markdown 将**星号 (\*)** 和**下划线 (\_)** 视为强调指示符。**一个分隔符**将变为 `<em>`；**两个分隔符**将变为 `<strong>`。

代码：

    *single asterisks*
    
    _single underscores_
    
    **double asterisks**
    
    __double underscores__

预览：

---

_single asterisks_

_single underscores_

**double asterisks**

**double underscores**

---

但是如果你用空格包围 \* 或 \_，它将被视为字面意义上的星号或下划线。

你可以使用反斜杠转义它：

代码：

    \*this text is surrounded by literal asterisks\*

预览：

---

\*this text is surrounded by literal asterisks\*

---

### 代码

HTML 标签：`<code>`

用**反引号 (`)** 包裹它。

代码：

    Use the `printf()` function.

预览：

---

Use the `printf()` function.

---

要在代码跨度内包含字面意义的反引号字符，你可以使用**多个反引号**作为开启和关闭分隔符：

代码：

    ``There is a literal backtick (`) here.``

预览：

---

``There is a literal backtick (`) here.``

---

包围代码跨度的反引号分隔符可以包含空格 — 一个在开启之后，一个在关闭之前。这允许你在代码跨度的开头或结尾放置字面意义的反引号字符：

代码：

    A single backtick in a code span: `` ` ``
    
    A backtick-delimited string in a code span: `` `foo` ``

预览：

---

A single backtick in a code span: `` ` ``

A backtick-delimited string in a code span: `` `foo` ``

---

### 图片

HTML 标签：`<img />`

Markdown 使用一种类似于链接语法的图片语法，允许两种样式：行内和引用。

#### 行内

行内图片语法如下：`![Alt text](URL "标题")`

标题是可选的。

代码：

    ![Alt text](/path/to/img.jpg)
    
    ![Alt text](/path/to/img.jpg "Optional title")

预览：

---

![Alt text](https://s2.loli.net/2024/08/20/5fszgXeOxmL3Wdv.webp)

![Alt text](https://s2.loli.net/2024/08/20/5fszgXeOxmL3Wdv.webp "Optional title")

---

即：

- 一个感叹号：!；
- 接着是一组方括号，包含图片的 alt 属性文本；
- 接着是一组圆括号，包含图片的 URL 或路径，以及用双引号或单引号括起来的可选标题属性。

#### 引用

引用样式图片语法如下：`![Alt text][id]`

代码：

    [img id]: https://s2.loli.net/2024/08/20/5fszgXeOxmL3Wdv.webp  "Optional title attribute"
    ![Alt text][img id]

预览：

---

[img id]: https://s2.loli.net/2024/08/20/5fszgXeOxmL3Wdv.webp "Optional title attribute"

![Alt text][img id]

---

### 删除线

HTML 标签：`<del>`

这是一个扩展功能。

GFM 添加了删除线文本的语法。

代码：

```
~~Mistaken text.~~
```

预览：

---

~~Mistaken text.~~

---

## 其他

### 自动链接

Markdown 支持一种创建 URL 和电子邮件地址“自动”链接的快捷方式：只需用尖括号包围 URL 或电子邮件地址。

代码：

    <http://example.com/>
    
    <address@example.com>

预览：

---

<http://example.com/>

<address@example.com>

---

GFM 将自动链接标准 URL。

代码：

```
https://github.com/emn178/markdown
```

预览：

---

https://github.com/emn178/markdown

---

### 反斜杠转义

Markdown 允许你使用反斜杠转义来生成字面字符，否则这些字符在 Markdown 格式语法中具有特殊含义。

代码：

    \*literal asterisks\*

预览：

---

\*literal asterisks\*

---

Markdown 为以下字符提供反斜杠转义：

代码：

    \   反斜杠
    `   反引号
    *   星号
    _   下划线
    {}  花括号
    []  方括号
    ()  圆括号
    #   井号
    +   加号
    -   减号（连字符）
    .   点
    !   感叹号

## 内联 HTML

对于 Markdown 语法未涵盖的任何标记，你可以直接使用 HTML 本身。不需要加前缀或定界符来指示你正在从 Markdown 切换到 HTML；只需使用标签即可。

代码：

    This is a regular paragraph.
    
    <table>
        <tr>
            <td>Foo</td>
        </tr>
    </table>
    
    This is another regular paragraph.

预览：

---

This is a regular paragraph.

<table>
    <tr>
        <td>Foo</td>
    </tr>
</table>

This is another regular paragraph.

---

请注意，Markdown 格式语法**不会在块级 HTML 标签内处理**。

与块级 HTML 标签不同，Markdown 语法**会在跨度级标签内处理**。

代码：

    <span>**Work**</span>
    
    <div>
        **No Work**
    </div>

预览：

---

<span>**Work**</span>

<div>
  **No Work**
</div>
***
