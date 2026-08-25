<p align="center">
  <img src="src-tauri/icons/icon.png" width="88" height="88" alt="Klip icon">
</p>

<h1 align="center">Klip</h1>

<p align="center">
  <strong>Windows-first local clipboard manager</strong>
</p>

<p align="center">
  把最近复制过的文本、图片和文件路径留在本机，随时搜索、找回、粘贴。
</p>

<p align="center">
  <a href="https://github.com/AllureCurtain/klip/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/AllureCurtain/klip/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <a href="https://github.com/AllureCurtain/klip/releases"><img alt="Version" src="https://img.shields.io/badge/version-0.2.0-2563eb"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20first-0f766e">
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2.x-24c8db">
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-backend-b7410e">
</p>

<p align="center">
  <a href="#安装">安装</a>
  · <a href="#核心工作流">核心工作流</a>
  · <a href="#功能范围">功能范围</a>
  · <a href="#本地开发">本地开发</a>
  · <a href="#文档地图">文档地图</a>
</p>

## 一分钟了解

Klip 是一个本地单机剪贴板管理器。系统剪贴板通常只能记住最近一次复制，Klip 负责把最近的复制历史保存下来，让你在写作、开发、整理资料或重复录入时不用来回找原始来源。

当前版本先把 Windows 上的核心小闭环做好：复制、记录、搜索、恢复粘贴、托盘常驻、快捷键、隐私控制和本地数据管理。它不需要账号，不上传云端，数据默认保存在本机 SQLite 数据库中。

| 项目 | 当前状态 |
|------|----------|
| 公开版本 | `v0.1.2` |
| 当前发布候选 | `v0.2.0` |
| 主要平台 | Windows 10+ |
| 产品形态 | 本地单机桌面应用 |
| 默认历史数量 | 100 条，可在设置中调整 |
| 数据存储 | 本机 SQLite 数据库 |
| 登录账号 | 不需要 |
| 云端上传 | 不包含 |
| macOS / Linux | 有部分代码基础，但不是当前 MVP 交付承诺 |

## 适合谁

| 你经常做的事 | Klip 能帮上的地方 |
|--------------|------------------|
| 写文档、整理资料 | 找回前几次复制过的段落、链接和图片 |
| 写代码、查日志 | 复用命令、路径、错误信息和短代码片段 |
| 做运营或录入 | 用快捷键快速粘贴列表前几条内容 |
| 本地优先使用软件 | 不登录账号，数据留在当前电脑 |
| 临时处理敏感内容 | 可暂停监听、开启隐私模式，或跳过识别出的敏感文本 |

如果你现在最需要的是跨设备同步、团队共享、插件市场或完整跨平台体验，Klip 还没有进入那个阶段。

## 核心工作流

| 步骤 | 操作 | 结果 |
|------|------|------|
| 复制 | 在任意应用复制文本、图片或文件 | Klip 自动记录到历史列表 |
| 找回 | 按 `Ctrl+Alt+K` 打开窗口 | 搜索、筛选、查看最近内容 |
| 粘贴 | 点击条目，或按 `Ctrl+Alt+1` 到 `Ctrl+Alt+9` | 内容恢复到系统剪贴板并粘贴 |
| 整理 | 收藏、打标签，或保存常用片段 | 常用内容更容易再次找到 |
| 控制 | 暂停监听、开启隐私模式、设置来源忽略规则 | 减少不该保存的内容进入历史 |
| 自救 | 导出、导入、备份或恢复数据库 | 本地迁移和误操作恢复更稳妥 |

## 功能范围

### 剪贴板历史

- 自动记录文本、图片和文件路径剪贴板内容。
- 浏览器和 Word 等应用复制的文本会同时保留纯文本、HTML 和 RTF；目标应用粘贴时可选择自身支持的格式。
- 相同内容去重，避免列表重复膨胀。
- 默认保留 100 条历史记录，可在设置中调整。
- 列表按本地自然日分组，便于从今天、昨天和更早记录中扫描。

### 搜索和筛选

