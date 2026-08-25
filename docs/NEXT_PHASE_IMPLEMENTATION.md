# Klip 下一阶段实现文档

| 项目 | 内容 |
|---|---|
| 文档状态 | 实现前冻结版 |
| 当前基线 | `v0.2.0` |
| 目标范围 | Windows-first 桌面产品化升级 |
| 最后更新 | 2026-08-18 |
| 相关文档 | [PRD](PRD.md)、[架构](ARCHITECTURE.md)、[API](API.md)、[数据库](DATABASE.md)、[发布检查](RELEASE_CHECKLIST.md) |
| 设计原型 | [桌面设置原型](design/settings-desktop-prototype.html)、[配色探索](design/settings-palette-exploration.html) |

## 1. 文档目标

本文件定义 Klip 下一阶段的产品、交互、数据、前后端接口、迁移、测试和发布契约。它不是对现有 `v0.2.0` 文档的覆盖；现有文档继续描述当前版本的行为，本文件描述下一阶段的目标行为。

实现应以本文件为准。若实现过程中需要改变本文件中的冻结决策，必须先更新文档、迁移方案和验收标准，再修改代码。

## 2. 当前基线与主要问题

当前仓库已经具备剪贴板监听、文本/图片/文件识别、搜索、粘贴、托盘、SQLite、开机自启和基础设置能力，但仍存在以下产品和技术限制：

- 窗口快捷键只能从 `Ctrl+Alt+A-Z` 中选择，无法自由录入，也没有逐项启用开关。
- 快速粘贴使用一个公共 `Ctrl+Alt` 前缀，1-9 不能独立修改或关闭。
- 主窗口快捷键没有在设置、主窗口和托盘中形成清晰的发现路径。
- `close_to_tray` 同时被用于“关闭到托盘”和“失去焦点隐藏”，两个概念混在一起。
- 窗口尺寸只支持手动输入，用户拖拽后的尺寸和位置不会稳定记忆，也没有多显示器恢复规则。
- 主题只有 `light/dark/system`，配色仍主要依赖原有蓝紫色 Token，主题只存在于 `localStorage`。
- 图片读取先转换为 `RGBA8` 再编码为 PNG，不能保留原始编码、MIME 或元数据。
- 图片使用 Base64 写入普通文本列，且当前解码后 `5 MiB` 上限会跳过普通全高清截图。

## 3. 冻结的产品决策

### 3.1 主题

- 四套配色全部提供：暗琥珀、炭黑酸橙、暖砖、玫瑰纸。
- 每套配色都支持浅色、深色、跟随系统。
- 新安装默认：暖砖 + 跟随系统。
- 主题不提供压缩、低清或降低对比度的选项。

### 3.2 快捷键

- 快捷键动作共 10 个：显示/隐藏主窗口，以及快速粘贴当前可见列表第 1-9 项。
- 每个动作都可以独立启用、关闭和重新录入。
- 新安装默认启用主窗口快捷键 `Ctrl+Alt+K`；快速粘贴 1-9 预填 `Ctrl+Alt+1-9`，默认关闭。
- 老用户迁移时保持旧行为：窗口快捷键按旧配置启用，快速粘贴 1-9 全部按旧公共前缀启用。
- 允许 `Ctrl`、`Alt`、`Shift`、`Win` 作为修饰键，但不使用低级键盘钩子抢占系统快捷键。
- `F12` 不允许作为触发键。微软将其保留给调试器。
- 系统保留组合和注册失败组合必须明确提示，不能静默保存。
- 点击其他软件后自动隐藏的行为暂时保留，并在设置中命名为“失去焦点时隐藏”。

### 3.3 窗口

