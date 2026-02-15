# OpenClaw 架构最终规范

## 概述

本文档将 OpenClaw 系统的所有核心知识点归纳为 **四个核心模块**，方便梳理整体系统架构流程：

1. **Client Layer (客户端层)** - 多端统一接入
2. **Gateway Layer (网关层)** - 协议解析与路由分发
3. **Channel Layer (通道层)** - 消息通道适配
4. **Agent Layer (代理层)** - AI 运行时与对话处理

---

## 模块一：Client Layer (客户端层)

### 1.1 架构概述

OpenClaw 采用 **Client-Gateway** 架构，所有客户端通过 **WebSocket** 连接到中心化的 **Gateway** 服务。

| 客户端  | 目录位置        | 技术栈                   | 角色                |
| ------- | --------------- | ------------------------ | ------------------- |
| Web UI  | `ui/`           | TypeScript + Lit + Vite  | `operator`          |
| macOS   | `apps/macos/`   | Swift 6.0 + SwiftUI      | `node` + `operator` |
| iOS     | `apps/ios/`     | Swift 6.0 + SwiftUI      | `node` + `operator` |
| Android | `apps/android/` | Kotlin + Jetpack Compose | `node` + `operator` |

### 1.2 统一通信协议

**协议版本**: Protocol Version 3

**连接帧结构**:

```typescript
{
  type: "req",
  id: "<uuid>",
  method: "connect",
  params: {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: "openclaw-ios" | "openclaw-android" | "openclaw-macos" | "openclaw-control-ui",
      displayName: "My iPhone",
      version: "2026.2.10",
      platform: "iOS 18.0.0",
      mode: "node" | "webchat" | "ui"
    },
    role: "node" | "operator",
    auth: { token: "<gateway-token>" }
  }
}
```

### 1.3 帧格式

| 类型     | 格式                                                                      |
| -------- | ------------------------------------------------------------------------- |
| Request  | `{ "type": "req", "id": "uuid", "method": "chat.send", "params": {...} }` |
| Response | `{ "type": "res", "id": "uuid", "ok": true, "payload": {...} }`           |
| Event    | `{ "type": "event", "event": "chat", "payload": {...}, "seq": 42 }`       |

### 1.4 源码位置

| 内容        | 位置                                    |
| ----------- | --------------------------------------- |
| 协议定义    | `src/gateway/protocol/schema/frames.ts` |
| Web UI      | `ui/src/`                               |
| macOS App   | `apps/macos/Sources/`                   |
| iOS App     | `apps/ios/Sources/`                     |
| Android App | `apps/android/app/src/`                 |

---

## 模块二：Gateway Layer (网关层)

### 2.1 架构概述

Gateway 是整个系统的核心枢纽，负责协议解析、路由分发、客户端连接管理。

### 2.2 核心功能

#### 2.2.1 方法注册与调用

**位置**: `src/gateway/server-methods.ts`

```typescript
// 核心方法列表
-connect - // 客户端连接
  chat.send - // 发送消息
  chat.history - // 消息历史
  sessions.list - // 会话列表
  sessions.preview - // 会话预览
  models.list - // 模型列表
  config.get / set - // 配置管理
  channels.status; // 通道状态
```

#### 2.2.2 协议解析

**位置**: `src/gateway/protocol/`

| 文件                         | 功能        |
| ---------------------------- | ----------- |
| `schema/frames.ts`           | 帧格式定义  |
| `schema/protocol-schemas.ts` | 协议 Schema |
| `index.ts`                   | 协议入口    |

#### 2.2.3 安全认证

**位置**: `src/gateway/`

- Token 验证
- 角色权限 (`role: node/operator`)
- Scope 权限 (`scopes: ["operator.admin"]`)

### 2.3 支撑子系统

#### 2.3.1 Hooks System (钩子系统)

**位置**: `src/hooks/`

扩展点系统，允许在特定事件发生时插入自定义逻辑：

| Hook 类型        | 功能     |
| ---------------- | -------- |
| `boot-md`        | 启动引导 |
| `command-logger` | 命令日志 |
| `session-memory` | 会话记忆 |
| `soul-evil`      | 灵魂绑定 |

**核心文件**:

- `src/hooks/types.ts` - 钩子类型
- `src/hooks/loader.ts` - 加载器
- `src/hooks/internal-hooks.ts` - 内部钩子

#### 2.3.2 Security System (安全系统)

**位置**: `src/security/`

安全审计与权限控制：

| 模块                  | 功能         |
| --------------------- | ------------ |
| `audit.ts`            | 安全审计     |
| `external-content.ts` | 外部内容安全 |
| `skill-scanner.ts`    | 技能安全扫描 |

#### 2.3.3 Configuration System (配置系统)

**位置**: `src/config/`

统一配置管理：

```typescript
type OpenClawConfig = {
  agents: AgentConfig;
  channels: ChannelConfig;
  models: ModelConfig;
  hooks: HookConfig;
  sessions: SessionConfig;
};
```

### 2.4 源码位置

