# Klip Core Clipboard Workflows Implementation Plan

> **状态：ACTIVE / PREPARED**
>
> 本文档是本轮实现的唯一范围与验收依据。执行期间不得另开功能分支、不得创建额外
> worktree、不得调用子 Agent。所有任务由当前主 Agent 在同一对话中串行完成。

- 创建日期：2026-08-07（Asia/Shanghai）
- 基线：`main` at `8018aced3cd6b1437a4f8bb681206389d66c68f8`
- 分支：`feat/core-workflows`
- worktree：`D:\Study\cc\klip\.worktrees\core-workflows`
- 参考代码版本：EcoPaste `6dbbf4f1`，muutot-Clipboard `b9c5dc09`
- 持续记录：[`docs/CORE_WORKFLOW_PROGRESS.md`](../../CORE_WORKFLOW_PROGRESS.md)

## 1. 目标

在不扩展账号、云同步、导入导出、隐私产品化和发布工作的前提下，补齐 Klip 日常使用
最直接的七个缺口：

1. 搜索输入状态下完整的键盘选择与粘贴闭环。
2. `Ctrl+Alt+1..9` 与当前界面前九条可见记录严格一致。
3. 明确区分“只复制到系统剪贴板”和“立即粘贴到原应用”。
4. 为文本、富文本、图片、文件和 OCR 提供统一完整预览。
5. 为链接、邮箱和文件路径提供保守、可预测的快捷动作。
6. 为文本条目提供纯文本复制和纯文本粘贴。
7. 为历史条目提供可搜索的自定义标题和备注。

完成后的核心流程应当是：

```text
Ctrl+Alt+K 唤起
      -> 搜索框直接输入（含中文 IME）
      -> ArrowUp / ArrowDown 选择
      -> Enter 原格式粘贴，Ctrl+Enter 纯文本粘贴
      -> 或打开详情，执行复制、粘贴、打开、定位、备注等动作
```

## 2. 执行纪律

### 2.1 单执行上下文

- WIP 始终为 1，只使用本计划声明的 worktree 和分支。
- 禁止调用、创建或委派任何子 Agent；主 Agent 串行阅读、实现、测试、审查和写文档。
- 不同时运行两个 Klip 桌面实例，避免全局快捷键、焦点恢复和剪贴板抑制互相干扰。
- 复用现有 `target/` 与 `node_modules/`；除非有可证明的缓存损坏，不删除构建目录。

### 2.2 分段提交与持续记录

- 严格按 Task 1 到 Task 7 的顺序推进；一个 Task 验证并提交后才进入下一个。
- 每个提交同时包含该功能的代码、测试、必要文档和进度记录，保持提交可独立审查。
- 提交前必须运行该 Task 的针对性测试与 `git diff --check`，提交后工作树必须干净。
- 实现过程中持续更新 `docs/CORE_WORKFLOW_PROGRESS.md`，写清状态、测试、限制和下一步。
- 若执行中断，恢复时以 Git 历史和进度文档为准，不依赖聊天上下文。
- 所有内容完成后运行全量验证，推送本分支并创建面向 `main` 的 PR；不得直接合并。

### 2.3 阻塞处理

- 代码、单元测试、Windows 当前桌面验收属于本轮必须尽力完成的内容。
- 只有缺少操作系统、外部应用、驱动或权限等真实环境条件时，才可记为
  `SKIPPED` 或 `BLOCKED`。
- 阻塞记录必须包含：失败命令、关键错误、已经尝试的方案和解除条件。
- 一个环境验收阻塞不得中断整个任务；记录后继续下一个不依赖该环境的部分。
- 当前只有 Windows 真实桌面。macOS/Linux 保留实现与可执行的静态编译/单元测试，
  不声称完成真实桌面验收。

## 3. 范围边界

### 3.1 本轮包含

