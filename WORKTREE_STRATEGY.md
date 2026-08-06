# Klip 多 Worktree 开发策略与构建/数据目录规范

> 本文档是 Klip 下一阶段的实现目标。
> 核心原则：**地基（阶段一）先串行合入 main，再分叉多个 worktree 并行推进。**
> 覆盖三块硬约束：Windows 构建成本、运行时进程级资源冲突、并行分支的代码冲突面。
> 所有"现状"描述都附了 `文件:行号`，可直接跳转核对。

---

## 1. 总体节奏：先串行地基，再并行分叉

```
                 ┌─────────────────────────────────────┐
  阶段一 (串行)   │  Foundation（单 worktree → 合入 main） │
                 │  · 切换 clipboard-rs                  │
                 │  · 重写 monitor/writer/format         │
                 │  · 钉死 4 个接口 + 一次性定 DB schema  │
                 │  · 拆分命令注册点（消冲突）            │
                 │  · 补齐 worktree 环境隔离              │
                 │  · 配置 sccache                       │
                 └───────────────────┬─────────────────┘
                                     │ 合入 main 且稳定后
                                     ▼
  阶段二 (并行)   ┌──────┐ ┌────────┐ ┌─────┐ ┌──────────┐ ┌──────────┐
                 │rich- │ │search- │ │ ocr │ │platform- │ │platform- │
                 │text  │ │tantivy │ │     │ │ focus    │ │ source   │
                 └──────┘ └────────┘ └─────┘ └──────────┘ └──────────┘
                 各自独立分支 / 各自独立 worktree
```

**为什么必须串行过地基：** 富文本的多格式捕获、多格式粘贴都依赖 clipboard-rs 切换后的新 API；Tantivy/OCR 的文字回灌依赖统一的 `index_text` 接口。若并行分支在 foundation 合入前就从旧代码切出，会同时改写 `monitor.rs` / `writer.rs` / `format/*.rs`，合回时冲突成片。

**前置条件：** 分叉前 main 工作区必须干净，各 worktree 才有一致基线。

---

## 2. 构建成本（Windows）

### 2.1 问题
Rust + Tauri 编译很重。每个 worktree 默认各自编译一套 `target/`，而本次引入的 `tantivy`、`oar-ocr`、`ort`(ONNX Runtime) 体积大、编译久。若每个 worktree 重复全量编译，时间和磁盘都浪费严重。

### 2.2 两种共享机制，各自省的东西不一样

**方案 A：共享 `CARGO_TARGET_DIR`**
- 设环境变量指向统一目录（如 `D:\Study\cc\klip-target`），所有 worktree 复用同一份已编译依赖。
- 限制：Cargo 对 `target/` 持有文件锁，并行 `cargo build` 不会产生陈旧产物或数据损坏，但第二个进程会阻塞等待。**问题是"并行退化成串行"，不是"不安全"。** 需要真并行时用方案 B。

**方案 B：`sccache` 编译器缓存**
- 按「编译器参数 + 输入文件哈希」缓存产物，存在 `~/.cache/sccache`。
- 不同 worktree 编译同一个依赖直接命中缓存，不依赖共享 target 目录，可真并行。
- 安装：`scoop install sccache` 或 `cargo install sccache`；启用：设 `RUSTC_WRAPPER=sccache`。

**期望管理（重要）：** sccache **不缓存 incremental 编译**。它省的是「新 worktree 第一次全量编译第三方依赖」的时间 —— 对开 5 个 worktree 的场景这恰好是大头（tantivy + ort 各自编一遍非常贵）。但它对 `klip` 这个 crate 本身"改一行重编"几乎零收益，那部分靠 cargo 的 incremental。

因此：
- **dev profile 的 `incremental` 保持开启**（默认即开，不要为了 sccache 命中率关掉）。
- 推荐 B 为主、A 为辅：平时各 worktree 独立 target + sccache 兜依赖；确定要串行跑批量验证时再切共享 target 省磁盘。

### 2.3 前端（pnpm）
pnpm 使用全局 content-addressable store，`node_modules` 是软链，体量很轻，各 worktree `pnpm install` 会命中 store。

