# Klip 数据库设计文档

## 1. 数据库概述

| 属性 | 值 |
|------|-----|
| 数据库类型 | SQLite |
| 数据库文件 | `{app_data_dir}/klip.db` |
| 最小版本 | SQLite 3.x |
| 最大大小 | 当前未强制限制；数量保留由 `max_history_count` 控制 |

### 数据库文件位置

| 平台 | 路径 |
|------|------|
| Windows | `%APPDATA%\com.klip.app\klip.db` |
| macOS | `~/Library/Application Support/com.klip.app/klip.db` |
| Linux | `~/.local/share/klip/klip.db` |

---

## 2. 表结构设计

### 2.1 clipboard_items (剪贴板历史表)

存储所有剪贴板历史记录。

```sql
CREATE TABLE clipboard_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    content_type    TEXT NOT NULL,              -- 内容类型: 'text' | 'image' | 'file'
    content         TEXT NOT NULL,              -- 内容数据 (文本/Base64/JSON)
    preview         TEXT,                       -- 预览文本 (用于列表显示和搜索)
    hash            TEXT NOT NULL UNIQUE,       -- 内容哈希 (SHA256, 用于去重)
    size            INTEGER NOT NULL DEFAULT 0, -- 内容大小 (字节)
    metadata        TEXT,                       -- JSON 元数据
    source_application TEXT,                    -- 来源应用；平台不可用时为 NULL
    source_window_title TEXT,                   -- 来源窗口标题；权限不足时可为 NULL
    is_favorited    INTEGER NOT NULL DEFAULT 0, -- 是否收藏 (预留字段)
    is_sensitive    INTEGER NOT NULL DEFAULT 0, -- 是否敏感
    sensitivity_reason TEXT,                    -- 敏感原因
    created_at      INTEGER NOT NULL,           -- 创建时间 (毫秒时间戳)
    last_used_at    INTEGER NOT NULL            -- 最后使用时间 (毫秒时间戳)
);

-- 索引
CREATE INDEX idx_clipboard_created_at ON clipboard_items(created_at DESC);
CREATE INDEX idx_clipboard_last_used_created_at ON clipboard_items(last_used_at DESC, created_at DESC);
CREATE INDEX idx_clipboard_hash ON clipboard_items(hash);
CREATE INDEX idx_clipboard_preview ON clipboard_items(preview);
CREATE INDEX idx_clipboard_content_type ON clipboard_items(content_type);
CREATE INDEX idx_clipboard_sensitive ON clipboard_items(is_sensitive, last_used_at DESC, created_at DESC);
```

#### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | INTEGER | 是 | 自增主键 |
| content_type | TEXT | 是 | 内容类型，枚举值 |
| content | TEXT | 是 | 实际内容，格式见下文 |
| preview | TEXT | 否 | 预览文本，用于列表显示 |
| hash | TEXT | 是 | SHA256 哈希，唯一约束 |
| size | INTEGER | 是 | 内容大小，单位字节 |
| metadata | TEXT | 否 | 图片或文件元数据 JSON |
| source_application | TEXT | 否 | 捕获时的前台应用名或进程文件名 |
| source_window_title | TEXT | 否 | 捕获时的窗口标题；macOS Accessibility 未授权等场景为空 |
| is_favorited | INTEGER | 是 | 是否收藏，0/1 |
| is_sensitive | INTEGER | 是 | 是否敏感，0/1 |
| sensitivity_reason | TEXT | 否 | 敏感内容检测原因 |
| created_at | INTEGER | 是 | 创建时间，毫秒时间戳 |
| last_used_at | INTEGER | 是 | 最后使用时间，毫秒时间戳 |

#### content 字段格式

| content_type | content 格式 | 示例 |
|--------------|-------------|------|
| text | 原始文本 | `"Hello World"` |
| image | Base64 编码 | `"data:image/png;base64,iVBORw0KGgo..."` |
| file | JSON 数组 | `["/path/to/file1.txt", "/path/to/file2.pdf"]` |

#### preview 字段生成规则

| content_type | preview 格式 |
|--------------|-------------|
| text | 截取前 200 字符 |
| image | `"图片 [宽x高] [大小KB]"` |
| file | `"文件 [数量] [文件名1, 文件名2...]"` |

#### clipboard_formats（文本多格式表）

