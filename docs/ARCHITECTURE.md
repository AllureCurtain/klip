# Klip 架构设计文档

## 1. 技术栈

### 1.1 前端技术

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.x | UI 框架 |
| TypeScript | 5.x | 类型安全 |
| Vite | 6.x | 构建工具 |
| Shadcn/ui | latest | 组件库 |
| Tailwind CSS | 4.x | 样式框架 |
| Zustand | 5.x | 状态管理 |

### 1.2 后端技术

| 技术 | 版本 | 用途 |
|------|------|------|
| Tauri | 2.0 | 桌面应用框架 |
| Rust | 1.95+ | 后端语言 |
| rusqlite | 0.31 | SQLite 绑定 |
| clipboard-rs | 0.3.5 | 跨平台剪贴板监听、读取和写回 |
| Tantivy / tantivy-jieba | 0.24.2 / 0.16.0 | 全文索引和中文分词 |
| oar-ocr / ONNX Runtime | 0.6.2 / 1.24.2 | 本地图片文字识别 |
| serde | 1.x | 序列化 |

### 1.3 开发工具

| 工具 | 版本 | 用途 |
|------|------|------|
| pnpm | 10.x | 包管理器 |
| Node.js | 24.x (LTS) | JavaScript 运行时 |
| ESLint | 9.x | JS/TS 检查 |
| Prettier | 3.x | 代码格式化 |
| rustfmt | latest | Rust 格式化 |
| clippy | latest | Rust 检查 |

---

## 2. 系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   UI Layer  │  │ State Layer │  │   API Layer │          │
│  │  (Shadcn)   │  │  (Zustand)  │  │  (Tauri)    │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└──────────────────────────┬──────────────────────────────────┘
                           │ Tauri IPC (invoke)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend (Rust)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  Clipboard  │  │  Database   │  │ Search/OCR  │          │
│  │  Monitor    │  │  (SQLite)   │  │  Workers    │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   Hotkey    │  │   System    │  │   Commands  │          │
│  │   Manager   │  │    Tray     │  │   (IPC)     │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流图

```
用户复制内容
     │
     ▼
┌─────────────────┐
│ Clipboard Monitor│  ← Windows 事件驱动 / 其他平台轮询兜底
└────────┬────────┘
         │ 内容变化
         ▼
┌─────────────────┐
│  Content Parser │  ← 类型检测 (text/image/file)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Database     │  ← 存储 + 去重
└────────┬────────┘
         ├──── 图片 pending ────▶ OCR Worker ────▶ completed/failed
         ├──── 可搜索文本 ──────▶ Tantivy Index
         │
         ▼
┌─────────────────┐
│  Tauri Event    │  ← 通知前端更新
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Frontend Store │  ← 更新 UI
└─────────────────┘
```

---

## 3. 模块设计

### 3.1 前端模块

```
src/
├── App.tsx              # 主应用组件（事件监听、路由、布局）
├── main.tsx             # 入口
├── components/
│   ├── ui/              # Shadcn/ui 基础组件
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── scroll-area.tsx
│   │   ├── dialog.tsx
│   │   ├── switch.tsx
│   │   ├── label.tsx
│   │   ├── tabs.tsx
│   │   ├── separator.tsx
│   │   └── badge.tsx
│   ├── layout/          # 布局组件
│   │   ├── Header.tsx   # 搜索栏 + 内容类型过滤 + 主题切换
│   │   └── EmptyState.tsx
│   ├── clipboard/       # 剪贴板相关
│   │   ├── ClipboardList.tsx   # 虚拟滚动列表（@tanstack/react-virtual）
│   │   ├── ClipboardItem.tsx   # 统一的列表项（内部按 content_type 分支渲染）
│   │   └── ClipboardDetailDialog.tsx # 文本、图片、文件和 OCR 的统一详情
│   └── settings/        # 设置相关
│       ├── SettingsView.tsx        # 全页设置（通用/快捷键/行为/数据/关于）
│       └── DataManagementView.tsx  # 标签、导入导出、备份恢复、敏感内容设置
│
├── stores/              # Zustand 状态
│   ├── clipboardStore.ts  # 剪贴板列表、搜索、删除、收藏
│   ├── configStore.ts     # 应用配置读写
│   └── themeStore.ts      # 主题（light/dark/system）
│
├── lib/                 # 工具库
│   ├── tauri.ts         # 所有 IPC 调用的唯一入口
│   ├── utils.ts         # 格式化、cn() 等工具函数
│   └── constants.ts
│
├── types/               # 类型定义
│   └── index.ts
│
└── styles/
    └── globals.css      # Tailwind 4 + oklch 主题变量
```