- 新安装默认窗口为 `680 x 720 DIP`。
- 最小尺寸为 `360 x 480 DIP`。
- 窗口可拖拽调整大小；不要求用户直接输入像素值。
- 宽度低于 `440 DIP` 时，设置页左侧导航收为图标栏。
- 第一次显示时居中于当前活动软件所在显示器。
- 用户调整后的尺寸和位置自动记忆；恢复失败或显示器断开时，在当前活动显示器重新居中。
- 窗口保持无边框、默认置顶、可隐藏到托盘的桌面工具形态；置顶状态由 `always_on_top` 控制。

### 3.4 图片保真

- 能取得原始编码时，原始字节逐字节保存。
- 只有位图时，保存尺寸和像素无损的标准 PNG 回退。
- 缩略图和原图必须物理隔离；缩略图永远不能用于复制、粘贴或导出。
- 单个图片表示的安全上限为 `128 MiB`，默认图片存储预算为 `2 GiB`。
- 超限、磁盘不足和读取失败必须产生可见错误，不得静默丢弃。
- 复制资源管理器中的图片文件仍按文件路径处理，不在本阶段归档外部文件本体。

## 4. 范围与非目标

### 4.1 本阶段范围

- 完整设置页信息架构和桌面窗口交互。
- 四套主题和浅色/深色/系统模式。
- 独立快捷键模型、录入、冲突检测、事务式注册和旧配置迁移。
- 窗口尺寸/位置记忆、多显示器恢复和失焦行为拆分。
- 原始图片表示、无损回退、缩略图隔离和二进制存储。
- SQLite migration、Tauri IPC、Zustand 状态和 Windows E2E。
- 开机自启、托盘、备份恢复、诊断信息与新配置的兼容验收。

### 4.2 非目标

- 云同步、账号体系、远程服务和插件市场。
- 通过低级键盘钩子强制覆盖 Windows 快捷键。
- 对外部文件做内容归档或版本管理。
- 图片 AI 增强、自动重采样、主动有损压缩。
- 重新设计当前剪贴板搜索、标签和 OCR 的核心语义。
- 在本阶段接入 Stitch MCP 或其他外部设计 MCP。

## 5. 设置页与桌面交互

### 5.1 信息架构

设置页采用左侧导航和右侧内容区，默认窗口尺寸为 `680 x 720 DIP`。导航项为：

1. 常规
2. 外观
3. 快捷键
4. 行为
5. 数据
6. 关于

窄窗口下导航收为图标栏，但每个图标必须有 tooltip 和可访问名称。

### 5.2 保存模型

- 设置页采用“草稿修改 + 统一保存”。
- 主题切换可以即时预览，但只有保存后写入 SQLite。
- 快捷键只有保存后才替换运行时注册。
- 保存失败时设置页保持打开，草稿保留，数据库和运行时保持旧值。
- 保存成功后不自动退出设置页，显示成功状态并清除 dirty 状态。
- 退出设置页时若有未保存修改，提示保存、放弃或继续编辑。
- 托盘菜单中的“外观设置”直接打开设置页外观面板，不绕过统一保存。

### 5.3 设置状态

所有设置页需要覆盖以下状态：

- 初始加载中。
- 后端加载失败。
- 草稿有修改。
- 保存中。
- 保存成功。
- 保存失败并回滚。
- 快捷键录入中。
- 快捷键重复。
- 快捷键被系统或其他程序占用。
- 图片容量达到上限。
- 数据库迁移失败。

## 6. 窗口与生命周期实现

### 6.1 配置拆分

以下配置继续存于 `app_config`：

```text
hide_on_focus_loss       = true
hide_after_paste         = true
close_to_tray            = true
show_window_on_startup   = false
always_on_top             = true
```

`close_to_tray` 只负责关闭按钮的语义，`hide_on_focus_loss` 只负责失焦隐藏。

### 6.2 窗口状态

运行时位置和尺寸不再依赖普通配置键，存入 `window_state`：

```sql
CREATE TABLE window_state (
    window_label TEXT PRIMARY KEY,
    width_dip INTEGER NOT NULL,
    height_dip INTEGER NOT NULL,
    x INTEGER,
    y INTEGER,
    monitor_id TEXT,
    scale_factor REAL,
    updated_at INTEGER NOT NULL
);
```

