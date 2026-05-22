# Klip 开发报告

> 生成时间：2026-05-22
> 当前分支：`feat/linux-support`
> 当前 HEAD：`32a70ed scope linux path dependency`
> 对比基线：`main` / `origin/main` 的 `9fcf012 docs: add release handoff`
> 说明：本报告基于当前 Git worktree、`docs/GOAL.md`、`docs/RELEASE_HANDOFF.md`、`docs/ROADMAP.md`、`docs/PRD.md` 和 `feat/linux-support` 分支提交历史整理。

## 1. 总览

`feat/linux-support` 分支完成了 Phase 3 Linux 平台适配的一批代码层面工作，重点覆盖：

- Linux 平台模块 `src-tauri/src/platform/linux.rs`。
- Linux 剪贴板读写和粘贴模拟的基础实现。
- Linux 自启动 `.desktop` 文件支持。
- Linux 数据目录和日志目录路径适配。
- Windows 依赖和 Linux 依赖的 target 条件化整理。
- Linux E2E runner 和文档说明。
- 针对 Linux URI、自启动路径、数据目录路径的 Rust 单元测试。

当前分支已经推送到 `origin/feat/linux-support`。工作树中仍有未跟踪文件 `docs/GOAL.md`，它是任务上下文文件，未纳入本分支提交。

## 2. 分支提交明细

`feat/linux-support` 相对 `main` 当前共有 5 个提交：

```text
8419523 feat: add linux platform support
539f8f1 fix linux clipboard file uri escaping
d17c524 test linux autostart desktop path
9c1aa9f test linux data and log paths
32a70ed scope linux path dependency
```

### 2.1 `8419523 feat: add linux platform support`

这是 Linux 支持的主体实现提交，变更范围最大，涉及后端平台抽象、剪贴板模块、热键粘贴、数据路径、日志、自启动和 E2E 文档。

主要文件：

- `src-tauri/src/platform/linux.rs`：新增 Linux 平台模块。
- `src-tauri/src/platform/mod.rs`：导出平台模块。
- `src-tauri/src/clipboard/writer.rs`：新增统一剪贴板写入模块。
- `src-tauri/src/clipboard/monitor.rs`：重构监听模块，抽出写入逻辑。
- `src-tauri/src/commands/mod.rs`：Linux 自启动、诊断路径、粘贴分支适配。
- `src-tauri/src/database/connection.rs`：Linux 数据库路径适配。
- `src-tauri/src/hotkey/manager.rs`：Linux quick paste 改走平台粘贴模拟。
- `src-tauri/src/main.rs`：Linux 日志目录和自启动恢复适配。
- `src-tauri/Cargo.toml`：Windows 依赖移入 Windows target block。
- `scripts/run-e2e-linux.sh`、`e2e/README.md`：新增 Linux E2E 运行路径和说明。

#### Linux 平台模块

新增 `src-tauri/src/platform/linux.rs`，集中承载 Linux 特有逻辑：

- `data_dir()`：解析 Linux 应用数据目录。
  - 优先使用 `XDG_DATA_HOME`。
  - 否则使用 `~/.local/share`。
  - 最终拼接 `klip`，目标路径为 `~/.local/share/klip`。
- `log_dir()`：基于 `data_dir()` 拼接 `logs`，目标路径为 `~/.local/share/klip/logs`。
- `set_text()` / `get_text()`：Linux 剪贴板文本读写。
  - Wayland 下优先使用 `wl-copy` / `wl-paste`。
  - X11 或通用场景尝试 `xclip`、`xsel`。
  - 最后回退到 `arboard`。
- `set_file_list()`：使用 `text/uri-list` 写入 Linux 文件列表剪贴板。
  - Wayland 使用 `wl-copy --type text/uri-list`。
  - X11 使用 `xclip -selection clipboard -t text/uri-list`。
  - `xsel` 作为备用写入路径。
- `simulate_paste()`：Linux 粘贴模拟。
  - X11 下优先使用 `xdotool key --clearmodifiers ctrl+v`。
  - Wayland 下尝试 `ydotool` 和 `wtype`。
  - 最后回退到 `enigo`。
  - Wayland 合成输入可能被桌面环境阻止，因此实现中保留 warning 和错误提示。