### 3.2 后端模块

```
src-tauri/src/
├── main.rs              # 应用启动、tracing 初始化、窗口焦点处理
├── lib.rs               # 模块导出、托盘点击守卫
│
├── commands/            # IPC 命令
│   ├── mod.rs           # 基础剪贴板、配置、窗口、系统命令
│   ├── search.rs        # 搜索 IPC 命令
│   └── productization.rs # 筛选、标签、导入导出、备份恢复、敏感内容
│
├── clipboard/           # 剪贴板监听与格式处理
│   ├── mod.rs
│   ├── monitor.rs       # clipboard-rs 事件监听、捕获 gate 与带来源落库
│   └── format/          # 格式策略
│       ├── mod.rs       # 格式分发表
│       ├── text.rs      # 文本格式
│       ├── image.rs     # 图片格式（缩略图生成）
│       └── file.rs      # 文件格式（路径解析、元数据提取）
│
├── database/            # 数据库操作
│   ├── mod.rs
│   ├── connection.rs    # 连接管理、建表、迁移
│   ├── clipboard.rs     # 剪贴板 CRUD
│   ├── config.rs        # 配置 CRUD
│   ├── data_portability.rs # JSON/CSV 导入导出、数据库备份恢复
│   ├── ocr.rs          # OCR pending/completed/failed 持久化与 hydration
│   ├── productization.rs   # 筛选、标签、敏感内容扫描
│   └── types.rs         # 数据类型（ClipboardItem, SystemInfo 等）
│
├── search/              # Tantivy 全文索引、jieba 分词、健康检测和 SQLite 重建
│   └── mod.rs
│
├── ocr/                 # 单 worker 队列、模型校验/缓存、图片解码和本地推理
│   └── mod.rs
│
├── platform/            # 平台差异与优雅降级
│   ├── focus/           # Windows HWND / macOS app PID / X11 window 焦点捕获恢复
│   ├── source/          # Windows / macOS / X11 前台应用与窗口标题追踪
│   └── linux.rs         # XDG 目录、autostart、Wayland 检测与 Linux 模拟粘贴
│
├── hotkey/              # 快捷键管理
│   ├── mod.rs
│   └── manager.rs       # 注册/注销/重载热键、快速粘贴
│
├── tray/                # 系统托盘
│   ├── mod.rs
│   └── setup.rs         # 托盘图标、菜单、点击事件
│
└── config/              # 静态配置常量
    ├── mod.rs
    └── settings.rs
```

---

## 4. 核心流程设计

### 4.1 剪贴板监听流程

```rust
// 简化示意：所有平台共享 clipboard-rs backend
fn start_monitor(app_handle: AppHandle) {
    let mut watcher = ClipboardWatcherContext::new()?;
    watcher.add_handler(KlipClipboardHandler { app_handle });
    watcher.start_watch();
}
```

图片写入 SQLite 后只向单 OCR worker 入队，不在 clipboard watcher 回调中加载模型或推理。worker 从 Tauri resources 校验并复制 PP-OCRv5 模型到 `{app_data_dir}/ocr-models`，Windows 从平台专用资源显式加载已校验的 ONNX Runtime DLL并关闭 telemetry；其他平台沿 `ort` 的静态 runtime 构建路径，但真实运行结果必须分别在对应系统验收。推理完成后事务更新 `clipboard_ocr`，调用 search 的 `index_text` 路径，并发送 `clipboard-item-updated`。