实现要求：

- `width_dip` 和 `height_dip` 使用逻辑像素保存。
- 调整大小或移动窗口后 debounce 500ms 再保存。
- 恢复时将位置夹在显示器工作区内，任务栏区域不得被覆盖。
- 原显示器不存在、工作区变化或保存矩形完全越界时，居中到当前活动显示器。
- 设置中的“恢复默认窗口大小”将尺寸重置为 `680 x 720`，位置重新按当前显示器居中。
- 失焦隐藏对设置页中的文件选择器、诊断导出和快捷键录入流程临时抑制。

### 6.3 Tauri 窗口配置

`tauri.conf.json` 与 Rust 常量必须统一：

```text
width: 680
height: 720
minWidth: 360
minHeight: 480
decorations: false
transparent: true
visible: false
alwaysOnTop: true
skipTaskbar: true
```

窗口尺寸和位置的运行时恢复由 `window::controller` 负责，不在 React 组件中直接操作操作系统坐标。

## 7. 主题系统

### 7.1 数据模型

```typescript
type ThemeFamily = 'ember' | 'graphite' | 'brick' | 'rose';
type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedThemeMode = 'light' | 'dark';
```

SQLite 配置：

```text
theme_family = brick
theme_mode   = system
```

`system` 只影响运行时 `resolved_mode`，不改写用户选择。

### 7.2 Token 契约

每个主题家族的浅色和深色都必须定义以下语义 Token：

```text
--stage                  窗口外部或透明区域
--background             主背景
--surface                一级表面
--surface-raised         卡片、弹层和输入区域
--surface-muted          次级背景
--surface-selected       选中状态
--ink                    主文字
--text                   次级文字
--muted                  辅助文字
--faint                  弱提示文字
--ink-inverse             反色文字
--accent                 主操作色
--accent-strong          悬停和强调
--accent-soft            选中浅色背景
--on-accent              主操作色上的文字
--focus                  键盘焦点环
--success                成功
--warning                警告
--danger                 错误和删除
--info                   信息
--border                 普通边框
--border-strong          强边框
--glass-bg               半透明表面
--glass-border           半透明边框
--shadow-window          窗口阴影
--shadow-card            卡片阴影
--content-text           文本类型标识
--content-image          图片类型标识
--content-file           文件类型标识
```

组件不得直接写入颜色值或 `indigo/emerald/sky` 等颜色名。当前 `globals.css` 中的蓝紫色主色和 `--gradient-primary` 应在迁移时移除或改为语义 Token。核心表面不使用装饰性渐变。

### 7.3 可访问性

- 普通文字对比度至少 `4.5:1`。
- 大文字对比度至少 `3:1`。
- 焦点环在全部 8 个家族/模式组合中都必须可见。
- 状态不可只用颜色表达，必须配合图标、文字或形状。
- 每次 Token 变更运行自动对比度检查。

### 7.4 迁移

- 读取旧 `localStorage` 的 `light/dark/system` 作为 `theme_mode` 迁移来源。
- 旧的解析结果 `klip-theme` 只用于首帧缓存，不作为正式配置。
- SQLite 成为唯一正式来源。
- 页面启动时先使用缓存避免闪烁，再用 SQLite 结果校正。

## 8. 快捷键系统

### 8.1 动作模型

动作 ID 固定为：

```text
toggle_window
quick_paste_1
quick_paste_2
quick_paste_3
quick_paste_4
quick_paste_5
quick_paste_6
quick_paste_7
quick_paste_8
quick_paste_9
```

快速粘贴动作表示“粘贴当前搜索/筛选后可见列表的第 N 项”，不能使用“最近一条”“常用链接”等会误导实际行为的名称。

### 8.2 数据表