- `set_autostart()` / `is_autostart_enabled()`：Linux 自启动 `.desktop` 文件支持。
  - 写入位置为 `$XDG_CONFIG_HOME/autostart/klip.desktop` 或 `~/.config/autostart/klip.desktop`。
  - 开启时创建父目录并写入 desktop entry。
  - 关闭时删除该文件。

#### 剪贴板写入重构

新增 `src-tauri/src/clipboard/writer.rs`，将原本混在 `monitor.rs` 里的 copy-back 写入逻辑抽出：

- Windows 仍使用 Win32 剪贴板 API 和自拷贝 marker。
- Linux 文本写入改走 `platform::linux::set_text()`。
- Linux 文件列表写入改走 `platform::linux::set_file_list()`。
- 非 Windows 图片写入仍使用 `arboard`。
- 统一导出 `clipboard::copy_to_clipboard`，符合“所有 clipboard mutation 通过 `clipboard::copy_to_clipboard`”的约束。

这项重构的取舍是：保留 Windows 已验证路径不变，把 Linux 平台差异集中到 `platform/linux.rs`；同时减少 `monitor.rs` 的职责，让监听和写入分离。

#### 剪贴板监听适配

`clipboard/monitor.rs` 做了结构性调整：

- Windows 继续使用 `clipboard-master` 事件监听和格式策略。
- Linux 和其他非 Windows 平台继续采用轮询式文本读取路径。
- Linux 文本读取通过 `platform::linux::get_text()`，从而可以使用 `wl-paste`、`xclip`、`xsel` 或 `arboard`。
- 文件/图片监听在 Linux 下仍未做到完整原生格式读取，这是本阶段明确保留的后续事项。

注意：本轮后续任务明确要求“先跳过 clipboard monitoring 的 xclip/xsel 真实测试”，因此这里属于代码层面适配，尚未在真实 Linux 桌面会话中完成验收。

#### 粘贴行为适配

`commands::paste_from_clipboard` 和 `hotkey::quick_paste` 的 Linux 分支改为调用 `platform::linux::simulate_paste()`：

- 避免在多个调用点手写 `Ctrl+V`。
- X11 和 Wayland 的差异集中处理。
- quick paste 中 Linux 粘贴失败只记录 warning，不中断整体流程；普通 IPC 粘贴会返回错误。

技术取舍：

- X11 的 `xdotool` 是相对成熟的方案。
- Wayland 出于安全设计会限制合成输入，因此只能通过 `ydotool`、`wtype` 或 `enigo` 做尽力而为。
- 不把 Wayland 粘贴模拟写成“保证可用”，文档中明确记录限制。

#### 自启动适配

`commands::set_auto_start` 在 Linux 下不使用 `tauri-plugin-autostart`，改为：

- 获取 `std::env::current_exe()`。
- 调用 `platform::linux::set_autostart(enabled, &exe)`。
- 同步数据库配置 `auto_start`。
- 发出 `config-changed` 事件。

`main.rs` 的 `restore_autostart_state()` 也增加 Linux 分支：

- 启动时读取数据库中的 `auto_start`。
- Linux 下按照配置写入或删除 `.desktop` 文件。
- 非 Linux 平台继续使用 `tauri-plugin-autostart`。

这样做的原因是 Linux 桌面环境对 autostart 的事实标准就是 XDG autostart `.desktop` 文件，直接写入比依赖跨平台插件更可控，也便于后续测试路径。

#### 数据目录和日志目录适配

`database::connection::get_db_path()`：

- Linux 下使用 `platform::linux::data_dir()`。
- 数据库文件路径变为 `~/.local/share/klip/klip.db` 或 `$XDG_DATA_HOME/klip/klip.db`。

`main.rs::init_tracing()`：

- Linux 下使用 `platform::linux::log_dir()`。
- 日志路径变为 `~/.local/share/klip/logs/klip.log.YYYY-MM-DD` 或 `$XDG_DATA_HOME/klip/logs/...`。

