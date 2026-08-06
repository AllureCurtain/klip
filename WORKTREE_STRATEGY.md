# Klip 单活动 Worktree 实施计划与构建/数据目录规范

> 本文档是 Klip 下一阶段的完整实施目标，所有任务在同一执行上下文中连续完成。
> 核心原则：**保持 WIP = 1，在当前 `feat/foundation` 工作树中串行完成全部功能；分段提交，最终统一提交 PR。**
> 覆盖三块硬约束：Windows 构建成本、运行时进程级资源冲突、串行功能之间的依赖与集成边界。
> 所有"现状"描述都附了 `文件:行号`，可直接跳转核对。

---

## 1. 总体节奏：先完成地基，再串行推进功能队列

```
  main（只作为 PR 目标，实施期间不直接合并）
              │
              └─ .worktrees/foundation [feat/foundation]
                         │
                         ├─ clipboard-rs 地基 ──验证──commit
                         ├─ search-tantivy    ──验证──commit
                         ├─ rich-text         ──验证──commit
                         ├─ ocr               ──验证──commit
                         ├─ platform-focus    ──验证──commit
                         └─ platform-source   ──验证──commit
                                      │
                                      ▼
                         全量验证 → push → PR to main
```

**为什么必须先完成地基：** 富文本的多格式捕获、多格式粘贴都依赖 clipboard-rs 切换后的新 API。地基完成并形成独立提交前不开始后续功能，避免在未稳定的 `monitor.rs` / `writer.rs` / `format/*.rs` 上叠加更多改动。

**为什么 search 排第一：** search 正式提供 `index_text(item_id, text)`；rich-text 提取出的纯文本和 OCR 识别结果都复用它。后续部分直接建立在前一部分已经验证并提交的代码上。

**工作区上限：** 常驻主工作区加当前 `.worktrees/foundation`，不再为五个功能创建额外 worktree 或分支。阶段二名称只表示逻辑功能块，不表示独立 Git 分支。

**提交与交付纪律：** 每完成一个可独立验证的部分就提交一次，提交前运行与该部分相称的测试；开始下一部分前工作树必须干净。全部内容完成后运行最终全量验证，推送 `feat/foundation` 并创建面向 `main` 的 PR。实施过程中不直接合并到 main。

### 1.1 Agent 执行约束

本项目禁止调用、创建或委派任何子 Agent。所有代码阅读、实现、测试、审查和文档工作只能由当前主 Agent 串行完成，确保项目的 Agent 并发始终为 1。

---

## 2. 构建成本（Windows）

### 2.1 问题
Rust + Tauri 编译很重。本次引入的 `tantivy`、`oar-ocr`、`ort`（ONNX Runtime）体积大、编译久。整个实施过程复用同一个 worktree，必须避免反复丢弃 `target/` 和 `node_modules`。

### 2.2 默认复用活动 worktree，缓存机制作为补充

`.worktrees/foundation` 在整个实施过程中持续复用。进入下一个功能块时保留构建目录，Cargo 会按输入和编译参数判断哪些产物可复用；不要为了“干净”习惯性删除 `target/`。

**方案 A：共享 `CARGO_TARGET_DIR`**
- 若必须重建实施 worktree，可把它指向统一目录（如 `D:\Study\cc\klip-target`），继续复用已编译依赖。
- 当前执行模式不会并行跑多个 Cargo 构建，因此不存在多个构建进程争用文件锁的问题。

**方案 B：`sccache` 编译器缓存**
- 按「编译器参数 + 输入文件哈希」缓存产物，存在 `~/.cache/sccache`。
- 活动 worktree 被重建或 target 未命中时，同一依赖仍可直接命中缓存。
- 安装：`scoop install sccache` 或 `cargo install sccache`；启用：设 `RUSTC_WRAPPER=sccache`。

**期望管理（重要）：** sccache **不缓存 incremental 编译**。它省的是重新建立构建目录时第三方依赖的编译时间；对 `klip` crate 本身“改一行重编”几乎没有收益，那部分依靠 Cargo incremental。

因此：
- **dev profile 的 `incremental` 保持开启**（默认即开，不要为了 sccache 命中率关掉）。
- 默认复用 `.worktrees/foundation` 自己的 target；`sccache` 和共享 `CARGO_TARGET_DIR` 都是可选的本地加速手段，不是功能完成条件。

