# Phase 4: Agent Runtime 运行时架构详解

## 一、概述

本文档详细分析 OpenClaw Agent 运行时的核心架构设计，涵盖底层框架、模型支持、工具系统、记忆系统和会话管理等五大核心模块。

---

## 二、底层框架：基于 pi-agent-core

### 2.1 框架技术栈

OpenClaw Agent 运行时基于 **Mario Zechner (pi) AI 框架**构建，这是一个专为编程辅助设计的 Agent 框架：

```typescript
// 核心依赖
import { complete, Model, streamSimple } from "@mariozechner/pi-ai";
import { AgentTool, AgentToolResult, AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";
import { createAgentSession, SessionManager, SettingsManager } from "@mariozechner/pi-coding-agent";
```

**框架组件**：

| 包                              | 功能                        |
| ------------------------------- | --------------------------- |
| `@mariozechner/pi-ai`           | AI 模型调用接口，流式输出   |
| `@mariozechner/pi-agent-core`   | Agent 核心类型定义          |
| `@mariozechner/pi-coding-agent` | 完整 Agent 运行时，技能系统 |

### 2.2 核心入口

位置：`src/agents/pi-embedded-runner.ts`

```typescript
// 主入口
export { runEmbeddedPiAgent } from "./pi-embedded-runner/run.js";
export { compactEmbeddedPiSession } from "./pi-embedded-runner/compact.js";

// 工具创建
export { createOpenClawCodingTools } from "./pi-tools.js";
```

### 2.3 Agent 运行流程

```
runEmbeddedPiAgent()
    │
    ├── runAttempt()         ← 单次运行尝试
    │   ├── createAgentSession()     ← 创建会话
    │   ├── createOpenClawCodingTools()  ← 创建工具
    │   ├── 循环调用 LLM
    │   └── 执行工具 → 返回结果
    │
    └── SessionManager       ← 会话管理
```

---

## 三、模型支持：15+ 提供商

### 3.1 支持的模型提供商

位置：`src/agents/models-config.providers.ts`

| Provider              | 认证方式 | 模型示例                         |
| --------------------- | -------- | -------------------------------- |
| OpenAI                | apiKey   | gpt-4o, gpt-4o-mini, gpt-4-turbo |
| Anthropic             | apiKey   | claude-3-5-sonnet, claude-3-opus |
| Google Gemini         | apiKey   | gemini-1.5-pro, gemini-1.5-flash |
| Amazon Bedrock        | aws-sdk  | claude-3-sonnet, llama-3         |
| Ollama                | local    | llama2, mistral, codellama       |
| GitHub Copilot        | oauth    | copilot                          |
| 腾讯混元 (Hunyuan)    | apiKey   | hunyuan-pro                      |
| MiniMax               | apiKey   | abab6.5s-chat                    |
| 百度千帆 (Qianfan)    | apiKey   | ernie-4.0-8k                     |
| Cohere                | apiKey   | command-r-plus                   |
| Together AI           | apiKey   | mixtral-8x7b                     |
| Replicate             | apiKey   | llama-2-70b                      |
| Cloudflare Workers AI | apiKey   | @cf/meta/llama-3-70b             |
| Venice AI             | apiKey   | venice-uncensored                |
| xAI                   | apiKey   | grok-beta                        |

### 3.2 认证配置类型

位置：`src/agents/auth-profiles/types.ts`

```typescript
// 三种认证方式
export type AuthProfileCredential =
  | ApiKeyCredential // API Key
  | TokenCredential // 静态 Token
  | OAuthCredential; // OAuth 动态刷新

// API Key 认证
type ApiKeyCredential = {
  type: "api_key";
  provider: string;
  key?: string;
  email?: string;
  metadata?: Record<string, string>;
};

// OAuth 认证
type OAuthCredential = {
  type: "oauth";
  provider: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};
```

### 3.3 OAuth 支持

位置：`src/agents/auth-profiles/oauth.ts`

```typescript
// OAuth 流程处理
- accessToken 动态刷新
- 过期自动重新认证
- 支持多种 OAuth 流程
```

### 3.4 Failover (故障转移) 机制

位置：`src/agents/model-fallback.ts`, `src/agents/failover-error.ts`

**Failover 触发条件**：

```typescript
type FailoverReason =
  | "auth" // 认证失败
  | "rate_limit" // 速率限制
  | "billing" // 账单问题
  | "timeout" // 超时
  | "context_overflow" // 上下文溢出
  | "unknown"; // 未知错误
```

**Failover 处理流程**：