### 4.2 剪贴板来源追踪

monitor 在读取剪贴板前调用 `platform::source::current()`，同一份来源既用于 `clipboard_source_rules` 捕获 gate，也随成功保存的记录写入 DB v6 字段。来源获取失败始终返回空值，规则匹配把空值视为不匹配，因此不会误伤捕获。

| 平台 | 应用身份 | 窗口标题 | 降级边界 |
|------|----------|----------|----------|
| Windows | 前台 HWND 对应进程的可执行文件名 | Win32 window text | 进程查询或标题读取失败时对应字段为空 |
| macOS | `NSWorkspace.frontmostApplication` 的 localized name / bundle identifier | Accessibility focused-window title | 未授权时只记录应用名，并且只提示一次 |
| Linux X11 | `_NET_WM_PID` 对应 `/proc/<pid>/comm` 或 `exe` | `_NET_WM_NAME`，回退 `WM_NAME` | EWMH/属性不可用时返回空值 |
| Linux Wayland / 其他平台 | 无 | 无 | 一次性提示后自动关闭来源功能，捕获继续 |

同一内容哈希再次出现时，已知新来源会替换应用与配套标题；手工插入、旧 JSON/CSV 或不支持平台产生的空来源不会清空既有来源。列表保持固定高度，只显示截断后的应用名，完整应用名和窗口标题通过 tooltip 提供。

### 4.3 快捷键处理流程

```rust
// 简化示意
fn register_hotkeys(app: &AppHandle) {
    let toggle = load_config("hotkey_toggle_window");       // default: Ctrl+Alt+K
    let prefix = load_config("hotkey_quick_paste_prefix");  // default: Ctrl+Alt

    register_toggle(toggle);
    register_quick_paste(prefix); // Ctrl+Alt+1..9
}
```

### 4.4 粘贴目标焦点恢复

所有显示主窗口的既有入口都汇聚到 `window::controller`，并在 `show` / `set_focus` 之前调用 `platform::focus::capture_previous_foreground()`。用户选择历史后，粘贴流程先写入系统剪贴板并隐藏 Klip，再调用 `restore_previous_foreground()`，最后发送平台粘贴按键。

| 平台 | 捕获标识 | 恢复方式 | 降级边界 |
|------|----------|----------|----------|
| Windows | 前台 HWND，跳过 Klip 自身 PID | 校验 `IsWindow` 后调用 `SetForegroundWindow` | 目标失效或系统拒绝激活时返回未恢复 |
| macOS | `NSWorkspace.frontmostApplication` 的 PID | `NSRunningApplication.activateWithOptions` | 应用退出或系统拒绝激活时返回未恢复 |
| Linux X11 | EWMH `_NET_ACTIVE_WINDOW` | 向根窗口发送 `_NET_ACTIVE_WINDOW` client message | 无 EWMH window manager 时返回未恢复 |
| Linux Wayland / 其他平台 | 不保存 | 不请求 | 静默返回未尝试，不抛错 |

Windows 已用真实外部文本框完成显示 Klip、选择历史、恢复焦点并粘贴的运行时闭环。macOS/Linux 后端已做对应目标的静态编译，真实桌面会话仍需分别验收，不能视为已经实机通过。

### 4.5 前端状态管理

```typescript
// clipboardStore.ts
interface ClipboardStore {
  items: ClipboardItem[];
  loading: boolean;
  error: string | null;

  // Actions
  fetchItems: () => Promise<void>;
  searchItems: (query: string, contentType?: string) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
  copyItem: (id: number) => Promise<void>;
  clearItems: () => Promise<void>;
  toggleFavorite: (id: number) => Promise<void>;
  addItems: (items: ClipboardItem[]) => void;
  setItems: (items: ClipboardItem[]) => void;
}
```

---

## 5. 数据模型

详见 [DATABASE.md](DATABASE.md)

### 5.1 核心类型

