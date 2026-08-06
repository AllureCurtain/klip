# Foundation Implementation Progress

- 最后更新时间：2026-08-07 03:15（Asia/Shanghai）
- 当前分支：`feat/foundation`
- 基准提交：`423ab24`（与 `main` / `origin/main` 一致）

## 已完成部分及 commit SHA

- `423ab24`：本轮实现基线，与 `main` / `origin/main` 一致。
- `d30e26c`：独立初始化本持续实施进度记录并审核单 worktree 策略。
- `909040d`：完成 clipboard-rs 统一 backend、哈希抑制、monitor/writer/format 迁移及针对性验证。
- `0dc501b`：完成 Tantivy 全文索引、jieba 中文分词、批量/定时提交、删除同步、损坏重建和 SQLite `LIKE` 降级。
- `3669c83`：完成 DB v4 多格式存储、clipboard-rs HTML/RTF 捕获与写回、v3/v4 备份兼容和 DOMPurify 安全预览。
- `58da1e8`：完成 DB v5 图片 OCR、PP-OCRv5/ONNX Runtime 离线资源、异步 worker、搜索回灌、前端状态和 Windows runtime acceptance。
- `82fa3a1`：完成 Windows HWND、macOS `NSRunningApplication`、Linux X11 EWMH 的粘贴目标焦点恢复及 Wayland/其他平台无错误降级。
- `1e5b63e`：完成 Windows/macOS/X11 来源追踪、DB v6 持久化与兼容恢复、API/前端来源展示及 Windows runtime acceptance。
- `77d7959`：完成 foundation worktree 初始化、运行时隔离、单 worktree 串行执行与可选 sccache 的开发文档。
- `ef2cdcc`：稳定 Windows Selenium clipboard E2E 的窗口恢复/刷新等待，隔离 HTTP 端口并传播 runner 失败退出码；记录最终运行时与默认目录回退边界。
- `f9dbea2`：记录最终 verify、Windows 运行时证据、默认目录回退限制和收尾清单。
- `c853468`：记录首次成功 push、pre-push verify 与 PR 准备状态。
- `387392b`：记录 PR #4 创建、平台限制与最终交付状态。
- `c880bff`：完成最终交付状态记录并确认 PR 保持 OPEN、未合并。

## 当前任务

- 当前任务：COMPLETE；当前环境可完成的实现、测试、分段提交、Windows 运行时验收、push 和 PR 创建均已完成。PR #4 保持 OPEN 且未合并，剩余仅为已记录的真实外部/平台验收项。
- README 已补齐 `pnpm install --frozen-lockfile` worktree 初始化、`KLIP_DATA_DIR` / `KLIP_LOG_DIR` / `KLIP_HTTP_PORT`、单活动 worktree 串行执行和可选 sccache。CHANGELOG 已在 rich-text 提交中说明 DB v4 备份不能回退到只支持 v3 的旧版；各功能行为与限制已分布记录在 README、CHANGELOG、API、DATABASE 与 ARCHITECTURE。
- `platform-source` 已在 `1e5b63e` 提交，§8.5 与串行功能队列均已据实勾选；macOS/Linux 真实桌面验收仍保持 SKIPPED，不影响已完成的代码、目标编译和 Windows 验收结论。
- Windows 保留现有进程文件名和窗口标题行为；macOS 使用 `NSWorkspace.frontmostApplication`，Accessibility 未授权时保留应用名且窗口标题为空；X11 使用 EWMH 活动窗口/PID/标题并从 `/proc` 解析应用名；Wayland和其他不支持平台一次性提示后返回空来源。
- Windows 完整“监听 → 捕获 → 选择历史 → 粘贴 → 焦点返回”闭环已通过最终 Selenium WebView 和外部文本框运行时验收。

## 已运行的测试及结果

