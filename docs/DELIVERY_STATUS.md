# Klip 交付状态

> 最后更新：2026-08-10（Asia/Shanghai）
> 已验证功能基线：`main@14e1717d4bc944dd6b3c14e2e4e86eb8c7745a4d`

本文档是当前代码交付状态的唯一摘要入口。详细产品行为、接口和数据结构分别以
`README.md`、`PRD.md`、`ARCHITECTURE.md`、`API.md` 和 `DATABASE.md` 为准。

## 当前结论

- Foundation 与核心剪贴板工作流已经全部合并到 `main`。
- 当前没有遗留实现任务或待处理 PR。
- Windows 本地验证、主分支 CI 和主分支 Desktop E2E 均通过。
- 当前阶段继续保持 Windows-first，优先处理真实使用反馈、核心路径回归和文档准确性。
- 当前 Windows 发布版本为 `v0.2.0`，版本元数据与 CHANGELOG 已统一。

## 已完成交付

| 交付 | PR / 提交 | 主要内容 |
|------|-----------|----------|
| Clipboard foundation | PR #4 / `8018ace` | clipboard-rs 统一后端、Tantivy + jieba 搜索、富文本、离线 OCR、跨平台焦点恢复和来源追踪、数据库 schema v6 |
| Core clipboard workflows | PR #5 / `a4fab19` | 搜索键盘闭环、可见项快捷粘贴、复制/粘贴分离、纯文本模式、统一详情、内容动作、可搜索标题备注、数据库 schema v7 |
| Desktop E2E reliability | PR #6 / `14e1717` | 按实际 WebView2 Runtime 安装同版本 EdgeDriver，并校验版本与 Microsoft 签名 |

## 最终验证证据

### 本地

- `pnpm verify`：通过。
- 前端：ESLint、22 个 Vitest 文件、193 项测试和生产构建通过。
- Rust：fmt、Clippy、169 项库测试（另 1 项显式性能测试忽略）、2 项 main 测试和
  6 项剪贴板集成测试通过。
- Windows `pnpm e2e`：5/5 通过，覆盖捕获/搜索/粘贴、可见项快捷键、标题备注搜索、
  copy/paste/plain-text 语义和经过校验的文件动作。

### GitHub Actions

| Workflow | Run | 结果 |
|----------|-----|------|
| `CI` on `main@14e1717` | `31365860754` | 成功：Windows/macOS/Ubuntu 前端及 Windows 后端/RustSec 全绿 |
| `Desktop E2E` on `main@14e1717` | `31365924522` | 成功：WebView2 `131.0.2903.86` 与 EdgeDriver `131.0.2903.86` 匹配，5 项通过 |

## 明确保留的边界

以下项目不是遗漏的当前实现任务：

- **Windows 分发：** `v0.2.0` 当前没有代码签名证书、时间戳配置或托管更新源；干净 Windows
  用户/VM 的安装、自启动和升级验收需在发布任务中重新执行。
- **macOS/Linux：** 已有部分实现和静态验证，但没有真实桌面整体验收，不作为当前
  MVP 交付承诺。
- **默认目录隔离验收：** Windows Known Folder API 不接受临时 `APPDATA` 覆盖；无环境
  变量的默认数据/日志目录测试需要隔离用户或 VM。
- **后续能力：** 云同步、插件市场、账号体系、真实数据库加密迁移和 AI 分类不在当前
  MVP 范围内。

## 下一阶段

1. 收集真实 Windows 使用反馈。
2. 保护复制、搜索、粘贴、快捷键、托盘、隐私状态和设置保存等核心路径。
3. 只修复影响 MVP 的小缺陷，不继续扩大功能面。
4. 需要发布时，单独从 `RELEASE_CHECKLIST.md` 开始新的发布任务。

已完成阶段的详细实施计划、逐提交进度和旧 handoff 已从当前文档集移除；如需审计，
可通过 Git 历史和 PR #4、#5、#6 查看完整记录。