文本条目的 `clipboard_items.content` 始终保留纯文本，作为哈希、敏感检测和全文索引的事实源；可写回系统剪贴板的多格式表示保存在独立表中。

```sql
CREATE TABLE clipboard_formats (
    item_id INTEGER NOT NULL,
    format  TEXT NOT NULL, -- text | html | rtf
    content TEXT NOT NULL,
    PRIMARY KEY (item_id, format),
    FOREIGN KEY (item_id) REFERENCES clipboard_items(id) ON DELETE CASCADE
);
```

捕获文本时会原子写入纯文本与当前剪贴板携带的 HTML/RTF。同一纯文本再次捕获时，以最新格式集合替换旧集合，避免粘贴陈旧富格式。

#### clipboard_ocr（图片识别状态表）

图片捕获与 OCR 推理解耦：图片入库时原子创建 `pending` 状态，单后台 worker 完成推理后写入 `completed` 文本或 `failed` 错误。删除图片会通过外键级联删除 OCR 状态。

```sql
CREATE TABLE clipboard_ocr (
    item_id    INTEGER PRIMARY KEY,
    status     TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
    text       TEXT NOT NULL DEFAULT '',
    error      TEXT,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (item_id) REFERENCES clipboard_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_clipboard_ocr_status
ON clipboard_ocr(status, updated_at);
```

只有 `completed` 的 OCR 文本进入 Tantivy 和 SQLite 搜索 fallback。启动时 worker 会按 `updated_at, item_id` 恢复全部 `pending` 任务；同一图片的失败状态在再次捕获时重置为 `pending`。

---

### 2.2 app_config (应用配置表)

存储应用配置键值对。

```sql
CREATE TABLE app_config (
    key         TEXT PRIMARY KEY,   -- 配置键
    value       TEXT NOT NULL,      -- 配置值 (JSON 字符串)
    updated_at  INTEGER NOT NULL    -- 更新时间 (毫秒时间戳)
);

-- 默认配置数据
INSERT INTO app_config (key, value, updated_at) VALUES
    ('max_history_count', '100', strftime('%s', 'now') * 1000),
    ('hotkey_toggle_window', 'Ctrl+Alt+K', strftime('%s', 'now') * 1000),
    ('hotkey_quick_paste_prefix', 'Ctrl+Alt', strftime('%s', 'now') * 1000),
    ('auto_start', 'false', strftime('%s', 'now') * 1000),
    ('close_to_tray', 'true', strftime('%s', 'now') * 1000),
    ('show_in_tray', 'true', strftime('%s', 'now') * 1000),
    ('window_width', '560', strftime('%s', 'now') * 1000),
    ('window_height', '760', strftime('%s', 'now') * 1000),
    ('search_debounce_ms', '150', strftime('%s', 'now') * 1000),
    ('language', 'zh-CN', strftime('%s', 'now') * 1000),
    ('sensitive_capture_policy', 'flag', strftime('%s', 'now') * 1000),
    ('mask_sensitive_previews', 'true', strftime('%s', 'now') * 1000),
    ('clipboard_monitor_enabled', 'true', strftime('%s', 'now') * 1000),
    ('privacy_mode_until', '0', strftime('%s', 'now') * 1000),
    ('advanced_search_exact', 'false', strftime('%s', 'now') * 1000),
    ('updates_enabled', 'false', strftime('%s', 'now') * 1000),
    ('update_feed_url', '', strftime('%s', 'now') * 1000),
    ('encryption_enabled', 'false', strftime('%s', 'now') * 1000),
    ('encryption_status', 'off', strftime('%s', 'now') * 1000),
    ('sync_folder', '', strftime('%s', 'now') * 1000),
    ('plugin_folder', '', strftime('%s', 'now') * 1000);
```

#### 配置项说明