- 本轮开始前未发现可复用的测试结果记录。
- `pnpm install --frozen-lockfile`：通过，prepare 已安装 foundation worktree 的 pre-push hook。
- `cargo fmt --check`：通过。
- `cargo test`：通过，110 个库测试、2 个 main 测试、5 个 clipboard integration tests，共 117 个测试通过。
- `cargo clippy -- -D warnings`：通过。
- `git diff --check`：通过；仅有 CRLF 转换提示。
- Windows runtime smoke：`pnpm tauri:dev` 已启动 `klip.exe`；`KLIP_DATA_DIR=C:\tmp\klip-foundation\data` 下生成 `klip.db`/WAL，`KLIP_LOG_DIR=C:\tmp\klip-foundation\logs` 下生成日志文件；进程已停止。完整 UI 闭环尚未执行。
- search 依赖核验：`tantivy 0.24.2` 使用 `tantivy-tokenizer-api 0.5`；选择同样依赖 tokenizer API 0.5 的 `tantivy-jieba 0.16.0`，避免同时链接不兼容的 tokenizer trait 版本。
- search 首轮专项测试：未进入测试执行，测试编译因两个既有 `ClipboardQuerySpec` 字面量缺少新增的 `text_match_ids` 字段而失败（`clipboard_query.rs:380`、`:460`）；业务代码 `cargo check` 已通过。处理：补齐测试字段后原命令重跑，不跳过测试。
- search 专项测试修复后：5 个行为/恢复/共享 writer 测试通过，1 个 10 万条性能测试按设计 ignored 并已单独显式运行通过；100k 热查询实测 `636.9us`。
- 最终 search `cargo test`：通过，115 个库测试通过、1 个显式性能测试 ignored，另有 2 个 main 测试和 5 个 clipboard integration tests 通过。
- 扩展检查 `cargo clippy --all-targets -- -D warnings`：失败于既有代码的 3 个测试目标 lint（`clipboard.rs`/`hotkey/manager.rs` 的 `items_after_test_module`，`http/openapi.rs` 的 `needless_borrows_for_generic_args`）；search 新代码无诊断。该命令不是仓库 verify 的准确门禁，下一步运行规定的 `cargo clippy -- -D warnings`。
- search 收尾 `cargo fmt --all -- --check`、`cargo clippy -- -D warnings`：通过。
- search 收尾 `git diff --check`：通过，仅有 Git 的 LF→CRLF 工作区提示。
- rich-text 数据库专项测试首次调用未进入编译：在单个 `cargo test` 命令中误传了三个名称过滤器，Cargo 报 `unexpected argument`。处理：拆为独立过滤命令顺序重跑，不跳过任何测试。
- rich-text DB 格式存储专项：`cargo test database::formats` 通过，2 项测试通过。
- rich-text migration 专项：`cargo test database::connection::tests::v3_database_is_migrated_with_plain_text_formats` 通过，确认 v3 文本回填并升级到 v4。
- rich-text restore 专项：`cargo test database::data_portability::tests::restore_ -- --test-threads=1` 通过，7 项测试覆盖 v3 恢复迁移、v4 HTML 保留、缺表/新版本/无效备份拒绝。
- rich-text clipboard 专项：`cargo test clipboard:: -- --test-threads=1` 通过，44 项测试通过；`cargo test --test clipboard_format_test -- --test-threads=1` 在 Windows 通过，5 项集成测试覆盖多格式写回/读取。
- rich-text 前端专项：`pnpm test -- --run src/components/clipboard/ClipboardItem.test.tsx` 通过，22 项测试覆盖安全标签保留、`script`/`on*`/`javascript:`/图片剥离及清洗为空时纯文本回退。
- rich-text 类型构建：`pnpm build` 通过。
- rich-text 导入回归：旧 JSON 去重测试通过，确认缺少 `formats` 的旧导入不会清空已有 HTML；OpenAPI schema 5 项测试通过。
- rich-text 完整前端验证：`pnpm lint` 通过；`pnpm test -- --run` 通过，20 个文件、141 项测试；`pnpm build` 通过。
- rich-text 完整 Rust 验证：`cargo fmt --all -- --check`、`cargo clippy -- -D warnings` 通过；`cargo test -- --test-threads=1` 通过，124 个 library 测试通过、1 个显式性能测试 ignored，另有 2 个 main 和 5 个 clipboard integration 测试通过。
- rich-text 依赖复核：`pnpm install --frozen-lockfile` 通过并重新安装 pre-push hook；`git diff --check` 通过，仅有 LF→CRLF 提示。
- OCR 资源端点核验：PP-OCRv5 mobile 检测模型、识别模型和字典的 GitHub release URL 均返回 HTTP 200；已下载到 `src-tauri/resources/ocr`。
- OCR 资源完整性：检测模型 4,826,518 B / SHA-256 `1eb7b4f7ab657ebd1c66d5f79bca7497f29768a2e3c15e52daecbba1a8e4a039`；识别模型 16,562,373 B / `243a0f06d826761323e9045e9b113ab2c191c3aa50565585e628300b8eda0224`；字典 74,012 B / `d1979e9f794c464c0d2e0b70a7fe14dd978e9dc644c0e71f14158cdf8342af1b`。
- OCR 许可证核验：`oar-ocr 0.6.2` 与 PP-OCR/PaddleOCR 模型均为 Apache-2.0；来源、版本、体积、哈希和许可证链接随模型记录在 `src-tauri/resources/ocr/README.md`。
- OCR 首次依赖构建：`cargo check` 失败于上游版本漂移；`oar-ocr 0.6.2` 的传递约束解析到 `oar-ocr-core 0.6.3` / `ort 2.0.0-rc.13`，但 core 的 `ort_infer_config.rs:78` 仍引用 rc.13 已移除的 `CPUExecutionProvider`（`E0433`）。模型下载成功，失败点在 Rust 编译；下一步精确锁定 `oar-ocr-core 0.6.2` 和其声明的兼容 `ort` 版本后重跑，不跳过构建。
- OCR 第二次依赖构建：已直接精确约束 `oar-ocr-core = 0.6.2` / `ort = 2.0.0-rc.12`，未再出现 `E0433`，但 `cargo check` 在 ORT 外部二进制获取阶段静默等待 15 分钟后被命令超时终止。已尝试路径为 Cargo 默认 `download-binaries`；下一步检查 `ort-sys` 下载 URL/缓存并显式预取归档，避免原样重复。
- OCR 第三次依赖构建：从 `ort-sys 2.0.0-rc.12` 分发表取得 Windows x64 CPU 包（29,445,945 B，SHA-256 `b685bfc8d336e0ba95c066a7a982c03aa6dedd528a492eb99ca4ccb7f3af9e7a`），用系统 `xz`/`tar` 预取到精确缓存键后 `cargo check` 通过；`onnxruntime.lib` 为 305,821,070 B（静态链接），`DirectML.dll` 为 18,527,776 B 并由 `copy-dylibs` 复制到 `target/debug`。
- OCR DB v5 首轮 `cargo check`：失败于 `database/ocr.rs::pending_item_ids` 的块尾 `MappedRows` 临时值析构顺序（`E0597`），没有其他 schema/type 诊断；处理为先收集到局部变量再返回，随后原命令重跑。
- OCR DB v5 修复后验证：`cargo check` 通过；`cargo test database::ocr -- --test-threads=1` 通过（2 项）；`cargo test database::connection::tests::v3_database_is_migrated_with_plain_text_formats -- --test-threads=1` 通过（1 项）。
- OCR worker 专项首次可达链接：`cargo test ocr::tests -- --test-threads=1` 在 Windows link 阶段失败；静态 `onnxruntime.lib` 引用了本机链接器未解析的 `__std_find_first_of_trivial_pos_1` / `_2`，最终 `LNK1120: 2 unresolved externals`。当前 MSVC toolset 为 `14.43.34808`，推测 ONNX Runtime 1.24.2 官方静态包使用了更新的 MSVC STL；未重复原样重试。
- OCR 动态加载首次构建：已确认 14.43 的 `libcpmt.lib` / `msvcprt.lib` 仅提供不带 `_pos_` 的旧符号，显式链接 runtime 不能解决；Windows 目标改启 `ort/load-dynamic` 后原 LNK2019 消失，但编译 `ort` 的动态 execution-provider 分支时报 `E0609`，API 17 bindings 中没有 `SessionOptionsAppendExecutionProvider_VitisAI`。原因是动态模式需显式启用与 1.24.2 对齐的 `api-24`；下一次重试将加入该 feature。
- OCR 动态加载修正后：Windows 目标启用 `ort/api-24` + `load-dynamic`，`cargo test ocr::tests -- --test-threads=1` 通过；筛选实际覆盖 OCR resource 单测与 DB OCR 测试共 4 项，静态 `onnxruntime.lib` 不再进入链接。
- 官方 ONNX Runtime 动态包核验：`onnxruntime-win-x64-1.24.2.zip` 为 74,075,355 B / SHA-256 `8e3e9c826375352e29cb2614fe44f3d7a4b0ff7b8028ad7a456af9d949a7e8b0`；其中 CPU `onnxruntime.dll` 为 14,148,680 B / `114947d633e6844ce3c4b51ef6678f776628571d08a5763859c61642c8dcca9c`。
- OCR Windows 资源与真实推理：DLL、上游 LICENSE/ThirdPartyNotices 已纳入 Windows 专用 Tauri resource overlay，加载前校验 SHA-256 并显式 `ort::init_from`；`cargo test ocr::tests -- --test-threads=1` 通过 5 项筛选测试，其中静态中文/英文 PNG fixture 成功识别“剪贴板搜索测试”和 `Klip OCR 2026`，含首次模型初始化的测试用例耗时 2.48s。
- OCR migration/restore 专项：v4→v5 image pending migration 1 项通过；`restore_` 9 项通过，覆盖真实 v4 无 OCR 表升级、v5 completed OCR 保留、v4/v5 必需表缺失拒绝和原有恢复边界。
- OCR search 专项：2 项通过，确认 completed OCR 文本在 worker 式增量回灌和 Tantivy 全量 rebuild 后均可查，并在索引不可用时由 SQLite OCR `LIKE` fallback 命中；同时统一增量索引只消费 `completed` 状态。
- OCR 前端专项：`pnpm lint` 通过；5 个目标测试文件共 63 项通过；`pnpm build` 通过。新增严格 OCR 类型、typed `clipboard-item-updated` 监听、store 原位替换/首次命中 upsert、completed OCR 文本预览和 pending/completed/empty/failed 双语状态。
- OCR Tauri resource 首次验收：`pnpm tauri build --debug --no-bundle` 构建成功，但 `target/debug/resources` 仅有三个模型和模型 README，未出现 Windows ONNX Runtime DLL/许可证。证据显示最新 `klip` build-script output 早于新建 `tauri.windows.conf.json`，Cargo 没有因新增平台配置文件触发旧 build script；该结果不算资源分发通过。下一步用 Tauri inspect 确认 merge 后配置，再仅清理 `klip` 包构建产物以强制 build script 重新登记新配置并重跑。
- OCR Tauri resource 修复后验收：当前 CLI 的 `tauri inspect` 不支持查看 merged config；执行一次 `cargo clean -p klip`（移除本包多套增量产物 7,735 文件/13.3 GiB，未删除 registry/第三方源码缓存）后，`pnpm tauri build --debug --no-bundle` 再次通过。生成目录现包含 3 个模型、Windows `onnxruntime.dll`、LICENSE 和 ThirdPartyNotices，DLL 大小 14,148,680 B 且 SHA-256 与 `114947...cca9c` 一致。新平台配置已被 build script 登记，不再重复 clean。
- OCR 文档收尾：README、CHANGELOG、API、DATABASE、ARCHITECTURE 已记录纯本地行为、DB v5/备份兼容、异步更新事件、worker/search 数据流、模型与 runtime 来源/哈希/体积以及非 Windows 真实验收边界；`git diff --check` 通过（仅 LF→CRLF 提示）。
- OCR 完整 `pnpm verify`：通过。ESLint 通过；20 个 Vitest 文件/147 项通过；生产构建通过；rustfmt 与 `cargo clippy -- -D warnings` 通过；Rust library 134 项通过、1 项显式 100k 性能测试 ignored，另有 2 个 main 与 5 个 clipboard integration tests 通过；真实中文 OCR fixture 包含在全量测试中。
- OCR Windows runtime acceptance：通过。以 `KLIP_DATA_DIR=C:\tmp\klip-foundation-ocr-runtime-20260807-0110\data`、`KLIP_LOG_DIR=...\logs`、`KLIP_HTTP_PORT=27831` 和 `KLIP_E2E_SHOW_WINDOW=true` 启动 `pnpm tauri:dev`；健康端点返回 `status=ok`。通过 Windows STA API 把 `chinese-text.png` 写入真实系统图片剪贴板后，monitor 保存 `id=1` / `content_type=image`，后台 OCR 返回 `status=completed` 和“剪贴板搜索测试\nKlip OCR 2026”，两个 HTTP 搜索词均命中该图片。
- OCR runtime 目录与资源证据：隔离数据目录生成 `klip.db`、Tantivy `search-index` 和 `ocr-models`；缓存模型大小及 SHA-256 与打包资源三项完全一致。隔离日志记录 OCR worker/clipboard monitor 启动、`http://127.0.0.1:27831` 监听、图片捕获、模型从隔离缓存初始化和索引 commit；验收后 Tauri、Vite、Cargo 及其子进程已全部停止。
- platform-focus Windows 首轮构建：`cargo fmt --all` 与 `cargo check` 通过；现有 Win32 HWND 行为已移入 `platform::focus`，macOS 使用前台进程 PID / `NSRunningApplication`，Linux X11 使用 EWMH `_NET_ACTIVE_WINDOW`，Wayland 与其他平台返回未尝试且不报错。
- platform-focus Linux 全仓交叉检查：已安装 Rust `x86_64-unknown-linux-gnu` 标准库目标；`cargo check --lib --target x86_64-unknown-linux-gnu` 在第三方 `zstd-sys` 构建脚本阶段失败，因为 Windows 主机缺少 `x86_64-linux-gnu-gcc`。失败发生在 Klip/X11 后端编译前，下一步用只依赖 `x11rb` 的临时最小 crate 编译实际后端文件；真实 Linux 运行仍保持 SKIPPED。
- platform-focus 目标后端静态编译：使用仓库外临时最小 crate 直接 `include!` 实际 `platform/focus/linux.rs` 与 `macos.rs`；`cargo check --target x86_64-unknown-linux-gnu` 和 `cargo check --target aarch64-apple-darwin` 均通过。输出只有临时 harness 未调用函数导致的 `dead_code` warning，实际后端无类型/API 错误。
- platform-focus Windows 专项：`cargo fmt --all -- --check`、`cargo test platform::focus -- --test-threads=1`（1 项）、`cargo test clipboard::paste -- --test-threads=1`（4 项）和 `cargo clippy -- -D warnings` 全部通过。
- platform-focus Windows runtime acceptance：通过。隔离端口 `27832` 启动应用，将唯一文本捕获为 `id=1`；外部 WinForms 文本框在显示 Klip 前为前台 `HWND 0x20e1a` / PID 8080，`POST /api/window/show` 后前台切至 Klip，`POST /api/clipboard/1/paste` 后恢复到同一目标 HWND，并完整收到 `KLIP-FOCUS-ACCEPTANCE-20260807-0145`。日志同时记录 `focus capture` 和 `focus restore`；Tauri/Vite/Cargo/WebView 与测试窗体进程已全部停止。
- platform-source Windows 编译：把原 Win32 进程文件名/窗口标题采集迁移到 `platform::source` 后，`cargo fmt --all` 与实际 Windows `cargo check` 通过。
- platform-source Linux 后端静态编译：仓库外最小 crate 直接编译实际 `platform/source/linux.rs`，`cargo check --target x86_64-unknown-linux-gnu` 通过；覆盖 `_NET_ACTIVE_WINDOW`、`_NET_WM_PID`、UTF-8 `_NET_WM_NAME`/`WM_NAME` fallback 和 `/proc` 应用名解析的类型/API。真实 X11/Wayland 运行仍为 SKIPPED。
- platform-source macOS 后端静态编译：仓库外最小 crate 直接编译实际 `platform/source/macos.rs`，`cargo check --target aarch64-apple-darwin` 通过；确认 `NSWorkspace.frontmostApplication`、应用名 fallback、ApplicationServices Accessibility FFI 与 Core Foundation 所有权处理可编译。真实授权/未授权桌面运行仍为 SKIPPED。
- platform-source DB v6 编译与专项：`cargo check` 通过；来源专项筛选 5 项通过，覆盖 monitor 落库、哈希冲突有来源更新/无来源保留、v5→v6 空值迁移、JSON v1 导入导出保留、v6 backup restore 保留。
- platform-source restore 回归：`cargo test database::data_portability::tests::restore_ -- --test-threads=1` 通过 11 项，包含真实 v5 缺少来源列恢复为 `NULL`、v6 缺来源列在 mutation 前拒绝，以及既有 v3/v4/v5/损坏/新版本边界；查询列顺序专项 1 项通过。
- platform-source 前端/API 专项：`pnpm test -- --run src/components/clipboard/ClipboardItem.test.tsx` 通过 25 项（含有来源显示/tooltip 与无来源不显示）；`pnpm build` 通过；OpenAPI nullable/required 来源字段专项 1 项通过。
- platform-source 完整 targeted 静态检查：monitor 9 项、connection/migration 12 项、restore 11 项、OpenAPI 6 项通过；`pnpm lint`、`cargo fmt --all -- --check`、`cargo clippy -- -D warnings` 和 `git diff --check` 均通过。
- platform-source Windows runtime acceptance：通过。隔离数据/日志与端口 `27833` 启动完整 Tauri dev；外部 WinForms 窗口进程 `powershell.exe`、标题 `Klip Source Acceptance Target` 在保持前台时写入 `KLIP-SOURCE-ACCEPTANCE-20260807-0202`。HTTP 和 SQLite 均返回 `id=1`、相同应用名/标题，`db_version=6`。验收后 Klip/Vite/Cargo/WebView/目标窗体共 21 个进程全部停止，端口 `1420/27833` 已释放；证据目录为 `C:\tmp\klip-source-runtime-20260807-0202`。
- 工具链文档审查：确认 `3669c83` 的 CHANGELOG 已明确 DB v4 备份向旧版不兼容；search、rich-text、OCR、platform-focus、platform-source 的用户行为、限制和必要配置已随对应功能提交写入 README/CHANGELOG/API/DATABASE/ARCHITECTURE。README 新增冻结 lockfile 初始化、三个隔离 env、单 worktree 串行规则与可选 sccache。
- 最终提交边界审查：通过。`423ab24..77d7959` 依次为进度初始化、clipboard-rs、search、search 记录、rich-text、rich-text 记录、OCR、OCR 记录、platform-focus、focus 记录、platform-source、source 记录、开发工作流文档；六个实现提交未混入其他大型功能。OCR 的 50 文件/27,078 行主要来自约 21.5 MB 模型、14.1 MB runtime、字典及第三方许可证，属于同一离线 OCR 交付边界。
- 最终 `pnpm verify`：通过，用时 225.7 秒。ESLint 通过；20 个 Vitest 文件/149 项通过；生产构建通过；`cargo fmt -- --check` 与 `cargo clippy -- -D warnings` 通过；Rust library 143 项通过、1 项显式 100k 性能测试 ignored，另有 2 个 main 与 5 个 clipboard integration tests 通过。
- 最终 Windows Selenium E2E 首次尝试：业务测试未执行。Tauri/WebView2 版本为 `151.0.4129.59`，PATH 中 `msedgedriver 148.0.3967.70` 只支持 Edge 148，建 session 报 `SessionNotCreatedError`。`scripts/run-e2e.ps1` 的 `finally` 最后一条成功命令还掩盖了 Mocha 非零退出码，使外层进程显示 exit 0；本轮先不改脚本，下一路径是在临时目录下载精确匹配的 Driver 151、临时前置 PATH 后重跑。
- 最终 Windows Selenium E2E 第二次尝试：临时 EdgeDriver `151.0.4129.59` 成功创建真实 WebView session，捕获和搜索等待均通过；把剪贴板覆盖为外部文本后，测试在未等待虚拟列表重渲染的最终 `findElement` 报 `NoSuchElementError`。处理方案改为复用 `waitForText` 返回稳定元素后点击，并让 `run-e2e.ps1` 显式检查 Mocha `$LASTEXITCODE`，避免业务失败被报告为 exit 0；修正后运行 lint 和同一 E2E。
- E2E 方案调整：外部 `Set-Clipboard` 会触发窗口自动隐藏，因此在覆盖剪贴板后调用真实 `/api/window/show` 再定位历史条目；runner 为应用与测试进程共享隔离 `KLIP_HTTP_PORT`（默认 `27718`）并在退出时恢复原环境。该项代码尚未重新验证。
- E2E 方案调整后重跑：`/api/window/show` 成功但原搜索视图在夺焦/恢复后仍不稳定，定位等待超时；下一方案是在重新显示后重新定位搜索输入并再次提交关键词，再等待历史条目。
- E2E 数据诊断：覆盖后 API 返回两条记录且原文本匹配 `id=1`，恢复后的 WebView 只渲染最新外部文本行；确认不是 SQLite/剪贴板捕获丢数据。下一方案是在显示窗口后刷新 WebView，再搜索并点击原记录。
- tauri:dev 完整闭环首次尝试：健康端点启动成功，但在外部窗口句柄等待阶段超时；该次证据写在 shell 隔离的 `C:\tmp`，无法跨命令读取。下一次把证据改到 worktree ignored `e2e/.tmp`，并用 Win32 前台 HWND/标题枚举替代 `Get-Process.MainWindowHandle`。
- 最终 Windows Selenium E2E：通过。临时 EdgeDriver `151.0.4129.59` 与 WebView2 匹配；真实 Tauri WebView 完成剪贴板捕获、关键词搜索、外部剪贴板覆盖后窗口显示、刷新 hydration、记录点击和剪贴板恢复，1 项通过；runner 现会传播 Mocha 失败退出码并隔离 HTTP 端口 `27718`。
- 最终 Windows tauri:dev runtime：通过。证据目录 `D:\Study\cc\klip\.worktrees\foundation\e2e\.tmp\final-runtime-20260807-023846`；`KLIP_HTTP_PORT=27834`，数据/索引位于隔离 `data`，日志位于隔离 `logs`。目标窗体 `powershell.exe` / `Klip Final Acceptance Target 20260807-023846` 写入 `KLIP-FINAL-ACCEPTANCE-20260807-023846`；来源 API 保留应用与标题。显示 Klip 前台 HWND `21105954`，显示后 Klip HWND `3608040`，粘贴后恢复 `21105954`，目标文本框收到准确文本。Klip、Vite、Cargo、WebView、目标窗体均由验收脚本停止。
- 默认目录回退尝试：健康端点 `27717` 通过，但在临时 `APPDATA=D:\Study\cc\klip\.worktrees\foundation\e2e\.tmp\default-runtime-20260807-024658\AppData\Roaming` / `LOCALAPPDATA` 下，Windows Tauri Known Folder API 仍解析到真实 `C:\Users\AllureLove\AppData\Roaming\com.klip.app`（诊断端点已返回该路径）；未发送剪贴板输入，端口已释放。标记 `SKIPPED/BLOCKED`：当前用户环境没有可安全替代 Known Folder 的 Windows 用户配置，解除条件是隔离测试用户/VM 或产品提供显式默认目录注入点。
- 最终 `pnpm verify` 重跑首次结果：前端 lint、Vitest 20/149、build、rustfmt、Clippy 均通过；Cargo 在移除/重链 `src-tauri/target/debug/klip.exe` 时因残留进程 PID `40088`（启动于默认目录回退尝试）占用文件，报 Windows `os error 5`。已按精确可执行路径停止该 PID，未改动源码；清理后重跑。
- 最终 `pnpm verify` 重跑：通过，用时 185.2 秒。ESLint 通过；20 个 Vitest 文件/149 项通过；生产构建通过；`cargo fmt -- --check` 与 `cargo clippy -- -D warnings` 通过；Rust library 143 项通过、1 项显式 100k 性能测试 ignored，另有 2 个 main 与 5 个 clipboard integration tests 通过。随后 `git diff --check` 通过。
- push：通过。`git push -u origin feat/foundation` 的 pre-push verify 全绿，远端新建 `origin/feat/foundation`；GitHub 提示 PR 创建入口 `https://github.com/AllureCurtain/klip/pull/new/feat/foundation`。本次 push 未修改 `main`。
- PR：通过。`gh pr create --base main --head feat/foundation` 创建 `https://github.com/AllureCurtain/klip/pull/4`，标题为 `feat: complete the clipboard foundation stack`；正文包含功能摘要、完整提交清单、测试证据、DB v4/v5/v6、OCR 资源/体积、平台权限与降级、默认目录回退阻塞及所有 SKIPPED 项。PR 未合并。
- PR 交付记录 push：通过。`387392b` 已推送，pre-push `pnpm verify` 再次全绿；PR head 与远端分支同步。