`commands::get_diagnostics_info()`：

- Linux 下诊断信息返回同一套 Linux 数据目录和日志目录。

#### 依赖条件化

`src-tauri/Cargo.toml` 在该提交中先把 Windows 专用依赖移入 target block：

```toml
[target.'cfg(windows)'.dependencies]
clipboard-master = "4.0.0"
clipboard-win = "5"
windows = { version = "0.59", features = [...] }
```

这满足 Phase 3 对 `windows = "0.59"` 和 Win32 feature 使用 `#[cfg]`/target 保护的要求，减少 Linux 构建时对 Windows-only crate 的直接依赖暴露。

#### E2E 适配

新增 `scripts/run-e2e-linux.sh`：

- 检查 `tauri-driver`。
- 默认执行 `pnpm build` 和 `cargo build`。
- 使用 `src-tauri/target/debug/klip`。
- 为 E2E 创建隔离目录：`e2e/.tmp/run-*/config` 和 `e2e/.tmp/run-*/data`。
- 设置 `XDG_CONFIG_HOME` 和 `XDG_DATA_HOME`，避免污染真实用户目录。
- 启动 `tauri-driver` 后运行 Mocha E2E。

`e2e/README.md` 增加 Linux 环境说明：

- 需要真实桌面会话。
- X11 建议安装 `xclip`、`xsel`、`xdotool`。
- Wayland 建议安装 `wl-clipboard`，并视桌面环境尝试 `wtype` 或 `ydotool`。
- 明确说明 Wayland 可能阻止全局快捷键和合成粘贴。

### 2.2 `539f8f1 fix linux clipboard file uri escaping`

该提交修复 Linux 文件列表写入中的 URI 编码问题。

原实现：

```rust
format!("file://{}", path)
```

问题：

- 路径中包含空格、`#`、中文等字符时，不符合 URI 编码要求。
- `text/uri-list` 消费方可能无法正确识别文件路径。

新实现：

- 新增 `file_uri_from_path(path: &Path) -> String`。
- 保留 `/` 路径分隔符。
- 对非 unreserved 字节做百分号编码。
- 非 ASCII 字符按 UTF-8 字节编码，例如 `截图.png` 转为 `%E6%88%AA%E5%9B%BE.png`。

新增测试：

- `file_uri_preserves_path_separators_and_escapes_special_bytes`
  - 验证 `/home/me/My File #1.txt` 变为 `file:///home/me/My%20File%20%231.txt`。
- `file_uri_escapes_non_ascii_as_utf8_bytes`
  - 验证中文文件名按 UTF-8 百分号编码。
- `shell_escape_wraps_and_escapes_single_quotes`
  - 验证 `.desktop` Exec 路径中的单引号 shell escaping。
- `desktop_entry_uses_escaped_exec_path`
  - 验证 desktop entry 的 Exec 行使用 escape 后路径。

技术取舍：

- 没有引入额外 URI crate，使用小型内部函数完成 Linux 文件 URI 需求。
- 该函数只处理本地文件路径转 `file://` URI，不扩展为通用 URL 编码器。

### 2.3 `d17c524 test linux autostart desktop path`

该提交主要提升 Linux 自启动路径逻辑的可测试性。

变更：

- 新增 `autostart_file_path_from_env(xdg_config_home, home_dir)`。
- `autostart_file_path()` 保持读取真实环境变量和 home 目录，但委托给可注入 helper。
- 新增单元测试：
  - `autostart_path_uses_xdg_config_home`
  - `autostart_path_falls_back_to_home_config`

验证覆盖：

- 当 `XDG_CONFIG_HOME=/tmp/xdg-config` 时，路径为 `/tmp/xdg-config/autostart/klip.desktop`。
- 当没有 `XDG_CONFIG_HOME` 但 home 为 `/home/me` 时，路径为 `/home/me/.config/autostart/klip.desktop`。

技术取舍：

- 没有在测试中修改真实进程环境变量，也没有写真实用户目录。
- 用 dependency-injected helper 让路径规则可测试，降低测试副作用。

