# Klip 数据库 v8 升级说明与回滚指南

本文件是产品化阶段（主题与窗口、独立快捷键、图片保真存储、设置页收口）发布候选的
升级与回滚材料，对应 [NEXT_PHASE_IMPLEMENTATION.md](NEXT_PHASE_IMPLEMENTATION.md)
第 18、19 节要求。表结构细节见 [DATABASE.md](DATABASE.md)，IPC 契约见 [API.md](API.md)。

本文件描述的是 schema `db_version = 8`，不是某个应用版本号。发布前请同时按
[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) 执行版本、构建与实机验收。

## 1. 升级前必读

- **升级会自动备份，但请自行再留一份副本。** Klip 在检测到需要迁移时会生成迁移前备份，
  但自动备份和应用数据位于同一目录、同一磁盘；磁盘级故障不在其保护范围内。
- 数据库位置：`app_data_dir()` + `klip.db`，Windows 下通常是 `%APPDATA%\klip\klip.db`。
- 建议在升级前复制整个 `%APPDATA%\klip` 目录（含 `klip.db`、`klip.db-wal`、`klip.db-shm`
  和 `search-index`）到应用之外的位置。
- **升级是单向的。** v8 数据库不能被旧版本二进制打开：旧版本读到高于自身的 `db_version`
  会直接报错退出，而不是静默降级。这是有意行为，用于避免旧代码写坏新表。

## 2. 数据库自动备份与恢复路径

### 2.1 迁移前自动备份

`Database::new` 在打开数据库前调用 `create_pre_migration_backup_if_needed`。仅当以下
条件**全部**满足时才创建备份：

1. 数据库文件存在且长度不为 0；
2. 文件可被 SQLite 打开；
3. `PRAGMA quick_check` 返回 `ok`；
4. 已存储的 `db_version` 低于当前 `CURRENT_DB_VERSION`。

备份通过 SQLite 在线备份 API 写出，随后对备份文件本身再执行一次 `PRAGMA quick_check`；
校验失败会中止启动并报错，而不是留下一个不可信的备份。

备份文件名：`klip.db.pre-v8-<unix_millis>.bak`，与数据库同目录。

新安装、已是最新 schema、以及文件已损坏到无法通过 `quick_check` 的情况都不会产生
迁移前备份——前两种不需要，最后一种走的是第 2.3 节的损坏保留路径。

### 2.2 迁移失败自动回滚

若迁移过程中出错且第 2.1 节的备份存在，Klip 会：

1. 删除 `-wal`、`-shm` 旁文件，避免残留日志与回滚后的主库不一致；
2. 将备份复制回 `klip.db`；
3. 返回错误，错误信息包含 `backup was restored` 与备份路径。

回滚后数据库仍是迁移前的 schema 版本，可以继续用旧版本二进制打开。

### 2.3 损坏数据库保留路径

若数据库文件损坏（`file is not a database`、`database disk image is malformed`），
原文件被重命名为 `klip.db.corrupt-<unix_millis>.bak` 并保留，Klip 以干净 schema 重新
启动，不会静默删除用户数据。

### 2.4 手动备份与恢复

设置中的数据管理面板提供备份与恢复；恢复前同样会自动备份当前数据库。命令层为
`backup_database` / `restore_database`（见 [API.md](API.md)）。

## 3. v7 到 v8 迁移日志

日志由 `tracing` 写出，级别 `INFO`，位置为日志目录下的 `klip_*.log`（可用
`KLIP_LOG_DIR` 覆盖）。排查升级问题时按下列关键字检索。

| 级别 | 日志/错误文本 | 含义 |
|------|---------------|------|
| INFO | `Created database migration backup at <path>` | 迁移前备份已创建并通过完整性校验 |
| ERROR | `database migration failed and the pre-migration backup was restored from <path>: <cause>` | 迁移失败且已回滚到迁移前备份 |
| WARN | `Legacy image <id> is not a valid PNG and was left for diagnostics` | 旧图片无法按 PNG 解析，原记录保留未改写 |
| WARN | `Recovered from corrupt database at <path>; preserved original at <path>` | 损坏数据库已保留，应用以干净 schema 启动 |
| WARN | `Full-text search unavailable at <path>: <cause>; SQLite LIKE fallback remains active` | 索引不可用，搜索降级为 SQLite `LIKE` |
| ERROR | `newer database schema version <n> is not supported by this app version` | 用旧二进制打开了更新的数据库，已拒绝 |

### 3.1 v8 迁移实际执行的动作

整个 v8 迁移在**单个事务**内完成，任一步骤失败则整体不生效：