### 2.3 前端（pnpm）
pnpm 使用全局 content-addressable store，`node_modules` 是软链，体量很轻。实施 worktree 第一次初始化以及 `pnpm-lock.yaml` 发生变化后，都要执行 `pnpm install --frozen-lockfile`。

**注意 `pnpm install` 不只是装依赖** —— 它会触发 `prepare` → `scripts/install-hooks.mjs`，把 `scripts/hooks/pre-push` 装进该 worktree 的 git hooks 目录。这道 hook 会跑 `pnpm verify`，是推送前的质量闸。实施 worktree 第一次建立时必须执行一次。

### 2.4 sccache 只走环境变量，不进仓库

**不在仓库里放 `.cargo/config.toml`。** 理由：
- 把 `RUSTC_WRAPPER=sccache` 提交进去，等于任何 clone 的人没装 sccache 就构建失败 —— 把一个本地加速工具变成了硬依赖。
- `CARGO_TARGET_DIR` 是各人磁盘布局，不该由仓库决定。

仓库根的 `.cargo/` 保持在 `.gitignore` 里 —— 它和 `.rustup/`、`.profile`、`.bashrc` 是同一类污染（构建时可能被当成 CARGO_HOME 落在仓库内），而且 `.cargo/credentials.toml` 会存 crates.io token，绝不能进版本库。

需要个人固定配置的，写到用户级 `~/.cargo/config.toml`。

README 只需把 sccache 作为可选的 Windows 加速方案说明：scoop 安装、设置 `RUSTC_WRAPPER`、用 `sccache --show-stats` 查看命中率。不要把本地工具写成项目硬依赖。

**验证方式：** 需要评估 sccache 时看 `sccache --show-stats` 的命中数据，不把“首次构建必须达到某个速度”作为阶段完成标准。

---

## 3. 运行时数据目录隔离

### 3.1 已有能力

`KLIP_DATA_DIR` 已在代码里生效：

| 位置 | 内容 |
|------|------|
| `database/connection.rs:113` | `pub const ENV_KLIP_DATA_DIR: &str = "KLIP_DATA_DIR";` |
| `database/connection.rs:115` | `app_data_dir_from_env()` —— 读 env，空值过滤 |
| `database/connection.rs:121` | `app_data_dir()` —— env 优先，否则 Linux 走 `platform::linux::data_dir()`，其他平台走 Tauri `app_data_dir()` |
| `database/connection.rs:141` | `get_db_path()` —— 拼 `klip.db` |
| `database/connection.rs:174` | 单测 `app_data_dir_prefers_klip_data_dir_env_override` |
| `commands/mod.rs:349` | 诊断信息复用同一解析函数 |
| `scripts/run-e2e.ps1:76` | e2e 已在用它做隔离 |

日志目录同样可隔离：`KLIP_LOG_DIR`（`main.rs:14` 定义，`main.rs:304` 消费）。

### 3.2 后续功能必须遵守的目录契约
新增的 Tantivy 索引根目录、OCR 模型缓存目录，**必须复用 `database::connection::app_data_dir()`**，不要另起一套路径解析。

### 3.3 一个边界
`KLIP_DATA_DIR` 覆盖的是数据目录。应用配置存在 SQLite 的 `app_config` 表里（`database/schema.rs:156`），也就是在 `klip.db` 内部 —— 配置天然随数据目录一起隔离，不需要额外处理。

---

## 4. 进程级资源冲突

### 4.1 没有单实例保护
项目未引入 `tauri-plugin-single-instance`（`main.rs` 注册的插件只有 `shell` / `dialog` / `global-shortcut` / `autostart`）。**两个 Klip 能同时起来**，下面这些资源隔离不了。

| 资源 | 位置 | 第二实例的后果 |
|------|------|--------------|
| HTTP 端口 | `http/mod.rs:33` `DEFAULT_PORT = 27717` | bind 失败，`http/mod.rs:93` 打 error 日志后 HTTP 功能不可用 |
| 全局热键 | `hotkey/manager.rs`，`Ctrl+Alt+K` / `Ctrl+Alt+1~9` | 系统级注册冲突，第二个注册失败 |
| 开机自启 | `tauri-plugin-autostart`，写注册表/desktop entry | 互相覆盖，写的是全局位置 |
| 自复制抑制 | 见 §9.1 | 哈希抑制是进程内状态，两个实例无法识别对方的写入，可能互相回灌 |