## 技术决策

- 所有平台、所有内容类型统一使用 `clipboard-rs 0.3.5`；移除 `clipboard-master`、`clipboard-win`、`arboard` 的运行时调用。
- clipboard-rs 图片写入不能可靠地与自定义标记共存，因此统一使用一次性、带 3 秒 TTL 的内容哈希抑制；写入失败时解除抑制。
- release profile 保持 `panic = "abort"`；Tantivy/OCR 的损坏和推理故障必须使用显式 `Result` 错误路径，不依赖 `catch_unwind`。
- 新索引和模型目录必须复用 `database::connection::app_data_dir()`。
- Tantivy 固定为 `0.24.2`，搭配使用同一 `tantivy-tokenizer-api 0.5` 的 `tantivy-jieba 0.16.0`；索引使用默认 LZ4 压缩与 `LogMergePolicy`。
- 同一路径的 IPC/HTTP SQLite 连接共享一个 Tantivy writer；每 50 条或 5 秒提交，查询前刷新待提交内容。
- SQLite 是事实源：索引 checksum/记录数异常时保留损坏目录并全量重建；任何索引错误都回退现有 `LIKE`，不让搜索故障阻断数据库写入。
- rich-text 继续以 `clipboard_items.content` 的纯文本作为哈希、敏感检测和搜索事实源；`clipboard_formats` 原子保存 text/html/rtf，重复哈希使用最新捕获格式，旧 JSON 导入命中现有记录时不清空已有富格式。
- 前端 HTML 预览使用 DOMPurify 明确允许的安全标签与 `href`/`title` 属性；禁止图片、脚本、事件属性、样式和危险 URI，清洗为空时回退纯文本。
- OCR 固定 `oar-ocr = "=0.6.2"`，使用 PP-OCRv5 mobile 检测/识别模型与中文通用字典；模型打包随应用分发，运行时不联网下载。
- `oar-ocr` 的 0.6.x 依赖范围不能任由 Cargo 升到不兼容的 core/ort 组合；必须把验证通过的传递版本一并锁定，并在升级时重新做编译与推理验收。
- OCR 的 ONNX Runtime 分发必须同时满足本机 MSVC ABI、离线运行和安装包携带；若官方静态库与现有 toolset 不兼容，优先切换 `ORT_PREFER_DYNAMIC_LINK=1` + 显式打包 `onnxruntime.dll`，而不是伪造缺失 STL 符号或升级整机工具链后声称项目本身可复现。
- 焦点恢复以平台进程/窗口标识为短期进程内状态：Windows 保存 HWND，macOS 保存前台应用 PID，Linux X11 保存 EWMH 活动窗口；捕获到 Klip 自身时保留上一外部目标，失效目标清空。Wayland 没有通用激活协议，明确静默跳过。
- 来源持久化使用 DB v6 的 `clipboard_items.source_application` / `source_window_title` 可空列。monitor 走专用带来源插入接口；普通插入或导入缺少来源时不清空哈希冲突记录的旧来源，已知新来源则更新应用和与其配套的可空窗口标题。
- DB v5 备份恢复时两个来源字段回填 `NULL`；DB v6 备份必须同时具备两个字段并原样保留，否则在修改当前数据库前拒绝。JSON v1 随 Rust 类型自然兼容新增可空字段；CSV v1 固定表头暂不增加来源列，避免破坏既有严格导入契约。