```sql
CREATE TABLE shortcut_bindings (
    action_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    accelerator TEXT,
    updated_at INTEGER NOT NULL,
    CHECK (enabled = 0 OR accelerator IS NOT NULL)
);

CREATE UNIQUE INDEX idx_shortcut_enabled_accelerator
ON shortcut_bindings(accelerator)
WHERE enabled = 1 AND accelerator IS NOT NULL;
```

关闭动作时保留原 `accelerator`，重新开启无需重复录入。

### 8.3 录入语法

- 修饰键：`Ctrl`、`Alt`、`Shift`、`Win`。
- 至少一个修饰键和一个普通触发键。
- 普通触发键：`A-Z`、顶部数字、`F1-F11`、方向键、`Home`、`End`、`PageUp`、`PageDown`、`Insert`、`Delete`、`Space`。
- 不支持仅修饰键、连续按键、双击、长按和宏。
- 存储使用标准化组合字符串，顺序固定为 `Ctrl+Alt+Shift+Win+Key`。
- 前端使用 `KeyboardEvent.code` 映射到 Tauri `Code`，不直接依赖本地化字符。
- `Esc` 取消录入；清除按钮写入空绑定并保持动作关闭。
- 录入期间抑制 Klip 自己的快捷键处理，避免录入键触发窗口动作。

### 8.4 冲突规则

- 已启用动作之间的重复绑定是硬错误。
- 关闭动作的重复绑定不注册，但重新开启时必须再次检查。
- 禁止 `Win+L`、`Win+V`、`Win+Tab`、`Win+Shift+S`、`Alt+Tab`、`Alt+F4`、`Ctrl+Alt+Delete`、`Ctrl+Shift+Esc` 等系统组合。
- 其他程序的占用以 Windows 实际注册结果为准。
- `Win` 修饰键允许使用，但不保证每个组合都能注册。
- 保存错误必须指出动作名称和原因，不能只返回通用错误。

Windows 官方对 `MOD_WIN` 的说明见 [RegisterHotKey](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey)；PowerToys Advanced Paste 使用 `Win+Shift+V` 作为默认快捷键，但 Klip 不通过低级钩子绕过系统限制。

### 8.5 事务式保存

`set_shortcut_bindings` 必须以一个全量 payload 工作：

1. 校验动作 ID、启用状态、组合键语法和标准化结果。
2. 检查动作内重复、系统保留键和缺失绑定。
3. 获取当前数据库配置和运行时注册快照。
4. 注销发生变化的旧快捷键。
5. 逐个注册新快捷键。
6. 全部注册成功后，在 SQLite 事务中写入新绑定。
7. 写库失败时注销新快捷键并恢复旧快照。
8. 任一步注册失败时恢复旧运行时和旧数据库状态。

不要在此流程中直接使用无差别 `unregister_all`，避免误伤其他运行时注册；快捷键管理器维护自己拥有的注册集合。

### 8.6 迁移

数据库 v8 创建 `shortcut_bindings`：

- 从 `hotkey_toggle_window` 生成 `toggle_window`。
- 从 `hotkey_quick_paste_prefix` 和数字 1-9 生成九个快速粘贴绑定。
- 旧配置不删除，保留一版供旧二进制回退读取，但新运行时不再消费。
- 新安装按 3.1 的默认值创建。
- 迁移失败使用 `Ctrl+Alt+K` 和关闭的快速粘贴作为安全回退，并记录诊断日志。

## 9. 图片保真与二进制存储

### 9.1 保真等级

| 场景 | 产品保证 |
|---|---|
| 剪贴板提供 PNG/JPEG/WebP/GIF 等编码字节 | 原始字节、格式名称和可识别元数据原样保存 |
| 剪贴板只提供 `CF_DIB/CF_DIBV5` | 原始位图数据保存，并生成像素无损 PNG 回退 |
| 剪贴板只提供像素且没有原始编码 | 保存相同尺寸和像素值，不能声称恢复不存在的源文件元数据 |
| 缩略图 | 仅用于界面预览，不能参与复制、粘贴和导出 |
| 资源管理器文件复制 | 保留文件路径，不归档外部文件本体 |

