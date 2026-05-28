# Klip

<p align="center">
  <strong>Windows-first local clipboard manager</strong>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.2-2563eb">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20first-0f766e">
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2.x-24c8db">
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-backend-b7410e">
</p>

Klip 是一个本地剪贴板管理器。它解决的是一个很具体的问题：系统剪贴板只能记住最近一次复制，而日常写作、开发、整理资料时，经常需要找回前几次复制过的内容。

当前版本以 Windows 为主要交付目标。数据保存在本机 SQLite 数据库里，不需要账号，也不会上传到云端。

## 当前状态

- 当前公开版本：`v0.1.2`
- 当前交付平台：Windows 10+
- 当前产品形态：本地单机剪贴板管理器
- macOS / Linux：已有部分代码基础，但不作为当前 MVP 交付承诺
- 云同步、插件市场、自动更新服务、真实数据库加密迁移：当前不包含

## 核心功能

### 记录和找回

- 自动记录文本、图片和文件路径剪贴板内容
- 相同内容去重，避免历史列表重复膨胀
- 支持关键词搜索、类型筛选、收藏筛选、标签筛选
- 支持敏感内容、精确匹配和日期范围等高级筛选

### 快速粘贴

- `Ctrl+Alt+K` 唤起或隐藏主窗口
- `Ctrl+Alt+1` 到 `Ctrl+Alt+9` 快速粘贴列表前 9 条
- 点击历史条目可恢复到系统剪贴板并粘贴
- 系统托盘常驻，关闭窗口后仍可继续监听

### 整理和复用

- 收藏常用历史记录
- 给历史记录添加标签
- 在设置中维护常用片段，例如命令、短语、模板
- 支持批量选择后收藏、打标签或删除

### 隐私和控制

- 数据只保存在本机
- 默认遮罩已识别的敏感内容预览
- 可选择跳过密码、密钥、高熵 Token 等敏感文本
- 可暂停剪贴板监听
- 可开启 15 分钟隐私模式
- Windows 上可按前台进程或窗口标题设置来源忽略规则

### 数据管理

- JSON / CSV 导入导出
- SQLite 数据库备份和恢复
- 恢复前自动备份当前数据库
- 数据库 schema 版本检查
- 损坏数据库会被保留，应用会用干净 schema 重新启动

## 不在当前 MVP 范围内

这些配置或文档入口可能已经存在，但它们只是为发布或后续集成预留，不代表功能已经上线：

| 能力 | 当前状态 |
|------|----------|
| macOS / Linux 完整体验 | 后续阶段 |
| 云同步服务 | 不包含 |
| 插件运行时和插件市场 | 不包含 |
| 托管更新源和应用内自动更新 | 不包含 |
| 真实数据库加密迁移 | 不包含 |
| 账号系统 | 不包含 |

## 安装

### Windows

从 GitHub Releases 下载 `v0.1.2` 的 Windows 安装包：

```text
https://github.com/AllureCurtain/klip/releases
```

当前安装包尚未绑定公开代码签名证书。Windows 可能显示 SmartScreen 或未知发布者提示，这是当前发布阶段的已知边界。

### macOS / Linux

暂不作为当前 MVP 交付平台。

## 使用方式

1. 安装并启动 Klip。
2. 复制文本、图片或文件。
3. 按 `Ctrl+Alt+K` 打开历史窗口。
4. 搜索、筛选或直接点击历史条目进行粘贴。
5. 常用内容可以收藏、加标签，或整理成片段。

## 默认快捷键

| 快捷键 | 作用 |
|--------|------|
| `Ctrl+Alt+K` | 显示或隐藏主窗口 |
| `Ctrl+Alt+1` 到 `Ctrl+Alt+9` | 快速粘贴前 9 条可见历史记录 |

窗口快捷键支持在设置中改为 `Ctrl+Alt+<A-Z>` 范围内的组合。快速粘贴目前使用 `Ctrl+Alt` 作为数字键前缀。

## 数据位置

Klip 将历史记录、标签、片段、来源规则和设置保存在本地 SQLite 数据库 `klip.db` 中。

| 平台 | 数据库位置 |
|------|------------|
| Windows | `%APPDATA%\com.klip.app\klip.db` |
| macOS | 后续阶段 |
| Linux | 后续阶段 |

## 本地开发

环境要求：

- Node.js 24.x
- pnpm 10.x
- Rust 1.95+
- Windows 上运行桌面 E2E 需要 `tauri-driver` 和 Microsoft Edge WebDriver

常用命令：

```powershell
pnpm install
pnpm tauri:dev
pnpm test -- --run
pnpm lint
pnpm build
cd src-tauri
cargo test
```

完整本地验证：

```powershell
pnpm verify
pnpm e2e
```

`pnpm verify` 会执行前端 lint、Vitest、生产构建、Rust 格式检查、Clippy 和 Rust 测试。`pnpm e2e` 会启动 Tauri WebDriver，覆盖复制、搜索、点击条目恢复剪贴板的桌面流程。

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Tauri 2 |
| 前端 | React 19, TypeScript, Vite |
| 样式 | Tailwind CSS, 本地 UI 组件 |
| 状态管理 | Zustand |
| 后端 | Rust |
| 数据库 | SQLite, rusqlite |
| 剪贴板 | arboard, clipboard-master, clipboard-win |
| 测试 | Vitest, Testing Library, Selenium WebDriver |

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

## 文档

| 文档 | 内容 |
|------|------|
| [产品需求文档](docs/PRD.md) | MVP 功能范围和验收口径 |
| [架构设计](docs/ARCHITECTURE.md) | 前端、后端、数据库和 Tauri 模块划分 |
| [数据库设计](docs/DATABASE.md) | 表结构、迁移和数据恢复策略 |
| [API 文档](docs/API.md) | Tauri IPC 命令和事件 |
| [开发指南](docs/DEVELOPMENT.md) | 开发环境、脚本和代码规范 |
| [发布检查清单](docs/RELEASE_CHECKLIST.md) | Windows 安装包发布前检查 |
| [版本记录](CHANGELOG.md) | 已发布版本和未发布变更 |

## 贡献

欢迎提交 issue 和 pull request。开始前请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

当前阶段更重视小而清晰的改动：剪贴板捕获、搜索、粘贴、隐私控制、数据可靠性、设置体验和文档准确性。大型平台扩展、云服务、插件系统和账号体系暂不进入 MVP。

## 许可证

[MIT](LICENSE)

## 致谢

- [Tauri](https://tauri.app/)：桌面应用框架
- [React](https://react.dev/)：前端 UI
- [Rust](https://www.rust-lang.org/)：本地后端
- [arboard](https://github.com/1Password/arboard)：跨平台剪贴板基础能力
- [clipboard-master](https://crates.io/crates/clipboard-master)：Windows 剪贴板事件监听