```typescript
// 1. 错误检测
function classifyFailoverError(error: Error): FailoverReason

// 2. 冷却期管理
isProfileInCooldown(profileId: string): boolean

// 3. 候选模型切换
resolveFallbackCandidates(model: string, reason: FailoverReason): ModelCandidate[]

// 4. 轮询策略
resolveAuthProfileOrder(provider: string): string[]
```

**Rate Limit 处理**：

```typescript
// 速率限制响应头解析
-X - RateLimit - Limit - X - RateLimit - Remaining - X - RateLimit - Reset - Retry - After;
```

---

## 四、工具系统：三层架构

### 4.1 三层工具架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Tools                               │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Coding Tools (基础编程工具)                         │
│  ├── Read / Write / Edit                                   │
│  ├── Bash / Node                                          │
│  └── Glob / Grep                                           │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: OpenClaw Tools (业务工具)                          │
│  ├── Message / WebSearch / WebFetch                        │
│  ├── Memory (记忆)                                         │
│  ├── Browser / Canvas                                      │
│  ├── Cron / Nodes                                          │
│  └── Session Management                                     │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Plugin Tools (插件工具)                           │
│  ├── Channel Tools (消息发送)                               │
│  ├── Custom Tools (自定义)                                 │
│  └── MCP Tools (外部集成)                                   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Layer 1: Coding Tools

位置：`src/agents/pi-tools.ts`

```typescript
export function createOpenClawCodingTools(options?: {
  workspaceDir?: string;
  sandbox?: SandboxConfig;
  senderIsOwner?: boolean;
  messageProvider?: string;
}): AgentTool[];
```

**核心工具**：

| 工具    | 功能            |
| ------- | --------------- |
| `Read`  | 读取文件内容    |
| `Write` | 写入/创建文件   |
| `Edit`  | 编辑文件        |
| `Bash`  | 执行 Shell 命令 |
| `Node`  | 执行 Node.js    |
| `Glob`  | 文件搜索        |
| `Grep`  | 文本搜索        |

### 4.3 Layer 2: OpenClaw Tools

位置：`src/agents/openclaw-tools.ts`

```typescript
export function createOpenClawTools(options?: {
  sandboxBrowserBridgeUrl?: string;
  allowHostBrowserControl?: boolean;
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  // ... 更多配置
}): AnyAgentTool[];
```

**核心工具**：

```typescript
// 消息工具
createMessageTool(); // 发送消息
createSessionsSendTool(); // 会话发送
createSessionsListTool(); // 会话列表
createSessionsHistoryTool(); // 历史记录

// 搜索工具
createWebSearchTool(); // 网页搜索
createWebFetchTool(); // 网页抓取

// 媒体工具
createImageTool(); // 图片处理
createCanvasTool(); // Canvas 操作
createBrowserTool(); // 浏览器控制

// 系统工具
createGatewayTool(); // 网关操作
createCronTool(); // 定时任务
createNodesTool(); // 节点操作
createTtsTool(); // 文字转语音

// 记忆工具
// 在 tools/memory-tool.ts
createMemoryTool(); // 记忆操作
```

### 4.4 Layer 3: Plugin Tools

位置：`src/plugins/tools.ts`

```typescript
// 插件工具解析
export function resolvePluginTools(options: {
  cfg: OpenClawConfig;
  toolAllowlist?: string[];
}): AgentTool[];
```

**工具来源**：

```typescript
// 1. Channel Tools (消息通道)
-telegram - actions - whatsapp - actions - discord - actions - slack - actions;

// 2. 自定义插件工具
// extensions/*/src/tools.ts

// 3. MCP 集成
// 通过 ACP 协议支持 MCP
```

### 4.5 工具策略控制

位置：`src/agents/tool-policy.ts`

```typescript
// 工具权限级别
- owner: 所有者 (全部权限)
- trusted: 信任用户 (受限权限)
- admin: 管理员
- default: 默认用户

// 策略类型
- allowlist: 白名单模式
- plugin-only-allowlist: 仅插件工具
- deny: 黑名单模式
```

### 4.6 MCP 支持

位置：`src/acp/`

```
src/acp/
├── client.ts      # ACP 客户端
├── translator.ts  # 协议转换
└── session.ts    # 会话管理
```

**MCP 集成方式**：

- 通过 ACP (Agent Communication Protocol) 实现
- 支持外部 MCP 服务调用
- 协议转换层处理兼容性

---

## 五、记忆系统：短期 + 长期

