# Klip 项目文档索引

> 本文档为项目文档导航，帮助快速了解项目全貌。

## 项目概述

**Klip** 是一个当前以 Windows 为主要交付目标的剪贴板管理器，使用 Tauri + React + Rust 构建。

- **名称**: Klip
- **定位**: 轻量、高效、隐私安全的剪贴板管理工具
- **技术栈**: Tauri 2.0 + React 19 + Rust + SQLite

## 快速导航

### 核心文档 (必读)

| 文档 | 内容 | 适合人群 |
|------|------|----------|
| [README.md](../README.md) | 项目简介、安装使用 | 所有人 |
| [PRD.md](PRD.md) | 产品需求、功能定义 | 产品/开发 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 技术架构、模块设计 | 开发者 |
| [DATABASE.md](DATABASE.md) | 数据库表结构、查询 | 开发者 |
| [API.md](API.md) | IPC 接口、数据类型 | 开发者 |
| [DEVELOPMENT.md](DEVELOPMENT.md) | 开发环境、代码规范 | 开发者 |
| [RELEASE_HANDOFF.md](RELEASE_HANDOFF.md) | v0.1.0 发布接续状态与剩余验收 | 发布执行者 |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | Windows 安装包发布验收清单 | 发布执行者 |

### 文档阅读顺序

```
新开发者推荐阅读顺序:

1. README.md      → 了解项目是什么
2. PRD.md         → 了解要做什么功能
3. ARCHITECTURE.md → 了解技术架构
4. DATABASE.md    → 了解数据存储
5. API.md         → 了解接口定义
6. DEVELOPMENT.md → 开始开发
```

## 项目状态

### 当前阶段

**Phase 1: Windows-first MVP 收敛阶段**

### 已完成工作

- [x] 项目命名: Klip
- [x] 技术选型确认
- [x] 功能范围定义 (Phase 1 MVP)
- [x] 架构设计
- [x] 数据库设计
- [x] API 设计
- [x] 核心文档编写
- [x] 剪贴板历史记录（事件监听）
- [x] 全局快捷键（Ctrl+Alt+K）
- [x] 快速数字键粘贴（Ctrl+Alt+1-9）
- [x] 搜索功能
- [x] 删除历史记录
- [x] 系统托盘常驻
- [x] 本地 SQLite 存储
- [x] 应用配置持久化
- [x] 开机自启动（设置与后端同步已接入，安装包阶段继续重点验证）
- [x] 失焦自动隐藏
- [x] 标签、JSON/CSV 导入导出、数据库备份/恢复
- [x] 敏感内容标记、跳过策略和默认预览遮罩

### 后续工作

| 功能 | 状态 | 优先级 |
|------|------|--------|
| macOS / Linux 后端补齐 | 规划中 | P1 |
| 完整迁移框架 / 损坏自动重建 / 数据能力安装包验收 | 规划中 | P1 |
| 测试脚本与工具链清理 | 规划中 | P2 |

## 技术决策摘要

### 关键决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 包管理器 | pnpm | 节省空间、安装快、更安全 |
| 桌面框架 | Tauri 2.0 | 轻量 (10MB)、安全、跨平台 |
| 前端框架 | React 19 | 生态成熟、Tauri 支持 |
| UI 组件 | Shadcn/ui | 无样式依赖、可定制 |
| 状态管理 | Zustand | 简单高效、TypeScript 友好 |
| 后端语言 | Rust | 性能好、安全、Tauri 原生 |
| 数据库 | SQLite | 本地存储、零配置、隐私安全 |
| 剪贴板监听 | clipboard-master (事件驱动) | 低延迟、不阻塞、Windows 原生 |

### 性能目标

| 指标 | 目标值 |
|------|--------|
| 启动时间 | < 1s |
| 内存占用 | < 50MB |
| 安装包大小 | < 10MB |
| 剪贴板监听延迟 | < 100ms |

## 开发指南

### 环境要求

- Node.js 24.x (LTS)
- pnpm 10.x
- Rust 1.95+

### 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发
pnpm tauri dev

# 构建
pnpm tauri build
```

### 项目结构

```
klip/
├── src/           # React 前端
├── src-tauri/     # Rust 后端
└── docs/          # 文档
```

## 联系与贡献

- **许可证**: MIT
- **贡献指南**: [CONTRIBUTING.md](../CONTRIBUTING.md)

---

> 最后更新: 2026-05-03 (MVP v0.1.0)