## 阻塞或跳过项

- RESOLVED：`gh auth status` 最终确认 `AllureCurtain` keyring token 有效；push 和 PR #4 创建均成功。
- 默认目录无 env 的安全回退验收为 `SKIPPED/BLOCKED`：Windows Known Folder API 忽略临时 `APPDATA` 覆盖，不能在真实用户目录上继续做写入验收；健康端点回落到 `27717` 已观察，数据/日志路径结论仅作为平台证据，不声称完整隔离通过。
- Windows 浏览器/Word 真实富文本闭环与 macOS/Linux 真实平台验收保持 SKIPPED；Windows 完整分支已通过真实 Selenium WebView 与外部文本框“捕获 → 显示 Klip → 选择历史粘贴 → 焦点返回”闭环，分支 push 和 PR #4 创建均已完成。富文本真实浏览器/Word 验收仍因未提供独立测试材料保持 SKIPPED。
- SKIPPED：当前只有 Windows 真实桌面，无法实机验证 macOS `NSRunningApplication` 或 Linux X11/Wayland 桌面焦点行为；实际后端已分别通过 `aarch64-apple-darwin` / `x86_64-unknown-linux-gnu` 最小交叉静态编译。解除条件是提供对应真实桌面会话；不阻塞 Windows 验收及后续独立功能。
- OCR 静态链接 BLOCKED 已解除：14.43 与官方静态包 ABI 不兼容，已改用官方 1.24.2 动态 DLL；DLL 入包后的 Windows 真实推理已通过，macOS/Linux 真实环境验收仍未执行且不得声称通过。
- SKIPPED：用户未提供独立 rich-text 测试文件；已用内建恶意 HTML、DB migration/restore 和 Windows clipboard-rs 集成测试覆盖，若后续提供文件可在最终验收补跑。

## 下一步准确操作

- 无剩余自动实施或交付命令；后续由 PR #4 审查流程决定是否合并，本执行不 merge main。
- 解除默认目录回退阻塞需隔离 Windows 测试用户/VM；真实 macOS/Linux 与浏览器/Word 富文本验收需对应桌面/应用环境和测试材料。
