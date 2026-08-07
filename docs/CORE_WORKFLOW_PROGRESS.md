# Core Clipboard Workflows Progress

- 最后更新时间：2026-08-07（Asia/Shanghai）
- 当前状态：`IN_PROGRESS`，Task 1-2 已完成，下一步执行 Task 3
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
| 1 | 搜索键盘闭环、复制/粘贴分离 | `COMPLETED` | `fix: complete keyboard clipboard workflow` |
| 2 | 数字快捷键绑定当前可见记录 | `COMPLETED` | `fix: align quick paste with visible history` |
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

### Task 1：搜索键盘闭环、复制/粘贴分离

- 搜索输入通过 `data-clipboard-search-input` 明确交接 ArrowUp、ArrowDown 和 Enter；
  IME composition、key code 229、修饰键及其他可编辑控件保持原生行为。
- 列表用条目 ID 保留键盘选中项，结果重排时保持同一条，条目消失时回到第一条，空列表
  不生成负索引或调用剪贴板动作；批量选择模式的 Enter 只切换选择。
- store 现在显式区分 `copyItem` 与 `pasteItem`：整行点击/Enter 调用 paste，独立复制图标
  调用 copy，只有显式复制显示“已复制”反馈。
- `pnpm test -- --run src/components/layout/Header.test.tsx
  src/components/clipboard/clipboardListKeyboard.test.ts
  src/components/clipboard/ClipboardList.test.tsx
  src/components/clipboard/ClipboardItem.test.tsx src/stores/clipboardStore.test.ts
  src/lib/tauri.test.ts`：6 个测试文件、82 项测试通过。
- `pnpm exec tsc -b --pretty false`：通过。
- 对 Task 1 变更文件运行 `pnpm exec eslint ...`：通过。
- worktree 移动后原 `node_modules` 缺少根级依赖链接，首次测试报
  `Cannot find module ...\node_modules\vitest\vitest.mjs`；已在不修改锁文件的前提下用
  `pnpm install --offline --frozen-lockfile --force` 从本地 pnpm store 恢复，随后测试通过。

### Task 2：数字快捷键绑定当前可见记录

- 新增进程内 `VisibleClipboardItems`：`None` 表示前端从未同步，`Some([])` 表示明确空
  结果；快照只保留前 9 个正整数 ID，并按一基位置解析。
- App 在搜索、类型、收藏、标签、日期筛选或有序结果变化后同步 `items.slice(0, 9)`；
  快捷键按快照 ID 重新读取数据库，已删除 ID 和越界位置不回退到其他记录。
- `pnpm test -- --run src/App.test.tsx src/lib/tauri.test.ts`：2 个测试文件、21 项通过，
  覆盖前九条、明确空快照及搜索/类型/收藏/标签/日期筛选后的重新同步。
- `cargo test hotkey::visible_items::tests`：3 项通过；`cargo test clipboard::paste::tests`：
  6 项通过，覆盖未初始化数据库回退、快照顺序、明确空结果和已删除 ID。
- `pnpm exec tsc -b --pretty false`、Task 2 前端 ESLint、`cargo fmt` 和
  `cargo clippy -- -D warnings`：通过。
- `pnpm e2e`：通过，Windows 隔离数据/日志目录下 2 个桌面用例通过；新增用例先建立
  搜索后的唯一可见项，再写入数据库最新 sentinel，真实发送 `Ctrl+Alt+1` 后系统剪贴板
  得到可见项。日志记录 `Quick paste index 1` 与 `pasted item at position 1`，验收后 Klip、
  tauri-driver、msedgedriver 均已停止。
- 首次 Rust 测试因移动 worktree 后 `target` 仍引用 `.worktrees\foundation` 失败；只执行
  `cargo clean -p tauri` 和 `cargo clean -p klip` 后恢复。首次 E2E 又因 EdgeDriver 148 与
  WebView2 151 不匹配而无法创建会话；使用 winget 更新到 EdgeDriver `151.0.4129.72`
  后解除阻塞并通过完整 E2E。

## 阻塞与跳过

- 当前无实现阻塞。
- 预期平台限制：没有 macOS/Linux 真实桌面。只有在对应 Task 到达验收阶段后才记录
  `SKIPPED`，并写清已经完成的编译或单元测试，不能提前标记通过。

## 中断恢复步骤

1. 进入 `D:\Study\cc\klip\.worktrees\core-workflows`。
2. 完整读取实施计划和本进度文件。
3. 运行 `git status --short --branch`、`git log --oneline -12` 和相关进程检查。
4. 若工作树有改动，先理解并验证现有 WIP，禁止丢弃不明改动。
5. 从表格中第一个非 `COMPLETED` Task 继续；当前应从 Task 3 开始。
6. Task 完成前更新本文件的状态、测试证据、限制和下一步，并随代码一起提交。
7. 提交后确认工作树干净，再进入下一个 Task。

## 下一步准确操作

- 从 Task 3 开始，为 preserve/plain 写入模式、非文本拒绝和前端 plain copy/paste wrapper
  先补失败测试。
- 不提前实现 Task 4-6，也不改发布、导入导出、隐私产品化或 P2 功能。