端口有 env 可躲（`KLIP_HTTP_PORT`，`http/mod.rs:34`），热键和自启没有。

### 4.2 开发者守则

**实施 worktree 运行前设三个 env：**

```bat
:: cmd
set KLIP_DATA_DIR=C:\tmp\klip-foundation\data
set KLIP_LOG_DIR=C:\tmp\klip-foundation\logs
set KLIP_HTTP_PORT=27718
pnpm tauri:dev
```

```powershell
# PowerShell
$env:KLIP_DATA_DIR  = 'C:\tmp\klip-foundation\data'
$env:KLIP_LOG_DIR   = 'C:\tmp\klip-foundation\logs'
$env:KLIP_HTTP_PORT = '27718'
pnpm tauri:dev
```

端口约定：主工作区保留默认 `27717`；实施 worktree 固定使用 `27718`。功能切换时不需要为每个逻辑功能块永久占一个端口。

**不要同时运行两个 Klip 实例。** 理由是 §4.1 的热键 + 自启 + 剪贴板标记冲突。数据目录隔离解决的是"先后跑不同 worktree 时不互相污染数据"，不解决同时跑。

若确实要同时跑，需额外做（都不在当前计划内）：改 `tauri.conf.json` 的 `identifier`（当前 `com.klip.app`）、热键改成可配置且错开、关掉其中一个的 autostart。**建议直接避免这个场景。**

### 4.3 实施 worktree 初始化

```bash
cd .worktrees/foundation
pnpm install --frozen-lockfile  # 装依赖，并通过 prepare 安装 pre-push hook
```

`scripts/hooks/pre-push` 会在推送前跑 `pnpm verify`（= `lint` + `test --run` + `build` + `cargo fmt --check` + `cargo clippy -D warnings` + `cargo test`）。紧急情况可 `KLIP_SKIP_VERIFY=1` 绕过，正常流程不要用。

---

## 5. 跨功能契约与实现归属

串行实施不需要在地基阶段预建空接口或空模块。每个公共能力由第一个真正需要它的功能负责实现，后续功能只消费已经提交并验证的接口：

1. **`index_text(item_id, text)` 归 search 所有** —— search-tantivy 定义签名、错误类型、降级行为并完成实现；rich-text 提取出的纯文本和 OCR 识别结果统一调用它。因此执行顺序必须是 search 在 rich-text 和 OCR 之前。
2. **`clipboard_formats` 归 rich-text 所有** —— rich-text 创建 `clipboard_formats(item_id, format, content)` 多格式存储接口，HTML、RTF 与未来 Markdown 都走这里。
3. **DB migration 跟随实际功能** —— 当前 `CURRENT_DB_VERSION = 3`（`database/mod.rs:12`）。rich-text 在引入 `clipboard_formats` 时追加 migration 并 bump 到 4，不在 foundation 中提前创建尚未使用的表。后续功能需要 schema 变更时继续使用独立版本，禁止把未实现功能的猜测一次性塞进 v4。
4. **模块边界随功能落地** —— 命令、HTTP 路由、前端 API 和类型在对应功能实现时拆分，不创建 `rich_text.rs`、`search.rs`、`ocr.rs` 等无行为占位文件。

**schema 版本的副作用：** bump 到 4 之后，`database/data_portability.rs:457` 的备份版本校验会拒绝更高版本的备份恢复到低版本 app。也就是用 rich-text 版本导出的备份不能恢复到旧 app。这是预期行为（防止静默降级），必须在同一功能提交的 CHANGELOG 中说明。

---

## 6. 共享注册点与串行集成规则

### 6.1 会冲突的文件

rich-text、search-tantivy、OCR 都要加新 IPC 命令和 HTTP 路由，因此会依次改到这些共享文件：

| 文件 | 当前状态 | 冲突原因 |
|------|---------|---------|
| `src-tauri/src/main.rs` | `invoke_handler!` 里 46 条命令平铺（`main.rs:149` 起） | 多个功能会依次注册命令 |
| `src-tauri/src/commands/mod.rs` | 483 行，核心命令都在里面 | 新 handler 继续堆入会恶化维护性 |
| `src-tauri/src/http/mod.rs` | 1323 行，router 里 40+ 条 `.route()`（`:154-214`） | 新路由继续堆入会恶化维护性 |
| `src-tauri/src/http/openapi.rs` | 919 行 | 跟着加 schema |
| `src/lib/tauri.ts` | 222 行，项目约定的 IPC 唯一出口 | 多个功能会依次加 API 包装 |
| `src/types/index.ts` | 186 行，要和 `database/types.rs` 手工同步 | 多个功能会依次加类型 |

