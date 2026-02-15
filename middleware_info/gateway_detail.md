# OpenClaw Gateway 组件深度解析

## 一、Gateway 核心定位

Gateway 是 OpenClaw 的**核心枢纽**，它是一个 **WebSocket 服务器 + HTTP 服务器**，主要职责：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Gateway 核心职责                               │
├─────────────────────────────────────────────────────────────────────────┤
│  1. 接收客户端连接 (WebSocket/HTTP)                                      │
│  2. 认证与授权 (Device Identity + Token/Password)                        │
│  3. 请求路由分发 (Method Handlers)                                       │
│  4. 会话状态管理 (Session Store)                                         │
│  5. 调用 Agent 执行 (Pi LLM Agent)                                       │
│  6. 事件广播 (Event Broadcasting)                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 二、输入端（客户端类型）

根据 `src/gateway/server-methods.ts:93-164` 的权限控制，Gateway 接收两种角色的客户端：

### 2.1 Operator 角色（聊天/配置管理）

```
- Web UI (openclaw-control-ui)
- iOS/Android/macOS 的 Operator 会话
- 权限: chat.send, agent, config.*, models.list, sessions.* 等
```

**权限 Scope**:
| Scope | 说明 |
|-------|------|
| `operator.admin` | 完全管理权限 |
| `operator.write` | 写入权限（发送消息、调用 Agent） |
| `operator.read` | 只读权限（查看配置、历史） |
| `operator.approvals` | 执行审批权限 |
| `operator.pairing` | 设备配对权限 |

### 2.2 Node 角色（设备能力）

```
- iOS/Android/macOS 的 Node 会话
- 权限: node.invoke.result, node.event, skills.bins
- 能力: camera, screen, location, contacts, sms 等
```

---

## 三、Gateway 方法分类

从 `src/gateway/server-methods.ts:166-192` 可以看到 Gateway 暴露的所有方法处理器：

```typescript
export const coreGatewayHandlers: GatewayRequestHandlers = {
  ...connectHandlers, // 连接管理
  ...chatHandlers, // 聊天消息
  ...agentHandlers, // Agent 调用 ← 核心
  ...configHandlers, // 配置管理
  ...modelsHandlers, // 模型管理
  ...sessionsHandlers, // 会话管理
  ...nodeHandlers, // 设备能力调用
  ...channelsHandlers, // 渠道状态
  ...skillsHandlers, // 技能管理
  ...cronHandlers, // 定时任务
  ...healthHandlers, // 健康检查
  ...usageHandlers, // 使用量统计
  ...voicewakeHandlers, // 语音唤醒
  ...browserHandlers, // 浏览器自动化
  ...talkHandlers, // 语音通话
  ...ttsHandlers, // 文本转语音
  ...deviceHandlers, // 设备配对
  ...wizardHandlers, // 配置向导
  ...execApprovalsHandlers, // 执行审批
  ...sendHandlers, // 消息发送
  ...systemHandlers, // 系统信息
  ...updateHandlers, // 更新检查
  ...agentsHandlers, // Agent CRUD
  ...webHandlers, // Web 相关
};
```

### 3.1 方法详细分类