| 键 | 类型 | 默认值 | 说明 |
|----|------|--------|------|
| max_history_count | number | 100 | 最大历史记录数 |
| hotkey_toggle_window | string | Ctrl+Alt+K | 窗口切换快捷键；当前运行时支持 `Ctrl+Alt+<A-Z>` |
| hotkey_quick_paste_prefix | string | Ctrl+Alt | 快速粘贴前缀；当前运行时固定派生为 `Ctrl+Alt+1..9` |
| auto_start | boolean | false | 开机自启动开关；启动时会与系统层面的自启状态同步 |
| close_to_tray | boolean | true | 关闭主窗口时隐藏到托盘；设为 false 时关闭会退出应用 |
| show_in_tray | boolean | true | 遗留键；当前运行时不消费，前端不再保存 |
| window_width | number | 560 | 窗口宽度 |
| window_height | number | 760 | 窗口高度 |
| search_debounce_ms | number | 150 | 搜索防抖时间 |
| language | string | zh-CN | UI 语言 |
| sensitive_capture_policy | flag/skip | flag | 敏感内容保存策略；`skip` 会跳过新捕获的敏感文本 |
| mask_sensitive_previews | boolean | true | 列表中默认遮罩敏感内容预览 |
| clipboard_monitor_enabled | boolean | true | 剪贴板监听开关；设为 false 会跳过新采集 |
| privacy_mode_until | number | 0 | 隐私模式结束时间；未来毫秒时间戳会跳过新采集 |
| advanced_search_exact | boolean | false | 高级搜索精确匹配 UI 默认项 |
| updates_enabled | boolean | false | 更新能力本地就绪开关；当前不包含托管更新源 |
| update_feed_url | string | 空 | 更新源 URL 配置；发布脚本可检查 `KLIP_UPDATE_FEED_URL` |
| encryption_enabled | boolean | false | 数据库加密本地就绪开关；当前不执行真实加密迁移 |
| encryption_status | string | off | 加密状态显示字段 |
| sync_folder | string | 空 | 同步目录配置；当前不包含同步服务 |
| plugin_folder | string | 空 | 插件目录配置；当前不包含插件运行时或市场 |

---

### 2.3 snippets (常用片段表)

存储用户手动维护的常用短语、命令和模板。

```sql
CREATE TABLE snippets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,
    tag_id          INTEGER,
    is_favorited    INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE SET NULL
);

CREATE INDEX idx_snippets_updated_at ON snippets(updated_at DESC);
```

### 2.4 clipboard_source_rules (来源忽略规则表)

存储剪贴板采集来源忽略规则。Windows 运行时会读取前台进程名和窗口标题并匹配规则；非 Windows 平台当前不做来源识别。

```sql
CREATE TABLE clipboard_source_rules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    match_type      TEXT NOT NULL,              -- process | title | any
    pattern         TEXT NOT NULL,
    enabled         INTEGER NOT NULL DEFAULT 1,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_source_rules_enabled
ON clipboard_source_rules(enabled, match_type);
```

### 2.5 tags / clipboard_item_tags (标签表)

```sql
CREATE TABLE tags (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    color       TEXT,
    created_at  INTEGER NOT NULL
);

CREATE TABLE clipboard_item_tags (
    item_id INTEGER NOT NULL,
    tag_id  INTEGER NOT NULL,
    PRIMARY KEY (item_id, tag_id),
    FOREIGN KEY (item_id) REFERENCES clipboard_items(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_clipboard_item_tags_tag_id
ON clipboard_item_tags(tag_id, item_id);
```

---

## 3. 数据访问层

### 3.1 Rust 结构体定义

```rust
// clipboard_items 对应的结构体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: i64,
    pub content_type: String,
    pub content: String,
    pub preview: Option<String>,
    pub hash: String,
    pub size: i64,
    pub source_application: Option<String>,
    pub source_window_title: Option<String>,
    pub is_favorited: bool,
    pub is_sensitive: bool,
    pub sensitivity_reason: Option<String>,
    pub formats: Vec<ClipboardFormat>,
    pub ocr: Option<ClipboardOcr>,
    pub tags: Vec<Tag>,
    pub created_at: i64,
    pub last_used_at: i64,
}

// app_config 对应的结构体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigEntry {
    pub key: String,
    pub value: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub tag_id: Option<i64>,
    pub is_favorited: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceRule {
    pub id: i64,
    pub match_type: String,
    pub pattern: String,
    pub enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}
```

### 3.2 主要查询语句

