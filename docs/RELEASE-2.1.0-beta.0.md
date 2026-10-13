# Hexo Pro 2.1.0 Beta

发布日期：2026-10-13。此版本用于测试，请在升级前备份博客源文件。

## 更新内容

- 新的块编辑器及 Markdown 源码模式，支持自动保存、失败稿件恢复和版本冲突比较。
- 使用当前 Hexo 主题预览文章，完善草稿、页面和文章筛选。
- 文章使用永久标识，改名、发布、撤回和回收站恢复后保持稳定定位；MCP 支持按文档标识操作。
- 独立的 GitHub 云同步页面，支持双向同步、变更预览、冲突选择和覆盖前备份。
- 新增 Android / iOS 手机工程，支持离线写作、GitHub 源文件同步和本地备份。
- 完善登录、桌面 IPC 隔离和系统凭据存储，升级桌面 Electron 运行环境。
- npm 包包含可独立运行的 Agent / MCP 命令和完整前端资源。

## 安装

在 Hexo 博客目录中安装测试版插件：

```sh
npm install --save hexo-pro@beta
```

固定安装本次版本：

```sh
npm install --save hexo-pro@2.1.0-beta.0
```

恢复当前正式版：

```sh
npm install --save hexo-pro@2.0.0
```

插件需要 Node.js 20.19.0 或更新版本；桌面源码构建需要 Node.js 22.12.0 或更新版本。

## 桌面与手机

桌面测试包由 [GitHub 预发布页面](https://github.com/heywarms/hexo-pro/releases/tag/v2.1.0-beta.0) 提供。此次提供 Apple Silicon Mac（arm64）的 DMG 与 ZIP。安装包未经过 Apple 公证。

Windows、Linux 和 Intel Mac 本次提供源码，未提供新构建的安装包。手机工程见 [移动端说明](MOBILE_APP.md)；Android 可自行构建测试 APK，iOS 真机安装需要 Xcode 签名。本次不包含应用商店分发。

手机支持正文预览，完整 Hexo 主题预览仍在电脑端运行。

## 建议测试

- 块编辑器与 Markdown 模式之间切换，自动保存、刷新恢复及冲突处理。
- 文章创建、改名、发布、撤回、删除和恢复后，链接与内容是否正确。
- GitHub 同步的预览、上传、下载、冲突选择及备份恢复。
- 桌面首次启动、登录、选择博客和主题预览。
- 使用 npm 安装后的 Agent / MCP 命令。

问题反馈：[GitHub Issues](https://github.com/heywarms/hexo-pro/issues)。