| 优先级 | 能力 | 当前问题 | 本轮结果 |
| --- | --- | --- | --- |
| P0 | 搜索键盘闭环 | 搜索框聚焦时列表忽略键盘事件 | 搜索输入后可直接方向键选择并 Enter 粘贴 |
| P0 | 可见列表数字快捷键 | 后端固定读取数据库最近第 N 条 | 快捷键使用前端同步的当前前九条可见 ID |
| P0 | 复制/粘贴分离 | UI 的 `copyItem` 实际调用 paste | 主动作语义、命名和反馈一致，提供独立复制 |
| P1 | 完整预览 | 文本截断，图片预览能力有限，文件无详情 | 统一详情对话框覆盖全部现有内容类型 |
| P1 | 内容快捷动作 | URL、邮箱、文件路径没有打开/定位动作 | 提供经过类型校验的有限动作集合 |
| P1 | 纯文本模式 | 富文本只能完整回放 | 文本可只写 plain text 并选择复制或粘贴 |
| P1 | 标题/备注 | 历史条目不可补充个人语义 | DB v7 持久化并进入搜索索引 |

### 3.2 明确排除

- 导入导出功能扩建、隐私管理重做、账号、云同步和发布版本工作。
- 来源应用筛选、来源应用图标、保留期限、单条捕获大小限制。
- 排序模式、列表密度、回收站、置顶、拖出条目和自定义鼠标行为。
- 电话、颜色、日期、货币、IP 等广义内容识别。
- 任意代码执行、任意协议打开和未经确认的批量文件操作。
- 新建一套“分组”系统；现有标签继续承担自定义分类。

### 3.3 参考项目边界

- EcoPaste 使用 Apache-2.0，可参考架构与行为，但若复用代码必须满足许可证声明要求。
- muutot-Clipboard 使用 AGPL-3.0，只参考产品行为和测试思路，不复制其实现到 Klip 的
  MIT 代码库；Klip 的实现必须独立设计和重写。
- 参考项目 README 与代码可能不同步，验收只采用已核实的代码行为。

## 4. 固定交互契约

| 场景 | 动作 | 结果 |
| --- | --- | --- |
| 普通模式单击条目 | 主操作 | 保留现有格式并立即粘贴，窗口隐藏 |
| 条目或详情中的复制按钮 | `copy` | 写入系统剪贴板，不模拟粘贴，不隐藏窗口 |
| 搜索框输入普通字符/空格 | 原生输入 | 不触发列表动作 |
| 搜索框按方向键 | 列表导航 | 移动当前选中项并滚动到可见位置 |
| 搜索框按 Enter | `paste` | 粘贴当前选中项；IME 组合输入期间不得触发 |
| 搜索框按 Ctrl+Enter | `pastePlainText` | 仅文本条目可用；其他类型不执行 |
| 非可编辑区域按 Space | `preview` | 打开当前选中项详情 |
| 其他 input/textarea/contenteditable | 原生行为 | 不接管键盘事件 |
| 批量选择模式按 Enter | `toggleSelected` | 不复制、不粘贴 |
| `Ctrl+Alt+N`，N 为 1..9 | `quickPaste` | 粘贴最后一次同步的当前可见第 N 条 |

选中状态在结果刷新时按 ID 保留；原选中 ID 不再存在时回到第一条。空列表不得产生
`-1` 索引或调用任何剪贴板动作。

## 5. 技术设计

### 5.1 键盘事件归属

- `ClipboardList` 继续拥有当前选中项和虚拟列表滚动，不在多个组件重复注册同一快捷键。
- 搜索输入框增加明确的 data attribute，列表只接管该输入框的方向键、Enter 和
  Ctrl+Enter；其他可编辑控件始终返回原生行为。
- 处理 `KeyboardEvent.isComposing` 和 key code 229，避免中文 IME 确认候选时误粘贴。
- 将“事件是否应接管”提取为纯函数并单测，避免依赖整棵 React 组件树验证边界。

### 5.2 可见列表快捷粘贴快照

- 后端新增进程内 `VisibleClipboardItems` 状态，内部保存 `Option<Vec<i64>>`，最多 9 个 ID。
- 前端每次 `items` 的有序结果改变后，通过 Tauri IPC 同步前九个 ID；筛选结果为空时
  同步空数组。
