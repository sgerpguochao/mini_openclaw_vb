# OpenClaw 项目架构说明

## 一、项目概述

OpenClaw 是一个**多渠道 AI 网关**，提供可扩展的消息集成能力。它作为一个中间层，连接各种消息平台（WhatsApp、Telegram、Discord、Slack 等）与 AI 模型服务，实现智能对话代理的统一管理。

---

## 二、顶层目录结构

```
openclaw/
├── src/                    # 核心后端源码
├── ui/                     # Web 前端
├── apps/                   # 移动端/桌面端应用
│   ├── macos/              # macOS 原生应用
│   ├── ios/                # iOS 原生应用
│   ├── android/            # Android 应用
│   └── shared/             # 共享的 Swift/JS 代码库
├── extensions/             # 插件扩展
├── docs/                   # 文档
├── dist/                   # 构建输出
├── scripts/                # 脚本工具
└── openclaw.mjs            # CLI 入口
```

---

## 三、核心功能模块划分

### 1. CLI 命令层 (`src/cli/`, `src/commands/`)

**入口文件**:

- `openclaw.mjs` → `src/entry.ts` → `src/cli/program/build-program.ts`

**功能模块**:
| 模块目录 | 功能说明 |
|---------|---------|
| `src/cli/program/` | CLI 框架构建、命令注册 |
| `src/commands/` | 各类命令实现 (onboard, doctor, status, models, channels 等) |
| `src/commands/onboard*.ts` | 用户引导/配置向导 |
| `src/commands/doctor*.ts` | 系统诊断和修复工具 |
| `src/commands/models/` | AI 模型管理命令 |
| `src/commands/channels/` | 渠道管理命令 |

---

### 2. Gateway 网关层 (`src/gateway/`)

**核心文件**: `src/gateway/server-methods.ts`

**架构设计**: 采用 **请求-响应协议** 模式，所有操作都定义为 Gateway Method

**主要功能模块**:
| 方法类别 | 功能说明 | 实现文件 |
|---------|---------|---------|
| `connect` | 客户端连接管理 | `server-methods/connect.ts` |
| `agent` | AI 代理调用 | `server-methods/agent.ts` |
| `chat` | 聊天消息处理 | `server-methods/chat.ts` |
| `channels` | 渠道状态/登出 | `server-methods/channels.ts` |
| `config` | 配置管理 | `server-methods/config.ts` |
| `models` | 模型列表/验证 | `server-methods/models.ts` |
| `sessions` | 会话管理 | `server-methods/sessions.ts` |
| `cron` | 定时任务 | `server-methods/cron.ts` |
| `skills` | 技能安装 | `server-methods/skills.ts` |
| `node` | 节点配对/调用 | `server-methods/nodes.ts` |
| `device` | 设备配对 | `server-methods/devices.ts` |

**协议层**: `src/gateway/protocol/`

- 定义了完整的 JSON-RPC 风格协议
- Schema 验证使用 TypeBox + AJV

**Gateway Methods 列表**:

```
health, logs.tail, channels.status, channels.logout, status,
usage.status, usage.cost, tts.status, tts.providers, tts.enable,
config.get, config.set, config.apply, config.patch, config.schema,
wizard.start, wizard.next, wizard.cancel, wizard.status,
models.list, models.validate, agents.list, agents.create, agents.update,
skills.status, skills.install, sessions.list, sessions.preview,
node.pair.request, node.pair.list, node.invoke, device.pair.list,
chat.history, chat.send, chat.abort, send, agent, agent.wait...
```

---

### 3. 消息渠道层 (`src/channels/`, 各渠道目录)

**核心文件**: `src/channels/registry.ts`

**支持的渠道类型**:
| 渠道 | 代码目录 | 类型 |
|------|---------|------|
| WhatsApp | `src/web/` | Web 协议 |
| Telegram | `src/telegram/` | Bot API |
| Discord | `src/discord/` | Bot API |
| Slack | `src/slack/` | Socket Mode |
| Signal | `src/signal/` | signal-cli |
| iMessage | `src/imessage/` | Apple Messages |
| LINE | `src/line/` | Bot API |