```sql
-- 获取最近的剪贴板记录
SELECT * FROM clipboard_items
ORDER BY last_used_at DESC, created_at DESC
LIMIT ? OFFSET ?;

-- Tantivy 返回匹配 ID 后，由 SQLite 叠加筛选、排序和分页
SELECT * FROM clipboard_items
WHERE id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))
ORDER BY last_used_at DESC, created_at DESC
LIMIT ?;

-- 按类型筛选
SELECT * FROM clipboard_items
WHERE content_type = ?
ORDER BY last_used_at DESC, created_at DESC
LIMIT ?;

-- 插入新记录 (带去重)
INSERT INTO clipboard_items
  (content_type, content, preview, hash, size, source_application,
   source_window_title, created_at, last_used_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(hash) DO UPDATE SET
  last_used_at = excluded.last_used_at,
  source_application = CASE WHEN excluded.source_application IS NOT NULL
    OR excluded.source_window_title IS NOT NULL
    THEN excluded.source_application ELSE clipboard_items.source_application END,
  source_window_title = CASE WHEN excluded.source_application IS NOT NULL
    OR excluded.source_window_title IS NOT NULL
    THEN excluded.source_window_title ELSE clipboard_items.source_window_title END;

-- 删除旧记录 (保留最近 N 条)
DELETE FROM clipboard_items
WHERE id NOT IN (
    SELECT id FROM clipboard_items
    ORDER BY created_at DESC
    LIMIT ?
);

-- 清空所有记录
DELETE FROM clipboard_items;

-- 获取配置
SELECT value FROM app_config WHERE key = ?;

-- 设置配置
INSERT OR REPLACE INTO app_config (key, value, updated_at)
VALUES (?, ?, ?);
```

---

## 4. 数据迁移策略

### 4.1 版本管理

在 `app_config` 表中存储数据库版本。当前 schema 版本由后端常量 `CURRENT_DB_VERSION` 管理，当前值为 `6`：

```sql
INSERT INTO app_config (key, value, updated_at)
VALUES ('db_version', '6', strftime('%s', 'now') * 1000);
```

### 4.2 迁移流程

当前版本在启动建表后执行轻量迁移：

- 拒绝打开比当前应用更新的 `db_version`，避免静默降级损坏数据。
- v1 -> v2 会规范化旧热键配置，并迁移早期窗口尺寸默认值。
- v2 -> v3 会把早期较小窗口尺寸迁移到当前默认尺寸。
- v3 -> v4 会创建 `clipboard_formats`，并为既有文本记录回填纯文本格式。
- v4 -> v5 会创建 `clipboard_ocr`，并把既有图片记录初始化为 `pending`。
- v5 -> v6 会给 `clipboard_items` 增加两个可空来源字段；既有记录保持 `NULL`。
- 完成后写回当前 `db_version`。

```rust
fn run_migrations(db: &Connection) -> Result<()> {
    let version = get_db_version(db)?;

    if version < 2 {
        migrate_v1_to_v2(db)?;
    }
    if version < 3 {
        migrate_v2_to_v3(db)?;
    }
    if version < 4 {
        migrate_v3_to_v4(db)?;
    }
    if version < 5 {
        migrate_v4_to_v5(db)?;
    }
    if version < 6 {
        migrate_v5_to_v6(db)?;
    }

    Ok(())
}

fn migrate_v1_to_v2(db: &Connection) -> Result<()> {
    db.execute("ALTER TABLE clipboard_items ADD COLUMN tags TEXT")?;
    set_db_version(db, 2)?;
    Ok(())
}
```

---

## 5. 数据清理策略

### 5.1 自动清理规则

| 规则 | 触发时机 | 操作 |
|------|----------|------|
| 数量限制 | 每次插入后 | 收藏项不参与清理；未收藏项保留最近 N 条，删除其余 |

当前实现只执行数量限制清理。时间限制和总大小限制尚未实现，避免在没有明确产品策略和迁移提示的情况下自动删除用户数据。

### 5.2 清理实现

```rust
fn cleanup_old_records(db: &Connection, max_count: i64) -> Result<()> {
    db.execute(
        "DELETE FROM clipboard_items WHERE id NOT IN (
            SELECT id FROM clipboard_items
            WHERE is_favorited = 0
            ORDER BY created_at DESC
            LIMIT ?
        ) AND is_favorited = 0",
        params![max_count]
    )?;
    Ok(())
}
```

---

## 6. 导入导出、备份与恢复

### 6.1 JSON/CSV 导入导出