- `None` 只表示前端尚未完成首次初始化，此时为保持启动期兼容可回退数据库最近记录；
  一旦前端同步过，后端不得越过当前快照去读取未显示的记录。
- 快捷键按位置解析 ID 后仍从数据库重新加载条目；条目已经删除时只记录 warning，
  不回退到另一条，避免粘贴错误内容。
- 快照是运行时 UI 状态，不进入 SQLite，不增加数据库迁移。

### 5.3 剪贴板写入模式

- 将现有写入路径扩展为明确的 `PreserveFormats` 与 `PlainText` 两种模式。
- `PreserveFormats` 继续写入 text/html/rtf；`PlainText` 只写 `ClipboardItem.content`，
  不把 HTML/RTF 放入系统剪贴板。
- 纯文本命令只接受 `content_type == text`。图片、文件不会被隐式转换。
- 两种模式都必须继续使用现有哈希抑制和 `touch_last_used`，不能直接新建 clipboard-rs
  context 绕过 `clipboard::writer`。

### 5.4 统一详情预览

- 新建 `ClipboardDetailDialog`，替换仅图片可用的孤立预览入口。
- 文本：完整可滚动纯文本；存在 HTML 时提供“纯文本/富文本”标签页，富文本继续使用
  DOMPurify 白名单，禁止脚本、事件属性和危险协议。
- 图片：显示原图、尺寸/格式/OCR，提供放大、缩小、重置；放大后支持指针拖动，控件不
  改变对话框尺寸。
- 文件：解析现有 metadata 和 JSON 路径列表，显示完整条目、类型、大小和路径。
- 所有类型共享来源、时间、大小、标签、自定义标题/备注及适用动作。
- 敏感内容遮罩规则在列表和详情中保持一致；详情不得绕过现有配置直接泄露内容。

### 5.5 内容识别与系统动作

- 新增纯 Rust 检测模块，输出有限、可序列化的动作枚举；前端只负责本地化和展示。
- 文本只识别完整 trim 后内容为 `http`/`https` URL、合法邮箱或当前存在的单一路径；
  不扫描长文本中的任意片段，不允许 `javascript:`、`data:` 等协议。
- 文件条目从已保存的 JSON 路径列表生成打开、定位、复制路径和复制文件名动作。
- 执行动作时后端按 item ID 重新加载和重新检测，不能信任前端传入任意路径或 URL。
- URL/邮箱/普通打开复用现有 `tauri-plugin-shell`；定位动作使用分平台参数化命令：
  Windows Explorer、macOS `open -R`、Linux 打开父目录。不得拼接 shell 字符串。
- Windows 做真实打开/定位验收；macOS/Linux 只做纯检测测试和可用条件下的编译检查。

### 5.6 自定义标题与备注

- DB v7 为 `clipboard_items` 增加 nullable `custom_title` 与 `note`，空白保存为 NULL。
- 标题最多 200 个 Unicode 字符，备注最多 10,000 个 Unicode 字符；后端统一验证。
- 编辑不修改原始 `content`、`hash` 或富文本 formats，避免历史内容与哈希失配。
- 标题和备注进入 Tantivy 文档及 SQLite LIKE/精确匹配回退；更新后立即重建该条索引。
- API 返回更新后的完整 `ClipboardItem`，前端原位 upsert；必要时发出
  `clipboard-item-updated` 维持其他消费者一致。
- 新字段使用 serde default，旧 JSON 数据仍可反序列化。现有 CSV 功能不在本轮扩建，
  但不得因新增字段破坏原有 CSV/JSON/数据库备份测试。

## 6. 串行任务与提交边界

### Task 1：完成搜索键盘闭环并分离复制/粘贴

**主要文件：**

- `src/components/layout/Header.tsx`
- `src/components/clipboard/ClipboardList.tsx`
- `src/components/clipboard/ClipboardItem.tsx`
- `src/components/clipboard/useClipboardItemActions.ts`
- `src/stores/clipboardStore.ts`
- `src/lib/tauri.ts`
- 对应 Vitest 与中英文 i18n 文件

