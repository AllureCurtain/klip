# Klip Windows 发布检查清单

> 当前发布候选是 `v0.2.0`。这是 `v0.1.2` 之后的功能级 minor release，不代表已经满足
> `1.0.0` 的签名、升级兼容、跨平台和长期稳定性承诺。

本清单仅在明确启动新发布后使用。此前生成的 MSI、NSIS、`target/` 和 E2E 临时目录已经
清理，旧文件名、大小与哈希不是当前代码的发布证据，必须从干净 checkout 重新生成。

## 当前候选证据（仍不是发布批准）

- `v0.2.0` tag 指向 `main@ab89ef7a645f9f8af9a0a113bfad4e2cf6093441`。
- 候选提交的 CI run `31379258017` 通过。
- Release run `31384403404` 通过，已创建 draft GitHub Release 并上传 Windows 安装包。
- 当前 draft 仍未公开；安装包没有代码签名，干净 Windows 安装与核心工作流验收仍待执行。
- Foundation、核心工作流和 E2E 稳定性改进已通过 PR #4、#5、#6 合并。

当前 draft 附件：

| 安装包 | 字节数 | SHA-256 |
|--------|-------:|---------|
| `Klip_0.2.0_x64-setup.exe` | 29,026,908 | `dafbdf5c8566b851992a94400af3ad85498b4bcf1d8ebbccb8fb8ac9a7fa2e53` |
| `Klip_0.2.0_x64_en-US.msi` | 32,546,816 | `4c3d431659b239ac57eb047f36d0c80e5e38d43a0c4c21a18272273612e3955b` |

详细产品状态见 [DELIVERY_STATUS.md](DELIVERY_STATUS.md)。

后续代码变化会使上述基线失效。任何发布候选都必须记录自己的 commit、workflow run、
安装包哈希和人工验收结果。

## 1. 启动发布

- [x] 目标版本确定为 `v0.2.0`，范围为 Windows-first 本地剪贴板核心工作流。
- [x] 统一 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 与
  `CHANGELOG.md` 中的版本。
- [x] 确认候选 commit 已合并到 `main`，工作区干净且没有未解决的阻塞 issue/PR。
- [x] 在干净 checkout 执行 `pnpm install --frozen-lockfile`（Release run）。
- [x] 确认发布说明明确 Windows-first 边界以及 macOS/Linux 尚未完成真实桌面验收。

## 2. 自动化验证

- [ ] `pnpm verify` 通过。
- [ ] `pnpm test:coverage` 通过，并记录测试数量和覆盖率。
- [ ] `pnpm audit --registry=https://registry.npmjs.org --audit-level high` 通过。
- [x] GitHub `CI` workflow 在候选 commit 上通过，并记录 run `31379258017`。
- [ ] GitHub `Desktop E2E` workflow 在候选 commit 上通过，并记录 WebView2、EdgeDriver
  版本与 5 项流程结果。
- [x] `pnpm release:readiness` 通过，签名、更新源和干净机验收边界已明确接受。
- [x] `pnpm release:verify -SkipBundle` 通过（Release run `31384403404`）。

## 3. 构建与产物

- [x] Release workflow 从干净 checkout 成功验证候选并生成 MSI 和 NSIS 安装包（run
  `31384403404`）。
- [x] 记录每个安装包的文件名、字节数和 SHA-256（见上表）。
- [ ] 检查安装包版本、产品名、架构和图标。
- [ ] 使用 `Get-AuthenticodeSignature` 检查签名状态和证书主体。
- [ ] 如需签名，配置证书与时间戳并重新构建，不把手工修改后的安装包当作原始产物。
- [ ] 将候选产物保存到本次发布独立目录，不复用旧 `target/` 中的文件。

## 4. 干净 Windows 安装验收

- [ ] 在干净 Windows 用户或 VM 安装 NSIS 包。
- [ ] 安装、升级、卸载均不会破坏非 Klip 数据。
- [ ] 首次启动隐藏到托盘，托盘菜单可打开和退出应用。
- [ ] `Ctrl+Alt+K` 可切换主窗口，托盘点击不会触发立即隐藏竞态。
- [ ] 修改窗口热键后无需重启即可生效。
- [ ] 开机自启可启用、重登后生效，并可完整移除。
- [ ] Settings -> About 中版本、数据目录和日志目录正确。
- [ ] 新安装默认显示 `暖砖 + 跟随系统`，主窗口默认 `680 x 720` DIP。
- [ ] 主窗口和托盘均显示当前启用的主窗口快捷键。
- [ ] 拖拽调整窗口尺寸并重启后，尺寸和有效位置能够恢复；副显示器移除后回落到可见区域。