### 2.4 `9c1aa9f test linux data and log paths`

该提交让 Linux 数据目录和日志目录规则具备直接测试覆盖。

变更：

- 新增 `data_dir_from_env(xdg_data_home, home_dir, temp_dir)`。
- `data_dir()` 继续读取真实环境，但委托给 helper。
- 新增单元测试：
  - `data_dir_uses_xdg_data_home`
  - `data_dir_falls_back_to_home_local_share`

验证覆盖：

- 当 `XDG_DATA_HOME=/tmp/xdg-data` 时，数据目录为 `/tmp/xdg-data/klip`。
- 当没有 `XDG_DATA_HOME` 但 home 为 `/home/me` 时，数据目录为 `/home/me/.local/share/klip`。
- 日志目录为数据目录下的 `logs`，即 `/home/me/.local/share/klip/logs`。

技术取舍：

- 与自启动路径测试一致，避免测试污染真实环境。
- 保留 `std::env::temp_dir()` 作为极端情况下无法解析 home 的 fallback。

### 2.5 `32a70ed scope linux path dependency`

该提交整理 Rust 依赖的 target 条件。

变更：

- 将 `dirs = "6"` 从全局依赖移到 Linux target block：

```toml
[target.'cfg(target_os = "linux")'.dependencies]
dirs = "6"
```

原因：

- 当前项目自有代码中只有 `src-tauri/src/platform/linux.rs` 使用 `dirs::home_dir()`。
- 将其设为 Linux-only 依赖更符合 Phase 3 的“Cargo.toml 平台依赖”要求。
- Windows-only 依赖已经在 `8419523` 中移入 `[target.'cfg(windows)'.dependencies]`。

没有移动的依赖：

- `arboard` 保持全局：当前非 Windows 文本/图片处理和 Linux fallback 仍使用它，且多个模块存在通用调用点。
- `enigo` 保持全局：Windows、macOS 和 Linux 粘贴模拟路径仍存在调用点。
- `tauri-plugin-autostart` 保持全局：main builder 仍注册该插件，非 Linux 平台通过 `ManagerExt` 使用。

技术取舍：

- 只移动已经明确 Linux-only 的 `dirs`，避免为了形式上的条件化而引入大范围代码改造。
- 保持 manifest 改动小而可验证。

## 3. 已完成的 Phase 3 工作

### 3.1 剪贴板相关

已完成：

- 新增 Linux 文本剪贴板读写基础能力。
- 支持 Wayland `wl-copy` / `wl-paste`。
- 支持 X11 `xclip` / `xsel`。
- 支持 `arboard` fallback。
- Linux 文件 copy-back 支持 `text/uri-list` 写入。
- 修复文件 URI 百分号编码。
- 将剪贴板写入逻辑抽出到 `clipboard/writer.rs`，保持 mutation 入口统一。

仍需验证或完善：

- Linux 剪贴板监听没有在真实 X11/Wayland 桌面会话中验证。
- Linux 文件和图片的原生剪贴板格式读取仍不完整。
- `xclip` / `xsel` / `wl-clipboard` 的交互行为需要真实桌面测试。
- Wayland 下 `wl-paste --no-newline` 对不同 compositor 的行为需要确认。

### 3.2 粘贴模拟

已完成：

- `paste_from_clipboard` Linux 分支调用 `platform::linux::simulate_paste()`。
- quick paste Linux 分支调用同一平台函数。
- X11 优先使用 `xdotool`。
- Wayland 尝试 `ydotool` / `wtype`。
- 最后使用 `enigo` fallback。

仍需验证或完善：

- Wayland 下合成输入受 compositor 策略影响，不能保证可用。
- 需要在 GNOME Wayland、KDE Wayland、X11 会话中分别验证。
- 需要确认失败时前端是否需要更明确的用户提示。

### 3.3 热键适配

已完成：

- Linux 分支仍通过 `tauri-plugin-global-shortcut` 注册 `Ctrl+Alt+K` 和 `Ctrl+Alt+1..9`。
- quick paste 后续粘贴动作改走 Linux 平台模拟。
- 文档记录 Wayland 下全局热键可能不可靠。