### 9.2 表结构

```sql
CREATE TABLE binary_blobs (
    sha256 TEXT PRIMARY KEY,
    byte_length INTEGER NOT NULL,
    content BLOB NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE clipboard_item_representations (
    item_id INTEGER NOT NULL,
    blob_sha256 TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('source', 'canonical', 'thumbnail')),
    format_name TEXT NOT NULL,
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    byte_length INTEGER NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,
    PRIMARY KEY (item_id, role, format_name),
    FOREIGN KEY (item_id) REFERENCES clipboard_items(id) ON DELETE CASCADE,
    FOREIGN KEY (blob_sha256) REFERENCES binary_blobs(sha256)
);

CREATE INDEX idx_clipboard_item_representations_item
ON clipboard_item_representations(item_id, role, priority);
```

新的图片列表查询不再读取 `clipboard_items.content` 中的 Base64。`ClipboardItem` 增加：

```typescript
interface ImageMedia {
  width: number;
  height: number;
  sizeBytes: number;
  originalAvailable: boolean;
  sourceFormats: string[];
  thumbnailRef: string | null;
}
```

图片条目的原始内容通过 `ImageMedia` 和按需加载命令返回，列表响应不得包含完整原图。

### 9.3 捕获与写回

- 只保存经过白名单和魔数验证的图片格式，不盲目保存任意自定义剪贴板对象。
- 保存原始表示后生成标准 PNG 兼容表示。
- 原始表示和标准表示都可用于写回；目标软件自行选择支持的格式。
- 复制/粘贴直接在 Rust 端从 BLOB 读取，不经过前端 Base64。
- 为 Klip 写回增加私有标记，用于抑制自身写回事件，减少对图片重新解码的依赖。
- OCR 读取 canonical PNG，OCR 失败不影响原图复制和导出。

### 9.4 容量与错误

- 单个表示上限 `128 MiB`。
- 默认图片预算 `2 GiB`，用户可选 `512 MiB`、`2 GiB`、`5 GiB` 或无限制；预算包含原始表示、canonical 表示和缩略图的总占用。
- 预算达到后清理最旧的未收藏记录；禁止通过有损压缩腾空间。
- 收藏内容超过预算时暂停新的超额图片捕获，并给出明确通知。
- 超限、格式损坏、解码失败、BLOB 写入失败必须生成错误事件和日志。

### 9.5 老图片迁移

- 旧 PNG Data URL 解码后写入 `binary_blobs`。
- 标记为 `legacy_reencoded`，不能伪装为原始来源。
- 迁移后旧 `content` 仅保留兼容读取一版，新代码不再依赖它。
- 数据库备份必须包含所有二进制数据，并在恢复后校验 SHA-256。
- JSON/CSV 继续用于文本和元数据交换；完整图片保真使用数据库备份。

## 10. 前端修改清单

### 10.1 状态层

- `themeStore.ts` 改为管理 `themeFamily`、`themeMode`、`resolvedMode`，SQLite 为正式来源。
- `configStore.ts` 增加 draft/committed 区分、批量保存和保存失败回滚。
- 增加 `shortcutStore` 或在 `configStore` 中维护 10 个强类型快捷键绑定。
- 图片条目只保存媒体元数据和缩略图引用，不把完整原图放入列表状态。

### 10.2 设置组件

- `SettingsView.tsx` 增加外观面板和完整快捷键录入器。
- 快捷键键位框在关闭状态下仍可编辑，关闭只代表不注册。
- 快速粘贴显示“当前列表第 N 项”。
- 常规面板增加开机自启、启动时显示、窗口尺寸恢复入口。
- 行为面板使用 `hide_on_focus_loss`，不再把它映射成 `close_to_tray`。
- 数据面板显示图片保真保证、当前用量、容量上限和清理策略。
- 所有图标按钮使用 Lucide 图标并提供 tooltip/aria-label。