**注意 `pnpm install` 不只是装依赖** —— 它会触发 `prepare` → `scripts/install-hooks.mjs`，把 `scripts/hooks/pre-push` 装进该 worktree 的 git hooks 目录。这道 hook 会跑 `pnpm verify`，是推送前的质量闸。**每个新 worktree 都必须跑一次 `pnpm install`，否则该 worktree 推送时没有闸。**

### 2.4 sccache 只走环境变量，不进仓库

**不在仓库里放 `.cargo/config.toml`。** 理由：
- 把 `RUSTC_WRAPPER=sccache` 提交进去，等于任何 clone 的人没装 sccache 就构建失败 —— 把一个本地加速工具变成了硬依赖。
- `CARGO_TARGET_DIR` 是各人磁盘布局，不该由仓库决定。

仓库根的 `.cargo/` 保持在 `.gitignore` 里 —— 它和 `.rustup/`、`.profile`、`.bashrc` 是同一类污染（构建时可能被当成 CARGO_HOME 落在仓库内），而且 `.cargo/credentials.toml` 会存 crates.io token，绝不能进版本库。

需要个人固定配置的，写到用户级 `~/.cargo/config.toml`。

阶段一在这块只需落地文档：README 写清 Windows 启用步骤（scoop 安装 sccache、设 `RUSTC_WRAPPER`、`sccache --show-stats` 看命中率）。

**验证标准：** 新开一个 worktree 首次 `cargo build` 显著提速。不是同一 worktree 二次编译提速 —— 那是 incremental 的功劳，测不出 sccache。

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

### 3.2 阶段一要做的
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
| 自复制标记 | 见 §9.1 | 两个实例互相把对方的写入当成用户复制，可能形成回灌环 |

端口有 env 可躲（`KLIP_HTTP_PORT`，`http/mod.rs:34`），热键和自启没有。

### 4.2 开发者守则

**每个 worktree 运行前设三个 env：**

```bat
:: cmd
set KLIP_DATA_DIR=C:\tmp\klip-rich-text\data
set KLIP_LOG_DIR=C:\tmp\klip-rich-text\logs
set KLIP_HTTP_PORT=27718
pnpm tauri:dev
```

```powershell
# PowerShell
$env:KLIP_DATA_DIR  = 'C:\tmp\klip-rich-text\data'
$env:KLIP_LOG_DIR   = 'C:\tmp\klip-rich-text\logs'
$env:KLIP_HTTP_PORT = '27718'
pnpm tauri:dev
```

端口分配：foundation 27717（默认）、rich-text 27718、search 27719、ocr 27720、focus 27721、source 27722。

**不要同时运行两个 Klip 实例。** 理由是 §4.1 的热键 + 自启 + 剪贴板标记冲突。数据目录隔离解决的是"先后跑不同 worktree 时不互相污染数据"，不解决同时跑。

若确实要同时跑，需额外做（都不在当前计划内）：改 `tauri.conf.json` 的 `identifier`（当前 `com.klip.app`）、热键改成可配置且错开、关掉其中一个的 autostart。**建议直接避免这个场景。**

### 4.3 新 worktree 初始化

```bash
cd ../klip-rich-text
pnpm install          # 必须：装依赖 + 通过 prepare 装 pre-push hook
```

`scripts/hooks/pre-push` 会在推送前跑 `pnpm verify`（= `lint` + `test --run` + `build` + `cargo fmt --check` + `cargo clippy -D warnings` + `cargo test`）。紧急情况可 `KLIP_SKIP_VERIFY=1` 绕过，正常流程不要用。

---

## 5. 阶段一要钉死的四个接口

为避免阶段二并行分支各自为政、合并不了，地基阶段一次性定好：

