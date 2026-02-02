# Mizuki 部署指南

本文档提供 Mizuki 博客在各个平台的部署配置说明。

## 目录

- [部署前准备](#部署前准备)
- [GitHub Pages 部署](#github-pages-部署)
- [Vercel 部署](#vercel-部署)
- [Netlify 部署](#netlify-部署)
- [Cloudflare Pages 部署](#cloudflare-pages-部署)
- [故障排查](#故障排查)

---

## 部署前准备

### 基础配置

1. **更新站点 URL**

编辑 `astro.config.mjs`:

```javascript
export default defineConfig({
  site: 'https://your-domain.com',  // 更新为你的域名
  // ...
});
```

1. **配置环境变量**

必须配置内容仓库地址：

- `CONTENT_REPO_URL=你的内容仓库地址`
- `USE_SUBMODULE=true` (可选，推荐使用 `true`)

详见 [内容分离完整指南](./CONTENT_SEPARATION.md)

---

## GitHub Pages 部署

### 自动部署 (推荐)

项目已配置好 GitHub Actions 工作流，推送到 `main` 分支会自动部署。

**配置步骤**:

1. **添加仓库 Secrets**:
   - Settings → Secrets and variables → Actions → New repository secret
   - 添加 `CONTENT_REPO_URL`: `https://github.com/your-username/Mizuki-Content.git`

2. **修改 `.github/workflows/deploy.yml`**:

添加环境变量:

```yaml
- name: Build site
  run: pnpm run build
  env:
    CONTENT_REPO_URL: ${{ secrets.CONTENT_REPO_URL }}
    USE_SUBMODULE: true
```

1. **私有内容仓库配置**:

**同账号私有仓库** (推荐):

- 无需额外配置
- 自动使用 `GITHUB_TOKEN` 访问

**跨账号私有仓库 (SSH)**:

```yaml
# 添加 SSH 配置步骤
- name: Setup SSH Key
  uses: webfactory/ssh-agent@v0.8.0
  with:
    ssh-private-key: ${{ secrets.SSH_PRIVATE_KEY }}

- name: Checkout
  uses: actions/checkout@v4
  with:
    submodules: true
```

在 Secrets 中添加:

- `SSH_PRIVATE_KEY`: SSH 私钥内容
- `CONTENT_REPO_URL`: `git@github.com:other-user/repo.git`

**跨账号私有仓库 (Token)**:

```yaml
- name: Checkout
  uses: actions/checkout@v4
  with:
    submodules: true
    token: ${{ secrets.PAT_TOKEN }}

- name: Build site
  run: pnpm run build
  env:
    CONTENT_REPO_URL: https://${{ secrets.PAT_TOKEN }}@github.com/other-user/repo.git
    USE_SUBMODULE: true
```

在 Secrets 中添加:

- `PAT_TOKEN`: GitHub Personal Access Token (需要 `repo` 权限)

### 工作流说明

项目包含三个工作流:

| 工作流       | 触发条件       | 功能                       |
|----------|-----------|-------------------------|
| `build.yml` | Push/PR 到 main | CI 测试，检查构建          |
| `deploy.yml` | Push 到 main | 构建并部署到 pages 分支     |
| `format.yml` | Push/PR | 代码格式和质量检查           |

---

## Vercel 部署

### 快速部署

1. **连接仓库**:
   - 访问 [Vercel](https://vercel.com)
   - Import Git Repository
   - 选择你的 Mizuki 仓库

2. **配置项目**:
   - Framework Preset: Astro
   - Build Command: `pnpm build` (默认)
   - Output Directory: `dist` (默认)

3. **部署**:
   - 点击 Deploy 开始部署

### 环境变量配置

在 Vercel 项目设置中添加环境变量:

| 变量名             | 值                                                         |
|-------------------|------------------------------------------------|
| `CONTENT_REPO_URL` | `https://github.com/your-username/Mizuki-Content.git` |
| `USE_SUBMODULE`    | `false` 或 `true` (推荐 `false`)                |

> **重要提示**: 如果使用 `USE_SUBMODULE=true`,请确保 `.gitignore` 中的 `content/` 行已被注释掉,否则会导致部署失败。推荐在 Vercel 上使用 `USE_SUBMODULE=false` (独立仓库模式)。

#### 私有仓库配置

##### 方式 A: 授权 Vercel 访问

- 在连接 GitHub 仓库时，确保授权包括内容仓库的访问权限

##### 方式 B: 使用 Token

添加环境变量:

```env
GITHUB_TOKEN=ghp_your_personal_access_token
CONTENT_REPO_URL=https://${GITHUB_TOKEN}@github.com/your-username/Mizuki-Content-Private.git
USE_SUBMODULE=true
```

### 配置文件

项目使用 `vercel.json` 作为默认配置。

---

## Netlify 部署

### 部署步骤

1. **连接仓库**:
   - 访问 [Netlify](https://www.netlify.com)
   - New site from Git
   - 选择你的 Mizuki 仓库

2. **配置构建**:
   - Build command: `pnpm build`
   - Publish directory: `dist`

3. **环境变量**:

在 Site settings → Environment variables 中添加:

```env
CONTENT_REPO_URL=https://github.com/your-username/Mizuki-Content.git
USE_SUBMODULE=true
```

1. **私有仓库配置**:

在 Site settings → Build & deploy → Deploy key 中添加有权限访问私有仓库的 SSH 密钥。

### netlify.toml 配置

可选：创建 `netlify.toml` 文件：

```toml
[build]
  command = "pnpm build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"
  PNPM_VERSION = "9"
  CONTENT_REPO_URL = "https://github.com/your-username/Mizuki-Content.git"
  USE_SUBMODULE = "true"
```

---

## Cloudflare Pages 部署

### 部署步骤

1. **连接仓库**:
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Workers & Pages → Create application → Pages
   - Connect to Git

2. **配置构建**:
   - Framework preset: Astro
   - Build command: `pnpm build`
   - Build output directory: `dist`

3. **环境变量**:

添加以下变量:

```env
CONTENT_REPO_URL=https://github.com/your-username/Mizuki-Content.git
USE_SUBMODULE=false  # Cloudflare Pages 默认不支持 submodule
```

### 注意事项

Cloudflare Pages 默认不支持 Git Submodule，建议:

- 使用独立仓库模式: `USE_SUBMODULE=false`
- 或在构建命令中手动初始化: `git submodule update --init && pnpm build`

---

## 自动同步机制

所有部署平台都使用相同的自动同步机制：

```json
// package.json
{
  "scripts": {
    "prebuild": "node scripts/sync-content.js || true"
  }
}
```

**工作原理**:

1. `pnpm build` 执行前自动运行 `prebuild` 钩子
2. 从远程仓库同步内容到 `src/content/` 和 `public/images/`
3. `|| true` 确保同步失败不会中断构建

**优势**:

- 统一的构建命令，无需修改配置
- 同步失败不影响构建

---

## 故障排查

### 问题 1: 部署失败 - "未设置 CONTENT_REPO_URL"

**原因**: 未配置内容仓库地址

**解决**:
检查环境变量中是否设置了 `CONTENT_REPO_URL`

### 问题 2: 私有仓库认证失败

**GitHub Actions**:

- **同账号**: 确保使用 `${{ secrets.GITHUB_TOKEN }}`
- **跨账号**: 配置 SSH 密钥或 PAT Token

**Vercel/Netlify**:

- 确保授权了私有仓库访问
- 或使用 Token 方式: `https://TOKEN@github.com/user/repo.git`

### 问题 3: Submodule 与 .gitignore 冲突

**错误信息**:

```
The following paths are ignored by one of your .gitignore files:
content
fatal: Failed to add submodule 'content'
```

**原因**: `.gitignore` 文件中的 `content/` 规则阻止了 Git 添加 submodule

**解决方案 A: 修改 .gitignore (推荐)**

编辑 `.gitignore` 文件,注释掉或删除 `content/` 行:

```diff
# content repository (if using independent mode)
- content/
+ # content/  # 使用 submodule 时需要注释掉
*.backup
```

然后重新部署。

**解决方案 B: 使用独立仓库模式**

如果不想修改 `.gitignore`,可以使用独立仓库模式:

```env
CONTENT_REPO_URL=https://github.com/your-username/Mizuki-Content.git
USE_SUBMODULE=false  # 改为 false
```

**解决方案 C: 自动降级 (v1.1+)**

`sync-content.js` 会自动检测此冲突并降级到独立仓库模式,无需手动干预。

### 问题 4: Submodule 克隆失败

**检查**:

1. 确认部署平台支持 Git Submodule
2. 检查 SSH 密钥或 Token 配置
3. 尝试使用独立仓库模式: `USE_SUBMODULE=false`

### 问题 5: 构建成功但内容未更新

**检查**:

1. 查看构建日志，确认同步步骤执行
2. 验证 `CONTENT_REPO_URL` 是否正确
3. 清除部署平台的缓存并重新部署

### 问题 6: 部署时间过长

**优化建议**:

- 使用 Git Submodule 模式 (更快)
- 启用部署平台的缓存机制
- 优化图片大小和数量

### 问题 7: Vercel 部署时 submodule 权限问题

**错误信息**:

```
fatal: could not read Username for 'https://github.com'
```

**原因**: 私有仓库需要认证

**解决**:

1. 在 Vercel 项目设置中添加 GitHub 集成权限
2. 或使用 Token: `https://${GITHUB_TOKEN}@github.com/user/repo.git`
3. 或切换到独立仓库模式: `USE_SUBMODULE=false`

**检查**:

1. 查看构建日志,确认同步步骤执行
2. 验证 `CONTENT_REPO_URL` 是否正确
3. 清除部署平台的缓存并重新部署

---

## 环境变量参考

| 变量名               | 必需 | 默认值      | 说明                       |
|-------------------|------|-----------|--------------------------|
| `CONTENT_REPO_URL` |      | -         | 内容仓库地址               |
| `USE_SUBMODULE`    |      | `false`   | 是否使用 Git Submodule 模式 |
| `CONTENT_DIR`      |      | `./content` | 内容目录路径               |
| `UMAMI_API_KEY`    |      | -         | Umami 统计 API 密钥        |
| `BCRYPT_SALT_ROUNDS`|     | `12`      | bcrypt 加密轮数            |

  = 必需配置

---

## 推荐配置

### 个人博客

- **平台**: Vercel 或 GitHub Pages
- **配置**: `CONTENT_REPO_URL` + `USE_SUBMODULE=true`

### 团队协作

- **平台**: 任意
- **配置**: `CONTENT_REPO_URL` + SSH 认证

### 多站点部署

- **平台**: 多个平台同时部署
- **配置**: 统一的环境变量配置

---

## 相关文档

- [内容分离完整指南](./CONTENT_SEPARATION.md) - 详细的内容分离配置
- [内容迁移指南](./MIGRATION_GUIDE.md) - 从单仓库迁移到分离模式
- [内容仓库结构](./CONTENT_REPOSITORY.md) - 内容仓库的组织方式

---

### 部署建议

部署前请确保已创建内容仓库并配置 `CONTENT_REPO_URL` 环境变量。详见 [内容分离完整指南](./CONTENT_SEPARATION.md)。

## 🔔 内容仓库更新触发构建

### 问题说明

当使用**内容代码分离**架构时，默认情况下：

- 代码仓库 (Mizuki) 更新会触发自动构建
- 内容仓库 (Mizuki-Content) 更新**不会**触发构建

这意味着您在内容仓库中发布新文章后，需要手动触发代码仓库的重新部署才能看到更新。

### 解决方案概览

有以下几种方式实现内容仓库更新时自动触发构建：

| 方案                      | 难度 | 推荐度 | 适用平台                       |
|-------------------------|------|--------|-------------------------------|
| **Repository Dispatch** | 简单 | ⭐⭐⭐⭐⭐ | GitHub Pages, Vercel, Netlify, CF Pages |
| **Webhook + Deploy Hook** | 中等 | ⭐⭐⭐⭐ | Vercel, Netlify, CF Pages     |
| **定时构建**              | 简单 | ⭐⭐⭐  | 所有平台                      |

---

### 方案 1: Repository Dispatch (推荐)

**原理**: 内容仓库推送时，通过 GitHub Actions 触发代码仓库的构建工作流。

**优点**:

- 实时触发，无延迟
- 无需云平台特定配置
- 适用于所有部署平台
- 完全免费

#### 配置步骤

**Step 1: 创建 GitHub Personal Access Token (PAT)**

1. 访问 [GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)](https://github.com/settings/tokens)
2. 点击 **Generate new token (classic)**
3. 配置 Token:
   - Note: `Mizuki Content Trigger` (名称随意)
   - Expiration: `No expiration` 或选择合适的期限
   - Scopes: 勾选 `repo` (完整仓库访问权限)
4. 点击 **Generate token**，复制生成的 Token (只显示一次！)

**Step 2: 在内容仓库添加 Secret**

1. 打开内容仓库 (Mizuki-Content): `https://github.com/your-username/Mizuki-Content`
2. Settings → Secrets and variables → Actions → New repository secret
3. 添加:
   - Name: `DISPATCH_TOKEN`
   - Value: 粘贴刚才创建的 PAT Token
4. 点击 **Add secret**

**Step 3: 在内容仓库创建 GitHub Actions 工作流**

在内容仓库创建文件 `.github/workflows/trigger-build.yml`:

```yaml
name: Trigger Main Repo Build

on:
  push:
    branches:
      - main  # 或你使用的主分支名称
    paths:
      - 'posts/**'
      - 'spec/**'
      - 'data/**'
      - 'images/**'

jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger repository dispatch
        uses: peter-evans/repository-dispatch@v2
        with:
          token: ${{ secrets.DISPATCH_TOKEN }}
          repository: your-username/Mizuki  # 改为你的代码仓库
          event-type: content-updated
          client-payload: |
            {
              "ref": "${{ github.ref }}",
              "sha": "${{ github.sha }}",
              "message": "${{ github.event.head_commit.message }}"
            }
```

**注意事项**:

- 将 `your-username/Mizuki` 替换为你的代码仓库完整名称
- 可以根据需要调整 `paths`，只在特定文件变化时触发

**Step 4: 在代码仓库更新 GitHub Actions 工作流**

编辑代码仓库的 `.github/workflows/deploy.yml`，添加 `repository_dispatch` 触发器:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main
  repository_dispatch:  # 添加这个触发器
    types:
      - content-updated

# ...其余配置保持不变
```

**Step 5: 测试**

1. 在内容仓库编辑一篇文章
2. 提交并推送到 `main` 分支
3. 查看内容仓库的 Actions 页面，确认 "Trigger Main Repo Build" 工作流运行
4. 查看代码仓库的 Actions 页面，确认部署工作流被触发

---

### 方案 2: Webhook + Deploy Hook

**原理**: 使用云平台提供的 Deploy Hook URL，在内容仓库更新时通过 webhook 触发构建。

**优点**:

- 实时触发
- 与部署平台深度集成

**缺点**:

- 需要为每个部署平台单独配置
- 不适用于 GitHub Pages

#### Vercel 配置

**Step 1: 获取 Deploy Hook URL**

1. 打开 Vercel 项目设置
2. Settings → Git → Deploy Hooks
3. 创建新的 Hook:
   - Name: `Content Update`
   - Git Branch: `main` (或你的主分支)
4. 点击 **Create Hook**，复制生成的 URL

**Step 2: 在内容仓库配置 Webhook**

在内容仓库创建 `.github/workflows/trigger-vercel.yml`:

```yaml
name: Trigger Vercel Deployment

on:
  push:
    branches:
      - main
    paths:
      - 'posts/**'
      - 'spec/**'
      - 'data/**'
      - 'images/**'

jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Vercel Deploy Hook
        run: |
          curl -X POST "${{ secrets.VERCEL_DEPLOY_HOOK }}"
```

**Step 3: 添加 Secret**

在内容仓库添加 Secret:

- Name: `VERCEL_DEPLOY_HOOK`
- Value: 粘贴 Vercel Deploy Hook URL

#### Netlify 配置

**Step 1: 获取 Build Hook URL**

1. 打开 Netlify 站点设置
2. Site settings → Build & deploy → Continuous deployment → Build hooks
3. 点击 **Add build hook**:
   - Build hook name: `Content Update`
   - Branch to build: `main`
4. 保存并复制生成的 URL

**Step 2: 配置 GitHub Actions**

在内容仓库创建 `.github/workflows/trigger-netlify.yml`:

```yaml
name: Trigger Netlify Deployment

on:
  push:
    branches:
      - main
    paths:
      - 'posts/**'
      - 'spec/**'
      - 'data/**'
      - 'images/**'

jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Netlify Build Hook
        run: |
          curl -X POST -d '{}' "${{ secrets.NETLIFY_BUILD_HOOK }}"
```

**Step 3: 添加 Secret**

- Name: `NETLIFY_BUILD_HOOK`
- Value: 粘贴 Netlify Build Hook URL

#### Cloudflare Pages 配置

**Step 1: 获取 Deploy Hook URL**

1. 打开 Cloudflare Pages 项目
2. Settings → Builds & deployments → Deploy hooks
3. 创建 Deploy Hook:
   - Hook name: `Content Update`
   - Branch: `main`
4. 保存并复制 URL

**Step 2: 配置类似于 Vercel/Netlify**

配置方式与上述相同，只需修改 Secret 名称和 workflow 文件名。

---

### 方案 3: 定时构建 (fallback)

**原理**: 设置定时任务，每天自动构建一次。

**优点**:

- 配置简单
- 无需额外 Token 或 Webhook

**缺点**:

- 有延迟，不是实时更新
- 可能造成不必要的构建

#### GitHub Actions 配置

在代码仓库的 `.github/workflows/deploy.yml` 中添加定时触发:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main
  schedule:
    - cron: '0 2 * * *'  # 每天凌晨 2 点 (UTC 时间)
  workflow_dispatch:  # 支持手动触发

# ...其余配置
```

**Cron 表达式示例**:

- `0 2 * * *` - 每天凌晨 2 点
- `0 */6 * * *` - 每 6 小时一次
- `0 0 * * 1` - 每周一凌晨

#### Vercel/Netlify 配置

这些平台也支持通过 webhook 设置定时构建:

```yaml
# 在内容仓库创建 .github/workflows/scheduled-build.yml
name: Scheduled Build

on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:

jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Deploy
        run: |
          curl -X POST "${{ secrets.DEPLOY_HOOK_URL }}"
```

---

### 推荐配置组合

#### 最佳实践 (推荐)

结合多种方式，确保稳定性:

```yaml
# 代码仓库 .github/workflows/deploy.yml
on:
  push:
    branches:
      - main
  repository_dispatch:    # 内容更新触发
    types:
      - content-updated
  schedule:              # 兜底方案
    - cron: '0 2 * * *'
  workflow_dispatch:     # 手动触发
```

**优势**:

- 内容更新实时触发 (repository_dispatch)
- 每天自动同步，防止遗漏 (schedule)
- 支持手动触发调试 (workflow_dispatch)

---

### 验证配置

#### 检查清单

- [ ] 创建了 PAT Token 或 Deploy Hook
- [ ] 在内容仓库添加了对应的 Secret
- [ ] 创建了内容仓库的触发工作流
- [ ] 更新了代码仓库的部署工作流
- [ ] 测试了一次提交，确认触发成功

#### 测试步骤

1. **在内容仓库修改文章**:

   ```bash
   cd /path/to/Mizuki-Content
   # 编辑文章
   git add .
   git commit -m "test: trigger build"
   git push
   ```

2. **查看内容仓库 Actions**:
   - 访问 `https://github.com/your-username/Mizuki-Content/actions`
   - 确认 "Trigger Build" 工作流运行成功

3. **查看代码仓库 Actions**:
   - 访问 `https://github.com/your-username/Mizuki/actions`
   - 确认部署工作流被触发
   - 查看日志确认内容同步成功

4. **查看部署平台**:
   - Vercel/Netlify/CF Pages: 查看部署历史
   - GitHub Pages: 访问站点确认更新

---

### 故障排查

#### 问题 1: 内容仓库推送后没有触发构建

**检查**:

1. 内容仓库的 Actions 是否运行?
   - 查看 Actions 页面，确认工作流被触发
2. PAT Token 权限是否正确?
   - 需要 `repo` 完整权限
3. 代码仓库名称是否正确?
   - 格式: `owner/repo`

**调试**:

```yaml
# 在内容仓库工作流中添加调试步骤
- name: Debug
  run: |
    echo "Repository: your-username/Mizuki"
    echo "Event type: content-updated"
```

#### 问题 2: Repository dispatch 触发成功但构建失败

**检查**:

1. 代码仓库的 Actions 是否启用?
   - Settings → Actions → General → 确保启用
2. 工作流文件是否包含 `repository_dispatch` 触发器?
3. 环境变量是否正确配置?

#### 问题 3: PAT Token 过期

**现象**: 工作流运行失败，提示认证错误

**解决**:

1. 重新生成 PAT Token
2. 更新内容仓库的 Secret
3. 测试触发

#### 问题 4: Deploy Hook 无效

**检查**:

1. Hook URL 是否正确复制?
2. Secret 是否正确添加?
3. 使用 curl 测试 Hook:

   ```bash
   curl -X POST "https://api.vercel.com/v1/integrations/deploy/..."
   ```

---