| 类别           | 方法                                                                                       | 实现文件                                                |
| -------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| **连接管理**   | `connect`                                                                                  | `server-methods/connect.ts`                             |
| **Agent 调用** | `agent`, `agent.wait`, `agent.identity.get`                                                | `server-methods/agent.ts`                               |
| **聊天**       | `chat.send`, `chat.history`, `chat.abort`                                                  | `server-methods/chat.ts`                                |
| **配置**       | `config.get`, `config.set`, `config.apply`, `config.patch`, `config.schema`                | `server-methods/config.ts`                              |
| **模型**       | `models.list`, `models.validate`                                                           | `server-methods/models.ts`                              |
| **会话**       | `sessions.list`, `sessions.preview`, `sessions.patch`, `sessions.reset`, `sessions.delete` | `server-methods/sessions.ts`                            |
| **设备节点**   | `node.invoke`, `node.list`, `node.describe`, `node.pair.*`                                 | `server-methods/nodes.ts`                               |
| **渠道**       | `channels.status`, `channels.logout`                                                       | `server-methods/channels.ts`                            |
| **技能**       | `skills.status`, `skills.install`, `skills.update`                                         | `server-methods/skills.ts`                              |
| **定时任务**   | `cron.list`, `cron.status`, `cron.add`, `cron.remove`, `cron.run`                          | `server-methods/cron.ts`                                |
| **健康检查**   | `health`, `status`, `system-presence`                                                      | `server-methods/health.ts`                              |
| **使用量**     | `usage.status`, `usage.cost`                                                               | `server-methods/usage.ts`                               |
| **语音**       | `voicewake.get`, `voicewake.set`, `talk.mode`                                              | `server-methods/voicewake.ts`, `server-methods/talk.ts` |
| **TTS**        | `tts.status`, `tts.enable`, `tts.convert`, `tts.setProvider`                               | `server-methods/tts.ts`                                 |
| **浏览器**     | `browser.request`                                                                          | `server-methods/browser.ts`                             |
| **设备配对**   | `device.pair.list`, `device.pair.approve`, `device.pair.reject`                            | `server-methods/devices.ts`                             |
| **向导**       | `wizard.start`, `wizard.next`, `wizard.cancel`, `wizard.status`                            | `server-methods/wizard.ts`                              |
| **执行审批**   | `exec.approval.request`, `exec.approval.resolve`                                           | `server-methods/exec-approval.ts`                       |
| **消息发送**   | `send`                                                                                     | `server-methods/send.ts`                                |
| **系统**       | `system-presence`, `last-heartbeat`                                                        | `server-methods/system.ts`                              |
| **更新**       | `update.check`, `update.apply`                                                             | `server-methods/update.ts`                              |
| **Agent 管理** | `agents.list`, `agents.create`, `agents.update`, `agents.delete`, `agents.files.*`         | `server-methods/agents.ts`                              |

---

## 四、Agent 调用流程详解

当客户端调用 `agent` 方法时，流程如下：

### 4.1 请求处理流程

```typescript
// src/gateway/server-methods/agent.ts:46-440
agent: async ({ params, respond, context, client }) => {
  // 1. 参数验证
  if (!validateAgentParams(p)) { ... }

  // 2. 幂等性检查（防止重复执行）
  const cached = context.dedupe.get(`agent:${idem}`);

  // 3. 解析会话和路由
  const agentId = normalizeAgentId(agentIdRaw);
  const sessionKey = resolveExplicitAgentSessionKey({ cfg, agentId });

  // 4. 解析投递目标（消息发往哪里）
  const deliveryPlan = resolveAgentDeliveryPlan({
    sessionEntry,
    requestedChannel: request.replyChannel ?? request.channel,
    explicitTo,
    wantsDelivery,
  });

  // 5. 返回"已接受"响应（异步执行）
  respond(true, { runId, status: "accepted" }, undefined);

  // 6. 异步调用 Agent 执行
  void agentCommand({ message, sessionId, sessionKey, ... }, defaultRuntime)
    .then((result) => {
      respond(true, { runId, status: "ok", result }, undefined);
    })
    .catch((err) => {
      respond(false, { runId, status: "error" }, error);
    });
}
```

### 4.2 Agent 命令内部

从 `src/commands/agent.ts:64-68` 可以看到 `agentCommand` 的核心逻辑：

```typescript
export async function agentCommand(
  opts: AgentCommandOpts,
  runtime: RuntimeEnv = defaultRuntime,
  deps: CliDeps = createDefaultDeps(),
) {
  // 1. 加载配置和会话
  const cfg = loadConfig();
  const session = await resolveSession(opts, cfg);

  // 2. 构建 Agent 工作空间
  const workspace = await ensureAgentWorkspace({ dir: workspaceDir });

  // 3. 选择模型（支持 fallback）
  const modelRef = resolveConfiguredModelRef(cfg, agentId);

  // 4. 执行 Pi Agent（嵌入式 LLM Agent）
  const result = await runEmbeddedPiAgent({
    session,
    workspace,
    model: modelRef.model,
    provider: modelRef.provider,
    message: opts.message,
    images: opts.images,
    tools: [...],
    onEvent: (event) => {
      // 流式事件回传给客户端
      emitAgentEvent({ runId, event });
    },
  });

  // 5. 投递结果（如果需要）
  if (opts.deliver) {
    await deliverAgentCommandResult(result, deliveryPlan);
  }

  return result;
}
```

---

## 五、完整数据流图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              客户端层                                        │
│  ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐   ┌───────────────────────┐ │
│  │Web UI │   │ macOS │   │  iOS  │   │Android│   │Channels (WA/TG/DC/SL)│ │
│  └───┬───┘   └───┬───┘   └───┬───┘   └───┬───┘   └───────────┬───────────┘ │
└──────┼───────────┼───────────┼───────────┼───────────────────┼─────────────┘
       │           │           │           │                   │
       └───────────┴───────────┴───────────┘                   │
                           │                                   │
                    WebSocket/HTTP                      Webhook/Polling
                           │                                   │
