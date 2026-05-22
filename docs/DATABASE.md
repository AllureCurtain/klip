# Klip 数据库设计文档

## 1. 数据库概述

| 属性 | 值 |
|------|-----|
| 数据库类型 | SQLite |
| 数据库文件 | `{app_data_dir}/klip.db` |
| 最小版本 | SQLite 3.x |
| 最大大小 | 100MB (可配置) |

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
    ('window_width', '480', strftime('%s', 'now') * 1000),
    ('window_height', '720', strftime('%s', 'now') * 1000),
    ('search_debounce_ms', '150', strftime('%s', 'now') * 1000),
    ('language', 'zh-CN', strftime('%s', 'now') * 1000),
    ('sensitive_capture_policy', 'flag', strftime('%s', 'now') * 1000),
    ('mask_sensitive_previews', 'true', strftime('%s', 'now') * 1000);
```

#### 配置项说明

| 键 | 类型 | 默认值 | 说明 |
|----|------|--------|------|
| max_history_count | number | 100 | 最大历史记录数 |
| hotkey_toggle_window | string | Ctrl+Alt+K | 窗口切换快捷键；当前运行时支持 `Ctrl+Alt+<A-Z>` |
| hotkey_quick_paste_prefix | string | Ctrl+Alt | 快速粘贴前缀；当前运行时固定派生为 `Ctrl+Alt+1..9` |
| auto_start | boolean | false | 开机自启动开关；启动时会与系统层面的自启状态同步 |
| close_to_tray | boolean | true | 关闭时最小化到托盘 |
| show_in_tray | boolean | true | 显示托盘图标 |
| window_width | number | 480 | 窗口宽度 |
| window_height | number | 720 | 窗口高度 |
| search_debounce_ms | number | 150 | 搜索防抖时间 |
| language | string | zh-CN | UI 语言 |
| sensitive_capture_policy | flag/skip | flag | 敏感内容保存策略；`skip` 会跳过新捕获的敏感文本 |
| mask_sensitive_previews | boolean | true | 列表中默认遮罩敏感内容预览 |

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
    pub is_favorited: bool,
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
```

### 3.2 主要查询语句

```sql
-- 获取最近的剪贴板记录
SELECT * FROM clipboard_items
ORDER BY last_used_at DESC, created_at DESC
LIMIT ? OFFSET ?;

-- 搜索剪贴板记录
SELECT * FROM clipboard_items
WHERE preview LIKE ?
ORDER BY last_used_at DESC, created_at DESC
LIMIT ?;

-- 按类型筛选
SELECT * FROM clipboard_items
WHERE content_type = ?
ORDER BY last_used_at DESC, created_at DESC
LIMIT ?;

-- 插入新记录 (带去重)
INSERT INTO clipboard_items (content_type, content, preview, hash, size, created_at, last_used_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(hash) DO UPDATE SET last_used_at = excluded.last_used_at;

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

## 4. 数据迁移策略（后续阶段）

### 4.1 版本管理

在 `app_config` 表中存储数据库版本：

```sql
INSERT INTO app_config (key, value, updated_at)
VALUES ('db_version', '1', strftime('%s', 'now') * 1000);
```

### 4.2 迁移流程

当前版本仅保留 `db_version` 配置项与基础建表/兼容逻辑，完整迁移框架仍是后续阶段能力。下面示例仅表示后续实现方向。

```rust
fn run_migrations(db: &Connection) -> Result<()> {
    let version = get_db_version(db)?;

    if version < 2 {
        migrate_v1_to_v2(db)?;
    }
    if version < 3 {
        migrate_v2_to_v3(db)?;
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
| 数量限制 | 每次插入后 | 保留最近 N 条，删除其余 |
| 时间限制 | 应用启动时 | 删除超过 30 天的记录 |
| 大小限制 | 应用启动时 | 删除最大的记录直到总大小 < 100MB |

### 5.2 清理实现

```rust
fn cleanup_old_records(db: &Connection, max_count: i64) -> Result<()> {
    db.execute(
        "DELETE FROM clipboard_items WHERE id NOT IN (
            SELECT id FROM clipboard_items
            ORDER BY created_at DESC
            LIMIT ?
        )",
        params![max_count]
    )?;
    Ok(())
}
```

---

## 6. 导入导出、备份与恢复

### 6.1 JSON/CSV 导入导出

当前版本提供 JSON 和 CSV 导入导出命令。JSON 导入会校验导出版本；CSV 导入支持带引号的多行字段。导出命令会创建目标父目录。

### 6.2 数据库备份

`backup_database` 会把当前数据库复制到用户选择的路径；如果目标文件已存在，会先删除再写入。命令返回实际路径和文件大小。

### 6.3 数据库恢复

`restore_database` 会先用只读 SQLite 连接校验备份文件，执行 `PRAGMA integrity_check`，并确认必需表存在。恢复前会自动创建当前数据库的 `.pre-restore.bak` 备份。恢复时通过当前连接 `ATTACH DATABASE` 后导入数据，不直接替换已打开的数据库文件。

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
| idx_clipboard_preview | 搜索优化 |
| idx_clipboard_content_type | 类型筛选 |
| idx_clipboard_sensitive | 敏感条目筛选和排序 |

### 7.2 查询优化

- 使用 `LIMIT` 限制返回数量
- 搜索使用 `LIKE '%keyword%'` 前缀匹配
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

### 8.1 数据库损坏（后续阶段）

当前版本尚未实现自动损坏检测与重建流程，以下内容为规划方向。

```rust
fn handle_corrupted_database(db_path: &Path) -> Result<()> {
    // 1. 尝试备份损坏的文件
    let backup_path = db_path.with_extension("db.corrupted");
    let _ = std::fs::rename(db_path, &backup_path);

    // 2. 创建新数据库
    let conn = Connection::open(db_path)?;
    init_schema(&conn)?;

    // 3. 通知用户
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
