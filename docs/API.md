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

#### `get_clipboard_list_filtered`

按内容类型、收藏状态或标签筛选剪贴板历史。

**参数**:
```typescript
{
  contentType?: 'text' | 'image' | 'file' | null;
  favoriteOnly?: boolean;
  tagId?: number | null;
  limit?: number;
  offset?: number;
}
```

**返回**:
```typescript
ClipboardItem[]
```

---

#### `search_clipboard_filtered`

在关键词搜索基础上叠加内容类型、收藏状态或标签筛选。

**参数**:
```typescript
{
  query: string;
  contentType?: 'text' | 'image' | 'file' | null;
  favoriteOnly?: boolean;
  tagId?: number | null;
  limit?: number;
  offset?: number;
}
```

**返回**:
```typescript
ClipboardItem[]
```

---

#### `search_clipboard_advanced`

在关键词搜索基础上叠加类型、收藏、敏感、标签、精确匹配和创建时间范围过滤。

**参数**:
```typescript
{
  query: {
    query: string;
    contentType?: 'text' | 'image' | 'file' | null;
    favoriteOnly?: boolean;
    sensitiveOnly?: boolean | null;
    tagId?: number | null;
    exactMatch?: boolean;
    createdAfter?: number | null;  // 毫秒时间戳
    createdBefore?: number | null; // 毫秒时间戳
    limit?: number;
    offset?: number;
  }
}
```

**返回**:
```typescript
ClipboardItem[]
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

#### `delete_clipboard_items`

批量删除剪贴板记录。

**参数**:
```typescript
{
  ids: number[];
}
```

**返回**:
```typescript
number
```

---

#### `set_favorite_for_items`

批量设置收藏状态。

**参数**:
```typescript
{
  ids: number[];
  isFavorited: boolean;
}
```

**返回**:
```typescript
number
```

---

#### `copy_to_clipboard`

将记录内容按原有格式复制到系统剪贴板，不模拟粘贴。

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

#### `paste_from_clipboard`

将记录内容按原有格式写入系统剪贴板，隐藏 Klip 窗口并模拟粘贴。

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

#### `copy_plain_text_to_clipboard`

仅将文本记录的纯文本内容复制到系统剪贴板，不写入 HTML/RTF，也不模拟粘贴。
非文本记录返回 `invalid_input`。

**参数**:
```typescript
{
  id: number;  // 文本记录 ID
}
```

**返回**:
```typescript
void
```

---

#### `paste_plain_text_from_clipboard`

仅将文本记录的纯文本内容写入系统剪贴板，隐藏 Klip 窗口并模拟粘贴。
非文本记录返回 `invalid_input`，且不会隐藏窗口或模拟粘贴。

**参数**:
```typescript
{
  id: number;  // 文本记录 ID
}
```

**返回**:
```typescript
void
```

---

#### `set_visible_clipboard_items`

同步当前界面有序结果中的前 9 个记录 ID，供 `Ctrl+Alt+1` 到 `Ctrl+Alt+9` 使用。
传入空数组会建立明确的空快照；只有前端从未同步过时，快捷键才回退到数据库最近记录。

**参数**:
```typescript
{
  ids: number[]; // 正整数 ID；超过 9 个时后端只保留前 9 个
}
```

**返回**:
```typescript
void
```

---

### 1.2 标签、数据导入导出和敏感内容

#### `list_tags`

返回所有标签。

**参数**: 无

**返回**:
```typescript
Tag[]
```

---

#### `create_tag`

创建标签。

**参数**:
```typescript
{
  name: string;
  color?: string | null;
}
```

**返回**:
```typescript
Tag
```

---

#### `delete_tag`

删除标签，并移除剪贴板条目上的关联。

**参数**:
```typescript
{
  id: number;
}
```

**返回**:
```typescript
void
```

---

#### `assign_tag_to_item` / `remove_tag_from_item`

给剪贴板条目添加或移除标签。

**参数**:
```typescript
{
  itemId: number;
  tagId: number;
}
```

**返回**:
```typescript
void
```

---

#### `export_clipboard_json` / `export_clipboard_csv`

导出剪贴板历史。导出命令会创建目标父目录。

**参数**:
```typescript
{
  path: string;
}
```

**返回**:
```typescript
BackupSummary
```

---

#### `import_clipboard_json` / `import_clipboard_csv`

导入剪贴板历史。JSON 导入会校验导出版本；CSV 导入支持带引号的多行字段。

**参数**:
```typescript
{
  path: string;
}
```

**返回**:
```typescript
ImportSummary
```

---

#### `backup_database`

创建当前 SQLite 数据库备份。

**参数**:
```typescript
{
  path: string;
}
```

**返回**:
```typescript
BackupSummary
```

---

#### `restore_database`

恢复 SQLite 数据库备份。恢复前会校验备份数据库，并把当前数据库保存为 `.pre-restore.bak`。

**参数**:
```typescript
{
  path: string;
}
```

**返回**:
```typescript
RestoreSummary
```

---

#### `rescan_sensitive_items`

重新扫描历史文本，刷新敏感内容标记。

**参数**: 无

**返回**:
```typescript
number
```

---

### 1.3 片段和来源规则

#### `list_snippets` / `search_snippets`

返回全部片段，或按标题/内容搜索片段。

**参数**:
```typescript
// list_snippets
{}

