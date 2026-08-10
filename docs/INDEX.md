# Klip 文档索引

本文档是仓库内当前有效文档的入口。Klip 是 Windows-first 的本地剪贴板管理器；
产品边界、实现状态和发布准备分别由对应文档维护，避免在阶段计划和交接记录之间重复同步。

## 当前状态

| 项目 | 状态 |
|------|------|
| 当前公开版本 | `v0.2.0` |
| 已验证功能基线 | `main@14e1717` |
| 当前交付平台 | Windows 10+ |
| 当前产品形态 | 本地单机剪贴板管理器 |
| 数据存储 | 本机 SQLite 数据库 |
| 未处理 PR / 实现任务 | 无 |
| 当前发布系列 | `0.2.x` |

Foundation、核心剪贴板工作流和 Desktop E2E 稳定性改进均已合并。完成范围、验证证据
和明确保留的边界统一记录在 [DELIVERY_STATUS.md](DELIVERY_STATUS.md)。

## 推荐阅读顺序

| 顺序 | 文档 | 用途 |
|------|------|------|
| 1 | [README.md](../README.md) | 了解产品、安装方式、核心工作流和当前限制 |
| 2 | [DELIVERY_STATUS.md](DELIVERY_STATUS.md) | 查看当前交付结论、已合并 PR 和验证证据 |
| 3 | [PRD.md](PRD.md) | 确认 MVP 功能范围和验收口径 |
| 4 | [ARCHITECTURE.md](ARCHITECTURE.md) | 理解前端、后端、Tauri 和数据库模块 |
| 5 | [DATABASE.md](DATABASE.md) | 查看表结构、schema 迁移和数据恢复策略 |
| 6 | [API.md](API.md) | 查看 Tauri IPC 命令、事件和类型 |
| 7 | [DEVELOPMENT.md](DEVELOPMENT.md) | 搭建开发环境并运行验证脚本 |
| 8 | [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | 在确定版本后启动新的 Windows 发布验收 |
| 9 | [ROADMAP.md](ROADMAP.md) | 查看当前边界和后续方向 |

## 专题文档

| 文档 | 用途 |
|------|------|
| [HTTP_ROUTE_AUDIT.md](HTTP_ROUTE_AUDIT.md) | 本地 HTTP API 的路由、OpenAPI、看板和测试覆盖矩阵 |
| [MULTI_FORMAT_DESIGN.md](MULTI_FORMAT_DESIGN.md) | 文本、HTML、RTF、图片和文件剪贴板格式的设计依据 |
| [RELEASE_VALIDATION_v0.1.2.md](RELEASE_VALIDATION_v0.1.2.md) | 已发布 `v0.1.2` 的历史验收记录，不代表当前代码可直接发布 |

阶段性实施计划、逐提交进度、handoff 和 worktree 操作记录已从当前文档集移除。
它们描述的是已经完成的工作，继续保留会与现状冲突；需要审计时请查看 Git 历史和
PR #4、#5、#6。

## 当前工作原则

- 优先处理真实 Windows 使用反馈和核心路径缺陷，不继续扩大 MVP 功能面。
- 复制、搜索、粘贴、快捷键、托盘、隐私状态、数据恢复和设置保存必须有回归保护。
- macOS/Linux 真实桌面验收、签名、托管更新、云同步、插件、账号和数据库加密迁移
  不属于当前已交付能力。
- 下一次发布必须从新的版本决策和 [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) 开始，
  不复用已清理的旧构建产物。

## 项目信息

- 许可证：[MIT](../LICENSE)
- 贡献指南：[CONTRIBUTING.md](../CONTRIBUTING.md)
- 最后更新：2026-08-10