**实现清单：**

- [ ] 为搜索输入标记可交接的键盘来源。
- [ ] 支持搜索框内 ArrowUp/ArrowDown/Enter，包含空列表、结果刷新和 IME 边界。
- [ ] 把 store 中当前误名的 `copyItem` 改为 `pasteItem`，实际复制使用 `clipboardApi.copy`。
- [ ] 保持单击/Enter 立即粘贴，增加可访问的独立复制图标动作。
- [ ] 复制反馈只表示复制；粘贴后窗口隐藏，不显示错误的“已复制”状态。
- [ ] 补 ClipboardList、ClipboardItem、store 和 IPC wrapper 回归测试。
- [ ] 更新进度文档并执行针对性测试、`git diff --check`。

**建议提交：** `fix: complete keyboard clipboard workflow`

### Task 2：让数字快捷键绑定当前可见条目

**主要文件：**

- `src/App.tsx`
- `src/lib/tauri.ts`
- `src-tauri/src/hotkey/manager.rs`
- 新建 `src-tauri/src/hotkey/visible_items.rs`
- `src-tauri/src/clipboard/paste.rs`
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/main.rs`

**实现清单：**

- [ ] 新增有界快照状态及 set/get/按位置解析单元测试。
- [ ] 新增 IPC，同步当前有序 `items.slice(0, 9)` 的 ID。
- [ ] 区分未初始化、已同步空结果和已有结果。
- [ ] 快捷键通过快照 ID 粘贴；已删除 ID 不替换为其他内容。
- [ ] 覆盖搜索、类型、收藏、标签、日期筛选改变时的同步测试。
- [ ] Windows 隔离数据目录下验证筛选结果与快捷键目标一致。
- [ ] 更新 README/PRD 中“可见记录”的实现证据和进度文档。

**建议提交：** `fix: align quick paste with visible history`

### Task 3：增加纯文本复制与粘贴

**主要文件：**

- `src-tauri/src/clipboard/writer.rs`
- `src-tauri/src/clipboard/paste.rs`
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/main.rs`
- `src/lib/tauri.ts`
- `src/stores/clipboardStore.ts`
- `src/components/clipboard/ClipboardList.tsx`
- `src/components/clipboard/ClipboardItem.tsx`

**实现清单：**

- [ ] 增加 preserve/plain 写入模式，保持哈希抑制和 last_used 更新。
- [ ] 增加 plain copy 与 plain paste Tauri 命令及类型化前端 wrapper。
- [ ] Ctrl+Enter 从搜索输入粘贴当前文本条目的纯文本。
- [ ] 条目动作中只对文本显示纯文本选项；Task 4 的详情复用同一动作。
- [ ] 非文本调用返回 `invalid_input`，不静默转换。
- [ ] Rust 覆盖 formats 选择逻辑；Windows 集成测试检查 HTML/RTF 不进入 plain clipboard。
- [ ] 更新 API 文档、i18n 和进度记录。

**建议提交：** `feat: add plain text clipboard actions`

### Task 4：建立统一详情与完整预览

**主要文件：**

- 新建 `src/components/clipboard/ClipboardDetailDialog.tsx`
- 可按内容拆分 `src/components/clipboard/details/*`
- `src/components/clipboard/ClipboardItem.tsx`
- `src/components/clipboard/ClipboardList.tsx`
- `src/components/clipboard/renderers/*`
- 复用或替换 `src/components/clipboard/ImagePreview.tsx`
- 对应 Vitest 和 i18n 文件

**实现清单：**

- [ ] 所有条目提供明确的预览按钮，非可编辑区域 Space 打开当前条目。
- [ ] 文本完整显示，plain/rich 标签页与 DOMPurify 安全回归测试通过。
- [ ] 图片实现有界缩放、重置和放大后拖动，OCR 文本完整可读。
- [ ] 文件显示完整路径列表及现有 metadata，不因长路径产生水平页面溢出。
- [ ] 详情展示来源、时间、大小、标签和适用的 copy/paste/plain 动作。
- [ ] 敏感遮罩、焦点陷阱、Esc 关闭和小窗口尺寸通过组件测试。
- [ ] 删除旧预览死代码，保持一个详情状态来源。