1. 建表：`shortcut_bindings`、`window_state`、`binary_blobs`、
   `clipboard_item_representations`，含启用态加速键的部分唯一索引。
2. 快捷键播种：`toggle_window` 取原 `hotkey_toggle_window` 值并启用；
   `quick_paste_1..9` 按 `Ctrl+Alt+<n>` 写入，**升级安装启用、全新安装默认关闭**，
   以保持老用户既有的快速粘贴行为不变。
3. 窗口状态播种：见第 5.2 节的尺寸规则。
4. 主题值收敛：`theme_family`、`theme_mode` 中的非法值分别回落到 `brick`、`system`。
5. 旧图片迁移：见第 6.3 节。

所有写入使用 `INSERT OR IGNORE`，迁移可重复执行而不会产生重复行。

## 4. 新旧配置键说明

配置键的唯一事实来源是 `src-tauri/src/config/registry.rs`；下表为本次升级的差异部分，
完整键列表见 [DATABASE.md](DATABASE.md) 的 `app_config` 章节。

### 4.1 新增配置键

| 键 | 默认值 | 取值 | 说明 |
|----|--------|------|------|
| `theme_family` | `brick` | `ember` / `graphite` / `brick` / `rose` | 主题色系；非法值在迁移时回落到 `brick` |
| `theme_mode` | `system` | `light` / `dark` / `system` | 明暗模式；非法值回落到 `system` |
| `image_budget_bytes` | `2147483648` | `-1` / `536870912` / `2147483648` / `5368709120` | 图片存储预算，`-1` 表示不限制；仅接受这四个值 |
| `hide_on_focus_loss` | `true` | 布尔 | 点击其他软件后隐藏主窗口 |
| `hide_after_paste` | `true` | 布尔 | 粘贴完成后隐藏主窗口 |
| `show_window_on_startup` | `false` | 布尔 | 启动时显示主窗口（默认仅驻留托盘） |
| `always_on_top` | `true` | 布尔 | 主窗口置顶 |

`hide_on_focus_loss` 与 `hide_after_paste` 把原先耦合在一起的隐藏行为拆成两个独立开关；
两者默认值都保持升级前的既有行为。

### 4.2 默认值变更

| 键 | 旧默认值 | 新默认值 |
|----|---------|---------|
| `window_width` | `560` | `680` |
| `window_height` | `760` | `720` |

### 4.3 未移除的配置键

本次升级**没有删除或重命名任何配置键**。

- `hotkey_toggle_window` 继续作为主窗口快捷键的配置来源，并在 v8 迁移时被读入
  `shortcut_bindings` 的 `toggle_window` 行。
- `hotkey_quick_paste_prefix` 仍在运行时被读取：配置写入失败后的回滚路径会用它调用
  `reload_hotkeys_from_values` 重新注册旧式热键，其校验仍要求值为 `Ctrl+Alt`。

快捷键的**启用态与逐槽位加速键**改由 `shortcut_bindings` 表承载，不再由前缀键推导。
这意味着同一份配置有两条注册路径：`set_shortcut_bindings` 走新表并整批事务化注册，
旧式配置键的变更走 `reload_hotkeys_from_values`。改动快捷键相关代码时需同时考虑两者。

## 5. 窗口尺寸与位置

### 5.1 新的默认与下限

- 默认 `680 x 720` DIP，最小 `360 x 480` DIP。
- 尺寸通过拖拽窗口边缘调整并自动记住，设置页不再提供像素输入框，只以只读信息展示
  默认值、最小值和当前值。
- 尺寸与位置存储在 `window_state` 表，按 DIP 记录，同时保存 `scale_factor` 与
  `monitor_id`，因此在不同缩放比例的显示器之间切换时按逻辑尺寸恢复而非物理像素。

### 5.2 升级尺寸规则

| 升级前 `window_width x window_height` | 升级后 `window_state` |
|---------------------------------------|----------------------|
| 正好 `560 x 760`（旧默认值，视为未自定义） | `680 x 720` |
| 任一维度被用户改过 | 原样保留用户尺寸 |
| 缺失或无法解析 | 回落到 `680 x 720` |

只要用户动过尺寸就完整保留其数值，不做「一半迁移一半保留」的混合改写。

## 6. 图片原始表示与容量策略

### 6.1 存储模型

一条图片记录可以拥有三种表示，存放在 `clipboard_item_representations`，字节内容按
SHA-256 去重后存入 `binary_blobs`：

