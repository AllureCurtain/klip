# Klip

> A modern, lightweight clipboard manager built with Tauri + React + Rust.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()

**Klip** 是一个跨平台剪贴板管理器，帮助你高效管理剪贴板历史记录。

## 特性

- **历史记录** - 自动保存最近 100 条剪贴板内容
- **多格式支持** - 支持文本、图片、文件路径
- **快捷键操作** - `Ctrl+Shift+V` 唤起，数字键快速粘贴
- **模糊搜索** - 快速查找历史内容
- **系统托盘** - 后台常驻，不占用任务栏
- **本地存储** - 数据完全本地化，隐私安全
- **开机自启** - 可选开机自动启动
- **轻量高效** - 内存占用 < 50MB，启动 < 1s

## 安装

### Windows
下载 `.msi` 或 `.exe` 安装包

### macOS
下载 `.dmg` 镜像文件

### Linux
下载 `.AppImage` 或使用包管理器安装

## 快速开始

1. 安装 Klip
2. 应用自动在后台运行
3. 按 `Ctrl+Shift+V` (Windows/Linux) 或 `Cmd+Shift+V` (macOS) 唤起窗口
4. 使用数字键 `1-9` 快速粘贴前 9 条记录

## 配置

配置文件位置：
- Windows: `%APPDATA%\klip\config.json`
- macOS: `~/Library/Application Support/klip/config.json`
- Linux: `~/.config/klip/config.json`

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
