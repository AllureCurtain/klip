# Klip 开发指南

Klip 当前以 Windows 10+ 为主要开发和交付环境；Linux X11 会话已完整支持并通过真实桌面验收
（Ubuntu 22.04/24.04）。macOS 可以参与编译和静态验证，但尚未完成真实桌面整体验收，
不应据此宣称完整跨平台支持。

## 1. 环境准备

| 工具 | 版本 | 用途 |
|------|------|------|
| Node.js | 24.x | 前端工具链 |
| pnpm | 10.x | 包管理和项目脚本 |
| Rust | 1.95+（验证用 1.97.0） | Tauri 后端 |
| `tauri-driver` | 当前稳定版 | 桌面 E2E（Windows 用 EdgeDriver，Linux 用 WebKitWebDriver） |
| WebView2 Runtime | 系统已安装版本 | Windows Tauri WebView |
| WebKitWebDriver | webkit2gtk-driver 包 | Linux Tauri WebView E2E |

安装依赖：

```powershell
pnpm install --frozen-lockfile
cargo install tauri-driver --locked
```

`pnpm install` 会通过 `prepare` 安装仓库的 pre-push hook。`pnpm-lock.yaml` 变化后应重新
执行带 `--frozen-lockfile` 的安装。

Linux 构建还需要 Tauri 2 的系统依赖（Ubuntu/Debian）：

```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev libayatana-appindicator3-dev \
  build-essential curl wget file libxdo-dev libssl-dev pkg-config \
  xdotool xclip xsel
```

`libwebkit2gtk-4.1-dev` 在 Ubuntu 22.04 (jammy-updates) 与 24.04 源中均可用。剪贴板读写走
clipboard-rs（X11 自带，Wayland 需 `wl-clipboard`）；模拟粘贴在 X11 用 `xdotool`，Wayland
用 `ydotool` 或 `wtype`。Wayland 合成器可能主动禁止全局快捷键、窗口激活或模拟粘贴。

Linux 桌面 E2E 需要一个 X11 会话和 `WebKitWebDriver`（`webkit2gtk-driver` 包）：

```bash
cargo install tauri-driver --locked
sudo apt-get install -y webkit2gtk-driver
SKIP_BUILD=1 DISPLAY=:0 bash scripts/run-e2e-linux.sh
```

## 2. 日常开发

```powershell
# Tauri 桌面开发模式
pnpm tauri:dev

# 仅启动 Vite；Tauri IPC 在普通浏览器中不可用
pnpm dev

# 前端 lint、测试和构建
pnpm lint
pnpm test -- --run
pnpm build

# Rust 验证
Push-Location src-tauri
cargo fmt -- --check
cargo clippy -- -D warnings
cargo test
Pop-Location
```

桌面开发实例应使用独立数据、日志和 HTTP 端口，以免污染日常数据：

```powershell
$env:KLIP_DATA_DIR = 'C:\tmp\klip-dev\data'
$env:KLIP_LOG_DIR = 'C:\tmp\klip-dev\logs'
$env:KLIP_HTTP_PORT = '27718'
pnpm tauri:dev
```

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `KLIP_DATA_DIR` | SQLite、全文索引和 OCR 模型缓存 | 平台应用数据目录 |
| `KLIP_LOG_DIR` | 运行日志 | 平台应用日志目录 |
| `KLIP_HTTP_PORT` | 本地 HTTP API | `27717` |

不要同时运行多个会注册相同全局热键的 Klip 桌面实例。目录和端口隔离无法隔离系统剪贴板、
全局热键、开机自启或进程内剪贴板抑制。

## 3. 完整验证

默认本地验证：

```powershell
pnpm verify
```

该命令依次执行 ESLint、Vitest、前端生产构建、Rust 格式检查、Clippy 和 Rust 测试。
它会重新生成较大的 Cargo `target/`，磁盘空间不足时可以先运行与改动范围对应的检查，
再依赖 CI 完成全量验证。

Windows 桌面 E2E 需要真实桌面会话、`tauri-driver`，以及与本机 WebView2 Runtime 完全
匹配的 EdgeDriver。安装脚本会自动识别 WebView2 版本，下载同版本驱动，并校验版本和
Microsoft Authenticode 签名：

```powershell
$edgeDriver = ./scripts/install-matching-edgedriver.ps1
$env:Path = "$(Split-Path $edgeDriver);$env:Path"
pnpm e2e
```

`.github/workflows/e2e.yml` 使用同一脚本自动识别 GitHub Windows runner 上的 WebView2，
不固定浏览器版本。当前 5 项 Selenium 流程覆盖：

1. 文本捕获、搜索和点击恢复粘贴。
2. 筛选后前 9 条可见记录的快捷粘贴。
3. 自定义标题、备注持久化和活动搜索。
4. copy、paste 和 plain-text 模式的分离语义。
5. 含空格及非 ASCII 字符的 Windows 路径打开和定位。

E2E 使用 `e2e/.tmp/` 下的隔离数据和日志目录。它依赖真实系统剪贴板和桌面焦点，因此
不包含在 `pnpm verify` 中。

## 4. 项目结构

```text
klip/
|-- src/                    # React 前端、Zustand stores、typed Tauri wrappers
|-- src-tauri/src/          # Rust commands、clipboard、database、search、platform adapters
|-- src-tauri/resources/    # OCR 模型、字典和 ONNX Runtime 资源
|-- e2e/                    # Selenium 桌面 E2E
|-- scripts/                # hooks、E2E 和发布验证脚本
|-- docs/                   # 当前产品和工程文档
|-- .github/workflows/      # CI、Desktop E2E 和 Release workflows
|-- package.json
`-- pnpm-lock.yaml
```

关键入口：

- `src/lib/tauri.ts`：前端 IPC 的唯一 typed wrapper 入口。
- `src-tauri/src/main.rs`：Tauri command 注册和应用启动。
- `src-tauri/src/database/migrations.rs`：数据库版本迁移；当前 schema 为 v7。
- `src-tauri/src/config/registry.rs`：运行时配置默认值和校验。
- `src-tauri/src/clipboard/`：捕获、格式识别、写回、粘贴和抑制。
- `src-tauri/src/search/`：Tantivy/jieba 索引、健康检查、重建和 SQLite fallback。

## 5. 提交约定

提交信息使用 Conventional Commits，例如：

```text
feat: add clipboard history search
fix: preserve visible items during refresh
docs: consolidate delivery status
```

新增 IPC command 时必须同时完成 Rust handler、`main.rs` 注册、`src/lib/tauri.ts` typed
wrapper 和对应测试。所有保存条目的系统剪贴板写入必须复用 `clipboard/writer.rs`，不要
在 command 中创建新的 clipboard backend。

## 6. 发布

当前 Windows 发布系列为 `0.2.x`，`package.json`、`src-tauri/Cargo.toml` 和
`src-tauri/tauri.conf.json` 必须保持一致。开始补丁发布时按
[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) 从干净 checkout 重新构建和验收；旧构建产物
不能作为新发布证据。

## 7. 相关文档

- [交付状态](DELIVERY_STATUS.md)
- [架构设计](ARCHITECTURE.md)
- [API 文档](API.md)
- [数据库设计](DATABASE.md)
- [发布检查清单](RELEASE_CHECKLIST.md)
