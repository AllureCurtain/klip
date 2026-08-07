# Core Clipboard Workflows Progress

- 最后更新时间：2026-08-07（Asia/Shanghai）
- 当前状态：`PREPARED`，尚未开始功能实现
- 分支：`feat/core-workflows`
- worktree：`D:\Study\cc\klip\.worktrees\core-workflows`
- 基线：`8018aced3cd6b1437a4f8bb681206389d66c68f8`
- 实施计划：
  [`docs/superpowers/plans/2026-08-07-core-clipboard-workflows.md`](superpowers/plans/2026-08-07-core-clipboard-workflows.md)

## 执行约束

- 只使用当前主 Agent，禁止调用、创建或委派子 Agent。
- 只使用当前 worktree，不创建额外 worktree 或并行功能分支。
- Task 串行执行；每个 Task 针对性验证、更新本文件并 commit 后再继续。
- 最终只推送并创建 PR，不直接合并 `main`。
- macOS/Linux 没有真实桌面，只保留代码和可执行的静态验证，不声称实机通过。

## 已完成准备

- [x] 确认 `main` 与 `origin/main` 都位于 `8018ace`，当前主工作区干净。
- [x] 确认旧 `feat/foundation` 为 `main` 祖先且旧 worktree 干净。
- [x] 将 `.worktrees/foundation` 移至 `.worktrees/core-workflows`，保留构建缓存。
- [x] 从最新 `main` 创建 `feat/core-workflows`，没有增加活动 worktree 数量。
- [x] 只读对比 EcoPaste `6dbbf4f1` 与 muutot-Clipboard `b9c5dc09`。
- [x] 固定本轮范围、交互契约、数据库边界、测试矩阵和提交顺序。
- [x] 将 foundation 策略标记为历史记录，并把当前文档加入索引。

准备文档的 commit 即为包含本文件初始版本的提交；恢复时可通过
`git log -- docs/CORE_WORKFLOW_PROGRESS.md` 获取准确 SHA。

## 串行任务状态

| Task | 内容 | 状态 | 目标提交 |
| --- | --- | --- | --- |
| 1 | 搜索键盘闭环、复制/粘贴分离 | `PENDING` | `fix: complete keyboard clipboard workflow` |
| 2 | 数字快捷键绑定当前可见记录 | `PENDING` | `fix: align quick paste with visible history` |
| 3 | 纯文本复制与粘贴 | `PENDING` | `feat: add plain text clipboard actions` |
| 4 | 统一详情与完整预览 | `PENDING` | `feat: add unified clipboard detail preview` |
| 5 | URL/邮箱/文件快捷动作 | `PENDING` | `feat: add clipboard content actions` |
| 6 | 可搜索自定义标题与备注、DB v7 | `PENDING` | `feat: add searchable clipboard annotations` |
| 7 | 全量验证、Windows 验收、推送和 PR | `PENDING` | `docs: finalize core workflow delivery` |

状态只允许使用：`PENDING`、`IN_PROGRESS`、`COMPLETED`、`SKIPPED`、`BLOCKED`。
只有代码、测试和针对性验证都完成后才可标记 `COMPLETED`。

## 当前证据

### 仓库与 worktree

- `git status --short --branch`：`## feat/core-workflows`，准备前无未提交代码。
- 旧 `feat/foundation` head：`273ba0d`，已是 `main` 的祖先。
- 当前基线包含已合并 PR #4：`8018ace feat: complete foundation clipboard architecture (#4)`。

### 已核实的现状

- `Header.tsx` 搜索框使用 `autoFocus`。
- `ClipboardList.tsx` 对事件目标为 `INPUT` 时直接返回，因此搜索后方向键/Enter 断裂。
- `clipboardStore.copyItem` 实际调用 `clipboardApi.paste`，命名、反馈和行为不一致。
- 后端已经同时提供 `copy_to_clipboard` 与 `paste_from_clipboard`，可以在现有边界内修复。
- `clipboard::paste::load_item_by_quick_paste_index` 固定调用数据库最近列表，不读取当前筛选结果。
- `ClipboardItem` 已把列表序号传入组件但未使用；本轮不增加常驻快捷键说明文字。
- 当前只有图片预览对话框；文本截断、文件无完整详情，图片没有缩放/拖动。
- DB 当前为 v6；Tantivy searchable text 当前由 content/preview/OCR 组成。

### 参考边界

- EcoPaste：Apache-2.0，可参考行为和架构。
- muutot-Clipboard：AGPL-3.0，只参考功能思路，禁止复制实现代码。
- EcoPaste 的键盘交接、纯文本粘贴、预览和备注已在代码中确认。
- muutot-Clipboard 的 filtered item 数字动作、详情面板和内容动作已在代码中确认。

## 测试与验收记录

当前尚未修改功能代码，因此未新增功能测试结果。准备提交只运行文档/工作树检查；每个
Task 的实际命令、结果和环境证据必须追加在本节，不能用计划中的“预期”代替“通过”。

## 阻塞与跳过

- 当前无实现阻塞。
- 预期平台限制：没有 macOS/Linux 真实桌面。只有在对应 Task 到达验收阶段后才记录
  `SKIPPED`，并写清已经完成的编译或单元测试，不能提前标记通过。

## 中断恢复步骤

1. 进入 `D:\Study\cc\klip\.worktrees\core-workflows`。
2. 完整读取实施计划和本进度文件。
3. 运行 `git status --short --branch`、`git log --oneline -12` 和相关进程检查。
4. 若工作树有改动，先理解并验证现有 WIP，禁止丢弃不明改动。
5. 从表格中第一个非 `COMPLETED` Task 继续；当前应从 Task 1 开始。
6. Task 完成前更新本文件的状态、测试证据、限制和下一步，并随代码一起提交。
7. 提交后确认工作树干净，再进入下一个 Task。

## 下一步准确操作

- 从 Task 1 开始，先为搜索输入键盘交接、IME 和 copy/paste 分离补失败测试。
- 不提前实现 Task 2-6，也不改发布、导入导出、隐私产品化或 P2 功能。
