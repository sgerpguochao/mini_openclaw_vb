# Agent Runtime 架构详解

## 一、概述

本文档详细分析 OpenClaw 项目中 Agent 的内部架构，涵盖底层技术框架、大模型接入、Skills/Tools 系统、记忆系统和会话管理等核心模块。

---

## 二、底层 Agent 技术框架

### 2.1 框架组成

OpenClaw 使用 **Mario Zechner (pi) AI 框架** 作为底层技术栈：

```typescript
// 核心依赖
import { complete, Model } from "@mariozechner/pi-ai";
import { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { createAgentSession, SessionManager, SettingsManager } from "@mariozechner/pi-coding-agent";
```

**框架组件**：

| 组件                            | 包                | 功能                             |
| ------------------------------- | ----------------- | -------------------------------- |
| `@mariozechner/pi-ai`           | AI 模型调用       | LLM 接口封装、流式输出           |
| `@mariozechner/pi-agent-core`   | Agent 核心类型    | AgentTool、AgentEvent 定义       |
| `@mariozechner/pi-coding-agent` | 完整 Agent 运行时 | Session 管理、技能系统、沙盒执行 |

### 2.2 核心入口

位置：`src/agents/pi-embedded-runner.ts`

```typescript
export { runEmbeddedPiAgent } from "./pi-embedded-runner/run.js";
export { compactEmbeddedPiSession } from "./pi-embedded-runner/compact.js";
export { createOpenClawCodingTools } from "./pi-tools.js";
```

---

## 三、大模型接入方式

### 3.1 模型配置

位置：`src/agents/models-config.ts`, `src/agents/models-config.providers.ts`

```typescript
export type ProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  models?: ModelConfig[];
  auth?: "api_key" | "oauth" | "aws-sdk" | "token";
};
```

### 3.2 支持的模型提供商

| Provider           | 认证方式 | 支持的模型                       |
| ------------------ | -------- | -------------------------------- |
| OpenAI             | apiKey   | GPT-4, GPT-4o, GPT-4o-mini       |
| Anthropic          | apiKey   | Claude 3.5, Claude 3 Opus/Sonnet |
| Google (Gemini)    | apiKey   | Gemini Pro, Gemini Flash         |
| Amazon Bedrock     | aws-sdk  | Claude, Llama, Titan             |
| Ollama             | local    | 本地模型 (Llama, Mistral 等)     |
| GitHub Copilot     | oauth    | 代码辅助                         |
| 腾讯混元 (Hunyuan) | apiKey   | 国产大模型                       |
| MiniMax            | apiKey   | 国产大模型                       |
| Qianfan (百度)     | apiKey   | ERNIE 系列                       |

### 3.3 模型选择逻辑

位置：`src/agents/model-selection.ts`

```typescript
// 模型选择考虑因素
- 用户指令中的模型指定
- 当前上下文窗口
- 成本优化
- 推理能力 (thinking level)
- 可用性/回退机制
```

---

## 四、Agent Skills / Tools / MCP 接入

### 4.1 Skills 系统

位置：`src/agents/skills.ts`

**Skills 来源**：

```typescript
// 1. Bundled Skills (内置技能)
src/hooks/bundled/
├── boot-md/
├── command-logger/
├── session-memory/
└── soul-evil/

// 2. Workspace Skills (工作空间技能)
Agent Workspace/
└── skills/
    ├── skill1.md
    └── skill2.md

// 3. Managed Skills (托管技能)
- 外部安装的技能包
```

**Skills 加载流程**：

```typescript
// 1. 从 workspace 目录加载
loadSkillsFromDir(workspaceDir, "skills");

// 2. 合并到 Agent 提示词
buildWorkspaceSkillsPrompt(skills, options);

// 3. Skills 定义格式
type Skill = {
  name: string;
  description: string;
  tools?: AgentTool[];
  prompts?: string[];
};
```

### 4.2 Tools 系统

位置：`src/agents/pi-tools.ts`

```typescript
export function createOpenClawCodingTools(options?: {
  workspaceDir?: string; // 工作目录
  sandbox?: SandboxConfig; // 沙盒配置
  senderIsOwner?: boolean; // 是否是所有者
  messageProvider?: string; // 消息提供商
}): AgentTool[];
```

**核心 Tools**：