// search_snippets
{ query: string }
```

**返回**:
```typescript
Snippet[]
```

---

#### `create_snippet` / `update_snippet`

创建或更新常用片段。

**参数**:
```typescript
{
  id?: number; // update_snippet 需要
  input: {
    title: string;
    content: string;
    tagId: number | null;
    isFavorited: boolean;
  }
}
```

**返回**:
```typescript
Snippet
```

---

#### `delete_snippet`

删除片段。

**参数**:
```typescript
{ id: number }
```

**返回**:
```typescript
void
```

---

#### `list_source_rules`

返回剪贴板来源忽略规则。

**参数**: 无

**返回**:
```typescript
SourceRule[]
```

---

#### `create_source_rule` / `update_source_rule`

创建或更新来源忽略规则。Windows 运行时会用前台进程名和窗口标题匹配这些规则；非 Windows 平台当前只应用监听/隐私模式开关，不做来源识别。

**参数**:
```typescript
{
  id?: number; // update_source_rule 需要
  input: {
    matchType: 'process' | 'title' | 'any';
    pattern: string;
    enabled: boolean;
  }
}
```

**返回**:
```typescript
SourceRule
```

---

#### `set_source_rule_enabled`

启用或禁用来源忽略规则。

**参数**:
```typescript
{
  id: number;
  enabled: boolean;
}
```

**返回**:
```typescript
SourceRule
```

---

#### `delete_source_rule`

删除来源忽略规则。

**参数**:
```typescript
{ id: number }
```

**返回**:
```typescript
void
```

---

### 1.4 配置管理

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
- `sensitive_capture_policy=skip` 会让后端跳过新捕获的敏感文本
- `mask_sensitive_previews` 由前端列表渲染消费，默认遮罩敏感内容预览
- `clipboard_monitor_enabled=false` 会让后端监听器跳过新采集
- `privacy_mode_until` 为未来毫秒时间戳时会让后端监听器跳过新采集
- `updates_enabled`、`update_feed_url`、`encryption_enabled`、`encryption_status`、`sync_folder`、`plugin_folder` 是本地就绪/配置项；当前仓库不包含托管更新源、真实加密迁移、同步服务或插件运行时
- 其他配置键当前主要负责持久化，不保证立即产生运行时副作用

---

### 1.5 系统操作

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

此命令会更新系统层面的自启动状态，并把 `auto_start` 持久化到数据库。

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

#### `clipboard-item-updated`

已有条目的后台状态发生变化时触发。当前由图片 OCR 在 `pending` 转为 `completed` 或 `failed` 后发送完整 `ClipboardItem`；前端应按 `id` 替换已有条目，若 OCR 文本首次命中当前搜索则插入结果。

**数据**:
```typescript
ClipboardItem
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
  source_application: string | null;
  source_window_title: string | null;
  is_favorited: boolean;
  is_sensitive: boolean;
  sensitivity_reason: string | null;
  formats: Array<{
    format: 'text' | 'html' | 'rtf';
    content: string;
  }>;
  ocr: {
    status: 'pending' | 'completed' | 'failed';
    text: string;
    error: string | null;
    updated_at: number;
  } | null;
  tags: Tag[];
  created_at: number;   // 毫秒时间戳
  last_used_at: number; // 毫秒时间戳
}
```

`source_application` 是捕获时可用的应用名或进程文件名，`source_window_title` 是可选窗口标题。macOS 未授予 Accessibility 权限时仍返回应用名但标题为 `null`；Wayland 和不支持的平台两个字段均为 `null`，不会因此跳过捕获。JSON v1 导入导出保留这两个字段，CSV v1 为兼容既有固定表头不携带来源。

### 3.2 Tag

```typescript
interface Tag {
  id: number;
  name: string;
  color: string | null;
  created_at: number;
}
```

### 3.3 AppConfig

应用配置。

```typescript
interface AppConfig {
  max_history_count: number;
  hotkey_toggle_window: string;
  hotkey_quick_paste_prefix: string;
  auto_start: boolean; // 启动时会与系统层面的自启状态同步
  close_to_tray: boolean;
  window_width: number;
  window_height: number;
  search_debounce_ms: number;
  language: string;
  sensitive_capture_policy: 'flag' | 'skip';
  mask_sensitive_previews: boolean;
  clipboard_monitor_enabled: boolean;
  privacy_mode_until: number;
  updates_enabled: boolean;
  update_feed_url: string;
  encryption_enabled: boolean;
  encryption_status: string;
  sync_folder: string;
  plugin_folder: string;
}
```

### 3.4 Snippet / SourceRule / AdvancedSearchQuery

```typescript
interface Snippet {
  id: number;
  title: string;
  content: string;
  tag_id: number | null;
  is_favorited: boolean;
  created_at: number;
  updated_at: number;
}