1. **`clipboard_formats` 存储接口** —— 富文本多格式落点（表：`item_id, format, content`），富文本与未来 RTF/Markdown 都走这里。
2. **`index_text(item_id, text)` 索引函数** —— Tantivy 实现它；OCR 与富文本提取出的文字统一回灌此函数。签名要在地基阶段定死（含错误类型），阶段二只填实现。
3. **DB schema 一次性定好** —— 把 `clipboard_formats` 表直接放进本次 migration。当前 `CURRENT_DB_VERSION = 3`（`database/mod.rs:12`），本次 bump 到 4，在 `database/migrations.rs` 的 `MIGRATIONS` 数组追加一条即可。
4. **命令注册点拆分** —— 见 §6。这是阶段二能否真并行的关键。

**schema 版本的副作用：** bump 到 4 之后，`database/data_portability.rs:457` 的备份版本校验会拒绝更高版本的备份恢复到低版本 app。也就是用地基版本导出的备份不能恢复到旧 app。这是预期行为（防止静默降级），要在 CHANGELOG 说明。

---

## 6. 阶段二的冲突面与收敛方案

### 6.1 会冲突的文件

rich-text / search-tantivy / ocr 三个分支都要加新 IPC 命令和新 HTTP 路由，因此都要改这几个文件：

| 文件 | 当前状态 | 冲突原因 |
|------|---------|---------|
| `src-tauri/src/main.rs` | `invoke_handler!` 里 46 条命令平铺（`main.rs:149` 起） | 三个分支都在同一个列表尾部加行 |
| `src-tauri/src/commands/mod.rs` | 483 行，核心命令都在里面 | 三个分支都往里加 handler |
| `src-tauri/src/http/mod.rs` | 1323 行，router 里 40+ 条 `.route()`（`:154-214`） | 三个分支都加路由 |
| `src-tauri/src/http/openapi.rs` | 919 行 | 跟着加 schema |
| `src/lib/tauri.ts` | 222 行，项目约定的 IPC 唯一出口 | 三个分支都加 API 包装 |
| `src/types/index.ts` | 186 行，要和 `database/types.rs` 手工同步 | 三个分支都加类型 |

### 6.2 阶段一的收敛做法（§5 接口 4）

按现有 `commands/productization.rs` 的先例（核心命令在 `mod.rs`、产品化命令单独一个文件），把新 feature 的注册点全部改成"独立文件 + 一行挂载"：

- **Rust 命令**：新建 `commands/rich_text.rs`、`commands/search.rs`、`commands/ocr.rs` 占位。`main.rs` 的 `invoke_handler!` 里每个 feature 占连续一段并加注释锚点，各分支只动自己那段：
  ```rust
  // --- rich-text (feat/rich-text owns this block) ---
  // --- search   (feat/search-tantivy owns this block) ---
  // --- ocr      (feat/ocr owns this block) ---
  ```
  锚点不是强约束，但能把 diff 局部化，三方合并基本能自动过。
- **HTTP 路由**：拆成 `fn rich_text_routes() -> Router`、`fn search_routes()`、`fn ocr_routes()`，主 router 用 `.merge()` 挂载。
- **前端**：`src/lib/tauri.ts` 已有 `clipboardApi` / `productApi` / `configApi` / `systemApi` 分组，地基阶段补 `richTextApi` / `searchApi` / `ocrApi` 三个空壳并 export。
- **前端类型**：`src/types/index.ts` 按 feature 分区加注释锚点，或拆成 `types/richText.ts` 等再 re-export。

做完这一步，冲突面从"6 个文件正面撞车"降到"每个分支只碰自己的文件 + 主文件里一行挂载"。

### 6.3 剩余的不可消除冲突
- `Cargo.toml` 的 `[dependencies]`：search 加 tantivy、ocr 加 oar-ocr/ort。不同行，易解。
- `package.json`：rich-text 要加 DOMPurify。同上。
- `Cargo.lock`：必冲突。**约定一律 `git checkout --theirs` 后重跑 `cargo build` 重新生成，不手工合。**

---

## 7. 新 Worktree 约定

- **每个新 worktree 必然开新分支**（git 硬限制：同一分支不能出现在两个 worktree）。
- 基础命令（仓库根目录执行）：
  ```bash
  git worktree add ../klip-search    -b feat/search-tantivy
  git worktree add ../klip-ocr       -b feat/ocr
  git worktree add ../klip-rich-text -b feat/rich-text
  git worktree add ../klip-focus     -b feat/platform-focus
  git worktree add ../klip-source    -b feat/platform-source
  ```
