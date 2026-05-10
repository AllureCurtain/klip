# Klip

> A modern, lightweight clipboard manager built with Tauri + React + Rust.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20first-blue.svg)]()

**Klip** 是一个当前以 Windows 为主要交付目标的剪贴板管理器，帮助你高效管理剪贴板历史记录。macOS / Linux 支持作为后续阶段完善。

## 特性

- **历史记录** - 自动保存最近 100 条剪贴板内容
- **多格式支持** - 支持文本、图片、文件路径
- **快捷键操作** - `Ctrl+Alt+K` 唤起，`Ctrl+Alt+1~9` 快速粘贴
- **模糊搜索** - 快速查找历史内容
- **系统托盘** - 后台常驻，不占用任务栏
- **本地存储** - 数据完全本地化，隐私安全
- **开机自启** - 可在设置中开启/关闭，安装包阶段重点验证
- **轻量高效** - 内存占用 < 50MB，启动 < 1s

## 安装

### Windows
下载 `.msi` 或 `.exe` 安装包

### macOS
后续阶段提供

### Linux
后续阶段提供

## 快速开始

1. 安装 Klip
2. 应用自动在后台运行
3. 按 `Ctrl+Alt+K` 唤起窗口
4. 使用 `Ctrl+Alt+1` ~ `Ctrl+Alt+9` 快速粘贴前 9 条记录

## 配置与数据

当前版本将历史记录和应用配置统一存储在本地 SQLite 数据库 `klip.db` 中，配置项位于 `app_config` 表。

- Windows: `%APPDATA%\com.klip.app\klip.db`
- macOS: `~/Library/Application Support/com.klip.app/klip.db`（后续阶段）
- Linux: `~/.local/share/com.klip.app/klip.db`（后续阶段）

其中默认热键为 `Ctrl+Alt+K` 和 `Ctrl+Alt+1~9`。修改 `hotkey_toggle_window`、`hotkey_quick_paste_prefix` 后，后端会立即重载热键；`auto_start` 会同步系统开机自启动状态并持久化到数据库。

## 技术栈

- **前端**: React 19 + TypeScript 6 + Vite
- **UI**: Shadcn/ui + Tailwind CSS
- **状态管理**: Zustand
- **桌面框架**: Tauri 2.0
- **后端**: Rust
- **数据库**: SQLite

## 文档

- [产品需求文档](docs/PRD.md)
- [架构设计](docs/ARCHITECTURE.md)
- [开发指南](docs/DEVELOPMENT.md)
- [API 文档](docs/API.md)
- [数据库设计](docs/DATABASE.md)

## 贡献

欢迎贡献！请阅读 [贡献指南](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)

## 致谢

- [Tauri](https://tauri.app/) - 跨平台桌面应用框架
- [Shadcn/ui](https://ui.shadcn.com/) - React 组件库
- [arboard](https://github.com/1Password/arboard) - Rust 剪贴板库
