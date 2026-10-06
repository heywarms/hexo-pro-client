# Hexo Pro Client

这是 Hexo Pro 项目的主仓库，整合了前端、后端和桌面客户端。

## 📁 项目结构

```
hexo-pro-client/           # 主项目（React前端）
├── hexo-pro/             # 子模块：Hexo插件后端
├── hexo-pro-desktop/     # 子模块：桌面端应用
├── client/               # React前端源码
├── config/               # Webpack配置
├── scripts/              # 构建脚本
└── BUILD_GUIDE.md        # 详细构建指南
```

## 🚀 快速开始

### 1. 克隆项目（包含子模块）

```bash
git clone --recursive https://github.com/wuzheng228/hexo-pro-client.git
cd hexo-pro-client
```

### 2. 安装依赖

```bash
# 安装主项目依赖
yarn install

# 设置桌面端
yarn setup:desktop
```

### 3. 构建项目

```bash
# 构建前端
yarn build

# 一键构建桌面端（包含前端构建）
yarn build:desktop
```

## 📦 可用脚本

### 主项目脚本

- `yarn dev` - 启动前端开发服务器
- `yarn build` - 构建前端生产版本
- `yarn build:desktop` - 一键构建桌面端应用
- `yarn dev:desktop` - 开发模式运行桌面端
- `yarn setup:desktop` - 初始化桌面端环境

### 桌面端脚本（在 hexo-pro-desktop 目录下）

- `yarn dev` - 运行桌面端
- `yarn copy-core` - 复制核心文件
- `yarn build:electron` - 打包桌面应用

## 🔄 开发工作流

### 前端开发

```bash
# 启动开发服务器
yarn dev

# 代码修改后构建
yarn build
```

### 桌面端开发

```bash
# 确保前端资源已构建
yarn build

# 启动桌面端开发
yarn dev:desktop
```

### 生产构建

```bash
# 一键构建所有
yarn build:desktop
```

构建产物位置：
- 前端资源：`hexo-pro/www/`
- 桌面端应用：`hexo-pro-desktop/dist/`

## 🔧 构建依赖关系

**重要**：必须按照以下顺序构建：

1. **前端构建** (`yarn build`) → 生成 `hexo-pro/www/`
2. **桌面端构建** → 复制前端资源并打包应用

桌面端的 `copy-core` 脚本会自动：
- 智能检测 hexo-pro 目录位置
- 复制后端核心文件
- 复制前端资源
- 如果前端资源不存在，自动触发前端构建

## 博客主题动态切换

在「主题」页面安装并切换 Hexo 主题后，插件端和桌面端都会重新加载主题的模板、脚本、配置和文章渲染结果，无需重启服务。已打开的博客页面刷新后即可查看新主题，服务端口保持不变。

切换前会先生成新主题的页面；生成失败时恢复原配置并保留旧主题。已有的 `_config.<主题名>.yml` 会保留，文件监听也会切换到新主题。

升级这部分后端代码后，需要先重启一次现有服务；桌面端还需在 `hexo-pro-desktop` 目录运行 `yarn copy-core` 同步核心代码。主题切换回归测试可通过 `yarn test:theme` 运行（需先安装 `hexo-pro` 的依赖）。

## 📚 更多信息

- 📖 [详细构建指南](BUILD_GUIDE.md)
- 🎯 [桌面端认证指南](hexo-pro-desktop/DESKTOP_AUTH_GUIDE.md)
- 🚀 [部署指南](hexo-pro-desktop/DEPLOYMENT_GUIDE.md)
- 🔧 [Electron-Store 修复说明](ELECTRON_STORE_FIX.md)

## 🎯 项目特色

### 智能路径检测
桌面端复制脚本支持多种项目结构：
- 子模块模式（推荐）
- 独立项目模式
- 自动检测并选择正确路径

### 一键构建
通过 `yarn build:desktop` 可以：
- 自动构建前端资源
- 复制核心文件到桌面端
- 打包生成可分发的桌面应用

### 统一管理
所有相关项目在一个仓库中管理：
- 简化版本控制
- 统一构建流程
- 便于协同开发

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## �� 许可证

MIT License