### 10.3 主窗口和托盘

- 主窗口明确显示当前“显示/隐藏 Klip”快捷键；禁用时显示未启用状态。
- 托盘菜单显示当前快捷键，禁用时不显示过期组合。
- 失焦隐藏、粘贴后隐藏和关闭到托盘分别消费各自的配置。
- 外观入口打开设置页，不再从主窗口直接绕过保存流程修改主题。

## 11. Rust 后端修改清单

### 11.1 快捷键

- 重写 `src-tauri/src/hotkey/manager.rs`，从固定前缀改为动作映射。
- 使用 `tauri-plugin-global-shortcut` 的 `SUPER` 映射 Windows `Win`。
- 引入拥有集合和事务式注册/回滚。
- 提供 `get_shortcut_bindings`、`set_shortcut_bindings`、`begin_shortcut_capture`、`end_shortcut_capture` 或等价内部状态控制。

### 11.2 窗口

- 扩展 `window::controller`，支持工作区、显示器、DIP 和越界修复。
- 监听 `Resized`、`Moved`、`ScaleFactorChanged`，debounce 写入 `window_state`。
- 将失焦隐藏和关闭到托盘拆成独立配置读取。
- 增加窗口状态恢复失败日志和诊断字段。

### 11.3 图片与数据库

- `clipboard::backend` 增加 Windows 原始格式读取和写回能力。
- `clipboard::format::image` 取消 `5 MiB` 解码硬限制，改用表示大小、像素数和工作内存保护。
- 新增 `database::blobs` 和 `database::image_representations`。
- OCR、导出、详情、粘贴改为从表示表读取。
- 删除条目时级联表示关系，并执行未引用 BLOB 的清理。
- 备份恢复、JSON/CSV 导入导出更新到新的图片引用模型。

### 11.4 配置

- `config/registry.rs` 增加主题、窗口行为和图片预算配置。
- 旧快捷键和旧窗口尺寸键标记为兼容键，不再作为新运行时来源。
- `set_config_many` 继续用于普通设置；快捷键使用专用全量命令。

## 12. IPC 契约

新增或调整以下接口：

| 命令 | 参数 | 返回 | 说明 |
|---|---|---|---|
| `get_shortcut_bindings` | 无 | `ShortcutBinding[]` | 返回 10 个动作的完整配置 |
| `set_shortcut_bindings` | `ShortcutBinding[]` | `void` | 全量校验、事务注册和回滚 |
| `get_image_thumbnail` | `itemId` | 二进制或资源引用 | 按需读取缩略图 |
| `get_image_representation` | `itemId, format` | 二进制或资源引用 | 详情、导出使用 |
| `get_window_state` | `windowLabel` | `WindowState` | 返回保存的窗口状态 |
| `reset_window_state` | `windowLabel` | `WindowState` | 恢复默认尺寸并重新定位 |
| `get_storage_usage` | 无 | `StorageUsage` | 返回图片和数据库用量 |

`ClipboardItem` 的图片响应改为包含 `media` 元数据，不再要求前端消费图片 Base64。现有 `copy_to_clipboard`、`paste_from_clipboard` 命令名可以保持不变，但内部必须读取新的表示模型。

新增事件：

```text
shortcut-registration-changed
image-storage-warning
window-state-changed
```

现有 `config-changed` 继续用于普通标量配置；快捷键批量变更使用带动作列表和注册结果的专用事件或响应。

## 13. 数据库迁移

下一阶段数据库版本为 `v8`，在现有 `v7` 之后执行：

1. 创建 `shortcut_bindings` 并从旧键迁移。
2. 创建 `window_state`，从旧 `window_width/window_height` 复制尺寸。
3. 创建 `binary_blobs` 和 `clipboard_item_representations`。
4. 将旧图片 Data URL 迁移为 `canonical` 表示。
5. 写入 `theme_family=brick`、`theme_mode=system` 和新增行为默认值。
6. 写入 `db_version=8`。