| 工具          | 功能              |
| ------------- | ----------------- |
| `Read`        | 读取文件          |
| `Write`       | 写入文件          |
| `Edit`        | 编辑文件          |
| `Bash`        | 执行 Shell 命令   |
| `Node`        | 执行 Node.js 代码 |
| `Memory`      | 记忆检索          |
| `MessageSend` | 发送消息          |
| `WebFetch`    | 网页抓取          |

**Tools 策略控制**：

位置：`src/agents/tool-policy.ts`

```typescript
// 工具策略
- allowlist: 白名单模式
- plugin-only-allowlist: 仅插件工具
- 权限分级: owner / trusted / admin
```

### 4.3 MCP 支持

源码中 MCP 相关实现较少，主要通过 **ACP (Agent Communication Protocol)** 实现：

位置：`src/acp/`

```
src/acp/
├── client.ts      # ACP 客户端
├── translator.ts  # 协议转换
└── session.ts    # 会话管理
```

---

## 五、Agent 记忆系统设计

### 5.1 记忆架构

位置：`src/memory/manager.ts`

```
┌─────────────────────────────────────────────────────────────┐
│                     Memory System                           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  Session     │  │   QMD        │  │  Vector      │    │
│  │  Transcript │  │  (Markdown)   │  │  Store       │    │
│  │  (会话记录)  │  │  (结构化)    │  │  (向量检索)  │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  Embedding Providers:                                       │
│  • OpenAI (text-embedding-3-small)                        │
│  • Google Gemini                                           │
│  • Voyage AI                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 记忆类型

```typescript
type MemorySource =
  | "session" // 会话记录
  | "qmd" // QMD 格式 (结构化记忆)
  | "file"; // 文件内容
```

### 5.3 向量检索

**支持的 Embedding 提供商**：

| Provider      | 模型                   | 位置                              |
| ------------- | ---------------------- | --------------------------------- |
| OpenAI        | text-embedding-3-small | `src/memory/embeddings-openai.ts` |
| Google Gemini | gemini-embedding       | `src/memory/embeddings-gemini.ts` |
| Voyage AI     | voyage-large-2         | `src/memory/embeddings-voyage.ts` |

### 5.4 记忆检索接口

```typescript
// 搜索结果
type MemorySearchResult = {
  source: MemorySource; // 记忆来源
  content: string; // 检索内容
  score: number; // 相关度分数
  chunkId: string; // 内容块 ID
};

// 同步进度
type MemorySyncProgressUpdate = {
  phase: "indexing" | "embedding" | "complete";
  completed: number;
  total: number;
};
```

### 5.5 记忆工具

位置：`src/agents/tools/memory-tool.ts`

```typescript
// Agent 可以使用的记忆工具
- memory_search: 搜索记忆
- memory_write: 写入记忆
- memory_read: 读取记忆
```

---

## 六、Session 会话管理

### 6.1 Session 管理架构

位置：`src/agents/pi-embedded-runner/`

```
pi-embedded-runner/
├── run.ts                    # 主入口
├── run/
│   ├── attempt.ts           # 单次运行
│   ├── payloads.ts          # 载荷处理
│   └── images.ts           # 图片处理
├── session-manager-init.ts  # 初始化
├── session-manager-cache.ts # 缓存
├── compact.ts              # 压缩
├── history.ts              # 历史限制
├── extensions.ts           # 扩展
└── google.ts               # Google 特定处理
```

### 6.2 Session 管理器

```typescript
// 核心: SessionManager (from pi-coding-agent)

// 持久化模式
SessionManager.open(sessionFile)  // 从文件加载/创建

// 内存模式
SessionManager.inMemory()          // 仅内存，不持久化

// Session 文件结构 (session.jsonl)
{
  "messages": AgentMessage[],    // 对话历史
  "metadata": SessionMeta,       // 元数据
  "tools": ToolCall[]          // 工具调用记录
}
```

### 6.3 关键模块

| 模块                           | 文件                       | 功能 |
| ------------------------------ | -------------------------- | ---- |
| `session-manager-init.ts`      | 初始化 Session，准备持久化 |
| `session-manager-cache.ts`     | Session 缓存，避免重复加载 |
| `session-tool-result-guard.ts` | 工具结果保护机制           |
| `compact.ts`                   | Session 压缩/裁剪          |
| `history.ts`                   | 历史消息数量限制           |

### 6.4 Session 压缩

```typescript
// 压缩配置
compactEmbeddedPiSession(params: {
  sessionFile: string;
  maxMessages?: number;    // 最大消息数
  maxTokens?: number;      // 最大 token 数
});

