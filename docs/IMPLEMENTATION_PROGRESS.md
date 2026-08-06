# Foundation Implementation Progress

- 最后更新时间：2026-08-06 23:17（Asia/Shanghai）
- 当前分支：`feat/foundation`
- 基准提交：`423ab24`（与 `main` / `origin/main` 一致）

## 已完成部分及 commit SHA

- `423ab24`：本轮实现基线，与 `main` / `origin/main` 一致。
- `d30e26c`：独立初始化本持续实施进度记录并审核单 worktree 策略。
- `909040d`：完成 clipboard-rs 统一 backend、哈希抑制、monitor/writer/format 迁移及针对性验证。
- `0dc501b`：完成 Tantivy 全文索引、jieba 中文分词、批量/定时提交、删除同步、损坏重建和 SQLite `LIKE` 降级。

## 当前任务

- 当前任务：rich-text 功能块；先审查 clipboard-rs HTML/RTF API、现有数据库迁移/备份结构和前端 renderer，再落地 DB v4 与多格式捕获/写回。
- search 已在 `0dc501b` 提交；尚未开始 rich-text 代码改动。
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

## 技术决策

- 所有平台、所有内容类型统一使用 `clipboard-rs 0.3.5`；移除 `clipboard-master`、`clipboard-win`、`arboard` 的运行时调用。
- clipboard-rs 图片写入不能可靠地与自定义标记共存，因此统一使用一次性、带 3 秒 TTL 的内容哈希抑制；写入失败时解除抑制。
- release profile 保持 `panic = "abort"`；Tantivy/OCR 的损坏和推理故障必须使用显式 `Result` 错误路径，不依赖 `catch_unwind`。
- 新索引和模型目录必须复用 `database::connection::app_data_dir()`。
- Tantivy 固定为 `0.24.2`，搭配使用同一 `tantivy-tokenizer-api 0.5` 的 `tantivy-jieba 0.16.0`；索引使用默认 LZ4 压缩与 `LogMergePolicy`。
- 同一路径的 IPC/HTTP SQLite 连接共享一个 Tantivy writer；每 50 条或 5 秒提交，查询前刷新待提交内容。
- SQLite 是事实源：索引 checksum/记录数异常时保留损坏目录并全量重建；任何索引错误都回退现有 `LIKE`，不让搜索故障阻断数据库写入。

## 阻塞或跳过项

- 最终 PR 创建存在外部认证风险：`gh auth status` 报 GitHub 账户 `AllureCurtain` 的 keyring token invalid，建议命令为 `gh auth login -h github.com`。实现与本地提交不受影响；最终仍会分别实测 `git push` 和 `gh pr create`，只有实际失败后才把对应交付项标为 BLOCKED。
- Windows 手工 UI 闭环、macOS/Linux 真实平台验收、rich-text 及后续功能、推送和 PR 创建尚未执行。

## 下一步准确操作

- 仅提交本次 search SHA/清单状态记录并确认工作树干净；随后审查 clipboard-rs 的 `get_html()` / `get_rich_text()` / 多格式 `set()`、migration 与前端 renderer 测试，列出 rich-text 的准确修改面后开始实现。