| 角色 | 用途 | 是否参与粘贴/导出 |
|------|------|------------------|
| `source` | 操作系统实际提供的原始编码字节（如 PNG、JPEG） | 是，优先使用 |
| `canonical` | 规范 PNG，用于系统只提供位图、或原始编码不可用时 | 是，`source` 缺失时使用 |
| `thumbnail` | 列表预览用的独立缩略图副本 | **否** |

缩略图是物理隔离的独立副本，重新生成或替换缩略图不会影响粘贴与导出的内容。

### 6.2 容量策略

- 单张图片的工作上限：像素数 `40,000,000`、RGBA 展开 `160 MiB`。常见 8K 截图
  （`7680 x 4320`，约 3,318 万像素）在限内，不会被静默跳过。旧版本的 `5 MiB` 闸门已移除。
- 总量预算由 `image_budget_bytes` 控制，默认 `2 GiB`，可选 `512 MiB`、`5 GiB` 或 `-1`
  （不限制）。
- 超出预算时按**最旧且未收藏**的图片优先淘汰，收藏项不会被容量淘汰；被淘汰的条目 ID
  会一并从全文索引中移除。
- BLOB 缺失或损坏时返回可定位的完整性错误，并且**不隐藏对应条目**，以便用户看到问题
  而不是记录凭空消失。

### 6.3 旧图片迁移行为

旧版本把图片以 `data:image/...;base64,` 形式存在 `clipboard_items.content`。v8 迁移会
逐条处理这些记录：

- 解码后写入 `binary_blobs`，登记为 `canonical` 表示，并在其 `metadata` 中标记
  `legacyReencoded: true`。
- 额外生成 `192 x 192` 上限的 `thumbnail` 表示。
- 超过 `128 MiB` 的旧图片跳过，不阻塞迁移。
- 无法按 PNG 解析的旧图片**保留原记录不改写**，并写出第 3 节的 WARN 日志供排查。
- 迁移不会为旧记录伪造 `source` 表示——原始编码字节如果从未被保存，就无法在事后恢复。

## 7. Windows 快捷键冲突与 `Win` 限制

### 7.1 十个可独立配置的动作

`shortcut_bindings` 承载 10 个动作：`toggle_window` 与 `quick_paste_1` 到
`quick_paste_9`。每个动作可以独立启用、关闭和重新录入。关闭其中若干槽位**不会**让
其余槽位重新编号——快速粘贴索引始终对应当前可见列表中的位置。

### 7.2 整批事务化注册

保存快捷键时 Klip 只操作自己拥有的注册项，**不调用 `unregister_all`**，以免连带注销
其他应用注册的全局快捷键。流程为：

1. 校验全部 10 个动作，任一非法则直接拒绝，不做部分保存；
2. 计算差集，只注销发生变化的旧快捷键；
3. 逐个注册新的快捷键；
4. 任一步失败则回滚——注销本次已成功注册的项，并恢复此前被注销的旧项，然后返回带有
   失败动作与回滚结果的错误。

因此不会出现「半套快捷键」状态：要么 10 个动作全部按新配置生效，要么保持原状。

### 7.3 被拒绝的组合

| 组合 | 原因 |
|------|------|
| `Win+L`、`Win+V`、`Win+Tab`、`Shift+Win+S` | Windows 系统保留 |
| `Alt+Tab`、`Alt+F4` | Windows 系统保留 |
| `Ctrl+Alt+Delete`、`Ctrl+Shift+Esc` | Windows 系统保留 |
| 任何包含 `F12` 的组合 | 被 Windows 调试工具占用 |
| 不含修饰键的单键（如 `K`） | 会与正常输入冲突 |

### 7.4 `Win` 键的实际边界

`Win` 可以作为修饰键录入（例如 `Ctrl+Win+K`），但 Windows 可能在系统更新后占用新的
`Win` 组合。Klip 不维护一份「保证可用」的 `Win` 组合清单，而是**以实际注册结果为准**：
注册失败时保存被拒绝并显示失败原因，已有配置保持不变。若某个 `Win` 组合在系统更新后
失效，重新录入一个不同的组合即可。

## 8. 门禁执行记录

以下为本次发布候选在开发机上的实际执行结果。**这不是实机安装验收**，见第 10 节。