### 6.2 随功能落地的模块化规则

按现有 `commands/productization.rs` 的先例，新功能采用“功能文件 + 主入口一行挂载”，但只在实现真实行为时创建：

- **Rust 命令**：实现 search 时创建 `commands/search.rs`，实现 rich-text/OCR 时同理。`main.rs` 的 `invoke_handler!` 里每个功能占连续一段并加注释锚点：
  ```rust
  // --- search ---
  // --- rich-text ---
  // --- ocr ---
  ```
  注释用于保持入口可扫描，不代表独立分支所有权。
- **HTTP 路由**：对应功能实现 `fn search_routes() -> Router`、`fn rich_text_routes()`、`fn ocr_routes()`，主 router 用 `.merge()` 挂载。
- **前端 API**：`src/lib/tauri.ts` 已有 `clipboardApi` / `productApi` / `configApi` / `systemApi` 分组。新增 API 按功能分组；当文件继续增长时拆到独立模块再 re-export，不预建空对象。
- **前端类型**：按功能分区，或拆成 `types/search.ts`、`types/richText.ts`、`types/ocr.ts` 后统一 re-export。

### 6.3 分段提交规则

- 每个逻辑部分必须形成可独立审查的 commit；不要把 search、rich-text、OCR 混在同一个提交中。
- 提交前运行该部分的针对性测试，并保证 `git diff --check` 通过；提交后工作树应干净再进入下一部分。
- `Cargo.toml` / `package.json` 与对应 lockfile 必须在同一功能提交中。发生 lockfile 问题时从实际 manifest 重新解析并检查依赖变化，禁止用 `git checkout --theirs` 整体覆盖。
- 文档和测试应随功能一起提交；仅跨多个功能的最终说明可放在单独的收尾文档提交中。
- 实施期间不直接合并到 main。全部功能完成后统一运行 `pnpm verify` 和运行时验收，推送分支并创建 PR。

建议的提交边界：

1. `refactor: unify clipboard backend on clipboard-rs`
2. `feat: add tantivy full-text search`
3. `feat: preserve rich clipboard formats`
4. `feat: add local image OCR`
5. `feat: restore focus across supported platforms`
6. `feat: track clipboard source across supported platforms`
7. 必要的最终文档、集成修复或发布准备提交

---

## 7. 单实施 Worktree 约定

- 主工作区 `D:\Study\cc\klip` 保持在 `main`，只作为比较基线和最终 PR 目标。
- 全部实现都在 `D:\Study\cc\klip\.worktrees\foundation` 的 `feat/foundation` 分支完成。
- `.worktrees/` 已由仓库 `.gitignore` 和 ESLint 排除；不要再创建仓库平级的 `klip-search`、`klip-ocr` 等目录。
- search、rich-text、OCR、focus、source 是同一分支上的串行功能块，不为它们再开 worktree 或 feature branch。
- 每完成一个功能块，按 §6.3 验证并提交。提交不等于合并；main 在最终 PR 前不接收这些改动。
- 初始化按 §4.3 执行。`pnpm-lock.yaml` 变化后重新运行 `pnpm install --frozen-lockfile`。

---

## 8. 阶段二：串行功能队列与完成标准

以下部分严格按 8.1 → 8.5 执行。每一部分完成针对性验证后立即 commit，再继续下一部分；中间不合并 main。

### 8.1 `search-tantivy` — Tantivy 全文搜索
**目标**：以 Tantivy + jieba 替换 SQLite `LIKE`，支持中文分词、海量条目快速搜索。

现状：`database/clipboard_query.rs:178` 是 `format!("%{}%", text_query)`，纯 `LIKE`。

任务清单：
- [x] 新增 `search/` 模块：索引创建、写入、查询；正式定义并实现 §5 的 `index_text(item_id, text)` 公共接口
- [x] 集成 `tantivy-jieba` 做中文分词（tantivy 0.24.x，版本要对齐 `tantivy-tokenizer-api`）
- [x] 索引目录走 `database::connection::app_data_dir()`（§3.2）
- [x] 写入策略：批量 + 定时 commit（如每 5s 或积攒 50 条）
- [x] 删除同步：剪贴板记录删除时同步删除索引项
- [x] segment 合并压缩；启动健康检测 + 索引损坏时从 SQLite 全量重建
- [x] Tantivy 异常时降级回 SQLite `LIKE`（前端无感知）
- [x] 切换 `clipboard_query.rs` 的 `text_query` 分支为 FTS 查询

