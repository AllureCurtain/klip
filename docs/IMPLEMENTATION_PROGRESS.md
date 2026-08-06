# Foundation Implementation Progress

- 最后更新时间：2026-08-07 01:20（Asia/Shanghai）
- 当前分支：`feat/foundation`
- 基准提交：`423ab24`（与 `main` / `origin/main` 一致）

## 已完成部分及 commit SHA

- `423ab24`：本轮实现基线，与 `main` / `origin/main` 一致。
- `d30e26c`：独立初始化本持续实施进度记录并审核单 worktree 策略。
- `909040d`：完成 clipboard-rs 统一 backend、哈希抑制、monitor/writer/format 迁移及针对性验证。
- `0dc501b`：完成 Tantivy 全文索引、jieba 中文分词、批量/定时提交、删除同步、损坏重建和 SQLite `LIKE` 降级。
- `3669c83`：完成 DB v4 多格式存储、clipboard-rs HTML/RTF 捕获与写回、v3/v4 备份兼容和 DOMPurify 安全预览。
- `58da1e8`：完成 DB v5 图片 OCR、PP-OCRv5/ONNX Runtime 离线资源、异步 worker、搜索回灌、前端状态和 Windows runtime acceptance。

## 当前任务

- 当前任务：`platform-focus` 功能块；先审查现有 `PREV_FOREGROUND_HWND`、窗口显示与粘贴调用链以及 `platform/` 模块边界，再按现有模式抽象平台无关的“上一个前台窗口”接口。
- OCR 已在 `58da1e8` 提交；当前工作树只应包含本次里程碑进度记录，提交后再开始修改 `platform-focus` 代码。
- Windows 完整“监听 → 捕获 → 选择历史 → 粘贴”闭环仍列为最终运行时验收项。

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

## 阻塞或跳过项

- 最终 PR 创建存在外部认证风险：`gh auth status` 报 GitHub 账户 `AllureCurtain` 的 keyring token invalid，建议命令为 `gh auth login -h github.com`。实现与本地提交不受影响；最终仍会分别实测 `git push` 和 `gh pr create`，只有实际失败后才把对应交付项标为 BLOCKED。
- Windows 手工 UI 完整“选择历史 → 粘贴”闭环、浏览器/Word 真实富文本闭环、macOS/Linux 真实平台验收、platform-focus、platform-source、推送和 PR 创建尚未执行；Windows OCR 的真实剪贴板捕获与搜索链路已通过。
- OCR 静态链接 BLOCKED 已解除：14.43 与官方静态包 ABI 不兼容，已改用官方 1.24.2 动态 DLL；DLL 入包后的 Windows 真实推理已通过，macOS/Linux 真实环境验收仍未执行且不得声称通过。
- SKIPPED：用户未提供独立 rich-text 测试文件；已用内建恶意 HTML、DB migration/restore 和 Windows clipboard-rs 集成测试覆盖，若后续提供文件可在最终验收补跑。

## 下一步准确操作

- 只暂存 `docs/IMPLEMENTATION_PROGRESS.md` 并提交 OCR 里程碑进度；确认工作树干净后读取 `src-tauri/src/lib.rs`、`commands/mod.rs`、`platform/mod.rs` 及 Windows/macOS/Linux 平台文件，定位焦点捕获和恢复的全部调用点与已有平台依赖。
