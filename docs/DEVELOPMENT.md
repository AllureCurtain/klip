# Klip 开发指南

## 1. 环境准备

### 1.1 系统要求

| 工具 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | 24.x (LTS) | JavaScript 运行时 |
| pnpm | 10.x | 包管理器 |
| Rust | 1.95+ | 后端语言 |
| Tauri CLI | 2.0 | 桌面框架 |

### 1.2 安装步骤

#### Windows

```powershell
# 安装 Node.js (推荐使用官方安装包)
# https://nodejs.org/

# 安装 pnpm
npm install -g pnpm

# 安装 Rust
# https://rustup.rs/
winget install Rustlang.Rustup

# 验证安装
node --version
pnpm --version
rustc --version
```

#### macOS

```bash
# 安装 Node.js
brew install node

# 安装 pnpm
npm install -g pnpm

# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 验证安装
node --version
pnpm --version
rustc --version
```

#### Linux

```bash
# 安装 Node.js
sudo apt install nodejs npm

# 安装 pnpm
npm install -g pnpm

# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装 Tauri 依赖
sudo apt install libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    xclip \
    xsel \
    xdotool \
    wl-clipboard

# Wayland paste automation may also require compositor-compatible tools:
# sudo apt install wtype ydotool

# 验证安装
node --version
pnpm --version
rustc --version
```

Linux runtime notes:

- Clipboard text uses `wl-copy`/`wl-paste` on Wayland when available, then `xclip` or `xsel` fallbacks.
- Paste simulation uses `xdotool` on X11 and tries `ydotool`/`wtype` on Wayland. Some Wayland compositors intentionally block synthetic paste.
- Global shortcuts depend on desktop environment support. Wayland sessions may not deliver global hotkeys reliably.
- System tray visibility depends on the desktop shell. KDE/XFCE usually expose tray icons directly; GNOME may require an AppIndicator/status icon extension.

---

## 2. 项目结构

```
klip/
├── src/                     # React 前端代码
│   ├── components/          # UI 组件
│   │   ├── ui/             # Shadcn/ui 基础组件
│   │   ├── layout/         # 布局组件
│   │   ├── clipboard/      # 剪贴板相关组件
│   │   └── settings/       # 设置组件
│   ├── hooks/              # 自定义 Hooks
│   ├── stores/             # Zustand 状态管理
│   ├── lib/                # 工具库
│   ├── types/              # TypeScript 类型定义
│   ├── styles/             # 样式文件
│   ├── App.tsx             # 根组件
│   └── main.tsx            # 入口文件
│
├── src-tauri/              # Rust 后端代码
│   ├── src/
│   │   ├── commands/       # Tauri IPC 命令
│   │   ├── clipboard/      # 剪贴板监听模块
│   │   ├── database/       # 数据库模块
│   │   ├── hotkey/         # 快捷键模块
│   │   ├── tray/           # 系统托盘模块
│   │   ├── config/         # 配置模块
│   │   ├── utils/          # 工具函数
│   │   ├── lib.rs          # 库入口
│   │   └── main.rs         # 程序入口
│   ├── icons/              # 应用图标
│   ├── Cargo.toml          # Rust 依赖配置
│   └── tauri.conf.json     # Tauri 配置
│
├── docs/                   # 文档
│   ├── PRD.md              # 产品需求文档
│   ├── ARCHITECTURE.md     # 架构设计
│   ├── DATABASE.md         # 数据库设计
│   ├── API.md              # API 文档
│   └── DEVELOPMENT.md      # 开发指南
│
├── tests/                  # 测试文件
├── e2e/                    # Tauri WebDriver + Selenium 桌面 E2E 测试
├── scripts/                # 发布验证、E2E runner、Git hooks
├── package.json            # 前端依赖配置
├── pnpm-lock.yaml          # 依赖锁定文件
├── tsconfig.json           # TypeScript 配置
├── vite.config.ts          # Vite 构建配置
├── tailwind.config.js      # Tailwind CSS 配置
├── components.json         # Shadcn/ui 配置
├── README.md               # 项目说明
├── LICENSE                 # 许可证
└── CONTRIBUTING.md         # 贡献指南
```

---

## 3. 开发流程

### 3.1 初始化项目

```bash
# 克隆项目
git clone https://github.com/your-repo/klip.git
cd klip

# 安装前端依赖
pnpm install

# 初始化 Shadcn/ui
pnpm dlx shadcn-ui@latest init

# 添加需要的 UI 组件
pnpm dlx shadcn-ui@latest add button
pnpm dlx shadcn-ui@latest add input
pnpm dlx shadcn-ui@latest add scroll-area
pnpm dlx shadcn-ui@latest add dialog
```