- 阶段二的所有 worktree **必须在 foundation 合入 main 之后再分叉**。
- 路径放仓库平级（如 `D:\Study\cc\klip-search`），避免嵌套进主仓库造成 git 混淆。
- 每个 worktree 建好后按 §4.3 跑 `pnpm install`。

---

## 8. 阶段二：并行分支任务与完成标准

### 8.1 `feat/rich-text` — 富文本 HTML 规范化
**目标**：剪贴板内容支持多格式（纯文本 + HTML/RTF），粘贴时目标应用按自身能力自选格式；前端安全渲染富文本。

现状：`database/types.rs:5` 的 `ContentType` 只有 `Text` / `Image` / `File`，没有富文本概念，要从零建。

任务清单：
- [ ] 后端落地 `clipboard_formats(item_id, format, content)` 多格式存储（§5 接口 1）
- [ ] monitor 捕获时优先取 HTML/RTF（clipboard-rs `get_html()` / `get_rich_text()`），无富文本则回退纯文本
- [ ] writer 粘贴时同时写入纯文本 + HTML（多格式粘贴）
- [ ] 前端列表/详情渲染 HTML，用 DOMPurify 做 XSS 过滤（仅保留 `<b>/<i>/<a>/<table>/<code>` 等安全标签）
- [ ] 复用地基已定义的 `clipboard_formats` 表 migration
- [ ] 通过用户提供的测试文件

完成标准：
- 从浏览器/Word 复制带格式文本，Klip 记录保留 HTML；粘贴回 Word 保格式，粘贴到记事本为纯文本
- 恶意 HTML（`<script>`、`on*` 事件属性、`javascript:` 协议）在预览中被剥离，绝不执行
- 测试全绿

### 8.2 `feat/search-tantivy` — Tantivy 全文搜索
**目标**：以 Tantivy + jieba 替换 SQLite `LIKE`，支持中文分词、海量条目快速搜索。

现状：`database/clipboard_query.rs:178` 是 `format!("%{}%", text_query)`，纯 `LIKE`。

任务清单：
- [ ] 新增 `search/` 模块：索引创建、写入、查询（实现 §5 接口 2 `index_text`）
- [ ] 集成 `tantivy-jieba` 做中文分词（tantivy 0.24.x，版本要对齐 `tantivy-tokenizer-api`）
- [ ] 索引目录走 `database::connection::app_data_dir()`（§3.2）
- [ ] 写入策略：批量 + 定时 commit（如每 5s 或积攒 50 条）
- [ ] 删除同步：剪贴板记录删除时同步删除索引项
- [ ] segment 合并压缩；启动健康检测 + 索引损坏时从 SQLite 全量重建
- [ ] Tantivy 异常时降级回 SQLite `LIKE`（前端无感知）
- [ ] 切换 `clipboard_query.rs` 的 `text_query` 分支为 FTS 查询

完成标准：
- **10 万条数据**搜索在毫秒级。（1k 条的基准无意义 —— `LIKE` 在 1k 条上也是毫秒级，区分不出改进。）
- 中文分词生效：搜「剪贴板工具」能命中「剪贴板管理工具」。`LIKE '%剪贴板工具%'` 命中不了，这是能区分新旧实现的判据。
- 删除条目后搜索不再返回该条
- 索引损坏能自动重建且不崩溃（注意 §9.2 的 panic 约束）；Tantivy 故障时回退 `LIKE` 仍可用
- 测试全绿

### 8.3 `feat/ocr` — 图片文字识别
**目标**：剪贴板图片离线识别文字并回灌搜索索引，使图片内容可搜索。

任务清单：
- [ ] 新增 `ocr/` 模块：`oar-ocr`（0.6.x）+ ONNX Runtime（`ort`）
- [ ] 模型文件打包进安装包/资源目录
- [ ] 捕获图片后**异步**跑识别（不阻塞主捕获线程）
- [ ] 识别文字回灌 `index_text`（§5 接口 2）
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