// 历史限制
limitHistoryTurns(session, {
  maxDmHistory: 20,       // 私聊最大历史
  maxGroupHistory: 10,    // 群聊最大历史
});
```

### 6.5 Session 工具结果保护

位置：`src/agents/session-tool-result-guard.ts`

```typescript
// 保护机制确保工具结果正确持久化
guardSessionManager(sessionManager, {
  persistToolResults: true,
  maxPendingResults: 100,
});
```

---

## 七、完整架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Runtime                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  pi-embedded-runner.ts                                  │   │
│  │  ├── runEmbeddedPiAgent()    ← 主入口                   │   │
│  │  ├── runAttempt()            ← 单次运行                │   │
│  │  ├── createAgentSession()    ← 创建会话                │   │
│  │  └── SessionManager          ← 会话管理                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│    Models     │    │    Skills    │    │    Tools     │
│               │    │               │    │               │
│ OpenAI        │    │ Bundled      │    │ File I/O      │
│ Anthropic     │    │ Workspace    │    │ Bash/Node     │
│ Google        │    │ Managed      │    │ Memory Search │
│ Bedrock       │    │              │    │ Message Send  │
│ Ollama        │    │              │    │ WebFetch      │
│ 国产模型...   │    │              │    │ ...           │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
              ┌───────────────────────────────┐
              │      Memory System           │
              │  ┌─────────────────────────┐ │
              │  │ Session Transcript     │ │
              │  │ (对话历史)             │ │
              │  └─────────────────────────┘ │
              │  ┌─────────────────────────┐ │
              │  │ QMD (Structured Memory)│ │
              │  │ (结构化记忆)           │ │
              │  └─────────────────────────┘ │
              │  ┌─────────────────────────┐ │
              │  │ Vector Store           │ │
              │  │ (向量检索 + Embedding) │ │
              │  └─────────────────────────┘ │
              └───────────────────────────────┘
```

---

## 八、额外发现模块

### 8.1 Context Pruning (上下文裁剪)

位置：`src/agents/pi-extensions/context-pruning/`

```typescript
// 自动裁剪过长的上下文
// 保留关键信息，移除冗余
```

### 8.2 Compaction (会话压缩)

位置：`src/agents/pi-embedded-runner/compact.ts`

```typescript
// 压缩会话文件
// 合并重复内容
// 清理无效数据
```

### 8.3 Subagent (子代理)

位置：`src/agents/subagent-registry.ts`

```typescript
// 子代理管理
// 支持多代理协作
```

---

## 九、源码位置汇总

| 模块         | 源码位置                                   | 说明           |
| ------------ | ------------------------------------------ | -------------- |
| Agent 入口   | `src/agents/pi-embedded-runner.ts`         | 主入口文件     |
| 模型配置     | `src/agents/models-config.ts`              | 模型提供商配置 |
| 模型选择     | `src/agents/model-selection.ts`            | 模型选择逻辑   |
| Skills       | `src/agents/skills.ts`                     | 技能系统       |
| Tools        | `src/agents/pi-tools.ts`                   | 工具创建       |
| 工具策略     | `src/agents/tool-policy.ts`                | 工具权限控制   |
| 记忆系统     | `src/memory/manager.ts`                    | 记忆管理       |
| 记忆工具     | `src/agents/tools/memory-tool.ts`          | 记忆操作工具   |
| Session 管理 | `src/agents/pi-embedded-runner/`           | 会话运行时     |
| 会话压缩     | `src/agents/pi-embedded-runner/compact.ts` | 会话压缩       |
| ACP 协议     | `src/acp/`                                 | Agent 通信协议 |

---

## 十、总结

OpenClaw 的 Agent 架构设计完善，涵盖了通用 Agent 系统的所有核心模块：

1. **底层框架**: 使用 Mario Zechner 的 pi 系列框架
2. **模型接入**: 支持 OpenAI、Anthropic、Google、Ollama 等多种模型
3. **Skills/Tools**: 完整的技能和工具系统，支持工作空间技能和内置工具
4. **记忆系统**: 三层记忆架构 (Session/QMD/Vector)，支持向量检索
5. **会话管理**: 持久化会话管理，支持压缩和缓存

此架构设计遵循了插件化、可扩展的原则，便于后续接入新的模型和功能。