| 内容     | 位置                            |
| -------- | ------------------------------- |
| 网关核心 | `src/gateway/server-methods.ts` |
| 协议定义 | `src/gateway/protocol/`         |
| Hooks    | `src/hooks/`                    |
| Security | `src/security/`                 |
| Config   | `src/config/`                   |

---

## 模块三：Channel Layer (通道层)

### 3.1 架构概述

Channel 是消息收发适配器，每个外部消息服务都有独立的实现，但遵循统一的接口规范。

### 3.2 统一接口规范

#### 3.2.1 输入格式 (AgentEnvelopeParams)

**位置**: `src/auto-reply/envelope.ts`

```typescript
type AgentEnvelopeParams = {
  channel: string; // 渠道 ID
  from?: string; // 发送者 ID
  body: string; // 消息内容
  timestamp?: number; // 时间戳
};
```

#### 3.2.2 输出格式 (ReplyPayload)

**位置**: `src/auto-reply/types.ts`

```typescript
type ReplyPayload = {
  text?: string; // 文本
  mediaUrl?: string; // 媒体 URL
  replyToId?: string; // 回复 ID
  channelData?: Record<string, unknown>; // 渠道特定数据
};
```

#### 3.2.3 发送结果 (OutboundDeliveryResult)

**位置**: `src/infra/outbound/deliver.ts`

```typescript
type OutboundDeliveryResult = {
  channel: string;
  messageId: string; // 消息 ID
  timestamp?: number; // 发送时间
};
```

### 3.3 ChannelPlugin 接口

**位置**: `src/channels/plugins/types.plugin.ts`

```typescript
type ChannelPlugin = {
  id: ChannelId; // 渠道 ID
  meta: ChannelMeta; // 元数据
  capabilities: ChannelCapabilities; // 能力声明
  config: ChannelConfigAdapter; // 配置管理
  outbound: ChannelOutboundAdapter; // 消息发送
  status?: ChannelStatusAdapter; // 状态查询
};
```

### 3.4 支持的 Channel

| Channel  | 目录                   | 协议          |
| -------- | ---------------------- | ------------- |
| Telegram | `extensions/telegram/` | Bot API       |
| WhatsApp | `extensions/whatsapp/` | Baileys (Web) |
| Discord  | `extensions/discord/`  | Discord.js    |
| Slack    | `extensions/slack/`    | Socket Mode   |
| Signal   | `extensions/signal/`   | signal-cli    |
| iMessage | `extensions/imessage/` | BlueBubbles   |

### 3.5 源码位置

| 内容         | 位置                                     |
| ------------ | ---------------------------------------- |
| Channel 定义 | `src/channels/plugins/types.plugin.ts`   |
| 接口规范     | `src/channels/plugins/types.adapters.ts` |
| Telegram     | `extensions/telegram/src/channel.ts`     |
| WhatsApp     | `extensions/whatsapp/src/channel.ts`     |
| Discord      | `extensions/discord/src/channel.ts`      |

---

## 模块四：Agent Layer (代理层)

### 4.1 架构概述

Agent 是 AI 对话的核心引擎，处理消息、调用模型、执行工具、管理记忆。

### 4.2 核心组件

#### 4.2.1 底层框架

基于 **Mario Zechner (pi) AI 框架**:

| 包                              | 功能           |
| ------------------------------- | -------------- |
| `@mariozechner/pi-ai`           | AI 模型调用    |
| `@mariozechner/pi-agent-core`   | Agent 核心类型 |
| `@mariozechner/pi-coding-agent` | 完整运行时     |

#### 4.2.2 模型支持 (15+ 提供商)

**位置**: `src/agents/models-config.ts`

| Provider       | 认证方式 |
| -------------- | -------- |
| OpenAI         | apiKey   |
| Anthropic      | apiKey   |
| Google Gemini  | apiKey   |
| Amazon Bedrock | aws-sdk  |
| Ollama         | local    |
| GitHub Copilot | OAuth    |
| 腾讯混元       | apiKey   |
| MiniMax        | apiKey   |

**高级特性**:

- **OAuth**: 自动刷新 token
- **Failover**: 故障转移 (auth/rate_limit/billing/timeout)
- **Rate Limit**: 速率限制处理

#### 4.2.3 工具系统 (三层架构)

**位置**: `src/agents/pi-tools.ts`, `src/agents/openclaw-tools.ts`

```
Layer 1: Coding Tools
├── Read / Write / Edit
├── Bash / Node
└── Glob / Grep

Layer 2: OpenClaw Tools
├── Message / WebSearch / WebFetch
├── Memory (记忆)
├── Browser / Canvas
└── Cron / Nodes

Layer 3: Plugin Tools
├── Channel Tools (消息发送)
├── Custom Tools (自定义)
└── MCP Tools (外部集成)
```

#### 4.2.4 记忆系统

**位置**: `src/memory/manager.ts`

```
短期记忆 (Session Transcript)
├── 对话历史
└── 工具调用记录

长期记忆 (Vector Store + QMD)
├── 向量检索 (Embedding)
└── 混合搜索
```

**Embedding 提供商**:

