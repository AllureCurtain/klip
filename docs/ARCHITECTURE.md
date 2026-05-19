# Klip 架构设计文档

## 1. 技术栈

### 1.1 前端技术

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.x | UI 框架 |
| TypeScript | 6.x | 类型安全 |
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
| arboard | 3.x | 剪贴板操作 |
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
│  │  Clipboard  │  │  Database   │  │   Config    │          │
│  │  Monitor    │  │  (SQLite)   │  │  Commands   │          │
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
│   │   └── ImagePreview.tsx    # 图片大图预览弹窗
│   └── settings/        # 设置相关
│       └── SettingsView.tsx    # 全页设置（4 个 Tab：通用/快捷键/行为/关于）
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
├── lib.rs               # 模块导出、托盘点击守卫、前台窗口捕获/恢复
│
├── commands/            # IPC 命令（17 个 #[tauri::command]）
│   └── mod.rs
│
├── clipboard/           # 剪贴板监听与格式处理
│   ├── mod.rs
│   ├── monitor.rs       # Windows 事件驱动 / 其他平台轮询
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
│   └── types.rs         # 数据类型（ClipboardItem, SystemInfo 等）
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
// 简化示意
#[cfg(target_os = "windows")]
fn start_monitor(app_handle: AppHandle) {
    clipboard_master::Master::new(WindowsClipboardHandler { app_handle }).run();
}

#[cfg(not(target_os = "windows"))]
fn start_monitor(app_handle: AppHandle) {
    loop {
        let text = arboard::Clipboard::new()?.get_text()?;
        save_if_changed(app_handle, text);
        sleep(500ms);
    }
}
```

### 4.2 快捷键处理流程

```rust
// 简化示意
fn register_hotkeys(app: &AppHandle) {
    let toggle = load_config("hotkey_toggle_window");       // default: Ctrl+Alt+K
    let prefix = load_config("hotkey_quick_paste_prefix");  // default: Ctrl+Alt

    register_toggle(toggle);
    register_quick_paste(prefix); // Ctrl+Alt+1..9
}
```

### 4.3 前端状态管理

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
  show_in_tray: boolean;
  window_width: number;
  window_height: number;
  search_debounce_ms: number;
}
```

---

## 6. IPC 接口设计

详见 [API.md](API.md)

### 6.1 命令列表

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_clipboard_list` | limit, offset | ClipboardItem[] | 获取列表 |
| `search_clipboard` | query, content_type?, limit | ClipboardItem[] | 搜索 |
| `get_clipboard_by_id` | id | ClipboardItem? | 按 ID 获取 |
| `delete_clipboard_item` | id | void | 删除 |
| `copy_to_clipboard` | id | void | 复制到系统剪贴板 |
| `paste_from_clipboard` | id | void | 复制后模拟粘贴 |
| `toggle_favorite` | id | ClipboardItem | 切换收藏 |
| `clear_clipboard_history` | - | void | 清空历史 |
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
| `clipboard-cleared` | void | 剪贴板历史清空 |
| `config-changed` | { key, value } | 配置变更 |

### 6.3 运行时配置约定

- 当前后端实际消费的配置键为 `hotkey_toggle_window`、`hotkey_quick_paste_prefix`、`auto_start`
- `set_config` 修改这两个键后，后端会立即注销旧热键并重新注册
- `set_auto_start` 会调用系统自启动管理器，并将 `auto_start` 持久化到数据库
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
| 批量操作 | 批量删除优化 |

---

## 9. 安全设计

### 9.1 数据安全

- 所有数据存储在用户本地目录
- 数据库文件权限设置为用户独享
- 不上传任何用户数据

### 9.2 可选安全特性 (Phase 2)

- 敏感内容检测（密码、密钥等）
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