完成标准：
- **10 万条数据**搜索在毫秒级。（1k 条的基准无意义 —— `LIKE` 在 1k 条上也是毫秒级，区分不出改进。）
- 中文分词生效：搜「剪贴板工具」能命中「剪贴板管理工具」。`LIKE '%剪贴板工具%'` 命中不了，这是能区分新旧实现的判据。
- 删除条目后搜索不再返回该条
- 索引损坏能自动重建且不崩溃（注意 §9.2 的 panic 约束）；Tantivy 故障时回退 `LIKE` 仍可用
- 测试全绿

### 8.2 `rich-text` — 富文本 HTML 规范化
**目标**：剪贴板内容支持多格式（纯文本 + HTML/RTF），粘贴时目标应用按自身能力自选格式；前端安全渲染富文本。

现状：`database/types.rs:5` 的 `ContentType` 只有 Text / Image / File，没有富文本概念，要从零建。

任务清单：
- [ ] 后端落地 `clipboard_formats(item_id, format, content)` 多格式存储
- [ ] 新增 migration，`CURRENT_DB_VERSION` 3 → 4，并补齐迁移测试和备份兼容性说明
- [ ] monitor 捕获时优先取 HTML/RTF（clipboard-rs `get_html()` / `get_rich_text()`），无富文本则回退纯文本
- [ ] 将富文本提取出的可搜索纯文本送入 search 已实现的 `index_text`
- [ ] writer 粘贴时同时写入纯文本 + HTML（多格式粘贴）
- [ ] 前端列表/详情渲染 HTML，用 DOMPurify 做 XSS 过滤（仅保留 `<b>/<i>/<a>/<table>/<code>` 等安全标签）
- [ ] 通过用户提供的测试文件

完成标准：
- 从浏览器/Word 复制带格式文本，Klip 记录保留 HTML；粘贴回 Word 保格式，粘贴到记事本为纯文本
- 恶意 HTML（`<script>`、`on*` 事件属性、`javascript:` 协议）在预览中被剥离，绝不执行
- v3 数据库能自动迁移到 v4；新版备份不能恢复到旧版的影响已写入 CHANGELOG
- 测试全绿

### 8.3 `ocr` — 图片文字识别
**目标**：剪贴板图片离线识别文字并回灌搜索索引，使图片内容可搜索。

任务清单：
- [ ] 新增 `ocr/` 模块：`oar-ocr`（0.6.x）+ ONNX Runtime（`ort`）
- [ ] 模型文件打包进安装包/资源目录
- [ ] 捕获图片后**异步**跑识别（不阻塞主捕获线程）
- [ ] 识别文字回灌 search 已实现的 `index_text`
- [ ] 缩略图 / 识别状态在前端展示

完成标准：
- 复制含文字的截图，搜索图中文字可定位该图
- 纯本地推理，不联网、不上传任何数据
- 中文识别可用；识别在后台异步完成，复制操作不卡顿
- 测试全绿

**体积成本：** PP-OCR 的检测 + 识别 ONNX 模型合计几十 MB，加上 onnxruntime 动态库，安装包体积会明显跳一档。额外工作：
- `tauri.conf.json` 的 `bundle.resources` 要配模型路径
- onnxruntime 动态库的分发方式要定（`ort` 的 download-binaries feature 会在构建时拉，离线/CI 环境要预置）
- release profile 是 `opt-level = "s"`（体积优先），但体积主因在模型不在代码，不需要为此改配置

### 8.4 `platform-focus` — 跨平台焦点恢复
**目标**：粘贴后恢复前台窗口焦点（Windows 已有，补齐 macOS / Linux，否则优雅降级）。

现状：`lib.rs:37` 的 `PREV_FOREGROUND_HWND: AtomicI64` + `lib.rs:90` 的 `GetForegroundWindow`，纯 Win32。