当前版本提供 JSON 和 CSV 导入导出命令。JSON v1 的 `ClipboardItem` 会携带两个可空来源字段，旧 JSON 缺少字段时按 `NULL` 导入；CSV v1 为保持严格表头兼容，不导入或导出来源字段。CSV 导入支持带引号的多行字段。导出命令会创建目标父目录。

### 6.2 数据库备份

`backup_database` 会把当前数据库复制到用户选择的路径；如果目标文件已存在，会先删除再写入。命令返回实际路径和文件大小。

### 6.3 数据库恢复

`restore_database` 会先用只读 SQLite 连接校验备份文件，执行 `PRAGMA integrity_check`，并确认必需表存在。恢复前会自动创建当前数据库的 `.pre-restore.bak` 备份。恢复时通过当前连接 `ATTACH DATABASE` 后导入数据，不直接替换已打开的数据库文件。v3 备份会迁移并回填纯文本格式；v4 备份必须包含 `clipboard_formats`，恢复后为图片补建 pending OCR；v5 备份还必须包含 `clipboard_ocr`，来源字段恢复为 `NULL`；v6 备份必须同时包含 `source_application` 与 `source_window_title` 并原样保留。缺列会在修改当前数据库前被拒绝。旧版应用会拒绝更高 schema 版本，因此 v6 备份不能恢复到只支持 v5 或更早 schema 的 Klip。

```rust
pub struct RestoreSummary {
    pub path: String,
    pub size: u64,
    pub pre_restore_backup_path: String,
    pub pre_restore_backup_size: u64,
}
```

---

## 7. 性能优化

### 7.1 索引策略

| 索引 | 用途 |
|------|------|
| idx_clipboard_created_at | 按时间排序查询 |
| idx_clipboard_last_used_created_at | 列表/搜索的最近使用排序 |
| idx_clipboard_hash | 去重检查 |
| idx_clipboard_preview | Tantivy 不可用时的 SQLite 搜索降级 |
| idx_clipboard_content_type | 类型筛选 |
| idx_clipboard_sensitive | 敏感条目筛选和排序 |
| idx_clipboard_ocr_status | OCR pending 恢复和状态扫描 |
| idx_clipboard_favorite_last_used | 收藏筛选和排序 |
| idx_clipboard_item_tags_tag_id | 标签筛选 |
| idx_snippets_updated_at | 片段列表排序 |
| idx_source_rules_enabled | 启用来源规则读取 |

### 7.2 查询优化

- 使用 `LIMIT` 限制返回数量
- 普通关键词搜索由 `search-index` 中的 Tantivy + jieba 生成匹配 ID，SQLite 继续负责类型、标签、收藏、敏感状态、日期、排序和分页
- 精确匹配继续使用 SQLite 等值查询；Tantivy 初始化、校验、写入或查询失败时自动回退 `LIKE '%keyword%'`
- 索引每 50 条或 5 秒批量提交，查询前刷新待提交内容；删除、清空、导入和恢复同步更新索引
- 启动时校验 Tantivy checksum 和 SQLite 记录数，损坏或失配时保留旧索引并从 SQLite 全量重建
- 批量操作使用事务

### 7.3 连接管理

当前后端使用单个 SQLite 连接，并通过 Rust `Mutex<Connection>` 在进程内串行化数据库访问，不存在连接池。

```rust
pub struct Database {
    conn: Mutex<Connection>,
}

// App setup 时初始化并通过 Tauri state 共享
```

---

## 8. 错误处理

### 8.1 数据库损坏

启动时如果 SQLite 打开或建表阶段检测到可恢复的损坏错误，当前版本会保留原始数据库文件，并创建一个干净 schema 继续启动。损坏文件会保存为同目录下的 `klip.db.corrupt-<timestamp>.bak`。

```rust
fn handle_corrupted_database(db_path: &Path) -> Result<()> {
    let backup_path = next_corrupt_backup_path(db_path);
    std::fs::rename(db_path, &backup_path)?;
    Database::new(db_path)?;
    Ok(())
}
```

### 8.2 磁盘空间不足

```rust
fn check_disk_space(db: &Connection) -> Result<bool> {
    let page_count: i64 = db.query_row(
        "SELECT COUNT(*) FROM clipboard_items",
        [],
        |row| row.get(0)
    )?;

    // 检查数据库大小
    Ok(page_count < 10000) // 假设每条记录平均 10KB
}
```
