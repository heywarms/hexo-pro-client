# Hexo Pro 2.1.0 Beta 3

发布日期：2026-11-07。本次为测试版本，升级前请备份博客源文件。

## 更新内容

- 修复 Volantis 安装失败和 Stellar 切换失败：两个主题分别固定到验证过的 v6.8.3 和 1.44.0，并在安装时补齐所需依赖。所有主题改为浅克隆，安装明显加快。
- 修复装了插件后 `hexo clean` 不生效的问题：`db.json` 不再被写回，换主题后不会再把旧主题的资源生成进 `public`，也不会再报旧资源渲染失败。后台部署内置的清理步骤同样恢复正常。
- 修复在后台切换主题后，不执行清理就运行 `hexo generate` 时混入旧主题资源的问题：切换完成后会立即保存数据库。
- 修复 Volantis 等会调用 `hexo -v` 的主题在装了插件后不断派生新进程的问题：只有 `hexo server` 会提前加载站点数据。
- 修复部分主题（如 anzhiyu）在主题预览中一片空白的问题。
- 修复表格单元格内的换行：块编辑器可以打开并保留这类表格，旧版块编辑器保存的表格也能恢复；手机预览同样显示换行。
- 改进找回密码：输入用户名后显示之前设置的安全问题，获取失败时可以重试。

## 下载与安装

安装包、插件压缩包、更新描述文件、校验文件及实际验证范围，以 [GitHub 预发布页面](https://github.com/heywarms/hexo-pro/releases/tag/v2.1.0-beta.3) 为准。

插件压缩包可在 Hexo 博客目录安装：

```sh
npm install --save ./hexo-pro-2.1.0-beta.3.tgz
```

插件需要 Node.js 20.19.0 或更新版本。手机安装、GitHub 连接与备份方法见 [手机 App 指南](MOBILE_APP.md)。Android 使用测试签名；iPhone Ad Hoc 包仅支持签名描述文件中已登记的设备，iOS 模拟器包不能安装到 iPhone。

已安装 Beta 2 的桌面端会收到本版本的自动更新；更早的版本需手动安装。自动更新的签名条件与使用方式见 [桌面端自动更新说明](../hexo-pro-desktop/docs/AUTO_UPDATE.md)。

已经装过 Stellar 2 的博客，主题目录不会自动更换版本：如需换到 1.44.0，请先备份并删除 `themes/stellar` 和 `_config.stellar.yml`，再重新安装。

问题反馈：[GitHub Issues](https://github.com/heywarms/hexo-pro/issues)。
