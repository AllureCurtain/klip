# Klip API 文档

## 1. Tauri IPC 命令

前端通过 `invoke()` 调用后端命令。

### 1.1 剪贴板操作

#### `get_clipboard_list`

获取剪贴板历史列表。

**参数**:
```typescript
{
  limit?: number;   // 返回条数，默认 100
  offset?: number;  // 偏移量，默认 0
}
```

**返回**:
```typescript
ClipboardItem[]
```

**示例**:
```typescript
const items = await invoke('get_clipboard_list', { limit: 50 });
```

---

#### `search_clipboard`

搜索剪贴板历史。

**参数**:
```typescript
{
  query: string;    // 搜索关键词
  limit?: number;   // 返回条数，默认 100
}
```

**返回**:
```typescript
ClipboardItem[]
```

**示例**:
```typescript
const results = await invoke('search_clipboard', { query: 'hello' });
```

---

#### `get_clipboard_by_id`

获取单条剪贴板记录。

**参数**:
```typescript
{
  id: number;  // 记录 ID
}
```

**返回**:
```typescript
ClipboardItem | null
```

---

#### `delete_clipboard_item`

删除单条剪贴板记录。

**参数**:
```typescript
{
  id: number;  // 记录 ID
}
```

**返回**:
```typescript
void
```

---

#### `clear_clipboard_history`

清空所有剪贴板历史。

**参数**: 无

**返回**:
```typescript
void
```

---

#### `copy_to_clipboard`

将记录内容复制到系统剪贴板。

**参数**:
```typescript
{
  id: number;  // 记录 ID
}
```

**返回**:
```typescript
void
```

---

### 1.2 配置管理

#### `get_config`

获取单个配置项。

**参数**:
```typescript
{
  key: string;  // 配置键
}
```

**返回**:
```typescript
string | null
```

---

#### `get_all_config`

获取所有配置。

**参数**: 无

**返回**:
```typescript
Record<string, string>
```

---

#### `set_config`

设置配置项。

**参数**:
```typescript
{
  key: string;    // 配置键
  value: string;  // 配置值
}
```

**返回**:
```typescript
void
```

**当前运行时约定**:

- `hotkey_toggle_window` 和 `hotkey_quick_paste_prefix` 会在写入后立即触发后端热键重载
- 当前支持的窗口热键配置范围为 `Ctrl+Alt+<A-Z>`
- 当前支持的快速粘贴前缀为 `Ctrl+Alt`，实际生效组合为 `Ctrl+Alt+1` 到 `Ctrl+Alt+9`
- 其他配置键当前主要负责持久化，不保证立即产生运行时副作用

---

### 1.3 系统操作

#### `toggle_window`

切换主窗口显示/隐藏。

**参数**: 无

**返回**:
```typescript
void
```

---

#### `show_window`

显示主窗口。

**参数**: 无

**返回**:
```typescript
void
```

---

#### `hide_window`

隐藏主窗口。

**参数**: 无

**返回**:
```typescript
void
```

---

#### `set_auto_start`

设置开机自启动。

**参数**:
```typescript
{
  enabled: boolean;  // 是否启用
}
```

**返回**:
```typescript
void
```

---

#### `is_auto_start_enabled`

读取当前系统层面的开机自启动状态。

**参数**: 无

**返回**:
```typescript
boolean
```

---

#### `get_system_info`

获取系统信息。

**参数**: 无

**返回**:
```typescript
{
  platform: 'windows' | 'macos' | 'linux';
  version: string;
  app_version: string;
}
```

---

## 2. Tauri 事件

前端通过 `listen()` 监听后端事件。

### 2.1 剪贴板事件

#### `clipboard-updated`

剪贴板内容更新时触发。

**数据**:
```typescript
ClipboardItem
```

**示例**:
```typescript
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen('clipboard-updated', (event) => {
  const newItem = event.payload as ClipboardItem;
  // 更新列表
});
```

