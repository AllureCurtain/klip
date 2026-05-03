# 多格式剪贴板支持实现方案

> 状态: 草案
> 日期: 2026-05-03
> 基于: Ditto / CopyQ / Maccy 最佳实践研究

## 1. 研究总结

### 1.1 业界做法对比

| 产品 | 格式检测 | 存储方式 | 图片处理 | 复制回写 |
|------|----------|----------|----------|----------|
| **Ditto** (Windows/C++) | `EnumClipboardFormats` 枚举所有格式 | SQLite BLOB，每条记录存多个格式 | 存储压缩 DIB 数据 | 恢复所有原始格式 |
| **CopyQ** (跨平台/C++Qt) | MIME 类型白名单 | 混合存储：小数据内联，大数据写入磁盘文件（SHA-256 路径） | 缩略图单独存储 | 恢复所有 MIME 类型 |
| **Maccy** (macOS/Swift) | 粘贴板类型白名单 | SQLite BLOB（SwiftData） | 全部存为 Data BLOB | 恢复所有类型 + 标记自我复制 |

### 1.2 关键发现

1. **必须保留所有格式**：只存文本会导致图片/文件粘贴失败，目标应用需要特定格式才能正确粘贴
2. **图片存原始 BLOB**：SQLite 存 BLOB 比文件系统快 35%（< 1MB 时），不要用 Base64
3. **图片编码为 PNG**：存储时将原始像素编码为 PNG，而非原始 RGBA 或 DIB，兼容性最好
4. **文件路径存 JSON 数组**：解析 `CF_HDROP` 后存储为 JSON 字符串
5. **复制回写时恢复所有格式**：否则目标应用无法正确粘贴
6. **添加自我复制标记**：避免剪贴板监听器捕获自己写入的内容

## 2. 技术选型

### 2.1 Rust 依赖

| Crate | 用途 | 是否已有 |
|-------|------|----------|
| `arboard` | 剪贴板读写（文本、图片、文件列表） | ✅ 已有 |
| `clipboard-master` | 剪贴板变化监听 | ✅ 已有 |
| `clipboard-win` | Windows 格式枚举和检测 | ❌ 需新增 |
| `image` | 图片格式解码/编码（PNG） | ❌ 需新增 |
| `fast_image_resize` | 缩略图生成（SIMD 加速） | ❌ 需新增 |
| `base64` | 前端 data URI 传输 | ❌ 需新增 |
| `serde_json` | 文件路径 JSON 序列化 | ✅ 已有（通过 serde） |

### 2.2 架构模式：策略模式 + 工厂模式

```
┌─────────────────────────────────────────────────────────────┐
│              ClipboardFormatStrategy (Trait)                 │
│  - content_type() -> ContentType                            │
│  - detect(clipboard) -> bool                                │
│  - extract(clipboard) -> Result<ExtractedContent>            │
│  - copy_back(content, clipboard) -> Result<()>              │
│  - generate_preview(content) -> String                       │
└─────────────────────────────────────────────────────────────┘
                              △
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────┴───────┐     ┌───────┴───────┐     ┌───────┴───────┐
│ TextStrategy  │     │ ImageStrategy  │     │ FileStrategy   │
│ (CF_UNICODE   │     │ (CF_DIBV5/    │     │ (CF_HDROP)    │
│  TEXT)        │     │  CF_DIB)      │     │                │
└───────────────┘     └───────────────┘     └───────────────┘

┌─────────────────────────────────────────────────────────────┐
│              FormatStrategyRegistry                          │
│  - strategies: Vec<Box<dyn ClipboardFormatStrategy>>        │
│  - detect_format(clipboard) -> Option<(&dyn Strategy, ...)> │
│                                                              │
│  注册顺序：Image > File > Text（图片和文件优先，文本兜底） │
└─────────────────────────────────────────────────────────────┘
```

## 3. 数据模型

### 3.1 数据库 Schema 变更

```sql
-- 修改 clipboard_items 表
-- content 列改为 BLOB 以支持二进制数据
-- 新增 metadata 列存储 JSON 元数据
CREATE TABLE clipboard_items (
    id INTEGER PRIMARY KEY,
    content_type TEXT NOT NULL,       -- 'text', 'image', 'file'
    content BLOB NOT NULL,            -- 文本: UTF-8 字节; 图片: PNG 字节; 文件: JSON 路径数组
    preview TEXT,                     -- 预览文本
    hash TEXT NOT NULL,               -- 去重哈希
    size INTEGER NOT NULL,            -- 数据大小(字节)
    metadata TEXT,                    -- JSON 元数据(图片尺寸、文件数量等)
    is_favorited INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL
);
```

### 3.2 元数据格式

```json
// 图片元数据
{
  "width": 1920,
  "height": 1080,
  "format": "png"
}

// 文件元数据
{
  "file_count": 3,
  "total_size": 1048576
}
```