仍需验证或完善：

- 未在真实 Linux 桌面环境验证全局热键注册和触发。
- Wayland 下不同桌面环境对 global shortcut 的支持差异较大，需要实机记录。
- 如果插件在 Wayland 下不可用，后续可能需要提示用户切换 X11 或使用桌面环境原生快捷键方案。

### 3.4 系统托盘适配

已完成：

- 当前 tray setup 继续使用 Tauri tray API。
- 开发文档增加 Linux tray 说明：
  - KDE/XFCE 通常直接显示 tray。
  - GNOME 可能需要 AppIndicator/status icon 扩展。

仍需验证或完善：

- 未在 GNOME、KDE、XFCE 中验证托盘图标显示、菜单点击、退出行为。
- 未验证不同 Linux 打包方式下图标资源路径。

### 3.5 自启动 `.desktop` 支持

已完成：

- Linux 下实现 `.desktop` 文件写入和删除。
- 路径为：
  - `$XDG_CONFIG_HOME/autostart/klip.desktop`
  - 或 `~/.config/autostart/klip.desktop`
- `.desktop` 内容包含：
  - `Type=Application`
  - `Name=Klip`
  - `Comment=Clipboard manager`
  - `Exec=<escaped current_exe>`
  - `Terminal=false`
  - `X-GNOME-Autostart-enabled=true`
- 设置页 IPC `set_auto_start` Linux 分支会同步数据库配置。
- 启动时 `restore_autostart_state` 会按照数据库 `auto_start` 恢复 Linux `.desktop` 状态。
- 增加自启动路径单元测试。

仍需验证或完善：

- 未在真实 Linux 桌面登录流程验证开机自启动。
- 未验证 AppImage、deb、rpm 或开发二进制下 `current_exe()` 写入 Exec 后是否符合最终发布形态。
- 后续可考虑增加 `StartupNotify=false`、`Categories=Utility;` 等 desktop entry 字段，但当前不是必须。

### 3.6 文件路径和数据目录

已完成：

- Linux 数据库路径适配为 `$XDG_DATA_HOME/klip/klip.db` 或 `~/.local/share/klip/klip.db`。
- Linux 日志路径适配为 `$XDG_DATA_HOME/klip/logs/` 或 `~/.local/share/klip/logs/`。
- 诊断信息使用同一 Linux 路径规则。
- 增加路径单元测试。

仍需验证或完善：

- 需要在打包安装后确认 Tauri 配置、系统权限和实际写入路径一致。
- 需要验证迁移现有 Windows-first 数据库路径不会影响非 Linux 平台。

### 3.7 Cargo.toml 平台依赖

已完成：

- Windows-only 依赖移入 `[target.'cfg(windows)'.dependencies]`：
  - `clipboard-master`
  - `clipboard-win`
  - `windows`
- Linux-only `dirs` 移入 `[target.'cfg(target_os = "linux")'.dependencies]`。
- 代码中 Windows API 使用仍由 `#[cfg(target_os = "windows")]` 保护。

仍需验证或完善：

- 未执行完整 `cargo check --target x86_64-unknown-linux-gnu` 的交叉目标命令；当前是在 Linux 主机上执行 manifest check。
- 若后续引入 `x11rb`、`wl-clipboard-rs` 等库，应继续放入 Linux target block。
- 当前实现优先调用系统命令而不是 Rust 原生 X11/Wayland crate，这是有意取舍。

### 3.8 E2E 测试适配

已完成：

- 新增 Linux E2E runner：`scripts/run-e2e-linux.sh`。
- E2E README 增加 Linux setup 和运行说明。
- Runner 使用隔离的 `XDG_CONFIG_HOME` / `XDG_DATA_HOME`。

仍需验证或完善：

- 当前服务器无法运行真实 Linux 桌面 E2E。
- 需要在真实 X11 桌面会话中执行 `scripts/run-e2e-linux.sh`。
- Wayland E2E 应单独记录 compositor、工具安装和失败模式。

## 4. 已执行验证

本轮 Linux 适配后执行过以下轻量验证：

