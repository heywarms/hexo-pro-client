# Hexo Pro 手机 App

这是 React + Capacitor 的 Android / iOS 安装型 App。前端和编辑器随安装包一起分发，文章保存在手机上，直接通过 GitHub API 同步 Markdown 源文件。手机写作不需要运行 Hexo Pro 后端，也不需要电脑保持开机。

## 当前可用

- 文章和页面列表、搜索、新建、编辑标题和文件路径；文章可按“全部 / 已发布 / 草稿”分类查看，每类显示数量，并可叠加“只看待同步”筛选。
- 与桌面端共用 BlockNote 块编辑器；支持插入菜单、加粗、斜体、图片，以及 Markdown 源码编辑。
- 本地自动保存、正文预览、回收站恢复、单篇 Markdown 导出、文章和图片备份导入 / 导出。
- 多个独立写作空间；连接仓库或切换仓库不会丢弃仅本机草稿。
- 手机直接拉取 / 提交 GitHub；文章、图片、改名和 ID 索引在同一个 Git 提交中更新。
- 同步前对比手机原稿、上次同步版本和仓库版本。出现冲突时保留本机稿件，等待选择版本或改名。
- iOS Keychain 和 Android Keystore 存储凭据；文章和备份不包含令牌。
- 浅色 / 深色模式，屏幕安全区域，Android 返回键，系统分享导出。

手机目前显示**正文预览**。完整 Hexo 主题预览、手机本地运行 Hexo、自动创建发布工作流、应用商店分发尚未包含在这一版。仓库已有的 GitHub Actions 发布流程可以由手机同步产生的提交触发。

## 安装与构建

项目根目录执行 `yarn install`。原生工程已经生成，不需要再次运行 `cap add`。

### Android

需要 Node.js 22+、JDK 21、Android SDK 36 和 Build Tools 36。构建脚本会优先使用 `JAVA_HOME`、`ANDROID_HOME` / `ANDROID_SDK_ROOT`；macOS 上也能使用 Android Studio 的内置 JDK 和默认 SDK 目录。

```bash
yarn mobile:build:android
```

产物为 `mobile/artifacts/HexoPro-android-debug.apk`，可用于个人安装测试。也可运行 `yarn mobile:android` 在 Android Studio 中调试或制作自行签名的发行包。

最低 Android 7；编辑器要求 Android System WebView 109 或更新版本。实际适配目前通过浏览器模拟小屏和原生构建检查，仍需在真实 Android 手机验证中文输入、软键盘及图片选择。

### iPhone

需要 macOS、Xcode 和 iOS SDK；工程最低系统版本为 iOS 16.4。

```bash
yarn mobile:sync
yarn mobile:ios
```

Xcode 中打开 `mobile/ios/App/App.xcodeproj`，在 App target 的 Signing & Capabilities 中选择自己的开发团队。如 Bundle Identifier 被其他账户占用，改为自己的标识。连接并解锁 iPhone，信任电脑，在手机“设置 → 隐私与安全性 → 开发者模式”中开启开发者模式，按提示重启并确认启用。选择该设备后运行。真机签名和分发需要用户自己的 Apple 账户及相应证书；项目未预填开发团队，个人签名配置不应提交。

```bash
yarn mobile:build:ios
```

此命令生成 `mobile/artifacts/HexoPro-ios-simulator.app`，用于模拟器验证，不能当作 iPhone 安装包。已验证 iPhone 模拟器启动和新稿本地保存；也已在 iPhone 17 Pro（iOS 26.0）完成真机签名、安装和启动，确认写作首页正常显示。中文输入、软键盘及图片选择仍需在真实手机继续验证。

构建脚本会将现有 Hexo Pro 标识生成对应尺寸的图标和启动画面。单独更新资源可执行 `yarn mobile:assets`。

## 连接现有博客

1. 在电脑上先提交并推送博客的 Markdown 源文件，以及 `.hexo-pro/document-identities.json`。如果 Hexo 配置了其他 `source_dir`，手机端也需填写相同目录。
2. App 的“设置 → 连接 GitHub”填写用户名 / 组织、源文件仓库名、同步分支。博客在仓库子目录时填写“博客在仓库中的目录”。不要填写只存放生成后 HTML 的仓库。
3. 创建仅授权这个仓库、拥有 Contents 读写权限的 GitHub 细粒度令牌，在 App 中填写并保存连接。可先点“测试连接”，检查凭据能否读取所填仓库和分支；检测不会保存新凭据、切换空间或提交文章，也不代表已经验证了写入权限。
4. 返回文章列表，点击右上角同步。仓库文章下载后可离线编辑；之后联网手动同步。
5. 仅本机创建的草稿，可从仓库空间的列表菜单选择“导入本机草稿”。这会复制文章和相关离线图片，并保留本机原稿。

手机发现已有文章但没有 ID 索引时会暂停，提示先从电脑同步索引。只有此前没有使用电脑端时才选择“在手机端初始化”，避免手机和电脑为同一篇文章各自分配 ID。