迁移要求：

- 迁移开始前创建临时数据库备份。
- 每一步在事务中执行；失败时保留原数据库和备份。
- 新版本遇到更高数据库版本必须拒绝启动并提示更新应用。
- 迁移后运行完整性检查、BLOB SHA-256 校验和索引重建。
- 旧版本回退只保证旧配置和旧图片仍可读取，不保证旧版本理解新快捷键或原始图片表示。

升级尺寸规则：如果旧尺寸正好是 `560 x 760`，迁移为 `680 x 720`；只要用户修改过任一尺寸，就保留用户尺寸。

## 14. 错误与恢复策略

| 场景 | 用户反馈 | 后端行为 |
|---|---|---|
| 快捷键重复 | 指出重复动作 | 不写库、不改变运行时 |
| 系统快捷键 | 指出 Windows 保留 | 不写库、不改变运行时 |
| 其他程序占用 | 指出注册失败 | 恢复旧注册和旧配置 |
| 快捷键写库失败 | 保存失败 | 恢复运行时和数据库 |
| 图片超过上限 | 明确提示未保存原因 | 不压缩、不静默丢弃 |
| 磁盘空间不足 | 提示清理或提高预算 | 保留旧数据，停止新图片写入 |
| BLOB 损坏 | 详情显示不可用 | 保留记录和诊断信息，不影响其他条目 |
| 窗口越界 | 无需用户操作 | 自动夹取或移到当前显示器 |
| 迁移失败 | 阻止进入不一致状态 | 恢复备份并提供日志路径 |

## 15. 测试矩阵

### 15.1 单元测试

- 快捷键解析、标准化、修饰键组合、`Win`、`F12` 拒绝。
- 动作重复、系统保留、空绑定和关闭状态。
- 注册成功、注册中途失败、数据库写入失败和完整回滚。
- 主题 Token 解析、系统模式变化和 localStorage 迁移。
- 窗口尺寸夹取、DIP 转换、工作区越界和默认值迁移。
- 原始图片哈希、像素哈希、BLOB 引用和未引用 BLOB 清理。
- 旧 PNG Data URL 迁移和备份恢复。

### 15.2 集成测试

- Windows `PNG/JPEG/WebP/GIF/CF_DIB/CF_DIBV5` 捕获。
- 原始字节 SHA-256 前后一致。
- 只有位图时尺寸、透明通道和像素值一致。
- 原始格式 + canonical PNG 同时写回系统剪贴板。
- 4K/8K 图片、透明 PNG、ICC/EXIF 具备原始表示时不丢失。
- OCR 读取 canonical 表示，失败不影响原始复制。
- 2 GiB 预算、收藏保护和空间不足行为。

### 15.3 Windows E2E

- 新安装默认主题、窗口尺寸和快捷键。
- 老用户 v7 数据升级到 v8。
- 主窗口快捷键显示/隐藏以及关闭后重新显示。
- 快速粘贴 1-9 绑定不同组合、单独关闭和搜索筛选后的索引语义。
- `Win` 可用组合、系统保留组合和外部占用提示。
- 拖拽窗口、重启后恢复尺寸和位置。
- 拔掉显示器、改变缩放比例和恢复越界窗口。
- 失焦隐藏开启/关闭、粘贴后隐藏和关闭到托盘的独立行为。
- 开机自启在重新登录后的系统状态同步。

### 15.4 视觉与可访问性

- 8 个主题状态逐一截图检查。
- 对比度自动检查全部语义 Token。
- 键盘-only 操作设置页、快捷键录入和保存流程。
- `360 x 480`、`440 x 600`、`680 x 720` 三种窗口尺寸。
- 不得出现文字溢出、控制重叠、焦点不可见或图标无名称。

## 16. 分阶段实施顺序

### Phase 0: 合同与夹具

