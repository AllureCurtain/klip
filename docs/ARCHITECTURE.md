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
│  │  Monitor    │  │  (SQLite)   │  │  Manager    │          │
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
│ Clipboard Monitor│  ← 轮询监听 (100ms)
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
├── components/           # UI 组件
│   ├── ui/              # Shadcn/ui 基础组件
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── scroll-area.tsx
│   │   └── dialog.tsx
│   ├── layout/          # 布局组件
│   │   ├── Header.tsx
│   │   └── EmptyState.tsx
│   ├── clipboard/       # 剪贴板相关
│   │   ├── ClipboardList.tsx
│   │   ├── ClipboardItem.tsx
│   │   ├── TextItem.tsx
│   │   ├── ImageItem.tsx
│   │   └── FileItem.tsx
│   └── settings/        # 设置相关
│       └── SettingsDialog.tsx
│
├── hooks/               # 自定义 Hooks
│   ├── useClipboard.ts
│   ├── useSearch.ts
│   └── useHotkey.ts
│
├── stores/              # Zustand 状态
│   ├── clipboardStore.ts
│   ├── settingsStore.ts
│   └── uiStore.ts
│
├── lib/                 # 工具库
│   ├── tauri.ts         # Tauri API 封装
│   ├── utils.ts
│   └── constants.ts
│
└── types/               # 类型定义
    └── index.ts
```

### 3.2 后端模块

```
src-tauri/src/
├── commands/            # IPC 命令
│   ├── mod.rs
│   ├── clipboard.rs     # 剪贴板命令
│   ├── config.rs        # 配置命令
│   └── system.rs        # 系统命令
│
├── clipboard/           # 剪贴板监听
│   ├── mod.rs
│   ├── monitor.rs       # 监听器
│   ├── types.rs         # 类型定义
│   └── parser.rs        # 内容解析
│
├── database/            # 数据库操作
│   ├── mod.rs
│   ├── connection.rs    # 连接管理
│   ├── schema.rs        # 表结构
│   ├── clipboard.rs     # 剪贴板 CRUD
│   └── config.rs        # 配置 CRUD
│
├── hotkey/              # 快捷键管理
│   ├── mod.rs
│   └── manager.rs
│
├── tray/                # 系统托盘
│   ├── mod.rs
│   └── setup.rs
│
├── config/              # 应用配置
│   ├── mod.rs
│   └── types.rs
│
└── utils/               # 工具函数
    └── mod.rs
```

---

## 4. 核心流程设计

### 4.1 剪贴板监听流程

```rust
// 伪代码
struct ClipboardMonitor {
    last_hash: Option<String>,
    interval: Duration,  // 100ms
}

impl ClipboardMonitor {
    fn start(&self, app_handle: AppHandle) {
        spawn_thread(|| loop {
            let content = arboard::get_clipboard();

            if content.hash() != self.last_hash {
                self.last_hash = content.hash();

                let parsed = ContentParser::parse(content);
                database::insert(parsed);

                app_handle.emit("clipboard-updated", parsed);
            }

            sleep(100ms);
        });
    }
}
```

### 4.2 快捷键处理流程

```rust
// 伪代码
fn register_hotkeys(app: &AppHandle) {
    // 窗口切换
    global_shortcut::register("CommandOrControl+Shift+V", || {
        let window = app.get_window("main");
        if window.is_visible() {
            window.hide();
        } else {
            window.show();
            window.focus();
        }
    });

    // 快速粘贴 (1-9)
    for i in 1..=9 {
        global_shortcut::register(format!("CommandOrControl+Shift+{}", i), || {
            let item = database::get_by_index(i);
            arboard::set_clipboard(item.content);
            window.hide();
        });
    }
}
```

### 4.3 前端状态管理

```typescript
// clipboardStore.ts
interface ClipboardStore {
  items: ClipboardItem[];
  selectedItem: ClipboardItem | null;
  searchQuery: string;
  isLoading: boolean;

  // Actions
  fetchItems: () => Promise<void>;
  searchItems: (query: string) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
  copyItem: (id: number) => Promise<void>;
}

// 使用 Zustand
export const useClipboardStore = create<ClipboardStore>((set, get) => ({
  items: [],
  selectedItem: null,
  searchQuery: '',
  isLoading: false,

  fetchItems: async () => {
    const items = await invoke('get_clipboard_list');
    set({ items });
  },

  // ...
}));
```

---

## 5. 数据模型

详见 [DATABASE.md](DATABASE.md)

### 5.1 核心类型

```typescript
// 剪贴板项
interface ClipboardItem {
  id: number;
  contentType: 'text' | 'image' | 'file';
  content: string;
  preview: string;
  hash: string;
  size: number;
  createdAt: number;
  lastUsedAt: number;
}

// 应用配置
interface AppConfig {
  maxHistoryCount: number;      // 最大历史数
  hotkeyToggleWindow: string;   // 窗口快捷键
  autoStart: boolean;           // 开机自启
  closeToTray: boolean;         // 关闭到托盘
}
```

---

## 6. IPC 接口设计

详见 [API.md](API.md)

### 6.1 命令列表

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_clipboard_list` | limit, offset | ClipboardItem[] | 获取列表 |
| `search_clipboard` | query, limit | ClipboardItem[] | 搜索 |
| `delete_clipboard_item` | id | void | 删除 |
| `copy_to_clipboard` | id | void | 复制 |
| `clear_clipboard_history` | - | void | 清空 |
| `get_config` | key | string | 获取配置 |
| `set_config` | key, value | void | 设置配置 |
| `toggle_window` | - | void | 切换窗口 |
| `set_auto_start` | enabled | void | 设置自启 |

### 6.2 事件列表

| 事件 | 数据 | 说明 |
|------|------|------|
| `clipboard-updated` | ClipboardItem | 剪贴板更新 |
| `config-changed` | { key, value } | 配置变更 |

---

## 7. 关键技术决策

### 7.1 为什么选择 Tauri 2.0

| 对比项 | Tauri | Electron |
|--------|-------|----------|
| 安装包大小 | ~10MB | ~150MB |
| 内存占用 | ~50MB | ~150MB |
| 启动速度 | 快 | 较慢 |
| 安全性 | 高 | 中 |
| 跨平台 | 是 | 是 |

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
| 数据库索引 | created_at, hash 字段索引 |
| 连接池 | 单例连接，避免重复创建 |
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