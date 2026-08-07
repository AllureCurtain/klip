# Core Clipboard Workflows Progress

- 最后更新时间：2026-08-07（Asia/Shanghai）
- 当前状态：`COMPLETED`，Task 1-7 已完成，等待 PR checks
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
| 3 | 纯文本复制与粘贴 | `COMPLETED` | `feat: add plain text clipboard actions` |
| 4 | 统一详情与完整预览 | `COMPLETED` | `feat: add unified clipboard detail preview` |
| 5 | URL/邮箱/文件快捷动作 | `COMPLETED` | `feat: add clipboard content actions` |
| 6 | 可搜索自定义标题与备注、DB v7 | `COMPLETED` | `feat: add searchable clipboard annotations` |
| 7 | 全量验证、Windows 验收、推送和 PR | `COMPLETED` | `docs: finalize core workflow delivery` |

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

### Task 3：纯文本复制与粘贴

- 剪贴板 writer 现在显式区分 `PreserveFormats` 与 `PlainText`：原格式模式继续写入
  text/HTML/RTF，纯文本模式只写 `ClipboardItem.content`；非文本记录在抑制器 arming、
  `last_used` 更新和隐藏窗口之前返回 `invalid_input`。
- 新增 plain copy/plain paste 后端命令、前端 IPC wrapper 和 store 动作；文本条目提供
  独立的纯文本复制与粘贴图标，搜索框中的 `Ctrl+Enter` 对当前文本条目执行纯文本粘贴，
  批量选择模式和非文本条目不触发该动作。
- `docs/API.md` 和 `docs/ARCHITECTURE.md` 已登记 copy、paste、plain copy、plain paste
  的行为边界，英文与中文动作文案同步补齐。
- `pnpm test -- --run src/components/clipboard/clipboardListKeyboard.test.ts
  src/components/clipboard/ClipboardList.test.tsx src/components/clipboard/ClipboardItem.test.tsx
  src/stores/clipboardStore.test.ts src/lib/tauri.test.ts`：5 个测试文件、69 项通过。
- `cargo test clipboard::`：50 项通过；覆盖 preserve/plain formats 选择、纯文本类型拒绝，
  以及现有剪贴板、快照和数据库相关回归。
- `cargo test --test clipboard_format_test`：Windows 当前桌面 6 项通过；其中
  `writer_plain_text_mode_omits_html_and_rtf` 验证纯文本回写后 HTML/RTF 均不存在。
- `pnpm exec tsc -b --pretty false`、Task 3 前端 ESLint、`cargo fmt -- --check` 和
  `cargo clippy -- -D warnings`：通过。

### Task 4：统一详情与完整预览

- 新增唯一的 `ClipboardDetailDialog` 状态源：`ClipboardList` 按条目 ID 管理详情，所有
  行内预览按钮、图片缩略图和非可编辑区域的 Space 都进入同一对话框；详情打开期间列表
  不再接管键盘，Base UI Dialog 负责焦点边界和 Esc 关闭。
- 文本详情完整滚动显示 plain text；存在 HTML 时提供纯文本/富文本标签页，并复用
  DOMPurify 白名单清洗脚本、事件属性和危险协议。敏感遮罩开启时，文本、HTML、图片数据、
  OCR 和文件路径均不进入详情 DOM。
- 图片详情在稳定视口中支持 50%-400% 有界缩放、重置和放大后指针拖动，保留图片下载，
  并完整显示尺寸、格式与 OCR 状态/文本；控件不会改变对话框尺寸。
- 文件详情解析已保存路径列表和 metadata，逐项显示文件/文件夹类型、名称、大小和完整
  路径；长路径使用 `break-all` 与内部纵向滚动，页面级横向溢出被禁止。
- 详情共享原格式 copy/paste、文本 plain copy/plain paste，以及来源应用、窗口标题、
  捕获时间、大小和标签事实带；标题/备注字段将在按计划执行的 Task 6 中接入同一详情。
- 旧 `ImagePreview` 组件、测试与无引用 i18n 已删除，架构文档更新为统一详情组件。
- `pnpm test -- --run src/components/clipboard`：5 个测试文件、54 项通过，覆盖统一入口、
  键盘边界、富文本安全、敏感遮罩、图片交互、OCR、文件长路径和响应式约束。
- `pnpm exec tsc -b --pretty false`、Task 4 前端 ESLint 和 `pnpm build`：通过。

### Task 5：保守的内容快捷动作

- Rust 检测器返回类型化的 `{ kind, target }` 动作；执行命令只接收 item ID 与动作，重新从
  数据库加载条目、重新检测并要求动作精确匹配，伪造、过期或已变化目标不会执行。
- 文本按完整 HTTP/HTTPS URL、保守 ASCII 邮箱、存在的完整路径识别；危险/不支持协议、
  部分匹配和不存在路径均不提供动作。文件记录即使路径失效仍保留复制路径/文件名，只有
  现存目标提供打开和定位。