- 固化本文件和 TypeScript/Rust DTO。
- 准备迁移数据库、图片格式和快捷键测试夹具。
- 建立 v8 migration 骨架和备份恢复门禁。

### Phase 1: 配置、主题和窗口

- 增加主题 Token、SQLite 配置和前端主题 store。
- 更新 `680 x 720` 常量与 Tauri 配置。
- 实现窗口状态表、DIP 恢复、失焦配置拆分。
- 设置页完成常规、外观和行为面板。

### Phase 2: 快捷键

- 新表和旧配置迁移。
- Rust 动作注册集合、录入抑制和事务回滚。
- 前端快捷键录入器、冲突状态和托盘/主窗口发现入口。
- 完成 Windows 快捷键 E2E 后再进入图片改造。

### Phase 3: 图片存储

- 原始格式读取、BLOB 表和表示关系。
- canonical PNG、缩略图和按需媒体 IPC。
- 粘贴、导出、OCR、备份恢复切换到新模型。
- 完成大图、原始字节和像素一致性测试。

### Phase 4: 设置页收口

- 完成数据容量、诊断、保存/取消和错误状态。
- 移除旧蓝紫色 Token、硬编码内容类型颜色和过时快捷键文案。
- 更新中英文 i18n、API 文档和数据库文档。

### Phase 5: 发布候选

- 运行迁移、回滚、Windows E2E、视觉和性能门禁。
- 安装包实机验证托盘、开机自启、窗口恢复和剪贴板格式。
- 生成升级说明、已知限制和数据库备份提示。

## 17. 可量化验收标准

### 产品

- 用户可以在设置中找到主窗口快捷键和 1-9 全部槽位。
- 每个快捷键可独立启用、关闭和重新录入。
- 主窗口和托盘可看到当前启用的主窗口快捷键。
- 新安装默认显示 `暖砖 + 跟随系统`、窗口 `680 x 720`。
- 用户拖拽窗口后重启，尺寸和有效位置能够恢复。

### 快捷键

- 10 个动作的成功保存会完整注册；任何失败都不会留下半套快捷键。
- `Win` 组合按实际系统能力判断；系统保留组合不会被抢占。
- `F12` 和不含修饰键的组合无法保存。
- 快速粘贴索引始终对应当前可见列表，不因禁用其他槽位而重排。

### 图片

- 原始编码可取得时，复制前后 SHA-256 一致。
- 只有位图时，复制前后尺寸、像素和透明通道一致。
- 缩略图改变不会改变粘贴和导出内容。
- 1920x1080、4K 和常见 8K 截图不因当前 `5 MiB` 限制被静默跳过。
- 图片列表不通过普通列表 IPC 传输完整原图。

### 稳定性

- v7 到 v8 迁移失败可恢复到迁移前备份。
- 数据库损坏、BLOB 损坏和磁盘不足都有可定位日志。
- 现有文本、文件、搜索、OCR、托盘和开机自启回归测试全部通过。

## 18. 发布与回滚

发布候选必须同时提供：

- 数据库自动备份和恢复路径。
- v7 到 v8 的迁移日志。
- 新旧配置键说明。
- 图片原始表示和容量策略说明。
- Windows 快捷键冲突与 `Win` 限制说明。
- 安装包实机验证记录。

若发布候选出现严重问题，优先回滚应用二进制并保留迁移前数据库备份。禁止使用旧二进制直接覆盖正在迁移的数据库而不先确认 schema 版本。

## 19. 已知限制与产品措辞

- “原始保留”指保留操作系统实际提供的原始表示；Klip 不能恢复剪贴板中从未存在的源文件字节或元数据。
- “无损”指不主动降低像素、尺寸、透明通道或已有编码质量；缩略图是独立预览副本。
- `Win` 可以录入，但 Windows 可能在系统更新后占用新的组合；Klip 以实际注册结果为准。
- 点击其他软件后隐藏目前是默认行为，后续可根据使用反馈调整默认值。
