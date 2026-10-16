# Hexo Pro 2.1.0 Beta 2

发布日期：2026-10-16。本次为测试版本，升级前请备份博客源文件。

## 更新内容

- 统一浅色与深色界面的颜色、导航、登录页、工作台、文章列表和移动端样式，改进搜索摘要显示。
- 改进块编辑器与 Markdown 模式切换时的内容快照，保留编辑状态；优化编辑器和文章属性面板。
- 桌面端内置 Node.js、npm、Git 和默认博客模板，新建博客、预览及部署使用随应用分发的运行环境。
- 桌面端新增更新检查、下载状态和重启安装入口；测试版接收后续 beta 和正式版，未保存内容会阻止重启安装。
- 完善 GitHub 源文件恢复、批量冲突处理以及切换同步模式时的变更审阅保留。
- 改进主题配置表单、主题安装与配置读取，并补充相关回归验证。

## 下载与安装

安装包、插件压缩包、更新描述文件、校验文件及实际验证范围，以 [GitHub 预发布页面](https://github.com/heywarms/hexo-pro/releases/tag/v2.1.0-beta.2) 为准。

插件压缩包可在 Hexo 博客目录安装：

```sh
npm install --save ./hexo-pro-2.1.0-beta.2.tgz
```

插件需要 Node.js 20.19.0 或更新版本。手机安装、GitHub 连接与备份方法见 [手机 App 指南](MOBILE_APP.md)。Android 使用测试签名；iPhone Ad Hoc 包仅支持签名描述文件中已登记的设备，iOS 模拟器包不能安装到 iPhone。

旧版桌面客户端如未包含更新功能，需手动安装本版本；自动更新的签名条件与使用方式见 [桌面端自动更新说明](../hexo-pro-desktop/docs/AUTO_UPDATE.md)。

问题反馈：[GitHub Issues](https://github.com/heywarms/hexo-pro/issues)。
