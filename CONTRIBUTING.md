# 🌸 Mizuki 开发、贡献指南 <img align='right' src='logo.png' width='200px' alt="Mizuki logo">

[![Node.js >= 20](https://img.shields.io/badge/node.js-%3E%3D20-brightgreen)](https://nodejs.org/)
[![pnpm >= 9](https://img.shields.io/badge/pnpm-%3E%3D9-blue)](https://pnpm.io/)
[![Astro](https://img.shields.io/badge/Astro-5.15.3-orange)](https://astro.build/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-blue)](https://www.typescriptlang.org/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg?logo=apache)](https://opensource.org/licenses/Apache-2.0)

## 合并上游更改

上一次同步至上游 `bc20a39`，日期 `20260201`

> 每次同步 diff 时，需在此处记录哈希值以快速定位提交。
> 注意：dev 分支仅同步上游 matsuzaka-yuki/Mizuki:master 分支，不要同步上游 dev 分支

## 开发文档

通过我们的综合文档快速开始。无论是自定义主题、配置功能，还是部署到生产环境，文档涵盖了您成功启动博客所需的所有内容。

开发文档位于 `docs/` 下。

## 开发

1. **克隆仓库：**

   ```bash
   git clone https://github.com/matsuzaka-yuki/mizuki.git
   cd mizuki
   ```

2. **安装依赖：**

   ```bash
   # 如果没有安装 pnpm，先安装
   npm install -g pnpm
   
   # 安装项目依赖
   pnpm install
   ```

3. **配置博客：**
   - 编辑 `src/config.ts` 自定义博客设置
   - 更新站点信息、主题色彩、横幅图片和社交链接
   - 配置特色页面功能
   - (可选) 配置内容仓库分离 - 见 [内容仓库配置](#-代码内容分离可选)

4. **启动开发服务器：**

   ```bash
   pnpm dev
   ```

   页面将在 `http://localhost:4321` 可用

## 基本命令

所有命令都在项目根目录运行：

| 基本命令                 | 操作                                   |
| :----------------------- | :------------------------------------- |
| `pnpm install`           | 安装依赖                               |
| `pnpm dev`               | 在 `localhost:4321` 启动本地开发服务器 |
| `pnpm build`             | 构建生产站点到 `./dist/`               |
| `pnpm preview`           | 在部署前本地预览构建                   |
| `pnpm check`             | 运行 Astro 错误检查                    |
| `pnpm format`            | 使用 Prettier 格式化代码               |
| `pnpm lint`              | 检查并修复代码问题                     |
| `pnpm new-post <文件名>` | 创建新博客文章                         |
| `pnpm astro ...`         | 运行 Astro CLI 命令                  |

## 贡献

我们欢迎贡献！请随时提交问题和拉取请求。

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开拉取请求