### 8.4 `feat/platform-focus` — 跨平台焦点恢复
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

### 8.5 `feat/platform-source` — 跨平台来源追踪
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
- 五个分支各自通过用户提供的测试
- 各自 rebase/merge 到 main 无冲突（依赖 §6.2 已收敛的注册点）
- 全平台（至少 Windows）`tauri:dev` 跑通，核心闭环可用
- 每个分支推送前 `pnpm verify` 全绿（pre-push hook 强制）

> Tantivy 最独立，但为让 OCR 回灌，仍需等地基 `index_text` 接口定好再开并行。

---

## 9. 阶段一开工前要先验证的两件事

这两条不确认就动手，返工概率很高。各写个几十行的独立小 demo 验掉，不要在主干上试。

### 9.1 自复制标记用 clipboard-rs 重新实现

**决策：统一使用 clipboard-rs，移除 clipboard-win。** 两套剪贴板库并存会让"哪个 API 负责什么"变成隐性知识，架构上留疤。防回灌机制要跟着一起迁移，而不是绕开。

**现状**：Windows 上防回灌靠 `"Clipboard Viewer Ignore"` 这个自定义剪贴板格式：
- 写入侧 `clipboard/writer.rs:51` `raw_set_text_with_marker()` —— `clipboard_win::raw::empty()` + `set_string()` + `set_without_clear(id, b"Klip")`
- 读取侧 `clipboard/monitor.rs:75` `is_self_copy_marker_present()` —— `clipboard_win::raw::is_format_avail()`

**clipboard-rs 的对应能力**（已查 0.3.5 API 确认存在）：

| 用途 | clipboard-rs API |
|------|-----------------|
| 原子写入「正文 + 标记」 | `set(Vec<ClipboardContent>)`，标记用 `ClipboardContent::Other(String, Vec<u8>)` |
| 单独写自定义格式 | `set_buffer(format: &str, buffer: Vec<u8>)` |
| 检测标记是否存在 | `available_formats() -> Result<Vec<String>>`，查列表里有没有那个格式名 |
| 读自定义格式内容 | `get_buffer(format: &str) -> Result<Vec<u8>>` |

关键是 `set(Vec<ClipboardContent>)` —— 一次调用把正文和 `Other("Clipboard Viewer Ignore", b"Klip".to_vec())` 一起写进去，是原子的，不存在"先写正文再补标记、中间被监听线程抓到"的窗口。比现在三步走的实现更干净。

注意 `has()` 只接受 `ContentFormat` 枚举，不接受任意格式名字符串，所以检测自定义标记要走 `available_formats()`，不是 `has()`。

**已知坑（官方文档明写）**：`set_image` 会清空剪贴板（"set image will clear clipboard"）。所以图片写入不能是"先 set_image 再补标记"，必须走 `set(vec![Image(..), Other(..)])` 一次性写完。这对 `writer.rs` 的图片分支是硬约束。

**验证步骤**：
1. `set(vec![Text("hello"), Other("Clipboard Viewer Ignore", b"Klip")])`
2. `available_formats()` 确认列表里有 `"Clipboard Viewer Ignore"`
3. `get_text()` 确认正文没被标记干扰
4. 对 `set(vec![Image(..), Other(..)])` 重复一遍（`set_image` 会 clear，这条最可能出问题）
5. 确认外部程序（记事本 / Word）粘贴时看不到这个自定义格式的干扰

**退路**：若第 4 步失败（图片 + 标记不能共存），改用**哈希抑制** —— Klip 写入前把内容哈希记进一个 `LAST_WRITTEN_HASH`，监听线程发现新内容哈希与之相等就跳过。这个方案完全平台中立，反而更契合"统一库"的方向；`monitor.rs:20` 已有 `LAST_HASH` 可以借用同一套机制。代价是极端情况下用户手工复制了和 Klip 刚写入完全相同的内容会被漏记一次，可接受。