任务清单：
- [ ] 抽象焦点恢复接口（把"`AtomicI64` 存 HWND"抽象成平台无关的"上一个前台窗口"概念）
- [ ] Windows：保留现有 Win32 实现
- [ ] macOS：用 `NSRunningApplication` 恢复
- [ ] Linux(X11)：用 X11 恢复；Wayland 检测到就跳过（`platform/linux.rs:207` 已有 `is_wayland_session()` 可复用）
- [ ] 不支持的平台：优雅跳过，不报错

完成标准：
- 三平台粘贴后焦点回到原应用；不支持平台静默降级，无异常
- **注意**：改动会碰到 `lib.rs` 的托盘点击守卫（`LAST_TRAY_CLICK_MS` / `TRAY_CLICK_GUARD_MS = 300ms`）。按 CLAUDE.md 约定，任何新的窗口显示/聚焦路径都要走 `notify_tray_click()`，否则和 focus-lost 自动隐藏打架。

### 8.5 `platform-source` — 跨平台来源追踪
**目标**：记录每条记录的来源应用（进程名/标题），三平台可用，否则自动关闭该功能。

现状：`monitor.rs:547` 的非 Windows 分支直接 `ClipboardSource::default()`，等于没有来源。

任务清单：
- [ ] 抽象来源获取接口
- [ ] Windows：保留现有 Win32 实现
- [ ] macOS：用 `NSWorkspace` / Accessibility 取前台应用（**需要辅助功能授权，要处理未授权的降级**）
- [ ] Linux(X11)：用 X11 取前台应用；Wayland 下多数合成器不给这个信息，直接关闭功能
- [ ] 不支持时：功能自动关闭并给出提示

完成标准：
- 三平台能显示来源应用；不支持平台不显示且不报错
- 来源规则（`clipboard_source_rules` 表，捕获忽略规则）在无来源信息的平台上不误判 —— **拿不到来源时的默认行为必须是"照常捕获"，不能是"全部忽略"**

### 8.6 阶段二总完成标准
- 五个功能块各自通过用户提供的测试并形成独立 commit
- 后一功能建立在前一功能已提交、工作树干净的状态上
- 全平台（至少 Windows）`tauri:dev` 跑通，核心闭环可用
- 最终 `pnpm verify` 全绿；各功能的针对性测试结果可从提交历史和 PR 描述追溯
- 全部内容只通过最终 PR 进入 main，不直接 merge 或 push main

> search 是队列第一项，因为 rich-text 和 OCR 都消费它提供的 `index_text`。OCR 必须在 search 完成后实施。

---

## 9. 已确认的技术决策

### 9.1 clipboard-rs 与哈希防回灌

**决策：所有平台、所有内容类型统一使用 clipboard-rs；移除 clipboard-master、clipboard-win 和 arboard。防回灌统一使用哈希抑制，不再写 `"Clipboard Viewer Ignore"` 自定义格式。**

独立 demo 对 clipboard-rs 0.3.5 的实测结果：

| 场景 | 结果 |
|------|------|
| `Text + Other(marker)` | 文本与标记可共存 |
| `Files + Preferred DropEffect + Other(marker)` | 三种格式可共存，文件复制语义保留 |
| `Image + Other(marker)` | 调用返回 `Ok`，但图片写入会清掉标记 |
| 调换顺序或分两次调用 `set_image` / `set_buffer` | 只能保住图片或标记之一，五种组合全部失败 |
| `ClipboardWatcherContext` | 能收到变更事件并可通过 shutdown channel 正常停止 |

因此不能按内容类型混用“文本/文件标记 + 图片哈希”两套机制。统一实现必须满足：

- writer 在写入前用 monitor 将会计算出的同一算法生成 hash，并 arm 一次抑制。
- monitor 提取内容后先检查 hash；匹配则只跳过这一次事件并立即消费该状态。
- 抑制状态设置短 TTL（当前设计为 3 秒），防止通知丢失后长期吞掉用户以后复制的相同内容。
- 写入失败必须 disarm，不能让从未进入剪贴板的内容影响后续捕获。
- 锁中毒等异常降级为“不抑制”，最多重复捕获一次，不能在 `panic = "abort"` 下扩大故障。

残余边界：用户如果在 TTL 内从外部应用复制与 Klip 刚写入字节完全相同的内容，该事件可能被跳过一次。该内容已经存在于历史顶部，损失的是一次时间更新而不是数据，可接受。

### 9.2 `panic = "abort"` 与索引损坏处理