**渠道插件系统** (`src/channels/plugins/`):

- 支持动态加载渠道插件
- 插件注册表: `src/plugins/runtime/`

---

### 4. 自动回复引擎 (`src/auto-reply/`)

**核心功能**: 处理入站消息并生成 AI 回复

**关键组件**:
| 文件/目录 | 功能 |
|----------|------|
| `reply.ts` | 回复分发主逻辑 |
| `triggers/` | 触发器处理 |
| `chunk.ts` | 消息分块 |
| `commands-registry.ts` | 命令注册表 |
| `envelope.ts` | 消息封装格式 |
| `heartbeat.ts` | 心跳/状态保持 |

---

### 5. Agent 代理系统 (`src/agents/`)

**核心功能**: AI Agent 的运行时管理

**关键组件**:
| 文件/目录 | 功能 |
|----------|------|
| `workspace.ts` | Agent 工作空间管理 |
| `skills.ts` | 技能系统 |
| `tool-policy.ts` | 工具调用策略 |
| `system-prompt.ts` | 系统提示词管理 |
| `pi-tools.ts` | PI (编程智能) 工具定义 |
| `sandbox.ts` | 沙盒执行环境 |
| `timeout.ts` | 超时控制 |
| `usage.ts` | 使用量统计 |

---

### 6. 路由系统 (`src/routing/`)

**核心文件**: `src/routing/resolve-route.ts`

**路由策略**: 根据消息来源匹配对应的 Agent

- `binding.peer` - 按 Peer ID 匹配
- `binding.guild` - 按 Guild (Discord 服务器) 匹配
- `binding.team` - 按 Team (Slack) 匹配
- `binding.channel` - 按渠道匹配
- `default` - 默认路由

---

### 7. 配置管理 (`src/config/`)

**核心文件**: `src/config/config.ts`

**配置结构**:

- Agents 配置
- Channels 渠道配置
- Models 模型配置
- Sessions 会话配置
- Hooks 钩子配置
- Sandbox 沙盒配置

---

### 8. 基础设施层 (`src/infra/`)

**关键组件**:
| 模块 | 功能 |
|------|------|
| `infra/env.ts` | 环境变量管理 |
| `infra/ports.ts` | 端口管理 |
| `infra/binaries.ts` | 二进制依赖管理 |
| `infra/provider-usage.ts` | Provider 使用量统计 |

---

## 四、前端架构

### Web UI (`ui/`)

**入口**: `ui/src/main.ts` → `ui/src/ui/app.ts`

**架构模式**:

- 基于 Lit 的 Web Components
- 模块化的 Controller-View 分离

**核心结构**:

```
ui/src/
├── main.ts                 # 入口
├── ui/
│   ├── app.ts              # 主应用组件
│   ├── controllers/        # 控制器层
│   │   ├── chat.ts         # 聊天控制
│   │   ├── config.ts       # 配置控制
│   │   ├── channels.ts     # 渠道控制
│   │   ├── agents.ts       # Agent 控制
│   │   └── models.ts       # 模型控制
│   ├── views/              # 视图层
│   │   ├── chat.ts         # 聊天视图
│   │   ├── config.ts       # 配置视图
│   │   ├── channels.ts     # 渠道视图
│   │   └── sessions.ts     # 会话视图
│   └── navigation.ts       # 路由导航
└── gateway.ts              # Gateway 连接管理
```

---

### 移动端应用 (`apps/`)

**架构**: 原生应用 + 共享 SDK

| 平台    | 目录                       | 技术栈        |
| ------- | -------------------------- | ------------- |
| macOS   | `apps/macos/`              | SwiftUI       |
| iOS     | `apps/ios/`                | SwiftUI       |
| Android | `apps/android/`            | Kotlin        |
| Shared  | `apps/shared/OpenClawKit/` | Swift Package |

**共享模块** (`apps/shared/OpenClawKit/`):

- `OpenClawKit/` - 核心功能库
- `OpenClawChatUI/` - 聊天 UI 组件
- `OpenClawProtocol/` - Gateway 协议实现

