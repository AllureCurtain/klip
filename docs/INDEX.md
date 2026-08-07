# Klip 文档索引

本文档是仓库内文档的入口。Klip 当前是 Windows-first 的本地剪贴板管理器，当前文档优先服务三个问题：

1. 当前 MVP 到底包含什么。
2. 本地开发、验证和发布怎么做。
3. 哪些能力只是后续方向，不应被当成当前承诺。

## 当前项目状态

| 项目 | 状态 |
|------|------|
| 当前公开版本 | `v0.1.2` |
| 当前交付平台 | Windows 10+ |
| 当前产品形态 | 本地单机剪贴板管理器 |
| 数据存储 | 本机 SQLite 数据库 |
| macOS / Linux | 后续阶段，不作为当前 MVP 交付 |
| 云同步 / 插件 / 账号 | 不在当前 MVP 范围内 |

当前 MVP 的核心链路已经齐全：复制内容、记录历史、搜索筛选、恢复粘贴、托盘常驻、快捷键操作、本地数据管理和基础隐私控制。

## 当前实施任务

基础模块已经具备，但对照 EcoPaste 和 muutot-Clipboard 后，仍发现键盘操作闭环、
可见列表快捷粘贴、复制/粘贴动作区分、完整预览、内容动作、纯文本粘贴和条目备注等
日常使用缺口。当前只在一个 worktree 中串行补齐这些能力：

| 文档 | 用途 |
|------|------|
| [2026-08-07-core-clipboard-workflows.md](superpowers/plans/2026-08-07-core-clipboard-workflows.md) | 当前任务的范围、设计、执行顺序、测试和提交边界 |
| [CORE_WORKFLOW_PROGRESS.md](CORE_WORKFLOW_PROGRESS.md) | 当前进度、验证证据、阻塞项和中断恢复入口 |

实施路径固定为 `D:\Study\cc\klip\.worktrees\core-workflows`，分支固定为
`feat/core-workflows`。`WORKTREE_STRATEGY.md` 和 `IMPLEMENTATION_PROGRESS.md` 已转为
foundation 阶段的历史记录。

## 推荐阅读顺序

| 顺序 | 文档 | 适合场景 |
|------|------|----------|
| 1 | [README.md](../README.md) | 先了解项目是什么、能做什么、不能做什么 |
| 2 | [PRD.md](PRD.md) | 确认 MVP 功能范围和验收口径 |
| 3 | [ARCHITECTURE.md](ARCHITECTURE.md) | 理解前端、后端、Tauri 和数据库模块 |
| 4 | [DATABASE.md](DATABASE.md) | 查看表结构、迁移和数据恢复策略 |
| 5 | [API.md](API.md) | 查看 Tauri IPC 命令、事件和类型 |
| 5b | [HTTP_ROUTE_AUDIT.md](HTTP_ROUTE_AUDIT.md) | 查看本地 HTTP API 的路由/OpenAPI/看板/测试覆盖矩阵 |
| 6 | [DEVELOPMENT.md](DEVELOPMENT.md) | 搭建开发环境并运行验证脚本 |
| 7 | [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | 做 Windows 安装包发布前检查 |
| 8 | [ROADMAP.md](ROADMAP.md) | 查看当前边界和后续方向 |

历史交接类文档保留在仓库中，主要用于回看某个阶段的上下文：

| 文档 | 用途 |
|------|------|
| [NEXT_HANDOFF.md](NEXT_HANDOFF.md) | 主窗口轻量化阶段的交接记录 |
| [RELEASE_HANDOFF.md](RELEASE_HANDOFF.md) | 早期发布流程和剩余验收记录 |
| [DEVELOPMENT_REPORT.md](DEVELOPMENT_REPORT.md) | 较完整的阶段开发报告 |
| [superpowers/plans](superpowers/plans) | 已执行或历史保留的实现计划 |
| [../WORKTREE_STRATEGY.md](../WORKTREE_STRATEGY.md) | 已完成的 foundation 单 worktree 实施记录 |
| [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md) | 已完成的 foundation 持续实施记录 |

## MVP 功能完成情况

| 能力 | 当前状态 |
|------|----------|
| 剪贴板历史记录 | 已实现，支持文本、图片和文件路径 |
| 快捷键唤起 | 已实现，默认 `Ctrl+Alt+K` |
| 快速粘贴 | 已实现，默认 `Ctrl+Alt+1` 到 `Ctrl+Alt+9` |
| 搜索和筛选 | 已实现，支持关键词、类型、标签、收藏和高级筛选 |
| 托盘常驻 | 已实现 |
| 本地存储 | 已实现，使用 SQLite |
| 标签和收藏 | 已实现 |
| 片段管理 | 已实现，位于 Settings -> Data |
| 导入导出 | 已实现，支持 JSON / CSV |
| 备份恢复 | 已实现，含恢复前备份 |
| 敏感内容保护 | 已实现，支持标记、遮罩和跳过策略 |
| 监听暂停 / 隐私模式 | 已实现，并在主窗口显示状态 |
| Windows 来源忽略规则 | 已实现 |
| 外部服务能力 | 不在当前 MVP 范围内 |

## 常用开发命令

```powershell
pnpm install
pnpm tauri:dev
pnpm test -- --run
pnpm lint
pnpm build
cd src-tauri
cargo test
```

完整验证：

```powershell
pnpm verify
pnpm e2e
```

`pnpm verify` 覆盖前端 lint、Vitest、生产构建、Rust 格式检查、Clippy 和 Rust 测试。`pnpm e2e` 需要真实 Windows 桌面会话、`tauri-driver` 和 Microsoft Edge WebDriver。

## 后续方向

当前不建议继续扩大功能面。更合适的工作是：

- 修正文档中不准确或过度承诺的地方。
- 改进 README、发布说明和安装说明。
- 补充小范围回归测试，保护复制、搜索、粘贴、隐私状态和设置页折叠这些核心路径。
- 修复真实使用中暴露的剪贴板捕获、窗口行为、托盘或快捷键问题。

云同步、插件市场、账号体系、完整跨平台体验和真实数据库加密迁移都应留到 MVP 之后。

## 项目信息

- 许可证：[MIT](../LICENSE)
- 贡献指南：[CONTRIBUTING.md](../CONTRIBUTING.md)
- 最后更新：2026-05-28