┌──────────────────────────▼───────────────────────────────────▼─────────────┐
│                              Gateway 层                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    handleGatewayRequest (server-methods.ts)           │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ authorizeGatewayMethod()  ← 权限检查                            │  │  │
│  │  │ handler = coreGatewayHandlers[method]  ← 路由分发               │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│  ┌──────────────┬────────────┼────────────┬────────────┬────────────────┐  │
│  ▼              ▼            ▼            ▼            ▼                ▼  │
│ agent       chat.send    config.*    node.invoke  sessions.*    channels.* │
│ Handlers    Handlers     Handlers    Handlers     Handlers      Handlers   │
└──┬──────────────┬────────────┬────────────┬────────────┬────────────┬──────┘
   │              │            │            │            │            │
   ▼              │            │            │            │            │
┌─────────────────┴────────────┴────────────┴────────────┴────────────┴──────┐
│                           Agent 执行层                                       │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    agentCommand (commands/agent.ts)                   │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ runEmbeddedPiAgent()  ← 调用 Pi LLM Agent                       │  │  │
│  │  │   ├── 加载 Session transcript                                   │  │  │
│  │  │   ├── 构建 System Prompt                                        │  │  │
│  │  │   ├── 加载 Tools (Skills)                                       │  │  │
│  │  │   ├── 调用 LLM API (OpenAI/Anthropic/Gemini/...)                │  │  │
│  │  │   ├── 执行 Tool calls                                           │  │  │
│  │  │   └── 流式返回结果                                              │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          外部服务层                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  AI Models  │  │ Messaging   │  │  Media      │  │  Plugins/Skills    │ │
│  │  (OpenAI,   │  │ Platforms   │  │ Processing  │  │  (Extensions)       │ │
│  │  Anthropic) │  │ (WA/TG/DC)  │  │ (Sharp/FF)  │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 六、权限控制详解

### 6.1 权限检查函数

```typescript
// src/gateway/server-methods.ts:93-164
function authorizeGatewayMethod(method: string, client: GatewayRequestOptions["client"]) {
  const role = client.connect.role ?? "operator";
  const scopes = client.connect.scopes ?? [];

  // Node 角色只允许特定方法
  if (NODE_ROLE_METHODS.has(method)) {
    if (role === "node") return null;
    return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${role}`);
  }

  // Admin scope 拥有完全权限
  if (scopes.includes(ADMIN_SCOPE)) return null;

  // 检查特定 scope
  if (APPROVAL_METHODS.has(method) && !scopes.includes(APPROVALS_SCOPE)) { ... }
  if (PAIRING_METHODS.has(method) && !scopes.includes(PAIRING_SCOPE)) { ... }
  if (READ_METHODS.has(method) && !(scopes.includes(READ_SCOPE) || scopes.includes(WRITE_SCOPE))) { ... }
  if (WRITE_METHODS.has(method) && !scopes.includes(WRITE_SCOPE)) { ... }

  // 其他方法需要 admin scope
  return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.admin");
}
```

### 6.2 方法权限分类

| 权限级别            | 方法示例                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Node 角色**       | `node.invoke.result`, `node.event`, `skills.bins`                                                                |
| **Read Scope**      | `health`, `logs.tail`, `channels.status`, `models.list`, `agents.list`, `sessions.list`, `chat.history`          |
| **Write Scope**     | `send`, `agent`, `chat.send`, `chat.abort`, `node.invoke`, `browser.request`                                     |
| **Approvals Scope** | `exec.approval.request`, `exec.approval.resolve`                                                                 |
| **Pairing Scope**   | `node.pair.*`, `device.pair.*`, `node.rename`                                                                    |
| **Admin Scope**     | `config.*`, `wizard.*`, `agents.create/update/delete`, `skills.install`, `cron.*`, `sessions.patch/reset/delete` |

---

## 七、关键源码路径

### 7.1 Gateway 核心

| 文件                               | 说明                     |
| ---------------------------------- | ------------------------ |
| `src/gateway/server.ts`            | Gateway 导出入口         |
| `src/gateway/server.impl.ts`       | Gateway 服务器实现       |
| `src/gateway/server-methods.ts`    | 方法处理器注册和权限控制 |
| `src/gateway/server-ws-runtime.ts` | WebSocket 运行时         |
| `src/gateway/auth.ts`              | 认证逻辑                 |

### 7.2 协议定义

| 文件                                              | 说明                 |
| ------------------------------------------------- | -------------------- |
| `src/gateway/protocol/index.ts`                   | 协议导出             |
| `src/gateway/protocol/schema/frames.ts`           | 帧结构定义           |
| `src/gateway/protocol/schema/protocol-schemas.ts` | 所有方法 Schema      |
| `src/gateway/protocol/client-info.ts`             | 客户端 ID 和能力定义 |
| `src/gateway/device-auth.ts`                      | 设备身份认证         |

### 7.3 方法处理器

| 文件                                     | 说明           |
| ---------------------------------------- | -------------- |
| `src/gateway/server-methods/agent.ts`    | Agent 调用处理 |
| `src/gateway/server-methods/chat.ts`     | 聊天消息处理   |
| `src/gateway/server-methods/config.ts`   | 配置管理       |
| `src/gateway/server-methods/sessions.ts` | 会话管理       |
| `src/gateway/server-methods/nodes.ts`    | 设备节点调用   |
| `src/gateway/server-methods/channels.ts` | 渠道状态管理   |
| `src/gateway/server-methods/models.ts`   | 模型管理       |
| `src/gateway/server-methods/agents.ts`   | Agent CRUD     |

### 7.4 Agent 执行

| 文件                            | 说明            |
| ------------------------------- | --------------- |
| `src/commands/agent.ts`         | Agent 命令入口  |
| `src/agents/pi-embedded.ts`     | 嵌入式 Pi Agent |
| `src/agents/workspace.ts`       | 工作空间管理    |
| `src/agents/model-selection.ts` | 模型选择逻辑    |
| `src/agents/skills.ts`          | 技能系统        |

---

## 八、请求-响应协议

### 8.1 帧格式

```typescript
// 请求帧
{ type: "req", id: "uuid-1234", method: "agent", params: { ... } }