### 5.1 记忆架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Memory System                              │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────┐   ┌───────────────────────────┐   │
│  │  短期记忆          │   │   长期记忆                │   │
│  │  (Session         │   │   (Vector Store          │   │
│  │   Transcript)    │   │    + QMD)                 │   │
│  │                   │   │                           │   │
│  │  - 对话历史        │   │   - 向量检索              │   │
│  │  - 工具调用记录    │   │   - 语义搜索              │   │
│  │  - 实时上下文      │   │   - 混合搜索              │   │
│  └───────────────────┘   └───────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Embedding Providers:                                        │
│  • OpenAI (text-embedding-3-small)                        │
│  • Google Gemini (gemini-embedding-001)                     │
│  • Voyage AI (voyage-large-2)                             │
│  • Ollama (本地向量)                                        │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 短期记忆：Session Transcript

**位置**：`src/agents/pi-embedded-runner/session-manager-init.ts`

```typescript
// Session 管理器
SessionManager.open(sessionFile); // 持久化到文件
SessionManager.inMemory(); // 内存模式

// 消息结构
interface AgentMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | MessageContent[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
}
```

**文件结构**：

```jsonl
// ~/.openclaw/sessions/{agentId}/{sessionKey}.jsonl
{"role": "user", "content": "Hello"}
{"role": "assistant", "content": "Hi!", "toolCalls": [...]}
{"role": "tool", "toolCallId": "call_xxx", "content": "Result"}
```

### 5.3 长期记忆：Vector Store + QMD

**位置**：`src/memory/manager.ts`

**向量存储**：

```typescript
// 向量数据库 (SQLite + LanceDB)
-存储嵌入向量 - 高效相似度搜索 - 支持混合搜索(向量 + 关键词);
```

**QMD (结构化记忆)**：

位置：`src/memory/qmd-manager.ts`

```typescript
// QMD 格式
---
source: memory
---
# 重要信息

- 这是一个结构化的记忆条目
- 可以包含代码块
- 支持 Markdown 格式
```

**Embedding 提供商**：

| Provider      | 模型                   | 维度 | 位置                   |
| ------------- | ---------------------- | ---- | ---------------------- |
| OpenAI        | text-embedding-3-small | 1536 | `embeddings-openai.ts` |
| Google Gemini | gemini-embedding-001   | 768  | `embeddings-gemini.ts` |
| Voyage AI     | voyage-large-2         | 1024 | `embeddings-voyage.ts` |
| Ollama        | (本地模型)             | 可变 | `embeddings.ts`        |

### 5.4 自动召回 (Auto-Recall)

位置：`src/agents/tools/memory-tool.ts`

```typescript
// Agent 可以使用的记忆工具
- memory_search: 搜索记忆
- memory_write: 写入记忆
- memory_read: 读取记忆

// 自动触发
- 基于上下文自动检索相关记忆
- 混合搜索 (向量 + 关键词)
```

### 5.5 记忆捕获 (Memory Capture)

位置：`src/hooks/bundled/session-memory/handler.ts`

```typescript
// 自动捕获会话中的重要信息
-工具调用结果 - 用户偏好 - 关键决策 - 重要上下文;
```

---

## 六、会话管理：基于 sessionKey 的隔离机制

### 6.1 Session Key 架构

位置：`src/routing/session-key.ts`, `src/sessions/session-key-utils.ts`

```typescript
// Session Key 格式
sessionKey = "agent:{agentId}:{mainKey}:{subKey}"
           = "agent:main:whatsapp:123456789"
           = "agent:myagent:group:987654321"

// 解析
parseAgentSessionKey(sessionKey: string): ParsedAgentSessionKey
```

### 6.2 会话模式

**三种会话模式**：

```typescript
// 1. Direct (私聊)
sessionKey = "agent:main:whatsapp:123456789";

// 2. Group (群组)
sessionKey = "agent:main:discord:serverid:channelid";

// 3. Global (全局)
sessionKey = "agent:main";
```

### 6.3 生命周期管理

```
┌─────────────────────────────────────────────────────────────┐
│                 Session Lifecycle                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   创建 ──▶ 活跃 ──▶ 等待 ──▶ 结束                          │
│     │         │         │         │                         │
│     ▼         ▼         ▼         ▼                         │
│  newSession active  idle     expired   cleanup               │
│                                                              │
│  • sessionKey 唯一标识                                        │
│  • 基于 channel + sender 隔离                                  │
│  • 自动过期清理                                               │
└─────────────────────────────────────────────────────────────┘
```

### 6.4 Session 管理模块

位置：`src/config/sessions/`