**产出必须是明确结论**：走自定义格式标记，还是走哈希抑制。定了再动 `writer.rs`。

### 9.2 `panic = "abort"` 与"索引损坏不崩溃"的冲突

release profile 是 `panic = "abort"`。这意味着：
- `std::panic::catch_unwind` **不生效**
- tantivy / ort 内部任何 panic 都会直接终止整个进程
- 后台线程 panic 也会 abort 整个进程（`panic = "abort"` 下没有"线程 panic 只死这个线程"这回事）

而 §8.2 要求"索引损坏自动重建且不崩溃"。这两件事在当前 profile 下不能靠捕获 panic 实现。

**约束**：
- 索引健康检测和重建只能靠 tantivy 返回的 `Result` 来兜，把所有 `unwrap()` / `expect()` 换成显式错误处理
- OCR 同理，`ort` 的推理错误必须走 `Result`
- 异步 OCR 任务内部必须零 panic
- 不要为此改 release profile —— `panic = "abort"` 是有意的体积/性能选择，改它影响面更大

**验证步骤**：手工损坏一个 tantivy 索引目录（截断 segment 文件），确认打开时返回 `Err` 而不是 panic。如果 tantivy 在这种情况下确实 panic，§8.2 的完成标准要改写成"索引损坏时应用重启后能重建"，并在 README 说明。

---

## 10. 阶段一待办清单

按依赖顺序：

**准备**
- [ ] 确认 main 工作区干净（§1）
- [ ] 跑 §9.1 验证，定下走「自定义格式标记」还是「哈希抑制」
- [ ] 跑 §9.2 验证，确认 tantivy 索引损坏的错误处理路径

**地基改造**
- [ ] 切换底层剪贴板库：**移除 `clipboard-master` 和 `clipboard-win`**，统一引入 `clipboard-rs`，重写 `monitor.rs` / `writer.rs` / `format/*.rs`（防回灌按 §9.1 结论实现）
- [ ] 评估 `arboard` 能否一并移除 —— 它当前只在非 Windows 非 Linux 分支读文本（`monitor.rs:17`），clipboard-rs 覆盖后应该就是死代码
- [ ] 钉死 §5 的四个接口
- [ ] `clipboard_formats` 表 migration，`CURRENT_DB_VERSION` 3 → 4（`database/mod.rs:12` + `database/migrations.rs`）
- [ ] §6.2 的注册点拆分：`commands/` 分文件、`invoke_handler!` 加注释锚点、http router 拆 `fn xxx_routes()`、`src/lib/tauri.ts` 加空壳 API 分组、`src/types/index.ts` 分区
- [ ] 新增目录（索引/模型缓存）统一走 `database::connection::app_data_dir()`（§3.2）

**工具链与文档**
- [ ] README 补：sccache 安装启用步骤（§2.4）、§4.2 的三 env 开发者守则、§4.3 的 worktree 初始化清单
- [ ] CHANGELOG 说明 db_version 4 的备份兼容性影响（§5）

**收尾**
- [ ] `pnpm verify` 全绿
- [ ] foundation 合入 main 并稳定后，再分叉阶段二 worktree

### 阶段一完成标准
- `cargo build` / `tauri:dev` 在 Windows 跑通，剪贴板监听、捕获、粘贴核心闭环正常
- **`Cargo.toml` 里已无 `clipboard-master`、`clipboard-win`**，剪贴板读写监听全部走 `clipboard-rs` 单一入口（`grep -rn "clipboard_win\|clipboard_master" src/` 应为空）
- §5 的四个接口已落地；`clipboard_formats` 表 migration 已合入；`CURRENT_DB_VERSION = 4`
- 注册点拆分完成 —— 判据：在两个临时分支上各加一个 dummy 命令 + 路由，merge 到一起零冲突
- 设 `KLIP_DATA_DIR` / `KLIP_LOG_DIR` / `KLIP_HTTP_PORT` 后数据、日志、端口都进指定位置；不设则回落默认
- sccache 生效（**新开 worktree 首次编译**显著提速）
- `pnpm verify` 全绿，main 干净