```bash
CARGO_BUILD_JOBS=1 cargo test --manifest-path src-tauri/Cargo.toml platform::linux::tests::autostart -- --nocapture
```

结果：

- `autostart_path_uses_xdg_config_home` 通过。
- `autostart_path_falls_back_to_home_config` 通过。

```bash
CARGO_BUILD_JOBS=1 cargo test --manifest-path src-tauri/Cargo.toml platform::linux::tests::data_dir -- --nocapture
```

结果：

- `data_dir_uses_xdg_data_home` 通过。
- `data_dir_falls_back_to_home_local_share` 通过。

```bash
CARGO_BUILD_JOBS=1 cargo check --manifest-path src-tauri/Cargo.toml
```

结果：

- 通过。

早前还对 Linux 文件 URI 修复做过 focused tests：

- `file_uri_preserves_path_separators_and_escapes_special_bytes`
- `file_uri_escapes_non_ascii_as_utf8_bytes`
- `shell_escape_wraps_and_escapes_single_quotes`
- `desktop_entry_uses_escaped_exec_path`

验证限制：

- 未运行完整 `pnpm verify`，原因是当前环境 cargo check 曾出现 OOM 风险，后续按要求使用 `CARGO_BUILD_JOBS=1` 并跳过重型验证。
- 未运行 Linux E2E，因为当前服务器没有可用于托盘、热键、剪贴板和 WebDriver 的真实桌面会话。
- 未验证 Windows 安装包或 Linux 打包产物。

## 5. Phase 3 待办清单

以下事项仍未完成或未验收：

### 5.1 Linux 剪贴板监听真实验证

- 在 X11 下验证 `xclip` / `xsel`：
  - 文本复制能被 Klip 捕获。
  - 自拷贝不会产生重复污染。
  - 文件 URI 能被正确读取和写回。
- 在 Wayland 下验证 `wl-copy` / `wl-paste`：
  - 文本复制行为。
  - 文件 URI 写入行为。
  - compositor 对剪贴板访问的限制。

### 5.2 Linux 图片和文件原生格式支持

当前 Linux 监听主要是文本路径，文件写回支持 `text/uri-list`。后续应补齐：

- Linux 文件列表读取。
- Linux 图片读取和缩略图生成。
- 不同文件管理器之间的文件 copy/paste 兼容性。
- 针对 `text/uri-list` 的解析测试。

### 5.3 Wayland 热键与粘贴限制验证

需要建立桌面环境矩阵：

- GNOME X11
- GNOME Wayland
- KDE Plasma X11
- KDE Plasma Wayland
- XFCE X11

每个环境至少验证：

- `Ctrl+Alt+K` 显示/隐藏主窗口。
- `Ctrl+Alt+1..9` quick paste。
- 从 Klip 选择条目后粘贴到目标应用。
- 托盘菜单可用性。

### 5.4 系统托盘验收

需要确认：

- 托盘图标是否显示。
- 左键/右键行为是否符合预期。
- 菜单项“显示窗口 / 开机自启 / 设置 / 关于 / 退出”是否可用。
- GNOME 是否需要扩展，并在文档中写明。

### 5.5 Linux 自启动实机验收

需要确认：

- 设置中开启自启动后写入 `.desktop` 文件。
- 关闭自启动后删除 `.desktop` 文件。
- 登出/登录后应用能自动启动。
- 打包安装后 `.desktop` 的 Exec 路径正确。
- 卸载后是否需要清理 autostart 文件。

### 5.6 Linux E2E 执行

需要在真实桌面环境执行：

```bash
scripts/run-e2e-linux.sh
```

并记录：

- 发行版。
- 桌面环境。
- X11/Wayland。
- 安装的剪贴板和粘贴模拟工具。
- 失败截图和日志。

### 5.7 完整验证

在资源充足环境执行：

```bash
pnpm verify
CARGO_BUILD_JOBS=1 cargo check --manifest-path src-tauri/Cargo.toml
```

如需要 Linux target 显式验证，再执行：

```bash
CARGO_BUILD_JOBS=1 cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-unknown-linux-gnu
```