---

## 五、插件扩展系统 (`extensions/`)

**已支持的外部渠道插件**:

- `extensions/msteams/` - Microsoft Teams
- `extensions/matrix/` - Matrix 协议
- `extensions/zalo/` - Zalo 消息
- `extensions/twitch/` - Twitch
- `extensions/nostr/` - Nostr 协议
- `extensions/voice-call/` - 语音通话

**插件 SDK**: `src/plugin-sdk/`

---

## 六、服务依赖关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                        客户端层 (Clients)                        │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐           │
│   │  Web UI │  │ macOS   │  │  iOS    │  │ Android │           │
│   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘           │
└────────┼────────────┼────────────┼────────────┼────────────────┘
         │            │            │            │
         └────────────┴────────────┴────────────┘
                              │
                    WebSocket / HTTP
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                        Gateway 网关层                            │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  server-methods.ts (请求分发 + 权限控制)                  │   │
│   │  ├── agent Handlers    ├── channels Handlers             │   │
│   │  ├── chat Handlers     ├── config Handlers               │   │
│   │  ├── models Handlers   ├── sessions Handlers             │   │
│   │  └── ... (其他 20+ 方法处理器)                            │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                        核心业务层                                │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│   │ Auto-Reply   │  │    Agent     │  │   Routing    │         │
│   │ Engine       │  │   Runtime    │  │   System     │         │
│   └──────┬───────┘  └──────┬───────┘  └──────────────┘         │
│          │                 │                                    │
│   ┌──────▼─────────────────▼───────┐                           │
│   │      Channels (渠道适配器)      │                           │
│   │  ┌─────┐ ┌─────┐ ┌─────┐ ┌────┐│                           │
│   │  │ WA  │ │ TG  │ │DC/SL│ │SG  ││ ...                       │
│   │  └─────┘ └─────┘ └─────┘ └────┘│                           │
│   └─────────────────────────────────┘                           │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                      外部服务集成                                │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│   │ AI Models   │  │ Messaging   │  │   Media     │            │
│   │ (OpenAI,    │  │ Platforms   │  │ Processing  │            │
│   │ Anthropic,  │  │ (WhatsApp,  │  │ (Sharp,     │            │
│   │ Gemini...)  │  │ Telegram...)│  │ FFmpeg...)  │            │
│   └─────────────┘  └─────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 七、关键设计模式

1. **Gateway Protocol**: 统一的请求-响应协议，所有操作抽象为 Method
2. **Plugin Architecture**: 可扩展的渠道插件系统
3. **Route Binding**: 灵活的消息路由策略
4. **Multi-Agent**: 支持多个 Agent 实例并行运行
5. **Sandbox Execution**: 安全的代码执行沙盒
6. **Session Management**: 持久化会话管理

---

## 八、外部服务依赖

| 服务类型   | 用途             | 关键依赖                                                               |
| ---------- | ---------------- | ---------------------------------------------------------------------- |
| AI 模型    | 对话生成         | `@mariozechner/pi-ai`, OpenAI SDK, Anthropic SDK                       |
| 消息平台   | 渠道连接         | `grammy` (Telegram), `@slack/bolt`, `discord.js`, `baileys` (WhatsApp) |
| 数据库     | 会话存储         | SQLite (内置)                                                          |
| 媒体处理   | 图片/音频        | `sharp`, `playwright-core`                                             |
| 本地运行时 | Node.js 22+, Bun |

---

## 九、启动命令

### 后端服务

```bash
# 开发模式启动 Gateway
pnpm gateway:dev

# 开发模式启动 CLI
pnpm dev

# 构建项目
pnpm build

# 运行测试
pnpm test
```

### 前端服务

```bash
# Web UI 开发
pnpm ui:dev

# Web UI 构建
pnpm ui:build
```

### 移动端

```bash
# iOS 构建
pnpm ios:build

# Android 构建
pnpm android:assemble

# macOS 应用打包
pnpm mac:package
```

---

_文档生成时间: 2026-02-13_