### 3.2 启动开发服务器

```bash
# 启动 Tauri 开发模式 (前端 + 后端)
pnpm tauri dev

# 仅启动前端开发服务器
pnpm dev

# 仅编译后端
cd src-tauri
cargo build
```

### 3.3 构建生产版本

```bash
# 构建所有平台
pnpm tauri build

# 构建特定平台
pnpm tauri build --target x86_64-pc-windows-msvc  # Windows
pnpm tauri build --target universal-apple-darwin  # macOS
pnpm tauri build --target x86_64-unknown-linux-gnu  # Linux
```

### 3.4 运行测试

```bash
# 前端测试
pnpm test

# Rust 测试
cd src-tauri
cargo test

# 运行默认本地验证（不含桌面 E2E）
pnpm verify

# 桌面 E2E：需要 tauri-driver + Microsoft Edge WebDriver
pnpm e2e
```

`pnpm e2e` 会启动 `tauri-driver`，使用隔离的 `e2e/.tmp/` 应用数据目录，并覆盖文本复制、搜索、点击条目恢复剪贴板的核心流程。该命令依赖真实桌面会话和系统剪贴板，因此不放进默认 `pnpm verify`。

---

## 4. 代码规范

### 4.1 TypeScript 规范

```json
// .eslintrc.json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended"
  ],
  "rules": {
    "no-unused-vars": "error",
    "prefer-const": "error",
    "@typescript-eslint/no-explicit-any": "warn"
  }
}
```

**命名规范**:
- 组件: PascalCase (`ClipboardList.tsx`)
- 函数/变量: camelCase (`useClipboard`)
- 常量: UPPER_SNAKE_CASE (`MAX_HISTORY_COUNT`)
- 文件名: 与组件/函数名一致

### 4.2 Rust 规范

```toml
# Cargo.toml 配置
[lints.clippy]
all = "warn"
pedantic = "warn"
nursery = "warn"
```

**命名规范**:
- 结构体/枚举: PascalCase (`ClipboardItem`)
- 函数/变量: snake_case (`get_clipboard_list`)
- 常量: UPPER_SNAKE_CASE (`MAX_HISTORY_COUNT`)
- 模块: snake_case (`clipboard_monitor`)

### 4.3 提交规范

使用 Conventional Commits:

```
<type>: <description>

[optional body]
```

**类型**:
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具

**示例**:
```
feat: add clipboard history search
fix: resolve hotkey conflict issue
docs: update API documentation
```

---

## 5. 调试技巧

### 5.1 前端调试

```bash
# 使用 Chrome DevTools
# 在 Tauri 开发模式下自动可用

# 添加调试日志
console.log('Clipboard items:', items);

# 使用 React DevTools
pnpm add -D react-devtools
```

### 5.2 后端调试

```rust
// 使用 tracing 日志
use tracing::{info, debug, error};

fn handle_clipboard(content: &str) {
    debug!("Received clipboard content: {}", content);
    // ...
    info!("Saved to database");
}

// 配置日志级别
tracing_subscriber::fmt()
    .with_max_level(tracing::Level::DEBUG)
    .init();
```

### 5.3 常见问题

| 问题 | 解决方案 |
|------|----------|
| 剪贴板监听不工作 | 检查 arboard crate 是否正确安装 |
| 快捷键冲突 | 检查其他应用是否占用相同快捷键 |
| 数据库连接失败 | 检查数据目录权限 |
| 窗口不显示 | 检查 `visible: false` 配置 |

---

## 6. 发布流程

### 6.1 版本号规则

使用 Semantic Versioning: `MAJOR.MINOR.PATCH`

- MAJOR: 重大变更
- MINOR: 新功能
- PATCH: Bug 修复

### 6.2 发布检查清单

- [ ] 更新版本号 (`package.json`, `Cargo.toml`, `tauri.conf.json`)
- [ ] 更新 CHANGELOG.md
- [ ] 运行所有测试
- [ ] 构建所有平台
- [ ] 代码签名
- [ ] 创建 Git tag
- [ ] 发布到 GitHub Releases

### 6.3 发布命令

```bash
# 创建 tag
git tag v0.1.1
git push origin v0.1.1

# 构建
pnpm tauri build

# 上传到 GitHub
gh release create v0.1.1 ./src-tauri/target/release/bundle/*
```

---

## 7. 相关文档

- [产品需求文档](PRD.md)
- [架构设计](ARCHITECTURE.md)
- [API 文档](API.md)
- [数据库设计](DATABASE.md)