- URL、邮件和路径打开复用 `tauri-plugin-shell`；复制路径/文件名复用统一剪贴板 writer。
  Windows 定位以独立 OS 参数传递 `/select,` 和路径，macOS 使用 `open -R`，Linux 使用
  `xdg-open` 打开目录或父目录。
- 列表行只显示第一个打开类主动作，详情按文本目标或逐个文件显示完整动作；选择模式和
  敏感遮罩条目不会请求或渲染内容动作。
- `cargo test clipboard::actions::tests`：7 项通过；`cargo test
  platform::reveal::windows::tests`：1 项通过；`cargo fmt -- --check` 与
  `cargo clippy -- -D warnings`：通过。
- `pnpm test -- --run src/lib/tauri.test.ts
  src/components/clipboard/useClipboardContentActions.test.tsx
  src/components/clipboard/ClipboardItem.test.tsx
  src/components/clipboard/ClipboardDetailDialog.test.tsx
  src/components/clipboard/ClipboardList.test.tsx`：5 个测试文件、59 项通过。
- `pnpm exec tsc -b --pretty false`、Task 5 前端/E2E ESLint 与 `git diff --check`：通过。
- Windows 使用带空格和中文的真实临时路径完成桌面验收；最终执行
  `scripts/run-e2e.ps1 -SkipBuild`，搜索/粘贴、筛选后可见项快捷粘贴、Explorer 打开与
  定位共 3/3 通过。验收过程中先修复详情定位按钮缺少可访问名称、Explorer `/select,`
  参数拼接问题和 Selenium 异步按钮 stale-node 等待；修复后 Klip、tauri-driver、
  msedgedriver 均已停止。

### Task 6：可搜索的自定义标题与备注

- DB v7 为 `clipboard_items` 增加 nullable `custom_title` 与 `note`；v6 迁移和全新
  schema 修复路径都保证两列存在，旧记录保持 `NULL`。Rust、TypeScript 与 OpenAPI
  的 `ClipboardItem` 已同步字段。
- `update_clipboard_annotations` 对整体空白 trim，空值归一为 `NULL`；标题限制
  200 个 Unicode 字符，备注限制 10,000 个 Unicode 字符，超限和不存在记录分别
  返回 `invalid_input` 与 `not_found`。更新不改动原内容、hash 或 rich formats。
- 标题和备注已进入 Tantivy 增量索引、全量重建、启动指纹漂移检查以及 SQLite
  LIKE/精确 fallback；更新后发送 `clipboard-item-updated`，普通列表原位替换，活动
  搜索重新请求后端。
- JSON v1 导入导出保留 annotation，缺字段旧 JSON 默认为 `NULL`；v6 备份恢复
  为空 annotation，v7 备份原样保留并在缺列时修改当前库前拒绝。CSV v1 保持
  原固定表头，不扩展本轮范围。
- 统一详情通过铅笔图标编辑并保存标题/备注，前端使用 Unicode 字符计数且
  超限时禁用保存；列表有标题时优先显示标题，备注只显示低噪声图标。敏感遮罩
  开启时标题、备注和编辑按钮都不进入 DOM。
- `cargo test database::`：61 项通过；`cargo test annotations`：8 项通过，覆盖增量/重建/
  fallback、fingerprint 漂移、迁移、JSON、restore 和 OpenAPI。限值契约修正后重跑
  `cargo test update_annotations -- --test-threads=1`：2 项通过。
- `cargo test database::data_portability::tests`：24 项、`database::connection::tests`：13 项、
  `database::clipboard_query::tests`：5 项、`http::openapi::tests`：7 项通过。
- Task 6 前端定向 7 个文件、103 项测试通过；限值修正后单独重跑
  `ClipboardDetailDialog.test.tsx`：10 项通过。`pnpm exec tsc -b --pretty false`、Task 6
  ESLint、`pnpm build`、`cargo fmt -- --check`、`cargo clippy -- -D warnings` 与 `git diff --check`
  均通过。

### Task 7：集成审查、Windows 验收与 PR

- Task 1-6 各自保持独立 commit 边界；实现路径无 TODO/FIXME/HACK/XXX。内容
  动作新增的 `url 2.5.8` 直接依赖为 `MIT OR Apache-2.0`。EcoPaste 只参考
  Apache-2.0 行为/架构，muutot-Clipboard 只参考 AGPL-3.0 产品思路，本轮没有
  复制两者实现。
- `pnpm verify`：通过。ESLint 全库通过；Vitest 22 个文件、189 项通过；
  TypeScript/Vite 生产构建通过；Rust fmt/clippy 通过；Rust lib 169 项通过、1 项
  显式忽略的 100k 性能测试，main 2 项和 Windows clipboard integration 6 项通过。