**建议提交：** `feat: add unified clipboard detail preview`

### Task 5：增加保守的内容快捷动作

**主要文件：**

- 新建 `src-tauri/src/clipboard/actions.rs`
- 按需新增 `src-tauri/src/platform/reveal/*`
- `src-tauri/src/clipboard/mod.rs`
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/main.rs`
- `src-tauri/Cargo.toml` 与 `src-tauri/Cargo.lock`（若增加 URL 解析直接依赖）
- `src/lib/tauri.ts`、`src/types/index.ts`
- `src/components/clipboard/ClipboardDetailDialog.tsx`
- `src/components/clipboard/ClipboardItem.tsx`

**实现清单：**

- [ ] 先写检测器失败测试：安全 URL、危险协议、邮箱、存在/不存在路径、文件列表。
- [ ] 返回类型化动作，不返回后端拼好的本地化文案。
- [ ] 执行前按 item ID 重新检测并校验动作与目标。
- [ ] 支持打开 URL、写邮件、打开文件/文件夹、定位文件、复制路径/文件名。
- [ ] 多文件详情逐项执行；列表行只展示不会拥挤的主要动作，其余留在详情。
- [ ] Windows 用带空格和非 ASCII 的临时路径做真实打开/定位验收并清理测试进程。
- [ ] macOS/Linux 分支可编译；没有真实桌面则按规则记录 SKIPPED。

**建议提交：** `feat: add clipboard content actions`

### Task 6：增加可搜索的自定义标题与备注

**主要文件：**

- `src-tauri/src/database/mod.rs`
- `src-tauri/src/database/schema.rs`
- `src-tauri/src/database/migrations.rs`
- `src-tauri/src/database/types.rs`
- `src-tauri/src/database/clipboard.rs`
- `src-tauri/src/database/clipboard_query.rs`
- `src-tauri/src/database/data_portability.rs`
- `src-tauri/src/search/mod.rs`
- `src-tauri/src/commands/mod.rs`、`src-tauri/src/main.rs`
- `src-tauri/src/http/openapi.rs`（模型字段保持一致）
- `src/types/index.ts`、`src/lib/tauri.ts`、`src/stores/clipboardStore.ts`
- `src/components/clipboard/ClipboardDetailDialog.tsx`、`ClipboardItem.tsx`

**实现清单：**

- [ ] 添加 DB v7 migration 与全新数据库 schema 修复路径。
- [ ] 为 Rust/TypeScript `ClipboardItem` 增加 nullable `custom_title`、`note`。
- [ ] 新增 update command，统一 trim、长度校验、空值归一化和 not-found 错误。
- [ ] 更新查询列、row mapping、测试 fixture、JSON 兼容和 OpenAPI schema。
- [ ] Tantivy 增量索引、重建指纹和 SQLite fallback 都包含标题/备注。
- [ ] 更新后前端原位刷新；活动搜索在标题/备注变化后重新请求后端。
- [ ] 详情内编辑与保存；列表有标题时优先显示标题，并提供低噪声备注标识。
- [ ] 验证 v6 -> v7、全新 DB、旧 JSON、备份恢复和搜索重建。
- [ ] 更新 DATABASE/API/ARCHITECTURE/README/CHANGELOG 和进度记录。

**建议提交：** `feat: add searchable clipboard annotations`

### Task 7：集成审查、Windows 验收与 PR

**实现清单：**

- [ ] 审查 Task 1-6 的提交边界、错误处理、许可证边界和遗留 TODO。
- [ ] 运行 `pnpm verify`，任何失败必须修复或形成有解除条件的环境阻塞记录。
- [ ] 使用隔离 `KLIP_DATA_DIR`、`KLIP_LOG_DIR`、`KLIP_HTTP_PORT` 运行 Windows
  `tauri:dev`，走通搜索键盘、copy/paste、plain paste、详情、动作、备注和快捷键。
- [ ] 验收后停止 Klip、Vite、Cargo、WebView、临时目标窗口和测试辅助进程。
- [ ] 在已安装 target 可用时执行 macOS/Linux 静态检查；真实桌面继续明确 SKIPPED。
- [ ] 更新本文档勾选项、进度文档、README/PRD/API/DATABASE/CHANGELOG。
- [ ] 工作树干净后推送 `feat/core-workflows`。
- [ ] 创建面向 `main` 的 PR，描述包含 commit 清单、测试证据、DB v7、平台边界和
  EcoPaste/muutot 参考许可证边界。
- [ ] 不直接合并 PR；把 PR URL 和 checks 状态交给用户。

**建议提交：** `docs: finalize core workflow delivery`

## 7. 测试矩阵

| 层级 | 必须覆盖 |
| --- | --- |
| 纯前端单测 | 键盘事件路由、IME、选中项、动作可见性、详情各内容类型、敏感遮罩、长内容布局 |
| Rust 单测 | 快照位置、plain/preserve 选择、内容检测与拒绝、annotation 校验、DB v7、搜索同步 |
| 数据兼容 | v6 -> v7、全新 DB、旧 JSON 反序列化、备份恢复、Tantivy 漂移重建 |
| IPC/API | 新命令注册、参数命名、错误码、OpenAPI ClipboardItem 字段 |
| Windows 桌面 | 搜索到粘贴、可见第 N 条、复制不隐藏、纯文本无富格式、详情、打开/定位、备注搜索 |
| 最终门禁 | `pnpm verify`、`git diff --check`、干净 worktree、PR checks |

针对性命令按 Task 选择，最终必须执行：

```powershell
pnpm verify
pnpm e2e
git diff --check
git status --short --branch
```

`pnpm e2e` 若受 EdgeDriver 或真实桌面条件阻塞，不能用单元测试冒充通过；应记录阻塞后
继续用可控的 `tauri:dev` Windows 目标窗口完成手工/自动化运行时证据。

## 8. 完成定义

只有同时满足以下条件才可声称本轮完成：

- 七个范围内能力全部实现，Task 1-6 各自形成独立可审查 commit。
- 搜索框聚焦时可以连续完成“输入 -> 选择 -> 粘贴”，中文 IME 不误触发。
- 数字快捷键与当前可见前九条一致，不会回退粘贴另一条内容。
- copy、paste、plain copy、plain paste 的 UI 文案、行为和错误处理一致。
- 文本、富文本、图片、文件、OCR 都有完整详情，危险 HTML 仍被清洗。
- 内容动作仅对通过检测的目标开放，危险协议和不存在路径不会执行。
- DB v7 与搜索索引、旧数据、备份恢复兼容；标题和备注可搜索。
- `pnpm verify` 通过，Windows 当前环境可执行的桌面验收通过。
- macOS/Linux 未实机验证的边界明确记录，不误报通过。
- 进度文档完整，分支已推送并创建 PR，未直接合并 `main`。

## 9. 新对话恢复指令

新对话只需发送以下内容：

```text
请在 D:\Study\cc\klip\.worktrees\core-workflows 中继续完成 Klip 基础剪贴板工作流任务。
先完整读取 docs/superpowers/plans/2026-08-07-core-clipboard-workflows.md 和
docs/CORE_WORKFLOW_PROGRESS.md，再检查 git status、git log 和当前进程。
严格按计划中第一个未完成 Task 串行继续：禁止子 Agent，禁止额外 worktree；每完成一个
Task 都运行针对性测试、更新进度文档并 commit，提交后保持工作树干净。遇到真实环境
阻塞时记录错误、尝试和解除条件，然后继续其他不依赖项，不要中断整轮任务。全部完成后
运行 pnpm verify 和 Windows 真实桌面验收，推送 feat/core-workflows 并创建面向 main 的
PR，不要直接合并。
```