### 3.3 Rust 类型变更

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum ContentType {
    Text,
    Image,
    File,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ClipboardItem {
    pub id: i64,
    pub content_type: ContentType,
    pub content: String,         // 文本/文件路径JSON 的字符串; 图片: Base64 data URI
    pub preview: Option<String>,
    pub hash: String,
    pub size: i64,
    pub metadata: Option<String>, // JSON
    pub is_favorited: bool,
    pub created_at: i64,
    pub last_used_at: i64,
}

#[derive(Debug)]
pub struct NewClipboardItem {
    pub content_type: ContentType,
    pub content: Vec<u8>,        // 原始二进制数据
    pub preview: Option<String>,
    pub hash: String,
    pub size: i64,
    pub metadata: Option<String>,
}
```

### 3.4 前端传输协议

图片数据通过 Base64 data URI 传给前端：

```
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...
```

文件路径通过 JSON 字符串传给前端：

```json
["C:\\Users\\xxx\\file1.txt", "C:\\Users\\xxx\\file2.pdf"]
```

## 4. 处理流程

### 4.1 剪贴板变化检测（修改 monitor.rs）

```
clipboard-master 检测到剪贴板变化
       │
       ▼
┌──────────────────────────┐
│ FormatStrategyRegistry    │
│ .detect_format()          │
│                          │
│ 1. 检查 CF_DIBV5/CF_DIB  │ → 图片策略
│ 2. 检查 CF_HDROP         │ → 文件策略
│ 3. 检查 CF_UNICODETEXT   │ → 文本策略（兜底）
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ matched_strategy.extract │
│                          │
│ Text:  读取 UTF-8 文本    │
│ Image: 读取 RGBA → 编码PNG│
│ File:  解析 HDROP → JSON │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ 生成预览 + 计算哈希       │
│                          │
│ Text:  截取前 200 字符    │
│ Image: "图片 {W}x{H}"    │
│ File:  "{filename}" 或   │
│        "{N} 个文件"       │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ 保存到 SQLite (BLOB)     │
└──────────────────────────┘
```

### 4.2 复制回剪贴板（修改 copy_to_clipboard）

```
用户点击项目 / Ctrl+数字键
       │
       ▼
┌──────────────────────────┐
│ 读取数据库记录            │
│ 根据 content_type 选择    │
│ 对应的回写策略            │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ strategy.copy_back()     │
│                          │
│ Text:  arboard.set_text() │
│ Image: arboard.set_image()│
│ File:  arboard.set_file  │
│        _list()            │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ 设置自我复制标记          │
│ 避免监听器重复捕获        │
└──────────────────────────┘
```

## 5. 模块结构

```
src-tauri/src/clipboard/
├── mod.rs              # 模块导出
├── monitor.rs          # 剪贴板监听（修改：使用 FormatStrategyRegistry）
├── format/             # 新增：格式策略模块
│   ├── mod.rs          # 策略 Trait + Registry
│   ├── text.rs         # 文本格式策略
│   ├── image.rs        # 图片格式策略
│   └── file.rs         # 文件路径格式策略
└── copy.rs             # 复制回写逻辑（从 monitor.rs 提取）
```

## 6. 实现步骤

### Phase 1: 基础架构
1. 新增 `clipboard-win`、`image`、`fast_image_resize`、`base64` 依赖
2. 定义 `ClipboardFormatStrategy` Trait 和 `ContentType` 枚举
3. 实现 `FormatStrategyRegistry`
4. 重构现有文本逻辑为 `TextStrategy`

### Phase 2: 图片支持
5. 实现 `ImageStrategy`（detect、extract、copy_back、generate_preview）
6. 修改数据库 Schema 支持 BLOB 和 metadata
7. 修改 `NewClipboardItem` 和 `ClipboardItem` 类型
8. 前端 `ClipboardItem.tsx` 添加图片预览组件
9. 后端序列化图片为 Base64 data URI 传给前端

### Phase 3: 文件支持
10. 实现 `FileStrategy`
11. 前端添加文件列表展示组件

### Phase 4: 完善
12. 自我复制标记机制
13. `copy_to_clipboard` 支持 `content_type` 分派
14. 缩略图生成优化

## 7. 注意事项

1. **Windows 优先**：当前 `clipboard-master` 事件监听仅在 Windows 可用，图片和文件检测也主要针对 Windows API
2. **图片大小限制**：建议限制单张图片最大 5MB，超过的跳过不存储
3. **性能考虑**：图片编码/解码应在独立线程中执行，避免阻塞 UI
4. **SQLite WAL 模式**：确保数据库使用 WAL 模式以优化 BLOB 读写性能
5. **自我复制标记**：使用 `RegisterClipboardFormat` 注册一个私有格式（如 `Klip.Internal`），复制回写时设置此格式，监听器检测到此格式时跳过
