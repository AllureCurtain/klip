# Foundation Implementation Progress

- 最后更新时间：2026-08-06 22:42（Asia/Shanghai）
- 当前分支：`feat/foundation`
- 基准提交：`423ab24`（与 `main` / `origin/main` 一致）

## 已完成部分及 commit SHA

- `423ab24`：基础分支当前基线，尚未包含本轮功能实现。
- `551c062`、`6bfdf22`：实施 worktree 策略文档已存在于历史中；当前策略文件还有未提交的审核后修订。
- clipboard-rs 地基迁移已开始但尚未提交：新增统一 backend 与哈希抑制模块，monitor、writer、format 及 Linux 平台代码已迁移部分逻辑。

## 当前任务

- 当前任务：search-tantivy 功能块；先完成 Tantivy 索引模块、查询降级和删除同步的设计审查，再实现并测试。
- clipboard-rs 地基代码已完成针对性验证，准备提交独立功能 commit；Windows 完整“监听 → 捕获 → 选择历史 → 粘贴”闭环仍列为最终运行时验收项。
- 文档初始记录已在 `d30e26c` 独立提交；后续每个功能块完成前更新本文件并随功能提交。

## 已运行的测试及结果

- 本轮开始前未发现可复用的测试结果记录。
- `pnpm install --frozen-lockfile`：通过，prepare 已安装 foundation worktree 的 pre-push hook。
- `cargo fmt --check`：通过。
- `cargo test`：通过，110 个库测试、2 个 main 测试、5 个 clipboard integration tests，共 117 个测试通过。
- `cargo clippy -- -D warnings`：通过。
- `git diff --check`：通过；仅有 CRLF 转换提示。
- Windows runtime smoke：`pnpm tauri:dev` 已启动 `klip.exe`；`KLIP_DATA_DIR=C:\tmp\klip-foundation\data` 下生成 `klip.db`/WAL，`KLIP_LOG_DIR=C:\tmp\klip-foundation\logs` 下生成日志文件；进程已停止。完整 UI 闭环尚未执行。

## 技术决策

- 所有平台、所有内容类型统一使用 `clipboard-rs 0.3.5`；移除 `clipboard-master`、`clipboard-win`、`arboard` 的运行时调用。
- clipboard-rs 图片写入不能可靠地与自定义标记共存，因此统一使用一次性、带 3 秒 TTL 的内容哈希抑制；写入失败时解除抑制。
- release profile 保持 `panic = "abort"`；Tantivy/OCR 的损坏和推理故障必须使用显式 `Result` 错误路径，不依赖 `catch_unwind`。
- 新索引和模型目录必须复用 `database::connection::app_data_dir()`。

## 阻塞或跳过项

- 暂无已确认的外部阻塞。
- Windows 手工 UI 闭环、macOS/Linux 真实平台验收、search 及后续功能、推送和 PR 创建尚未执行。

## 下一步准确操作

- 仅暂存 clipboard-rs 地基相关代码、`Cargo.toml`/`Cargo.lock`、本进度记录和策略清单，创建 `refactor: unify clipboard backend on clipboard-rs`；提交后确认工作树干净，再开始 search。