ID 与桌面端使用同一份外部索引：版本 1、UUID、文章种类、相对源文件路径、原稿 SHA-256。读取、正文编辑和同步不会向 Front Matter 添加标识字段或重排它；主动改标题只修改标题字段。文件源码中主动修改元信息会按原稿保存。文件改名会保留 UUID；文章旁的图片目录随文章一起移动。

## 连接故障排查

- 顶部“网络已连接”只表示设备有网络连接，不代表 GitHub 接口可达。可用手机 Safari 打开 `https://api.github.com` 辅助排查，并检查系统设置中 App 的 WLAN / 蜂窝数据权限。
- 访问凭据应粘贴 GitHub 生成的完整令牌。含有中文、换行等无效字符时会在发请求前提示凭据格式错误，不再显示为网络故障。
- “凭据无效或已过期”需要更新令牌；“没有仓库权限”需核对仓库授权、Contents 权限和请求额度；“没有找到仓库、分支或文件”需核对名称和访问权限。
- 读取时遇到连接中断会在原有 30 秒时限内重试一次；提交请求不会自动重放。连接中断、超时或返回内容异常均保留本机修改。

## 保存、同步和备份

- “本地已保存”表示稿件已写入当前设备，不代表已上传 GitHub。“待同步”表示还有未上传内容。
- 网络中断、无权限、分支保护和远程并发提交失败都不会丢弃本机稿件。分支更新使用 `force: false`，不强制覆盖其他设备提交。
- 同步过程中继续输入的内容会保留为下次待同步版本。
- 回收站中的已同步文章，会在下次同步时从仓库删除。本机原稿继续保留，可恢复后重新上传。
- App 数据位于应用的私有存储。卸载前应同步或在设置中导出全部备份。备份包括所有空间的文章与已缓存图片，不含 GitHub 凭据；新手机导入后重新填写凭据。
- 导入备份会合并空间。发现同一篇文章有不同内容时保留副本；图片内容不一致时停止导入，保留原文件。
- 已加载的仓库图片会本地缓存；尚未加载的远程图片或外链图片需要网络。插入 / 缓存图片上限 10 MB，文章读取上限 4 MB，备份导入上限 100 MB。
- 本地数据文件意外损坏时会显示错误并保留原文件与上一份副本，不会自动重置为空白空间。启动错误页可选择“恢复本地备份”“导入备份文件”或“导出原文件与备份”。恢复先校验内容并另存当前原文件，保留原来的备份；导入完整备份还会恢复图片。原生上一份副本位于应用数据目录中的 `hexopro-mobile/workspace.bak.json`。
- 仓库树过大而被 GitHub 截断、索引损坏或已存在的索引丢失时，同步会停止，避免不完整数据造成覆盖。

## 开发与验证

```bash
yarn dev:mobile       # http://127.0.0.1:8797，开发预览
yarn build:mobile     # 生成独立前端到 mobile/dist
yarn mobile:sync      # 构建并同步到两端原生工程
yarn test:mobile
yarn tsc --noEmit
node --test test/*.test.js
```

浏览器预览使用 IndexedDB 保存文章和图片，但凭据只放在页面内存，刷新后需要重填。正式 App 使用原生文件存储和系统安全凭据存储。没有 PWA service worker，也没有远程 `server.url`。

同步自动化测试使用模拟 GitHub 响应，覆盖索引初始化、Front Matter 原样保留、两端冲突、并发提交拒绝、图片与文章原子更新、离线恢复、备份合并、回收站恢复和同步时继续输入。真实私有仓库的凭据及权限需要安装后验证。

连接回归测试还覆盖默认网络请求的调用上下文。iOS WebKit 要求 `fetch` 的接收对象是 `Window`，仓库类保存默认请求函数时必须绑定 `globalThis`；直接将裸 `fetch` 作为实例方法调用，会在发出请求前抛出 `TypeError`。真机验证应经过 `GitHubRepository.checkConnection()` / `readSnapshot()`，仅在控制台直接调用 `fetch()` 无法覆盖这类错误。

iOS 原生凭据回归测试位于 `mobile/ios/App/AppTests/CredentialsBridgeTests.swift`，使用 iOS 17 或更新版本的模拟器。测试从 App 实际启动的场景和 JavaScript 插件代理调用钥匙串，验证首次读取、保存、更新、页面重新加载后的读取，以及重复删除；使用独立测试账户并清理测试数据。

```bash
# 将模拟器名称替换为本机已安装的设备，也可在 Xcode 中选择模拟器后执行 Test。
xcodebuild -project mobile/ios/App/App.xcodeproj -scheme App \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro' test
```

此项测试需要模拟器默认的本地签名，不能添加 `CODE_SIGNING_ALLOWED=NO`。场景启动和旧式 storyboard 启动都使用 `HexoProViewController` 注册 `SecureCredentials` 插件，避免只验证网页预览或首页启动而遗漏原生凭据功能。

原生工程、资源和依赖锁文件可提交；`mobile/dist`、原生复制的前端、个人签名设置及 `mobile/artifacts` 构建产物不应提交。