## 6. Phase 1 状态

Phase 1 是 Windows v0.1.0 发布收尾。根据 `docs/RELEASE_HANDOFF.md` 和 `docs/GOAL.md`：

已完成：

- Windows-first MVP 代码已经推进到 `main`。
- `main` 曾在 `a692aad test: add desktop e2e and release workflow` 上完成 CI。
- 本地 Windows 环境曾成功执行 `pnpm release:verify`。
- 生成过 Windows 安装包：
  - `Klip_0.1.0_x64_en-US.msi`
  - `Klip_0.1.0_x64-setup.exe`
- GitHub Release workflow 曾成功创建 v0.1.0 draft release。
- draft release 里已有 MSI 和 NSIS assets。
- 当前仓库已经存在 `v0.1.0` tag，指向 `a692aad`。

仍需确认或完成：

- `docs/GOAL.md` 仍列出 Phase 1 收尾任务：
  - 确认 main commit、CI 状态、draft release 状态。
  - 处理 duplicate draft release。
  - 编写正式 release notes。
  - 确认 release assets 完整。
  - 发布前每步命令和影响需提前说明。
- `docs/RELEASE_HANDOFF.md` 中明确未完成安装后烟测：
  - NSIS fresh install smoke test。
  - MSI smoke test。
  - 安装后隐藏启动和托盘优先行为。
  - 安装后热键和 quick paste。
  - 安装后文本、图片、文件捕获。
  - 自启动开关和重启/重新登录验证。
  - 卸载行为和自启动清理。
  - draft release 发布。

结论：

- Phase 1 的代码和 release workflow 基础基本完成。
- 发布层面仍有人工确认、release notes、duplicate draft 处理和 Windows 安装后验收未完全闭环。

## 7. Phase 2 状态

Phase 2 是产品化功能。`docs/GOAL.md` 列出的 Phase 2 范围包括：

1. 收藏功能增强：批量操作、收藏筛选。
2. 数据导出/导入：JSON/CSV 格式。
3. 敏感内容检测：密码、API key 模式匹配。
4. 数据库备份/恢复。
5. 标签/分组管理。
6. 性能优化：虚拟列表、懒加载、数据库索引。

当前代码已有的相关基础：

- 已有单条收藏切换：
  - 后端 `toggle_favorite`。
  - 数据库字段 `is_favorited`。
  - 前端收藏按钮和收藏筛选视图。
  - 相关单元测试覆盖 toggle favorite。
- 前端列表已使用 `@tanstack/react-virtual` 做虚拟列表。

仍未完成的 Phase 2 目标：

- 批量收藏/批量删除等批量操作。
- JSON/CSV 导出。
- JSON/CSV 导入。
- 敏感内容检测规则。
- 数据库备份。
- 数据库恢复。
- 标签/分组数据模型和 UI。
- 明确的懒加载分页体验。
- 数据库索引专项优化和性能基准。

结论：

- Phase 2 只具备部分基础能力，不应视为完成。
- 当前 `feat/linux-support` 分支没有以 Phase 2 为目标做产品化功能开发。

## 8. 技术决策与取舍

### 8.1 平台差异集中在 `platform/linux.rs`

决策：

- Linux 特有路径、剪贴板命令、自启动和粘贴模拟集中放入 `src-tauri/src/platform/linux.rs`。

原因：

- 保持 Windows 既有路径稳定。
- 降低调用层的 `#[cfg]` 分散程度。
- 后续替换 Linux 实现时只需要集中修改平台模块。

取舍：

- 平台模块会逐渐变厚，后续如果继续增加 X11/Wayland 原生能力，可能需要拆分为 `linux/clipboard.rs`、`linux/autostart.rs`、`linux/path.rs`。

### 8.2 优先使用系统命令而不是原生 Rust X11/Wayland 库

决策：

- 剪贴板和粘贴模拟优先调用 `wl-copy`、`wl-paste`、`xclip`、`xsel`、`xdotool`、`ydotool`、`wtype`。

原因：