| 模块            | 功能         |
| --------------- | ------------ |
| `store.ts`      | Session 存储 |
| `paths.ts`      | 路径解析     |
| `metadata.ts`   | 元数据管理   |
| `transcript.ts` | 转录管理     |
| `reset.ts`      | 重置逻辑     |

### 6.5 会话隔离机制

```typescript
// 隔离级别
- Agent 级别隔离: 每个 Agent 有独立会话
- Channel 级别隔离: 不同消息通道独立
- Sender 级别隔离: 每个用户独立会话

// 路由规则
resolveSessionKey({
  channel: string,    // 消息通道
  senderId: string,  // 发送者
  groupId?: string, // 群组 ID
}): string
```

---

## 七、完整架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Agent Runtime                                    │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────┐      │
│   │                   pi-embedded-runner                         │      │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │      │
│   │  │   Models    │  │   Skills    │  │   Tools     │         │      │
│   │  │             │  │             │  │             │         │      │
│   │  │ 15+        │  │ Bundled     │  │ Layer 1:    │         │      │
│   │  │ Providers  │  │ Workspace   │  │ Coding      │         │      │
│   │  │            │  │ Managed     │  │ Layer 2:    │         │      │
│   │  │ • OAuth   │  │             │  │ OpenClaw   │         │      │
│   │  │ • Failover│  │             │  │ Layer 3:    │         │      │
│   │  │ • Rate    │  │             │  │ Plugin     │         │      │
│   │  │   Limit   │  │             │  │             │         │      │
│   │  └─────────────┘  └─────────────┘  └─────────────┘         │      │
│   └─────────────────────────────────────────────────────────────┘      │
│                              │                                          │
│         ┌────────────────────┼────────────────────┐                   │
│         ▼                    ▼                    ▼                    │
│   ┌────────────┐      ┌────────────┐      ┌────────────┐             │
│   │  Session   │      │   Memory   │      │   Tools    │             │
│   │  Manager   │      │   System   │      │   Policy   │             │
│   │            │      │            │      │            │             │
│   │ • Key     │      │ • Transcript│      │ • Allowlist│             │
│   │   Isolation│      │ • Vector   │      │ • Roles   │             │
│   │ • Lifecycle│      │ • QMD      │      │ • Sandboxed│             │
│   │ • Compact │      │ • Embedding│      │            │             │
│   └────────────┘      └────────────┘      └────────────┘             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 八、源码位置汇总

| 模块               | 源码位置                         | 关键文件                   |
| ------------------ | -------------------------------- | -------------------------- |
| **底层框架**       | `src/agents/pi-embedded-runner/` | run.ts, attempt.ts         |
| **模型配置**       | `src/agents/models-config.ts`    | providers.ts               |
| **OAuth**          | `src/agents/auth-profiles/`      | oauth.ts, types.ts         |
| **Failover**       | `src/agents/model-fallback.ts`   | failover-error.ts          |
| **Rate Limit**     | `src/agents/auth-profiles/`      | order.ts                   |
| **Coding Tools**   | `src/agents/pi-tools.ts`         | -                          |
| **OpenClaw Tools** | `src/agents/openclaw-tools.ts`   | -                          |
| **Plugin Tools**   | `src/plugins/tools.ts`           | -                          |
| **Tool Policy**    | `src/agents/tool-policy.ts`      | -                          |
| **MCP/ACP**        | `src/acp/`                       | client.ts                  |
| **Session**        | `src/agents/pi-embedded-runner/` | session-manager-\*.ts      |
| **记忆系统**       | `src/memory/manager.ts`          | -                          |
| **短期记忆**       | `src/agents/pi-embedded-runner/` | session-manager-init.ts    |
| **长期记忆**       | `src/memory/`                    | manager.ts, qmd-manager.ts |
| **向量检索**       | `src/memory/embeddings*.ts`      | -                          |
| **Session Key**    | `src/routing/session-key.ts`     | session-key-utils.ts       |

---

## 九、总结

OpenClaw Agent Runtime 是一个完整的、生产级的 Agent 系统，核心特点：

1. **底层框架稳固**: 基于 pi-agent-core，经过大量实际使用验证

2. **模型支持丰富**: 15+ 提供商，支持 OAuth、故障转移、速率限制处理

3. **工具系统分层**: Coding → OpenClaw → Plugin，三层解耦

4. **记忆设计完善**:
   - 短期: Session Transcript (实时对话)
   - 长期: Vector Store + QMD (语义搜索)

5. **会话隔离**: 基于 sessionKey 的多级隔离机制，支持私聊/群组/全局模式

此架构设计遵循了模块化、可扩展的原则，便于后续接入新的模型和功能。