```typescript
// 剪贴板项
interface ClipboardItem {
  id: number;
  content_type: 'text' | 'image' | 'file';
  content: string;
  preview: string | null;
  hash: string;
  size: number;
  metadata: string | null;   // JSON: ImageMetadata | FileMetadata
  is_favorited: boolean;
  is_sensitive: boolean;
  sensitivity_reason: string | null;
  formats: ClipboardFormat[];
  ocr: ClipboardOcr | null;
  tags: Tag[];
  created_at: number;
  last_used_at: number;
}

// 应用配置
interface AppConfig {
  max_history_count: number;
  hotkey_toggle_window: string;
  hotkey_quick_paste_prefix: string;
  auto_start: boolean;
  close_to_tray: boolean;
  window_width: number;
  window_height: number;
  search_debounce_ms: number;
  language: string;
  sensitive_capture_policy: 'flag' | 'skip';
  mask_sensitive_previews: boolean;
}
```

---

## 6. IPC 接口设计

详见 [API.md](API.md)

### 6.1 命令列表

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_clipboard_list` | limit, offset | ClipboardItem[] | 获取列表 |
| `get_clipboard_list_filtered` | filters | ClipboardItem[] | 筛选列表 |
| `search_clipboard` | query, content_type?, limit | ClipboardItem[] | 搜索 |
| `search_clipboard_filtered` | query, filters | ClipboardItem[] | 搜索并筛选 |
| `get_clipboard_by_id` | id | ClipboardItem? | 按 ID 获取 |
| `delete_clipboard_item` | id | void | 删除 |
| `delete_clipboard_items` | ids | number | 批量删除 |
| `copy_to_clipboard` | id | void | 复制到系统剪贴板 |
| `copy_plain_text_to_clipboard` | id | void | 以纯文本复制文本记录 |
| `paste_from_clipboard` | id | void | 复制后模拟粘贴 |
| `paste_plain_text_from_clipboard` | id | void | 以纯文本复制后模拟粘贴 |
| `toggle_favorite` | id | ClipboardItem | 切换收藏 |
| `set_favorite_for_items` | ids, is_favorited | number | 批量收藏/取消收藏 |
| `clear_clipboard_history` | - | void | 清空历史 |
| `list_tags` | - | Tag[] | 获取标签 |
| `create_tag` | name, color | Tag | 创建标签 |
| `delete_tag` | id | void | 删除标签 |
| `assign_tag_to_item` | item_id, tag_id | void | 添加标签关联 |
| `remove_tag_from_item` | item_id, tag_id | void | 移除标签关联 |
| `export_clipboard_json` | path | BackupSummary | 导出 JSON |
| `export_clipboard_csv` | path | BackupSummary | 导出 CSV |
| `import_clipboard_json` | path | ImportSummary | 导入 JSON |
| `import_clipboard_csv` | path | ImportSummary | 导入 CSV |
| `backup_database` | path | BackupSummary | 备份数据库 |
| `restore_database` | path | RestoreSummary | 校验并恢复数据库 |
| `rescan_sensitive_items` | - | number | 重新扫描敏感内容 |
| `get_config` | key | string? | 获取配置 |
| `get_all_config` | - | Record<string, string> | 获取全部配置 |
| `set_config` | key, value | void | 设置配置（热键变更会立即重载） |
| `toggle_window` | - | void | 切换窗口显示/隐藏 |
| `show_window` | - | void | 显示窗口 |
| `hide_window` | - | void | 隐藏窗口 |
| `set_auto_start` | enabled | void | 设置系统开机自启动并持久化 |
| `is_auto_start_enabled` | - | boolean | 查询系统层面的自启状态 |
| `get_system_info` | - | SystemInfo | 获取系统/版本信息 |
| `get_diagnostics_info` | - | DiagnosticsInfo | 获取诊断路径信息 |

### 6.2 事件列表

| 事件 | 数据 | 说明 |
|------|------|------|
| `clipboard-updated` | ClipboardItem | 剪贴板更新 |
| `clipboard-item-updated` | ClipboardItem | OCR 等后台任务更新已有条目 |
| `clipboard-cleared` | void | 剪贴板历史清空 |
| `config-changed` | { key, value } | 配置变更 |

### 6.3 运行时配置约定

- 当前后端实际消费的配置键包括 `hotkey_toggle_window`、`hotkey_quick_paste_prefix`、`auto_start`、`close_to_tray`、`window_width`、`window_height`、`sensitive_capture_policy`
- `set_config` 修改热键键后，后端会立即注销旧热键并重新注册
- `set_auto_start` 会调用系统自启动管理器，并将 `auto_start` 持久化到数据库
- `close_to_tray=true` 时关闭主窗口会隐藏到托盘；`false` 时关闭主窗口会退出应用
- `window_width`、`window_height` 会夹取到打包窗口最小尺寸并立即应用到主窗口
- `mask_sensitive_previews` 由前端列表渲染消费，默认开启
- `show_in_tray` 是旧数据库键，当前运行时不消费，前端也不再保存它
- 其他配置键当前主要承担持久化职责，不保证在运行中立即产生副作用

---

## 7. 关键技术决策

### 7.1 为什么选择 Tauri 2.0

| 对比项 | Tauri | Electron |
|--------|-------|----------|
| 安装包大小 | ~10MB | ~150MB |
| 内存占用 | ~50MB | ~150MB |
| 启动速度 | 快 | 较慢 |
| 安全性 | 高 | 中 |
| 框架跨平台能力 | 是 | 是 |

**结论**: Tauri 更轻量、更安全、性能更好。

### 7.2 为什么选择 SQLite

| 对比项 | SQLite | 其他方案 |
|--------|--------|----------|
| 部署 | 嵌入式，无需服务 | 需要数据库服务 |
| 性能 | 本地读写极快 | 网络延迟 |
| 隐私 | 完全本地 | 可能上传云端 |
| 维护 | 零维护 | 需要运维 |

**结论**: SQLite 完美满足本地应用需求。

### 7.3 为什么选择 Zustand

| 对比项 | Zustand | Redux | Jotai |
|--------|---------|-------|-------|
| 代码量 | 最少 | 多 | 少 |
| 学习曲线 | 平缓 | 陡峭 | 平缓 |
| 性能 | 好 | 好 | 好 |
| TypeScript | 友好 | 友好 | 友好 |

**结论**: Zustand 简单高效，适合中小型应用。

---

## 8. 性能优化策略

### 8.1 前端优化

| 策略 | 说明 |
|------|------|
| 虚拟滚动 | 大量列表项时只渲染可见区域 |
| 图片懒加载 | 图片缩略图按需加载 |
| 搜索防抖 | 150ms 防抖避免频繁查询 |
| 状态分片 | 按功能拆分 Store |

### 8.2 后端优化

| 策略 | 说明 |
|------|------|
| 数据库索引 | `created_at`、`last_used_at + created_at`、`content_type`、`hash` |
| 数据库访问模型 | 单个 SQLite 连接 + `Mutex<Connection>` 串行化访问 |
| 异步处理 | 剪贴板监听独立线程 |
| 全文搜索 | Tantivy + jieba；50 条/5 秒批量提交，启动时比对 checksum 及逐文档 ID/内容指纹，物理损坏或逻辑漂移时从 SQLite 重建，失败时回退 `LIKE` |
| 批量操作 | 批量删除优化 |

---

## 9. 安全设计

### 9.1 数据安全

- 所有数据存储在用户本地目录
- 数据库位于操作系统用户数据目录；当前版本未额外实现跨平台文件权限加固
- 不上传任何用户数据

### 9.2 后续安全特性

- 数据库加密
- 应用锁定密码

---

## 10. 扩展性设计

### 10.1 插件系统 (Phase 3)

```
plugin/
├── manifest.json    # 插件元信息
├── main.js          # 插件逻辑
└── ui/              # 插件 UI
```

### 10.2 云同步 (Phase 3)

- 端到端加密
- 用户自建服务器选项
- 冲突解决策略