- 支持基于 Tantivy + jieba 的全文关键词搜索，可按拆分后的中文词组命中结果。
- 图片在后台使用本地 PP-OCRv5 模型识别文字，识别完成后可直接搜索截图中的中英文内容；推理不联网、不上传图片。
- 支持文本、图片、文件类型筛选。
- 支持收藏、标签、敏感内容、精确匹配和日期范围筛选。
- 搜索框默认聚焦，适合用快捷键唤起后直接输入。
- 自定义标题和备注与原内容一起进入搜索；修改后活动搜索会立即按后端索引语义刷新。
- 搜索索引损坏，或索引 ID/可搜索内容与 SQLite 不一致时，会从 SQLite 自动重建；索引暂时不可用时自动回退到 SQLite 包含匹配。活动搜索期间的新捕获和 OCR 更新会重新经过同一后端搜索语义。

### 粘贴和窗口

- `Ctrl+Alt+K` 显示或隐藏主窗口。
- `Ctrl+Alt+1` 到 `Ctrl+Alt+9` 快速粘贴列表前 9 条可见记录。
- 可见记录由前端在搜索、类型、收藏、标签和日期筛选结果变化时同步；已同步空结果不会
  回退到数据库中的其他记录，已删除的快照 ID 也不会被替换。
- 点击历史条目可恢复到系统剪贴板并粘贴。
- Klip 显示前会记录外部前台应用，粘贴前恢复焦点；Windows 使用前台窗口句柄，macOS 使用前台应用，Linux X11 使用 EWMH 活动窗口。Wayland 无通用激活协议时会跳过恢复，不会让粘贴命令报错。
- 应用常驻系统托盘，关闭窗口后仍可继续监听。

### 整理和复用

- 收藏常用历史记录。
- 为历史记录添加标签。
- 在统一详情中添加自定义标题和备注；有标题时列表优先显示标题，备注以紧凑图标提示。
- 批量选择后收藏、打标签或删除。
- 在设置中维护常用片段，例如命令、短语和模板。

### 隐私和控制

- 数据只保存在本机。
- 默认遮罩已识别的敏感内容预览。
- 可选择跳过密码、密钥、高熵 Token 等敏感文本。
- 可暂停剪贴板监听。
- 可开启 15 分钟隐私模式。
- Windows 上可按前台进程名或窗口标题设置来源忽略规则。

### 数据管理

- JSON / CSV 导入导出。
- SQLite 数据库备份和恢复。
- 恢复前自动备份当前数据库。
- 数据库 schema 版本检查。
- 损坏数据库会被保留，应用会用干净 schema 重新启动。

### Web 仪表盘与本地 HTTP API

桌面应用内置一个仅监听回环地址的 HTTP 服务（`web-klip/` 前端 + axum 后端），
不启动桌面界面也能用 curl/脚本操作：

- 剪贴板列表/搜索/详情，图片条目按需加载原图与缩略图（列表不再传 base64）。
- 图片 OCR：查看状态、手动触发、失败返回明确错误（桌面 worker 不可用时 503）。
- 流式问答（SSE）：答案逐帧到达，引用可点击跳回原条目；失败/超时不再转圈。
- 自诊断面板：SQLite 完整性、搜索索引一致性、数据目录占用，可导出 JSON 报告。
- 主窗口只读状态（位置/尺寸/可见性）。
- 可选访问令牌（`http_access_token` 配置）：开启后全路由含 SSE 需 `Bearer` 头或
  `?access_token=` 查询参数，缺失/错误一律 401；默认关闭，行为不变。

完整契约见 `GET /openapi.json` 与 [`docs/API.md`](docs/API.md)。

## 安装

### Windows