// 响应帧（成功）
{ type: "res", id: "uuid-1234", ok: true, payload: { ... } }

// 响应帧（失败）
{ type: "res", id: "uuid-1234", ok: false, error: { code: "...", message: "..." } }

// 事件帧
{ type: "event", event: "chat", payload: { ... }, seq: 42 }
```

### 8.2 连接流程

```
Client                                    Gateway
   │                                          │
   │──────── WebSocket Connect ──────────────>│
   │                                          │
   │<────── hello-ok (protocol features) ─────│
   │                                          │
   │──────── connect request ────────────────>│
   │        (device identity + auth)          │
   │                                          │
   │<────── connect response ─────────────────│
   │        (deviceToken + session)           │
   │                                          │
   │──────── agent request ──────────────────>│
   │        (message + sessionKey)            │
   │                                          │
   │<────── agent accepted ───────────────────│
   │        (runId + status: accepted)        │
   │                                          │
   │<────── event (agent.stream) ─────────────│
   │<────── event (agent.tool) ───────────────│
   │        ...                               │
   │                                          │
   │<────── agent completed ──────────────────│
   │        (runId + status: ok + result)     │
```

---

## 九、Gateway 核心代码可复用性分析

### 9.1 问题：能否 100% 复用？

根据源码分析，Gateway 服务端核心代码**可以接近 100% 复用**，但存在一个**小小的限制**：

**唯一需要修改的地方：客户端 ID 注册**

在 `src/gateway/protocol/client-info.ts:1-14` 中，客户端 ID 是严格枚举的：

```typescript
export const GATEWAY_CLIENT_IDS = {
  WEBCHAT_UI: "webchat-ui",
  CONTROL_UI: "openclaw-control-ui",
  WEBCHAT: "webchat",
  CLI: "cli",
  GATEWAY_CLIENT: "gateway-client",
  MACOS_APP: "openclaw-macos",
  IOS_APP: "openclaw-ios",
  ANDROID_APP: "openclaw-android",
  NODE_HOST: "node-host",
  TEST: "test",
  FINGERPRINT: "fingerprint",
  PROBE: "openclaw-probe",
} as const;
```

**原因**：Schema 验证是严格枚举的（`src/gateway/protocol/schema/primitives.ts:11-13`）：

```typescript
export const GatewayClientIdSchema = Type.Union(
  Object.values(GATEWAY_CLIENT_IDS).map((value) => Type.Literal(value)),
);
```

### 9.2 完整的可复用模块

以下模块**完全不需要修改**：

| 模块               | 文件                                     | 可复用程度 |
| ------------------ | ---------------------------------------- | ---------- |
| **认证授权**       | `src/gateway/auth.ts`                    | ✅ 100%    |
| **设备身份验证**   | `src/gateway/device-auth.ts`             | ✅ 100%    |
| **请求路由**       | `src/gateway/server-methods.ts`          | ✅ 100%    |
| **权限控制**       | `src/gateway/server-methods.ts:93-164`   | ✅ 100%    |
| **WebSocket 处理** | `src/gateway/server-ws-runtime.ts`       | ✅ 100%    |
| **会话管理**       | `src/gateway/session-utils.ts`           | ✅ 100%    |
| **Agent 执行**     | `src/commands/agent.ts`                  | ✅ 100%    |
| **方法 Handler**   | `src/gateway/server-methods/*.ts` (全部) | ✅ 100%    |
| **事件广播**       | `src/gateway/server-methods/types.ts`    | ✅ 100%    |

### 9.3 扩展机制：extraHandlers

如果不想修改服务端代码，可以通过 `extraHandlers` 扩展自定义方法：

```typescript
// 服务端启动时传入
const extraHandlers: GatewayRequestHandlers = {
  "my.custom.method": async ({ params, respond }) => {
    respond(true, { result: "ok" }, undefined);
  },
};

// 在 server.impl.ts 中使用
extraHandlers: {
  ...pluginRegistry.gatewayHandlers,
  ...execApprovalHandlers,
  ...extraHandlers,  // 自定义方法
},
```

**实际使用示例** (`src/gateway/server.impl.ts:485-488`)：

```typescript
extraHandlers: {
  ...pluginRegistry.gatewayHandlers,  // 插件 Handler
  ...execApprovalHandlers,            // 执行审批 Handler
},
```

### 9.4 客户端需要实现的部分

虽然 Gateway 服务端代码可复用，但客户端需要实现：

| 组件               | 说明                             |
| ------------------ | -------------------------------- |
| **WebSocket 连接** | 建立与 Gateway 的 WebSocket 连接 |
| **设备身份**       | Ed25519 密钥对生成和签名         |
| **请求/响应处理**  | 帧序列化和反序列化               |
| **重连机制**       | 断线自动重连                     |

### 9.5 结论

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Gateway 代码复用评估                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  服务端代码 (99.9% 可复用)                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ✅ 认证授权 (Token/Password/Tailscale/Device Token)                 │   │
│  │ ✅ 协议处理 (帧格式、Schema 验证)                                    │   │
│  │ ✅ 方法路由 (20+ Handler)                                          │   │
│  │ ✅ 权限控制 (Role + Scope)                                          │   │
│  │ ✅ 会话管理 (持久化状态)                                            │   │
│  │ ✅ Agent 执行 (Pi LLM + Tools + Skills)                            │   │
│  │ ✅ 事件广播 (流式推送)                                              │   │
│  │ ✅ extraHandlers (扩展自定义方法)                                   │   │
│  │                                                                     │   │
│  │ ⚠️ 客户端 ID 注册 (添加一行常量) ← 唯一需要修改的地方           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  客户端代码 (需自行实现)                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ • WebSocket 客户端连接                                              │   │
│  │ • Ed25519 设备身份 (密钥生成 + 签名)                                │   │
│  │ • 请求/响应处理                                                    │   │
│  │ • 断线重连                                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 十、总结

### Gateway 的核心价值

1. **统一入口**: 所有客户端和渠道通过 Gateway 统一接入
2. **协议抽象**: JSON-RPC 风格协议，屏蔽底层差异
3. **安全隔离**: 认证授权、设备身份、Scope 权限控制
4. **会话管理**: 持久化会话状态、跨设备同步
5. **Agent 编排**: 模型选择、工具加载、执行调度、结果投递
6. **事件广播**: 实时状态推送、流式响应
7. **高可复用**: 服务端代码 99.9% 可复用

### 回答最初的问题

> 这一部分的核心代码，我能不能百分之百的进行复用？

**答案**：可以接近 100% 复用。

- **服务端**：仅需添加一行客户端 ID 常量（如果不使用 extraHandlers 扩展）
- **客户端**：需要自行实现 WebSocket 连接和 Ed25519 设备身份

Gateway 的核心机制（认证授权、请求路由、会话管理、Agent 执行、事件广播）已经完全实现并可直接复用。

---

_文档生成时间: 2026-02-13_
