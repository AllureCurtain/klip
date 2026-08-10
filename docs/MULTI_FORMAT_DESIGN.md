# Klip 多格式剪贴板设计

> 状态：已实现
> 最后更新：2026-08-10

本文档记录 Klip 为什么以及如何同时处理文本、富文本、图片和文件。数据库表结构以
[DATABASE.md](DATABASE.md) 为准，运行时模块划分以 [ARCHITECTURE.md](ARCHITECTURE.md)
为准。

## 1. 设计目标

- 所有平台通过一个 `clipboard-rs` backend 读写剪贴板。
- 同一条文本同时保留 plain text、HTML 和 RTF，避免恢复时丢失目标应用可用格式。
- 图片规范化为 PNG，文件规范化为普通路径 JSON 数组。
- 捕获、复制、粘贴和纯文本粘贴共享同一套持久化表示。
- Klip 自己写入剪贴板后不会再次捕获形成反馈循环。
- 平台能力不可用时明确降级，不把 Windows 专用格式泄漏到业务层。

## 2. 当前实现

| 模块 | 职责 |
|------|------|
| `clipboard/backend.rs` | 唯一 OS 剪贴板适配层；探测、读取、写入和争用重试 |
| `clipboard/format/mod.rs` | 格式策略注册表，按 image -> file -> text 顺序选择主内容 |
| `clipboard/format/text.rs` | 提取 plain text、HTML、RTF，生成文本哈希和预览 |
| `clipboard/format/image.rs` | 提取 RGBA，编码 PNG，生成 data URI 和尺寸元数据 |
| `clipboard/format/file.rs` | 提取并规范化文件路径，保存 JSON 数组 |
| `clipboard/monitor.rs` | 监听/轮询、事件合并、捕获 gate、提取重试和落库 |
| `clipboard/writer.rs` | 保存条目的唯一写回入口，支持保留格式和纯文本模式 |
| `clipboard/suppress.rs` | 一次性、3 秒 TTL 的哈希抑制，防止自写回被再次捕获 |

`clipboard-rs` watcher 用于 Windows、macOS、X11 和 Wayland。watcher 无法启动时，
monitor 使用 500ms 轮询兜底，但仍通过同一个 backend 读取，格式行为不会切换到另一套实现。

## 3. 持久化表示

| 主类型 | `clipboard_items.content` | 附加数据 | 哈希依据 |
|--------|---------------------------|----------|----------|
| text | UTF-8 plain text | `clipboard_formats` 中的 text/HTML/RTF | plain text 字节 |
| image | `data:image/png;base64,...` | `metadata` 中的宽高；`clipboard_ocr` 中的 OCR 状态与文本 | PNG 字节 |
| file | 普通路径组成的 JSON 数组 | `metadata` 中的文件数量等信息 | 规范化 JSON 字节 |

`clipboard_items` 仍使用 `TEXT` 保存统一的前后端传输表示，而不是直接改成 BLOB。图片
写回前会解码 data URI，并以 PNG 文件头为尺寸事实源，不信任可能漂移的 metadata。

文本条目的 plain text 是去重、敏感检测和搜索的基础。HTML/RTF 只作为伴随格式保存在
`clipboard_formats`；同一 plain text 再次捕获时，用最新的完整格式集合替换旧集合，
避免恢复陈旧富文本。

## 4. 捕获流程

```text
OS clipboard event
  -> one-slot queue 合并突发通知并等待 150ms 稳定
  -> monitoring / privacy / source-rule capture gate
  -> image -> file -> text 格式探测
  -> 最多 3 次提取重试
  -> 一次性哈希自写抑制与重复检测
  -> SQLite 事务写入主记录和伴随格式
  -> clipboard-updated event
  -> 图片进入单 OCR worker
```

格式优先级很重要：很多图片或文件剪贴板也带有文本表示。如果先检测文本，就会把图片
或文件路径降级成普通文本。

剪贴板是单所有者资源。backend 对读取和写入进行最多 10 次、每次 50ms 的短退避重试；
格式探测本身不重试，避免监控线程仅为了回答“是否存在”而阻塞半秒。

## 5. 写回与粘贴

所有保存条目的写回都必须经过 `clipboard/writer.rs`：

| 操作 | 文本 | 图片 | 文件 | 隐藏窗口/模拟粘贴 |
|------|------|------|------|-------------------|
| Copy | plain + 已保存 HTML/RTF | PNG | 文件列表 | 否 |
| Paste | plain + 已保存 HTML/RTF | PNG | 文件列表 | 是 |
| Copy as plain text | 仅 plain | 拒绝 | 拒绝 | 否 |
| Paste as plain text | 仅 plain | 拒绝 | 拒绝 | 是 |

文本伴随格式必须在一次 `set()` 中写入。Windows 上后续再写一个格式可能清空前一次内容，
因此禁止通过连续写入“追加”HTML/RTF。文件列表同时写入 `Preferred DropEffect=copy`，
使 Explorer 等目标按复制而非移动处理。

## 6. 自写抑制

旧实现曾尝试写入 Windows 私有 marker，但 `clipboard-rs 0.3.5` 无法可靠地让自定义格式
与图片共存。当前统一使用内容哈希：写回前预先 arm，monitor 提取后匹配并消费；写回失败
立即 disarm。arm 最多保留 3 秒且只消费一次，避免之后用户复制相同内容被长期忽略。

## 7. 平台边界

- Windows 是当前真实桌面交付平台。
- macOS/Linux 共用捕获与写回代码，并参与 CI 静态验证，但尚未完成真实桌面整体验收。
- X11/macOS 文件 URI 在 backend 转成普通路径；只有合法 `%XX` 被解码。
- Wayland compositor 可能禁止 watcher、全局热键、窗口激活或模拟粘贴；watcher 失败时可
  轮询捕获，但这不等于完整桌面工作流已通过。
- 图片 OCR 是捕获后的异步步骤，不阻塞 clipboard watcher，也不改变原始 PNG。

## 8. 维护约束

- 不得在 commands 或格式策略中直接创建第二种 clipboard library context。
- 新格式必须明确主内容优先级、规范化表示、哈希规则、预览、写回和自写抑制行为。
- 数据库存储变化必须增加 schema migration 和备份恢复兼容测试。
- 富文本显示必须经过 DOMPurify allowlist；保存的 HTML 不能直接作为可信 DOM。
- 平台行为声明必须区分“代码存在/可编译”与“真实桌面已验收”。