- 这些工具是 Linux 桌面自动化和剪贴板集成的常见依赖。
- 实现快，依赖边界清晰。
- 避免在当前阶段引入复杂的 X11/Wayland 原生协议依赖。

取舍：

- 需要用户或安装包提供外部命令。
- 不同发行版和桌面环境行为差异大。
- 错误处理必须接受“工具不存在”或“compositor 拒绝”的情况。

### 8.3 Wayland 能力按“尽力而为”处理

决策：

- Wayland 下尝试 `wl-clipboard`、`ydotool`、`wtype`，同时在文档和日志中标注限制。

原因：

- Wayland 安全模型本身限制全局热键和合成输入。
- 不同 compositor 的支持差异无法通过服务器环境验证。

取舍：

- X11 可以先作为 Linux 完整体验主路径。
- Wayland 体验需要后续桌面环境矩阵测试，不应承诺完全等价 Windows。

### 8.4 自启动不用跨平台插件的 Linux 分支

决策：

- Linux 下手写 XDG autostart `.desktop` 文件。
- 非 Linux 继续使用 `tauri-plugin-autostart`。

原因：

- XDG autostart 文件是 Linux 桌面通用机制。
- 路径、内容和测试都可控。
- 插件行为在 Linux 不一定覆盖所有桌面环境差异。

取舍：

- 需要维护 `.desktop` 格式。
- 打包形态变化时，需要确认 `Exec` 是否仍指向正确路径。

### 8.5 测试采用 dependency-injected helper

决策：

- 为 autostart path 和 data path 增加 `*_from_env` helper。
- 测试直接传入假环境值，不修改真实环境变量。

原因：

- 测试可重复。
- 不污染开发者机器目录。
- 不依赖当前 CI 用户 home 目录。

取舍：

- 生产函数多了一层 helper，但可读性仍可接受。

### 8.6 依赖条件化采取保守策略

决策：

- 移动确认只在 Linux 使用的 `dirs`。
- 保持 `arboard`、`enigo`、`tauri-plugin-autostart` 暂时全局。

原因：

- 当前代码仍有跨平台调用点。
- 强行移动会牵涉更多 `#[cfg]` 改造，增加回归风险。

取舍：

- Cargo 依赖仍有继续精细化空间。
- 当前阶段优先保证可编译和改动可审计。

## 9. 风险与建议

### 高风险

- Wayland 全局热键和粘贴模拟不可控，需要真实桌面验证。
- Linux 文件/图片剪贴板监听尚未完整。
- 自启动 `.desktop` 在打包后 Exec 路径可能和开发环境不同。

### 中风险

- 外部命令依赖未打包或未安装时，Linux 功能会降级。
- GNOME tray 图标可能默认不可见。
- E2E runner 依赖真实桌面，会在 headless CI 中失败。

### 建议下一步

1. 在 Ubuntu X11 桌面环境执行 `scripts/run-e2e-linux.sh`。
2. 手动验证：
   - 文本复制捕获。
   - 搜索。
   - 点击粘贴。
   - quick paste。
   - tray 菜单。
   - autostart 写入/删除。
3. 再扩展到 GNOME Wayland 和 KDE Wayland。
4. 根据验证结果决定是否引入原生 Linux clipboard crate 或继续系统命令路线。
5. Phase 1 发布收尾应回到 `release/v0.1.0` 分支独立完成，不要混入 `feat/linux-support`。
6. Phase 2 产品化功能应在 `feat/productization` 单独推进。

## 10. 当前结论

`feat/linux-support` 已完成 Linux 平台适配的代码骨架和关键路径实现：

- Linux platform abstraction 已建立。
- Linux data/log path 已适配并有测试。
- Linux autostart `.desktop` 已实现并有测试。
- Linux paste simulation 已接入普通粘贴和 quick paste。
- Windows-only 和 Linux-only 依赖已有基础 target 条件化。
- Linux E2E runner 已提供。

但 Phase 3 还不能视为完全验收完成，因为真实 Linux 桌面环境下的剪贴板监听、热键、托盘、自启动和 E2E 仍未跑通。当前状态适合进入 Linux 桌面实机验证阶段。