---

#### `clipboard-cleared`

剪贴板历史清空时触发。

**数据**: 无

---

### 2.2 配置事件

#### `config-changed`

配置变更时触发。

**数据**:
```typescript
{
  key: string;
  value: string;
}
```

---

## 3. 数据类型

### 3.1 ClipboardItem

剪贴板条目。

```typescript
interface ClipboardItem {
  id: number;
  content_type: 'text' | 'image' | 'file';
  content: string;
  preview: string | null;
  hash: string;
  size: number;
  metadata: string | null;
  is_favorited: boolean;
  created_at: number;   // 毫秒时间戳
  last_used_at: number; // 毫秒时间戳
}
```

### 3.2 AppConfig

应用配置。

```typescript
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

### 3.3 ContentType

内容类型枚举。

```typescript
type ContentType = 'text' | 'image' | 'file';
```

### 3.4 SystemInfo

系统信息。

```typescript
interface SystemInfo {
  platform: 'windows' | 'macos' | 'linux';
  version: string;
  app_version: string;
}
```

---

## 4. 前端 API 封装

建议封装 Tauri API 便于使用。

```typescript
// lib/tauri.ts
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// 剪贴板 API
export const clipboardApi = {
  getList: (limit = 100, offset = 0) =>
    invoke<ClipboardItem[]>('get_clipboard_list', { limit, offset }),

  search: (query: string, limit = 100) =>
    invoke<ClipboardItem[]>('search_clipboard', { query, limit }),

  delete: (id: number) =>
    invoke('delete_clipboard_item', { id }),

  copy: (id: number) =>
    invoke('copy_to_clipboard', { id }),

  clear: () =>
    invoke('clear_clipboard_history'),
};

// 配置 API
export const configApi = {
  get: (key: string) =>
    invoke<string | null>('get_config', { key }),

  getAll: () =>
    invoke<Record<string, string>>('get_all_config'),

  set: (key: string, value: string) =>
    invoke('set_config', { key, value }),
};

// 系统 API
export const systemApi = {
  toggleWindow: () =>
    invoke('toggle_window'),

  showWindow: () =>
    invoke('show_window'),

  hideWindow: () =>
    invoke('hide_window'),

  setAutoStart: (enabled: boolean) =>
    invoke('set_auto_start', { enabled }),

  isAutoStartEnabled: () =>
    invoke<boolean>('is_auto_start_enabled'),

  getInfo: () =>
    invoke<SystemInfo>('get_system_info'),
};

// 事件监听
export const onClipboardUpdated = (callback: (item: ClipboardItem) => void) =>
  listen('clipboard-updated', (event) => callback(event.payload as ClipboardItem));

export const onClipboardCleared = (callback: () => void) =>
  listen('clipboard-cleared', () => callback());

export const onConfigChanged = (callback: (key: string, value: string) => void) =>
  listen('config-changed', (event) => {
    const { key, value } = event.payload as { key: string; value: string };
    callback(key, value);
  });
```

---

## 5. 错误处理

所有命令返回 `Result<T, String>`，前端需要处理错误。

```typescript
try {
  await clipboardApi.delete(id);
} catch (error) {
  console.error('Failed to delete:', error);
  // 显示错误提示
}
```

---

## 6. 使用示例

### 6.1 完整的 Hook 示例

```typescript
// hooks/useClipboard.ts
import { useState, useEffect, useCallback } from 'react';
import { clipboardApi, onClipboardUpdated } from '@/lib/tauri';

export function useClipboard() {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    try {
      const data = await clipboardApi.getList();
      setItems(data);
    } catch (error) {
      console.error('Failed to fetch:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();

    // 监听更新
    const unlisten = onClipboardUpdated((item) => {
      setItems((prev) => [item, ...prev]);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [fetchItems]);

  return { items, loading, refetch: fetchItems };
}
```