- OpenAI (text-embedding-3-small)
- Google Gemini (gemini-embedding-001)
- Voyage AI (voyage-large-2)
- Ollama (本地)

#### 4.2.5 会话管理

**位置**: `src/routing/session-key.ts`, `src/config/sessions/`

```typescript
// Session Key 格式
sessionKey = "agent:{agentId}:{mainKey}:{subKey}";
```

**三种模式**:

- Direct (私聊)
- Group (群组)
- Global (全局)

### 4.3 自动回复系统

**位置**: `src/auto-reply/`

| 模块          | 功能       |
| ------------- | ---------- |
| `reply.ts`    | 回复主逻辑 |
| `envelope.ts` | 消息封装   |
| `thinking.ts` | 思考层级   |

**思考层级**:

```typescript
type ThinkLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
```

### 4.4 定时任务系统

**位置**: `src/cron/`

| 模块                    | 功能     |
| ----------------------- | -------- |
| `service.ts`            | 定时服务 |
| `schedule.ts`           | 调度逻辑 |
| `delivery.ts`           | 任务交付 |
| `isolated-agent/run.ts` | 隔离运行 |

### 4.5 源码位置

| 内容       | 位置                               |
| ---------- | ---------------------------------- |
| Agent 入口 | `src/agents/pi-embedded-runner.ts` |
| 模型配置   | `src/agents/models-config.ts`      |
| Tools      | `src/agents/pi-tools.ts`           |
| 记忆系统   | `src/memory/manager.ts`            |
| Auto-Reply | `src/auto-reply/reply.ts`          |
| Cron       | `src/cron/service.ts`              |

---

## 完整架构流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Client Layer (客户端层)                          │
│   Web UI  │  macOS  │  iOS  │  Android                                 │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ WebSocket + Protocol v3
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Gateway Layer (网关层)                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│  │ server-methods │  │    Hooks      │  │   Security    │           │
│  │   (方法注册)   │  │   (扩展点)    │  │   (安全审计)  │           │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘           │
│  ┌─────────────────┐  ┌─────────────────┐                              │
│  │    Config      │  │   Protocol     │                              │
│  │   (配置管理)   │  │   (协议解析)   │                              │
│  └─────────────────┘  └─────────────────┘                              │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Channel Layer (通道层)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ Telegram  │  │ WhatsApp │  │ Discord  │  │  Custom  │             │
│  │  消息收发  │  │  消息收发  │  │  消息收发  │  │  消息收发  │             │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘             │
│                                                                         │
│           (统一接口: Envelope → ReplyPayload → Result)                │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Agent Layer (代理层)                             │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                   pi-embedded-runner                         │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐          │   │
│  │  │   Models   │  │   Skills   │  │   Tools   │          │   │
│  │  │  15+ 提供商 │  │ Bundled    │  │ 3 Layers  │          │   │
│  │  └────────────┘  └────────────┘  └────────────┘          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐   │
│  │   Memory   │  │  Session   │  │  Thinking │  │   Cron    │   │
│  │ Vector+QMD │  │  Management│  │  Levels   │  │ 定时任务  │   │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 源码目录总览

```
src/
├── acp/                    # Agent 通信协议
├── agents/                 # Agent 运行时 ★
├── auto-reply/             # 自动回复 ★
├── browser/                # 浏览器控制
├── canvas-host/            # Canvas 服务
├── channels/               # 消息通道 ★
├── cli/                   # CLI 程序
├── commands/              # CLI 命令
├── config/                 # 配置系统 ★
├── cron/                   # 定时任务 ★
├── discord/                # Discord 集成
├── gateway/                # 网关服务 ★
├── hooks/                  # 钩子系统 ★
├── imessage/              # iMessage 集成
├── infra/                  # 基础设施
├── line/                   # LINE 集成
├── link-understanding/     # 链接理解
├── logging/                # 日志系统
├── markdown/               # Markdown 处理
├── media/                  # 媒体处理
├── media-understanding/    # 媒体理解
├── memory/                 # 记忆系统 ★
├── plugins/                # 插件系统
├── routing/                # 路由系统 ★
├── security/               # 安全系统 ★
├── sessions/               # 会话管理
├── shared/                 # 共享代码
├── signal/                # Signal 集成
├── slack/                  # Slack 集成
├── telegram/               # Telegram 集成
├── tts/                   # 文字转语音
├── tui/                   # TUI 界面
├── utils/                  # 工具函数
├── web/                    # Web 服务
└── wizard/                 # 向导系统
```

---

## 总结

OpenClaw 系统通过 **四个核心模块** 构建了完整的多渠道 AI 网关：

| 模块        | 核心职责       | 关键文件              |
| ----------- | -------------- | --------------------- |
| **Client**  | 多端统一接入   | WebSocket 协议        |
| **Gateway** | 协议解析与路由 | server-methods.ts     |
| **Channel** | 消息通道适配   | types.plugin.ts       |
| **Agent**   | AI 运行时      | pi-embedded-runner.ts |

支撑系统 (Hooks/Security/Config/Cron/Routing/Auto-Reply) 贯穿四个核心模块，提供扩展性、安全性、配置管理和任务调度能力。