## 5. 核心工作流验收

- [ ] 文本、图片、单个文件和多文件复制均正确入库与预览。
- [ ] 搜索、类型、收藏、标签、敏感和日期筛选结果正确。
- [ ] 点击条目能恢复富格式并粘贴到目标应用。
- [ ] copy、paste、copy as plain text 和 paste as plain text 语义互不混淆。
- [ ] `Ctrl+Alt+1` 到 `Ctrl+Alt+9` 对应当前筛选后的可见记录，而非数据库最新记录。
- [ ] 设置中主窗口快捷键与 1-9 全部槽位均可独立启用、关闭和重新录入。
- [ ] 关闭部分快速粘贴槽位后，剩余槽位索引仍对应当前可见列表，不发生重排。
- [ ] `F12` 和不含修饰键的组合无法保存；系统保留组合（`Win+L`、`Win+V` 等）被拒绝。
- [ ] 任一快捷键注册失败时整批回滚，不残留半套快捷键。
- [ ] 图片复制粘贴保持原始编码；仅有位图时尺寸、像素和透明通道一致。
- [ ] 1920x1080、4K 与常见 8K 截图不被静默跳过；图片列表不传输完整原图。
- [ ] 自定义标题、备注、收藏和标签在重启后保留并可被搜索。
- [ ] 文件打开/定位只接受经过校验的本地路径，含空格和非 ASCII 字符的路径正常。
- [ ] 关闭窗口、焦点丢失、粘贴后隐藏和目标窗口恢复行为正确。

## 6. 数据、隐私与恢复

- [ ] 重启后历史和设置仍存在，日志写入预期目录。
- [ ] JSON/CSV 导出与隔离环境导入通过。
- [ ] 数据库备份、恢复前自动备份和有效备份恢复通过。
- [ ] 旧 schema 数据库无损迁移到当前 v8。
- [ ] v7 数据库升级前自动生成 `klip.db.pre-v8-<millis>.bak`，且迁移失败可回滚到该备份。
- [ ] 损坏数据库被保留后以干净 schema 启动。
- [ ] 高于 v8 的数据库/备份被拒绝，不发生静默降级。
- [ ] 敏感内容识别、默认遮罩和“跳过敏感内容”设置通过。
- [ ] 暂停监听和 15 分钟隐私模式期间不捕获新内容。
- [ ] Windows 来源忽略规则对进程名和窗口标题生效。
- [ ] OCR 模型离线加载、图片识别、OCR 搜索和失败状态通过。

## 7. 分发准备

- [x] 若发布未签名安装包，发布说明明确 SmartScreen/未知发布者提示。
- [ ] 若签名，配置 `KLIP_WINDOWS_CERTIFICATE_THUMBPRINT` 或
  `KLIP_WINDOWS_CERTIFICATE_PATH`，PFX 场景同时配置密码。
- [ ] 若签名，配置 `KLIP_WINDOWS_TIMESTAMP_URL` 并验证时间戳。
- [ ] 若启用应用更新，配置并实际访问验证 `KLIP_UPDATE_FEED_URL`；未配置时不得宣称
  支持自动更新。
- [ ] `pnpm release:smoke` 对本地安装包和目标 GitHub Release 均通过。
- [x] 发布说明列出版本、候选 commit、安装包 SHA-256、签名状态、已知限制和升级边界。

## 8. 发布与回查

- [x] 从已验收 commit 创建 `v*` tag 并触发 `.github/workflows/release.yml`。
- [x] Release workflow `31384403404` 成功创建 draft GitHub Release，并附加 MSI/NSIS。
- [ ] 下载远端附件并复核 SHA-256、签名和安装行为。
- [ ] 确认 release notes 与最终附件一致后再公开 draft。
- [ ] 发布后记录 tag、commit、workflow run、附件哈希和验收日期。
- [x] 保留 GitHub draft 发布附件，且本地 `target/`、`dist/` 已清理。