| 门禁 | 命令 | 结果 |
|------|------|------|
| 前端 lint | `pnpm lint` | 通过 |
| 对比度门禁 | `pnpm check:contrast` | 通过，8 组主题组合共 464 对颜色满足 WCAG 4.5:1 / 3:1 |
| i18n 门禁 | `pnpm check:i18n` | 通过，163 个设置键在 `en-US`、`zh-CN` 均存在 |
| 设计 Token 门禁 | `pnpm check:tokens` | 通过，组件中无调色板名与颜色字面量 |
| 前端测试 | `pnpm test -- --run` | 通过，24 个文件 201 个用例 |
| 前端构建 | `pnpm build` | 通过 |
| Rust 格式 | `cargo fmt -- --check` | 通过 |
| Rust lint | `cargo clippy -- -D warnings` | 通过 |
| Rust 测试 | `cargo test` | 通过，209 个用例 |
| 迁移与回滚门禁 | `cargo test`（`connection.rs` 迁移用例） | 通过，含 v7 升级、尺寸规则、旧图片迁移、迁移失败回滚、损坏保留、高版本拒绝 |
| 性能门禁 | `cargo test -- --ignored` | 通过，10 万条文档下查询 `794µs`（阈值 1s）、启动索引校验 `2.20s`（阈值 10s） |
| Windows E2E 门禁 | `pnpm e2e` | 通过，6 个用例 31s，覆盖文本捕获与搜索还原、位图尺寸与像素回写、快捷粘贴命中筛选后可见项、批注持久化与搜索、复制与粘贴模式分离、含空格与非 ASCII 的路径打开 |

> Windows E2E 说明：Win32 剪贴板是全局独占资源，`OpenClipboard` 在被其他进程（资源管理器、
> 密码管理器、输入法）持有时会立即抛出 `ExternalException` 而不是等待。首轮执行曾因此偶发失败
> 一例，已在 `e2e/clipboard-flow.e2e.js` 中为剪贴板读写辅助函数加入有界重试（最多 5 次、递增退避，
> 仅匹配与语言无关的 `ExternalException` 类型名）。发送按键与资源管理器辅助函数**不**重试，避免重复
> 触发。这是测试宿主机的争用问题，不是产品缺陷。

## 9. 回滚步骤

发布候选出现严重问题时，**优先回滚应用二进制并保留迁移前数据库备份**。

1. 卸载或替换为上一个已发布版本的安装包。
2. **不要**让旧二进制直接打开已经迁移到 v8 的 `klip.db`。旧版本会因为
   `db_version = 8` 高于自身而拒绝启动，这是预期保护行为。
3. 需要用旧版本继续工作时，先确认 schema 版本，再把第 2.1 节的
   `klip.db.pre-v8-<millis>.bak` 复制回 `klip.db`：
   - 关闭 Klip；
   - 删除 `klip.db-wal` 与 `klip.db-shm`；
   - 将备份复制为 `klip.db`。
4. 回滚后，v8 期间新增的快捷键启用态、窗口状态和图片原始表示不会被旧版本理解。
   旧版本只保证旧配置与旧图片仍可读取。
5. 若已经用 v8 使用了一段时间，回滚到迁移前备份意味着丢失这段时间的新增记录。
   请先导出（JSON/CSV）再回滚。

## 10. 安装包实机验证记录

**状态：未执行。**

第 18 节要求的「安装包实机验证记录」尚未产生。本次工作在开发环境完成，
未构建发布安装包、未在干净 Windows 环境安装，因此以下项目**均无验收证据**：

- [ ] 干净 Windows 用户或 VM 安装 NSIS/MSI 包。
- [ ] 首次启动隐藏到托盘、托盘菜单可打开与退出。
- [ ] 开机自启启用、重登生效、可完整移除。
- [ ] 拖拽调整窗口后重启，尺寸与有效位置恢复。
- [ ] 剪贴板文本、图片、单/多文件格式在真实桌面往返正确。
- [ ] 安装包版本、产品名、架构、图标与签名状态。

发布前必须按 [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) 第 3 到 5 节补齐，
并在此处记录 commit、workflow run、安装包 SHA-256 与验收日期。
在补齐之前，本阶段成果不构成可发布状态。

## 11. 已知限制与产品措辞

对外说明必须使用下列口径，避免过度承诺：

- **「原始保留」**指保留操作系统实际提供的原始表示。Klip 无法恢复剪贴板中从未存在的
  源文件字节或元数据——例如某些应用只提供位图时，就没有原始编码可供保留。
- **「无损」**指不主动降低像素、尺寸、透明通道或已有编码质量。缩略图是独立的预览副本，
  不参与粘贴与导出。
- **`Win` 组合**可以录入，但 Windows 可能在系统更新后占用新的组合；Klip 以实际注册
  结果为准，不保证某个 `Win` 组合长期可用。
- **点击其他软件后隐藏**目前是默认行为（`hide_on_focus_loss = true`），后续可根据使用
  反馈调整默认值。
- 实机安装验收、代码签名、托管更新与 macOS/Linux 桌面验收不属于本阶段已交付能力。