interface SnippetInput {
  title: string;
  content: string;
  tagId: number | null;
  isFavorited: boolean;
}

interface SourceRule {
  id: number;
  match_type: 'process' | 'title' | 'any';
  pattern: string;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

interface SourceRuleInput {
  matchType: 'process' | 'title' | 'any';
  pattern: string;
  enabled: boolean;
}

interface AdvancedSearchQuery {
  query: string;
  contentType?: ContentType | null;
  favoriteOnly?: boolean;
  sensitiveOnly?: boolean | null;
  tagId?: number | null;
  exactMatch?: boolean;
  createdAfter?: number | null;
  createdBefore?: number | null;
  limit?: number;
  offset?: number;
}
```

### 3.5 ImportSummary / BackupSummary / RestoreSummary

```typescript
interface ImportSummary {
  imported: number;
  skipped: number;
}

interface BackupSummary {
  path: string;
  size: number;
}

interface RestoreSummary {
  path: string;
  size: number;
  pre_restore_backup_path: string;
  pre_restore_backup_size: number;
}
```

### 3.6 ContentType

内容类型枚举。

```typescript
type ContentType = 'text' | 'image' | 'file';
```

### 3.7 SystemInfo

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

  getListFiltered: (options: ClipboardQueryOptions = {}) =>
    invoke<ClipboardItem[]>('get_clipboard_list_filtered', options),

  search: (query: string, limit = 100) =>
    invoke<ClipboardItem[]>('search_clipboard', { query, limit }),

  searchFiltered: (query: string, options: ClipboardQueryOptions = {}) =>
    invoke<ClipboardItem[]>('search_clipboard_filtered', { query, ...options }),

  searchAdvanced: (query: AdvancedSearchQuery) =>
    invoke<ClipboardItem[]>('search_clipboard_advanced', { query }),

  delete: (id: number) =>
    invoke('delete_clipboard_item', { id }),

  deleteMany: (ids: number[]) =>
    invoke<number>('delete_clipboard_items', { ids }),

  copy: (id: number) =>
    invoke('copy_to_clipboard', { id }),

  copyPlainText: (id: number) =>
    invoke('copy_plain_text_to_clipboard', { id }),

  paste: (id: number) =>
    invoke('paste_from_clipboard', { id }),

  pastePlainText: (id: number) =>
    invoke('paste_plain_text_from_clipboard', { id }),

  setVisibleItems: (ids: number[]) =>
    invoke('set_visible_clipboard_items', { ids }),

  toggleFavorite: (id: number) =>
    invoke<ClipboardItem>('toggle_favorite', { id }),

  setFavoriteForItems: (ids: number[], isFavorited: boolean) =>
    invoke<number>('set_favorite_for_items', { ids, isFavorited }),

  listTags: () =>
    invoke<Tag[]>('list_tags'),

  createTag: (name: string, color?: string | null) =>
    invoke<Tag>('create_tag', { name, color }),

  deleteTag: (id: number) =>
    invoke('delete_tag', { id }),

  assignTagToItem: (itemId: number, tagId: number) =>
    invoke('assign_tag_to_item', { itemId, tagId }),

  removeTagFromItem: (itemId: number, tagId: number) =>
    invoke('remove_tag_from_item', { itemId, tagId }),

  rescanSensitive: () =>
    invoke<number>('rescan_sensitive_items'),

  exportJson: (path: string) =>
    invoke<BackupSummary>('export_clipboard_json', { path }),

  exportCsv: (path: string) =>
    invoke<BackupSummary>('export_clipboard_csv', { path }),

  importJson: (path: string) =>
    invoke<ImportSummary>('import_clipboard_json', { path }),

  importCsv: (path: string) =>
    invoke<ImportSummary>('import_clipboard_csv', { path }),

  backupDatabase: (path: string) =>
    invoke<BackupSummary>('backup_database', { path }),

  restoreDatabase: (path: string) =>
    invoke<RestoreSummary>('restore_database', { path }),

  clear: () =>
    invoke('clear_clipboard_history'),
};

export const productApi = {
  listSnippets: () =>
    invoke<Snippet[]>('list_snippets'),

  searchSnippets: (query: string) =>
    invoke<Snippet[]>('search_snippets', { query }),

  createSnippet: (input: SnippetInput) =>
    invoke<Snippet>('create_snippet', { input }),

  updateSnippet: (id: number, input: SnippetInput) =>
    invoke<Snippet>('update_snippet', { id, input }),

  deleteSnippet: (id: number) =>
    invoke('delete_snippet', { id }),

  listSourceRules: () =>
    invoke<SourceRule[]>('list_source_rules'),

  createSourceRule: (input: SourceRuleInput) =>
    invoke<SourceRule>('create_source_rule', { input }),

  updateSourceRule: (id: number, input: SourceRuleInput) =>
    invoke<SourceRule>('update_source_rule', { id, input }),

  setSourceRuleEnabled: (id: number, enabled: boolean) =>
    invoke<SourceRule>('set_source_rule_enabled', { id, enabled }),

  deleteSourceRule: (id: number) =>
    invoke('delete_source_rule', { id }),
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

  getDiagnostics: () =>
    invoke<DiagnosticsInfo>('get_diagnostics_info'),
};

// 事件监听
export const onClipboardUpdated = (callback: (item: ClipboardItem) => void) =>
  listen('clipboard-updated', (event) => callback(event.payload as ClipboardItem));

export const onClipboardItemUpdated = (callback: (item: ClipboardItem) => void) =>
  listen('clipboard-item-updated', (event) => callback(event.payload as ClipboardItem));

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