从 [GitHub Releases](https://github.com/AllureCurtain/klip/releases) 下载当前版本的 Windows 安装包。

当前公开版本是 `v0.1.2`；`v0.2.0` 已进入发布候选阶段，完成干净 Windows 用户/VM
安装验收后再公开。安装包尚未绑定公开代码签名证书，Windows 可能显示 SmartScreen 或
未知发布者提示。这是当前发布阶段的已知边界，不代表应用需要联网或登录账号。

### Linux

Linux X11 会话已完整支持并通过真实桌面验收（Ubuntu 22.04/24.04，X11 会话）。剪贴板监听（文本/图片/文件）、SQLite 历史、Tantivy+jieba 中文搜索、标签/片段、OCR（内置 ONNX Runtime + PP-OCRv5）、xdotool 模拟粘贴、X11 来源追踪、全局快捷键、托盘常驻、XDG 开机自启、设置持久化、JSON/CSV 导入导出与备份恢复、隐私开关、HTTP API 与 web-klip 仪表盘均可真实使用。Wayland 会话为降级支持（见[已知限制](#已知限制)）。

从源码构建运行见[在 Linux 上构建](#在-linux-上构建)。macOS 暂不作为当前 MVP 交付平台：仓库已实现 macOS 焦点恢复并为未支持平台提供无错误降级，但尚未在真实 macOS 桌面完成整体验收。

### macOS

暂不作为当前 MVP 交付平台。仓库已实现 macOS 焦点恢复，并为未支持平台提供无错误降级，但尚未在真实 macOS 桌面完成整体验收；OCR 在 macOS 上无内置 ONNX Runtime，会优雅降级（不影响其他功能）。

## 使用方式

1. 安装并启动 Klip。
2. 复制文本、图片或文件。
3. 按 `Ctrl+Alt+K` 打开历史窗口。
4. 输入关键词，或用类型、收藏、标签和高级筛选缩小列表。
5. 点击历史条目进行粘贴，或用 `Ctrl+Alt+数字键` 快速粘贴前 9 条。
6. 常用内容可以收藏、加标签，或整理成片段。

## 默认快捷键

| 快捷键 | 作用 |
|--------|------|
| `Ctrl+Alt+K` | 显示或隐藏主窗口 |
| `Ctrl+Alt+1` 到 `Ctrl+Alt+9` | 快速粘贴前 9 条可见历史记录 |

窗口快捷键支持在设置中改为 `Ctrl+Alt+<A-Z>` 范围内的组合。快速粘贴目前使用 `Ctrl+Alt` 作为数字键前缀。

## 隐私和数据

Klip 将历史记录、图片 OCR 状态与文字、标签、片段、来源规则和设置保存在本地 SQLite 数据库 `klip.db` 中；全文索引保存在同一应用数据目录下的 `search-index`，可以随时从 SQLite 重建。OCR 模型随安装包提供，首次使用时会校验 SHA-256 后复制到同一数据目录下的 `ocr-models`，运行时不下载模型。

Windows 安装资源中，PP-OCRv5 检测/识别模型和字典约 21.5 MB，ONNX Runtime DLL 约 14.1 MB，合计使安装资源增加约 36 MB；应用数据目录中的模型缓存还会占用约 21.5 MB。来源、许可证和精确哈希见 `src-tauri/resources/ocr/README.md` 与 `src-tauri/resources/onnxruntime/README.md`。

| 平台 | 数据库位置 |
|------|------------|
| Windows | `%APPDATA%\com.klip.app\klip.db` |
| Linux | `$XDG_DATA_HOME/klip/klip.db`（默认 `~/.local/share/klip/klip.db`） |
| macOS | 后续阶段 |

Linux 上全文索引位于同目录下的 `search-index/`，OCR 模型缓存位于 `ocr-models/`，日志位于 `logs/`。可用 `KLIP_DATA_DIR` 环境变量覆盖数据目录（便于测试）。

当前隐私设计偏实用：默认遮罩敏感预览，允许跳过新捕获的敏感文本，也允许临时暂停监听。它还不是完整的数据库加密产品，密钥管理和真实加密迁移属于 MVP 之后的工作。

## 当前限制

这些能力可能在代码、配置或文档里有预留入口，但不代表已经作为当前产品能力上线：

| 能力 | 当前状态 |
|------|----------|
| Linux 完整体验（X11 会话） | 已支持并验收 |
| Wayland 会话 | 降级支持（见[已知限制](#已知限制)） |
| macOS 完整体验 | 后续阶段 |
| 云同步服务 | 不包含 |
| 插件运行时和插件市场 | 不包含 |
| 托管更新源和应用内自动更新 | 不包含 |
| 真实数据库加密迁移 | 不包含 |
| 账号系统 | 不包含 |
| 公开代码签名证书 | 当前安装包尚未绑定 |

现阶段更适合修小而真实的问题：复制是否稳定入库、搜索和筛选是否准确、点击和快捷键粘贴是否顺手、隐私状态是否明确、备份恢复是否可靠、README 和发布说明是否让用户少猜。

## 本地开发

环境要求：

- Node.js 24.x
- pnpm 10.x
- Rust 1.95+
- Windows 上运行桌面 E2E 需要 `tauri-driver`；仓库脚本会安装与 WebView2 匹配且具有
  有效 Microsoft 签名的 EdgeDriver

常用命令：

```powershell
pnpm install --frozen-lockfile
pnpm tauri:dev
pnpm test -- --run
pnpm lint
pnpm build
cd src-tauri
cargo test
```

首次初始化 worktree，以及 `pnpm-lock.yaml` 变化后，都应运行 `pnpm install --frozen-lockfile`。安装过程会通过 `prepare` 安装 pre-push hook；该 hook 在推送前执行 `pnpm verify`。

桌面开发实例应使用独立的数据、日志和 HTTP 端口，避免污染日常使用的数据或与默认端口冲突：

```powershell
$env:KLIP_DATA_DIR = 'C:\tmp\klip-dev\data'
$env:KLIP_LOG_DIR = 'C:\tmp\klip-dev\logs'
$env:KLIP_HTTP_PORT = '27718'
pnpm tauri:dev
```

| 变量 | 用途 | 未设置时 |
|------|------|----------|
| `KLIP_DATA_DIR` | SQLite、全文索引和 OCR 模型缓存目录 | 平台应用数据目录 |
| `KLIP_LOG_DIR` | 运行日志目录 | 平台应用日志目录 |
| `KLIP_HTTP_PORT` | 本地 HTTP API 端口 | `27717` |

同一个开发任务保持一个活动 worktree，并串行完成实现、测试和提交。复用该 worktree 的 `target/` 与 `node_modules/`，不要同时运行多个 Klip 桌面实例；全局热键、开机自启和进程内剪贴板抑制无法靠上述目录与端口变量完全隔离。

Windows 上可选用 `sccache` 加速重建依赖。它不是项目依赖，不需要修改仓库内 Cargo 配置：

```powershell
scoop install sccache
$env:RUSTC_WRAPPER = 'sccache'
sccache --show-stats
```

`sccache` 主要帮助 target 缓存未命中或 worktree 重建后的依赖编译；日常修改项目代码仍主要依靠 Cargo incremental。

完整本地验证：

```powershell
pnpm verify
pnpm e2e
```

`pnpm verify` 会执行前端 lint、Vitest、生产构建、Rust 格式检查、Clippy 和 Rust 测试。
运行本地 E2E 前可执行 `scripts/install-matching-edgedriver.ps1`：脚本自动识别 WebView2
版本，下载同版本 EdgeDriver，并校验版本与 Microsoft Authenticode 签名。Desktop E2E
workflow 使用同一自动检测流程，不固定 runner 的 WebView2 版本。当前 5 项桌面流程覆盖
捕获/搜索/粘贴、可见项快捷粘贴、标题备注搜索、copy/paste/plain-text 语义和文件动作。

### 在 Linux 上构建

系统依赖（Ubuntu/Debian，Tauri 2 的 webkit2gtk-4.1 是 webview 后端，appindicator3 是托盘）：

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev libayatana-appindicator3-dev \
  build-essential curl wget file libxdo-dev libssl-dev pkg-config \
  xdotool xclip xsel
```

> `libwebkit2gtk-4.1-dev` 在 Ubuntu 22.04 (jammy-updates) 和 24.04 源中均可用，无需第三方 PPA。
> 粘贴模拟需要 `xdotool`（X11）；Wayland 下可另装 `ydotool` 或 `wtype`。

构建运行：

```bash
pnpm install --frozen-lockfile
pnpm build
cd src-tauri
cargo build
# 直接运行 debug 二进制（OCR 模型/ONNX Runtime 通过 CARGO_MANIFEST_DIR 回退加载）
KLIP_DATA_DIR=$HOME/.local/share/klip KLIP_LOG_DIR=$HOME/.local/share/klip/logs \
  DISPLAY=:0 ./target/debug/klip
```

打包（生成 deb/AppImage 等，`tauri.linux.conf.json` 会自动并入，把 Linux ONNX Runtime 纳入 bundle）：

```bash
pnpm tauri:build
```

Linux 桌面 E2E（需要一个 X11 会话；headless 环境用 Xvfb 或 Xvnc）：

```bash
cargo install tauri-driver --locked   # 已在 PATH 中
SKIP_BUILD=1 DISPLAY=:0 bash scripts/run-e2e-linux.sh
```

Rust 工具链：当前用 1.97.0/1.98.0 stable 验证通过。注意 rustc 1.98.0 在某些环境下编译 `quote 1.0.x` 会触发 ICE（`no type-dependent def for method call`），如遇到请改用 1.97.0。

## 发布验证

Windows 发布前常用命令：

```powershell
pnpm release:readiness
pnpm release:verify -SkipBundle
pnpm release:verify
pnpm release:smoke
```

`pnpm release:readiness` 只检查签名和更新源配置是否存在，不验证真实证书，也不会访问托管更新源。

可用的发布环境变量：

| 变量 | 用途 |
|------|------|
| `KLIP_WINDOWS_CERTIFICATE_THUMBPRINT` | 使用系统证书存储中的代码签名证书 |
| `KLIP_WINDOWS_CERTIFICATE_PATH` | 使用本地 PFX 证书文件 |
| `KLIP_WINDOWS_CERTIFICATE_PASSWORD` | PFX 证书密码 |
| `KLIP_WINDOWS_TIMESTAMP_URL` | 签名时间戳服务 |
| `KLIP_UPDATE_FEED_URL` | 后续更新源配置 |

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Tauri 2 |
| 前端 | React 19, TypeScript, Vite |
| 样式 | Tailwind CSS, 本地 UI 组件 |
| 状态管理 | Zustand |
| 后端 | Rust |
| 数据库 | SQLite, rusqlite |
| 全文搜索 | Tantivy, tantivy-jieba |
| 剪贴板 | clipboard-rs |
| 图片 OCR | oar-ocr, PP-OCRv5, ONNX Runtime |
| 测试 | Vitest, Testing Library, Selenium WebDriver |

## 文档地图

| 文档 | 内容 |
|------|------|
| [文档索引](docs/INDEX.md) | 推荐阅读顺序和当前项目状态 |
| [交付状态](docs/DELIVERY_STATUS.md) | 已合并工作、验证证据和明确保留的边界 |
| [产品需求文档](docs/PRD.md) | MVP 功能范围和验收口径 |
| [架构设计](docs/ARCHITECTURE.md) | 前端、后端、数据库和 Tauri 模块划分 |
| [数据库设计](docs/DATABASE.md) | 表结构、迁移和数据恢复策略 |
| [API 文档](docs/API.md) | Tauri IPC 命令和事件 |
| [开发指南](docs/DEVELOPMENT.md) | 开发环境、脚本和代码规范 |
| [发布检查清单](docs/RELEASE_CHECKLIST.md) | Windows 安装包发布前检查 |
| [路线图](docs/ROADMAP.md) | 当前边界和后续方向 |
| [版本记录](CHANGELOG.md) | 已发布版本和未发布变更 |

## 贡献

欢迎提交 issue 和 pull request。开始前请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

当前阶段更重视小而清晰的改动：剪贴板捕获、搜索、粘贴、快捷键、托盘、隐私控制、本地数据可靠性、设置体验和文档准确性。大型平台扩展、云服务、插件系统和账号体系暂不进入 MVP。

## 许可证

[MIT](LICENSE)

## 致谢

- [Tauri](https://tauri.app/)：桌面应用框架
- [React](https://react.dev/)：前端 UI
- [Rust](https://www.rust-lang.org/)：本地后端
- [clipboard-rs](https://crates.io/crates/clipboard-rs)：跨平台剪贴板读取、写入与变更监听
- [Tantivy](https://github.com/quickwit-oss/tantivy)：本地全文搜索索引