release profile 是 `panic = "abort"`。这意味着：
- `std::panic::catch_unwind` **不生效**
- tantivy / ort 内部任何 panic 都会直接终止整个进程
- 后台线程 panic 也会 abort 整个进程（`panic = "abort"` 下没有"线程 panic 只死这个线程"这回事）

独立 release demo 已对截断 store/idx/pos/term/fast 文件、损坏或删除 meta.json 等情况做过验证。Tantivy 0.24 在这些场景中返回 `Err`，没有触发 abort；部分不影响读取的损坏仍能正常打开。因此 §8.1 的“发现损坏后自动重建且不崩溃”可以通过 `Result` 错误路径实现。

**约束**：
- 索引健康检测和重建只能靠 tantivy 返回的 `Result` 来兜，把所有 `unwrap()` / `expect()` 换成显式错误处理
- OCR 同理，`ort` 的推理错误必须走 `Result`
- 异步 OCR 任务内部必须零 panic
- 不要为此改 release profile —— `panic = "abort"` 是有意的体积/性能选择，改它影响面更大
- 保留损坏索引集成测试，防止升级 Tantivy 后错误语义发生变化

---

## 10. 串行实施清单与 PR 交付

按依赖顺序执行。勾选表示结论已经确认；仍在 worktree 中但尚未完成验收和提交的代码不得提前勾选。

**已确认准备项**
- [x] main 与 origin/main 基线一致，`.worktrees/foundation` 建立在 `feat/foundation`
- [x] 完成 §9.1 demo，确认统一走哈希抑制
- [x] 完成 §9.2 demo，确认 Tantivy 损坏可通过 `Result` 处理

**地基：clipboard-rs**
- [x] 完成统一剪贴板 backend，重写 monitor / writer / format，补齐错误处理和回归测试
- [x] 从 manifest 和源码移除 clipboard-master、clipboard-win、arboard（`clipboard-rs` 的传递依赖除外）
- [x] 保留文件列表的 Preferred DropEffect，并验证文本、图片、文件捕获与写回
- [x] 验证哈希抑制的一次性、TTL、写失败 disarm 和监听关闭行为
- [ ] Windows 下运行 `tauri:dev`，手工走通监听 → 捕获 → 选择历史 → 粘贴闭环（已完成启动 smoke，完整闭环留待最终验收）
- [x] 针对性测试通过后提交 `refactor: unify clipboard backend on clipboard-rs`

**串行功能队列**
- [ ] 完成 §8.1 search-tantivy，针对性测试通过并 commit
- [ ] 完成 §8.2 rich-text 与 DB v4 migration，针对性测试通过并 commit
- [ ] 完成 §8.3 OCR，针对性测试通过并 commit
- [ ] 完成 §8.4 platform-focus，针对性测试通过并 commit
- [ ] 完成 §8.5 platform-source，针对性测试通过并 commit

**工具链与文档**
- [ ] README 补充可选 sccache、三个运行时 env、单 worktree 初始化和串行执行规则
- [ ] rich-text 提交中的 CHANGELOG 说明 db_version 4 的备份兼容性影响
- [ ] 每个功能的用户可见行为、限制和必要配置随对应 commit 更新

**最终验证与 PR**
- [ ] 检查提交历史：每个部分边界清楚，无把多个功能揉在一起的超大提交
- [ ] `pnpm verify` 全绿
- [ ] Windows `tauri:dev` 和核心剪贴板闭环通过；能执行的平台专项验证全部完成
- [ ] 三个 env 生效：数据、日志、HTTP 端口进入指定位置；不设置时回落默认
- [ ] 最终文档/集成修复提交后，`feat/foundation` 工作树干净
- [ ] 推送 `feat/foundation`，创建面向 `main` 的 PR
- [ ] PR 描述包含功能摘要、commit 清单、测试证据、DB migration、OCR 模型体积和平台降级边界
- [ ] 不直接 push 或 merge main；是否合并由 PR 审查流程决定

### 全部完成标准
- clipboard-rs 是唯一剪贴板库，监听、读取、写入和哈希防回灌全部走统一入口
- search、rich-text、OCR、platform-focus、platform-source 五个功能全部达到 §8 的完成标准
- `clipboard_formats` migration 已落地，数据库版本按实际 migration 演进
- 新增索引与模型目录统一复用 `database::connection::app_data_dir()`
- `pnpm verify`、运行时闭环和用户提供的专项测试全部通过
- 提交历史可逐部分审查，最终 PR 已创建且 main 未被直接修改