- 最终 `pnpm e2e`：Windows 真实 Tauri/WebView2 桌面 5/5 通过。隔离的 data/log/
  HTTP port 下验证真实剪贴板捕获、经后端搜索后点击粘贴、当前可见
  项 `Ctrl+Alt+1`、搜索框 Enter 原格式粘贴、独立复制不隐藏 Tauri 主窗、详情
  仍可打开、Ctrl+Enter 纯文本粘贴、annotation 持久化与 note-only 搜索，以及
  带空格和中文的 Explorer 打开/定位。Task 3 的 Windows 集成测试同时确认
  plain 模式不写 HTML/RTF；IME 与详情敏感/内容类型边界由定向组件测试覆盖。
- E2E 首次是 3/4：annotation 用例在 150ms 防抖搜索前误命中旧列表，随后 loading
  卸载详情，且动作帮助器只识别 `aria-label` 而不识别文字按钮。已改为等待
  真正后端搜索结果、重新定位可能被 React 替换的节点，并同时按 aria/text
  可访问名称定位按钮；修正后 4/4 通过，再扩展键盘/copy/plain 桌面验收
  并统一稳定策略后 `-SkipBuild` 与正式全新构建均以 5/5 为最终门禁。
- 验收结束后确认无 Klip、tauri-driver、msedgedriver、Cargo、Vite 或 Explorer
  测试进程残留。

### PR review follow-up

- `e32e8b3` 剥离富文本预览中的 `href`，保留安全排版但禁止剪贴板 HTML 直接
  导航 Klip 主 WebView；普通 HTTPS 与危险协议链接都由组件测试确认不可导航。
- `58103cc` 在搜索和筛选刷新期间保留旧列表 DOM，加载/失败状态改为列表上方的
  紧凑状态条；选中 ID 和详情状态不再因 `loading` 被卸载。数字快捷键继续同步
  屏幕上实际显示的前九项，进入设置页时同步明确空快照。
- `6612da9` 让普通复制和纯文本复制返回明确成功结果；列表仅在 IPC 成功后显示
  “已复制”，失败继续写入统一错误状态且不再误报成功。
- review 定向验证分别为富文本/详情 41 项、App/列表 29 项、store/条目 56 项通过；
  ESLint、TypeScript 与 `git diff --check` 通过。
- review 后完整 `pnpm verify` 通过：Vitest 22 个文件、193 项通过，生产构建、Rust
  fmt/clippy、Rust lib 169 项（另 1 项显式忽略）、main 2 项和 Windows clipboard
  integration 6 项通过。
- review 后重新执行正式 `pnpm e2e`，Windows Tauri/WebView2 桌面 5/5 通过；结束后
  确认没有当前 worktree 的 Node、Cargo、Rust、Klip、tauri-driver 或 EdgeDriver
  进程残留。

## 阻塞与跳过

- 当前无实现或 Windows 验收阻塞。
- `SKIPPED` macOS 静态/桌面验收：已安装 `aarch64-apple-darwin` target 并执行
  `cargo check --target aarch64-apple-darwin --locked`；`objc2-exception-helper` 在 Windows
  主机找不到 target `cc`/Apple SDK。已确认 target 存在并让 Cargo 下载所需
  crate，没有重复原样命令。解除条件是 macOS + Xcode SDK，或可用的 Apple 交叉 C
  工具链/SDK。当前没有 macOS 真实桌面。
- `SKIPPED` Linux 静态/桌面验收：已安装 `x86_64-unknown-linux-gnu` target 并执行
  `cargo check --target x86_64-unknown-linux-gnu --locked`；缺少
  `x86_64-linux-gnu-gcc`，`pkg-config` 也没有 Linux sysroot/DBus 开发库。已让 Cargo
  进入 `zstd-sys`/`libdbus-sys` 构建脚本，没有重复原样命令。解除条件是 GNU
  交叉工具链、配套 sysroot/pkg-config 和 `libdbus-1-dev` 等系统依赖，或直接在
  Linux 主机检查。当前没有 Linux 真实桌面。

## 中断恢复步骤

1. 进入 `D:\Study\cc\klip\.worktrees\core-workflows`。
2. 完整读取实施计划和本进度文件。
3. 运行 `git status --short --branch`、`git log --oneline -12` 和相关进程检查。
4. 若工作树有改动，先理解并验证现有 WIP，禁止丢弃不明改动。
5. 七个 Task 均已 `COMPLETED`；后续只跟踪 PR checks 或根据 review 处理新反馈。
6. Task 完成前更新本文件的状态、测试证据、限制和下一步，并随代码一起提交。
7. 提交后确认工作树干净，再进入下一个 Task。

## 下一步准确操作

- 提交本次 review follow-up 文档并确认工作树干净，推送 `feat/core-workflows` 更新
  现有 PR #5。
- 等待 PR checks 全部成功后，按用户明确授权把 PR #5 合并到 `main`；不得绕过失败
  或未完成的 checks。
- 合并后确认远端 PR 状态、`origin/main` 提交和本地 worktree 状态，并向用户交付
  合并提交、Windows 证据和 macOS/Linux `SKIPPED` 边界。
