# OpenClaw Gateway Phase 2: 标准接入方式与接口规范

## 一、Gateway 接入架构总览

Gateway 是一个完整的后端系统，接收来自不同客户端的连接，并将请求路由到后端 Agent 执行。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              输入端                                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│  │   Web UI    │ │  macOS App  │ │   iOS App   │ │ Android App │        │
│  │(TypeScript) │ │   (Swift)   │ │   (Swift)   │ │  (Kotlin)  │        │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘        │
└─────────┼──────────────┼──────────────┼──────────────┼───────────────┘
          │               │               │               │
          └───────────────┴───────────────┴───────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Gateway 服务端                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  1. WebSocket 连接管理                                             │ │
│  │  2. 认证授权 (Token/Password/Device Identity/Tailscale)           │ │
│  │  3. 请求路由分发 (coreGatewayHandlers)                              │ │
│  │  4. 会话状态管理 (Session Store)                                   │ │
│  │  5. Agent 执行 (agentCommand → Pi LLM Agent)                     │ │
│  │  6. 事件广播 (流式推送)                                            │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         输出端                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  • 响应帧 (type: "res", ok: true/false, payload/error)          │ │
│  │  • 事件帧 (type: "event", event: "chat"/"agent.stream"/...)     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、核心功能模块（可复用）

### 2.1 模块清单

| 模块                 | 文件路径                               | 功能说明              | 可复用程度     |
| -------------------- | -------------------------------------- | --------------------- | -------------- |
| **协议定义**         | `src/gateway/protocol/schema/`         | 帧格式、方法 Schema   | ✅ 100%        |
| **客户端注册**       | `src/gateway/protocol/client-info.ts`  | 客户端 ID、模式、能力 | ⚠️ 需添加新 ID |
| **认证授权**         | `src/gateway/auth.ts`                  | 4 种认证方式          | ✅ 100%        |
| **设备身份**         | `src/gateway/device-auth.ts`           | Payload 构建          | ✅ 100%        |
| **请求路由**         | `src/gateway/server-methods.ts`        | 20+ Handler           | ✅ 100%        |
| **权限控制**         | `src/gateway/server-methods.ts:93-164` | Role + Scope          | ✅ 100%        |
| **WebSocket 运行时** | `src/gateway/server-ws-runtime.ts`     | 连接管理              | ✅ 100%        |
| **会话管理**         | `src/gateway/session-utils.ts`         | 状态持久化            | ✅ 100%        |
| **Agent 执行**       | `src/commands/agent.ts`                | Pi LLM Agent          | ✅ 100%        |

### 2.2 源码关键路径

```
src/gateway/
├── protocol/
│   ├── client-info.ts          # 客户端 ID 注册 (⚠️ 需修改)
│   ├── schema/
│   │   ├── frames.ts          # 帧格式定义
│   │   └── primitives.ts      # Schema 定义
│   └── index.ts              # 协议导出
├── auth.ts                    # 认证授权 (✅ 复用)
├── device-auth.ts             # 设备身份 (✅ 复用)
├── server-methods.ts          # 方法路由 + 权限 (✅ 复用)
├── server-ws-runtime.ts       # WebSocket 运行时 (✅ 复用)
├── session-utils.ts           # 会话管理 (✅ 复用)
└── server-methods/
    ├── agent.ts               # Agent Handler
    ├── chat.ts                # 聊天 Handler
    ├── config.ts              # 配置 Handler
    ├── nodes.ts               # 设备节点 Handler
    └── ...                    # 其他 Handler
```

---

## 三、客户端输入接口规范

### 3.1 连接流程

```
Client                                                   Gateway
  │                                                        │
  │ ─────────── WebSocket Connect ──────────────────────> │
  │                                                        │
  │ <────────── hello-ok ─────────────────────────────── │  协议特性
  │                                                        │
  │ <────────── connect.challenge ────────────────────── │  (可选，非本地)
  │            { nonce: "xxx" }                          │
  │                                                        │
  │ ─────────── connect request ───────────────────────> │
  │            {                                        │
  │              method: "connect",                     │
  │              params: {                               │
  │                minProtocol: 3,                      │
  │                maxProtocol: 3,                       │
  │                client: { ... },                     │
  │                role: "operator",                   │
  │                scopes: ["operator.admin"],         │
  │                device: { ... },                    │
  │                auth: { token: "..." }             │
  │              }                                       │
  │            }                                        │
  │                                                        │
  │ <────────── connect response ────────────────────── │
  │            {                                        │
  │              type: "hello-ok",                     │
  │              auth: {                                │
  │                deviceToken: "...",                  │
  │                role: "operator",                   │
  │                scopes: ["operator.admin"]          │
  │              }                                       │
  │            }                                        │
  │                                                        │
  ═══════════ 连接建立 ═══════════                       │
  │                                                        │
  │ ─────────── 请求 (agent/chat.send/...) ────────> │
  │ <────────── 响应 + 事件 ────────────────────────── │
```

### 3.2 Connect 请求参数

```typescript
// 定义: src/gateway/protocol/schema/frames.ts:20-68
{
  minProtocol: 3,           // 协议版本（固定为 3）
  maxProtocol: 3,           // 协议版本（固定为 3）
  client: {
    id: string,            // 客户端 ID（必须在 GATEWAY_CLIENT_IDS 中）
    displayName?: string,   // 显示名称
    version: string,        // 客户端版本
    platform: string,       // 平台（如 "web", "iOS 18.0"）
    deviceFamily?: string,  // 设备类型（如 "iPhone"）
    modelIdentifier?: string, // 设备型号（如 "iPhone15,2"）
    mode: string,           // 模式：webchat/cli/ui/node/backend
    instanceId?: string     // 实例 ID
  },
  role: "operator" | "node",   // 角色
  scopes?: string[],            // 权限范围
  caps?: string[],              // 能力列表（Node 角色）
  commands?: string[],          // 命令列表（Node 角色）
  device?: {                    // 设备身份
    id: string,                // deviceId = SHA256(publicKey)
    publicKey: string,         // Base64URL 编码
    signature: string,         // Ed25519 签名
    signedAt: number,          // 时间戳（毫秒）
    nonce?: string             // 挑战 nonce
  },
  auth?: {                      // 认证信息
    token?: string,            // Gateway Token
    password?: string          // Gateway Password
  },
  locale?: string,              // 语言（如 "en-US"）
  userAgent?: string            // User Agent
}
```

### 3.3 请求帧格式

```typescript
// 定义: src/gateway/protocol/schema/frames.ts:126-134
{
  type: "req",                 // 固定值
  id: string,                 // UUID，用于匹配响应
  method: string,             // 方法名
  params?: unknown            // 可选参数
}

// 示例：调用 Agent
{
  "type": "req",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "method": "agent",
  "params": {
    "message": "Hello, help me with coding",
    "sessionKey": "agent:default"
  }
}

// 示例：发送聊天
{
  "type": "req",
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "method": "chat.send",
  "params": {
    "message": "Hello",
    "sessionKey": "agent:default"
  }
}
```

---

## 四、客户端输出接口规范

### 4.1 响应帧格式

```typescript
// 定义: src/gateway/protocol/schema/frames.ts:136-145

// 成功响应
{
  type: "res",
  id: "550e8400-e29b-41d4-a716-446655440000",
  ok: true,
  payload: {
    runId: "abc123",
    status: "accepted"  // 先返回 accepted
  }
}

// 成功响应（Agent 完成）
{
  type: "res",
  id: "550e8400-e29b-41d4-a716-446655440000",
  ok: true,
  payload: {
    runId: "abc123",
    status: "ok",
    summary: "completed",
    result: { ... }
  }
}

// 失败响应
{
  type: "res",
  id: "550e8400-e29b-41d4-a716-446655440000",
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "missing scope: operator.admin",
    details?: unknown,
    retryable?: boolean,
    retryAfterMs?: number
  }
}
```

### 4.2 事件帧格式

```typescript
// 定义: src/gateway/protocol/schema/frames.ts:147-156

// 通用事件
{
  type: "event",
  event: string,           // 事件名
  payload?: unknown,       // 事件数据
  seq?: number,            // 序列号（用于检测丢失）
  stateVersion?: {         // 状态版本
    presence: number,
    health: number
  }
}

// 常见事件类型
// 1. Agent 流式输出
{ "type": "event", "event": "agent.stream", "payload": { "delta": "Hello" }, "seq": 1 }

// 2. Agent 工具调用
{ "type": "event", "event": "agent.tool", "payload": { "id": "tool_1", "name": "bash", "input": {...} }, "seq": 5 }

// 3. 聊天消息
{ "type": "event", "event": "chat", "payload": { "message": {...} }, "seq": 10 }

// 4. 在线状态
{ "type": "event", "event": "presence", "payload": { "presence": [...] } }
```

### 4.3 完整响应流程

```
Client                                                     Gateway
  │                                                          │
  │ ─────────── { type: "req", method: "agent" } ───────>  │
  │                                                          │
  │ <────────── { type: "res", status: "accepted" } ────── │  立即返回
  │                                                          │
  │ <────────── { type: "event", event: "agent.stream" }  │  流式输出
  │                                                          │
  │ <────────── { type: "event", event: "agent.tool" } ─── │  工具调用
  │                                                          │
  │ <────────── { type: "event", event: "agent.stream" }  │  继续输出
  │                                                          │
  │ <────────── { type: "res", status: "ok" } ─────────── │  最终结果
```

---

## 五、不同客户端的角色差异

### 5.1 角色说明

| 角色         | 说明                       | 权限             |
| ------------ | -------------------------- | ---------------- |
| **operator** | 操作员，用于聊天、配置管理 | 根据 scopes 决定 |
| **node**     | 节点，用于提供设备能力     | 只能调用特定方法 |

### 5.2 客户端配置对比

| 客户端                 | Role       | Scopes           | Caps                                                                      | 用途       |
| ---------------------- | ---------- | ---------------- | ------------------------------------------------------------------------- | ---------- |
| **Web UI**             | `operator` | `operator.admin` | 无                                                                        | 聊天、配置 |
| **macOS (Operator)**   | `operator` | `operator.admin` | 无                                                                        | 聊天、配置 |
| **macOS (Node)**       | `node`     | 无               | `canvas, camera, screen, voiceWake`                                       | 设备能力   |
| **iOS (Operator)**     | `operator` | `operator.admin` | 无                                                                        | 聊天、配置 |
| **iOS (Node)**         | `node`     | 无               | `canvas, camera, location, contacts, photos, calendar, reminders, motion` | 设备能力   |
| **Android (Operator)** | `operator` | `operator.admin` | 无                                                                        | 聊天、配置 |
| **Android (Node)**     | `node`     | 无               | `canvas, camera, screen, sms, voiceWake, location`                        | 设备能力   |

### 5.3 Scope 权限

| Scope                | 权限说明                                                           |
| -------------------- | ------------------------------------------------------------------ |
| `operator.admin`     | 完全管理权限（所有操作）                                           |
| `operator.write`     | 写入权限（send, agent, chat.send, node.invoke）                    |
| `operator.read`      | 只读权限（health, logs, models.list, sessions.list, chat.history） |
| `operator.approvals` | 执行审批权限                                                       |
| `operator.pairing`   | 设备配对权限                                                       |

---

## 六、二次开发技术细节

### 6.1 必须实现的核心组件

```
┌────────────────────────────────────────────────────────────────────────┐
│                    新客户端必须实现的组件                                │
├────────────────────────────────────────────────────────────────────────┤
│
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ 1. WebSocket 客户端                                             │ │
│  │    • 建立连接、发送/接收消息                                     │ │
│  │    • 请求-响应匹配 (通过 id)                                     │ │
│  │    • 断线重连 (指数退避)                                         │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ 2. 设备身份管理                                                 │ │
│  │    • Ed25519 密钥对生成                                          │ │
│  │    • deviceId = SHA256(publicKey)                              │ │
│  │    • Payload 签名                                               │ │
│  │    • 密钥安全存储                                                │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ 3. 认证流程                                                     │ │
│  │    • Token / Password 认证                                       │ │
│  │    • 设备身份认证                                                │ │
│  │    • deviceToken 存储与复用                                      │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ 4. Node 能力处理 (可选，仅 Node 角色需要)                       │ │
│  │    • 命令处理 (camera.snap, location.get 等)                   │ │
│  │    • 能力声明 (caps, commands)                                  │ │
│  │    • 事件上报 (node.event)                                      │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│
└────────────────────────────────────────────────────────────────────────┘
```

### 6.2 步骤 1：注册客户端 ID

**唯一需要修改服务端的地方**

```typescript
// src/gateway/protocol/client-info.ts:1-14

export const GATEWAY_CLIENT_IDS = {
  // ... 现有 ID
  MY_NEW_CLIENT: "my-new-client", // 添加新客户端 ID
} as const;
```

### 6.3 步骤 2：实现 WebSocket 客户端

**完整模板代码**：

```typescript
class MyGatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: Function; reject: Function }>();
  private closed = false;
  private connectNonce: string | null = null;
  private backoffMs = 800;

  constructor(
    private url: string,
    private options: {
      clientId: string;
      clientMode: string;
      role: string;
      scopes: string[];
      token?: string;
      onHello?: (hello: any) => void;
      onEvent?: (event: any) => void;
      onClose?: (code: number, reason: string) => void;
    },
  ) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        // 等待 hello-ok 和 connect.challenge
      };

      this.ws.onmessage = (ev) => this.handleMessage(ev.data);
      this.ws.onerror = () => reject(new Error("Connection failed"));
      this.ws.onclose = (ev) => {
        if (!this.closed) {
          this.scheduleReconnect();
        }
        this.options.onClose?.(ev.code, ev.reason);
      };
    });
  }

  private async sendConnect(): Promise<void> {
    const identity = await this.loadOrCreateDeviceIdentity();
    const signedAtMs = Date.now();
    const nonce = this.connectNonce;

    // 构建 payload
    const payload = buildDeviceAuthPayload({
      deviceId: identity.deviceId,
      clientId: this.options.clientId,
      clientMode: this.options.clientMode,
      role: this.options.role,
      scopes: this.options.scopes,
      signedAtMs,
      token: this.options.token,
      nonce,
    });

    // 签名
    const signature = await this.signPayload(identity.privateKey, payload);

    // 发送 connect 请求
    await this.request("connect", {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: this.options.clientId,
        version: "1.0.0",
        platform: "custom",
        mode: this.options.clientMode,
      },
      role: this.options.role,
      scopes: this.options.scopes,
      device: {
        id: identity.deviceId,
        publicKey: identity.publicKey,
        signature,
        signedAt: signedAtMs,
        nonce,
      },
      auth: this.options.token ? { token: this.options.token } : undefined,
    });
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected");
    }

    const id = crypto.randomUUID();
    const frame = { type: "req", id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: (v: any) => resolve(v as T), reject });
      this.ws!.send(JSON.stringify(frame));
    });
  }

  private handleMessage(raw: string): void {
    const frame = JSON.parse(raw);

    if (frame.type === "event") {
      // 处理 connect.challenge
      if (frame.event === "connect.challenge") {
        this.connectNonce = frame.payload?.nonce;
        this.sendConnect();
        return;
      }
      // 处理其他事件
      this.options.onEvent?.(frame);
    } else if (frame.type === "res") {
      const pending = this.pending.get(frame.id);
      if (pending) {
        this.pending.delete(frame.id);
        if (frame.ok) {
          pending.resolve(frame.payload);
        } else {
          pending.reject(new Error(frame.error?.message ?? "Request failed"));
        }
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15000);
    setTimeout(() => this.connect(), delay);
  }

  // 设备身份方法 (需根据平台实现)
  private async loadOrCreateDeviceIdentity(): Promise<any> {
    /* ... */
  }
  private async signPayload(privateKey: string, payload: string): Promise<string> {
    /* ... */
  }
}

// 使用
const client = new MyGatewayClient("ws://100.x.y.z:18789", {
  clientId: "my-new-client",
  clientMode: "ui",
  role: "operator",
  scopes: ["operator.admin"],
  token: "my-gateway-token",
  onEvent: (evt) => console.log("Event:", evt),
});

await client.connect();

// 调用 Agent
const result = await client.request("agent", {
  message: "Hello",
  sessionKey: "agent:default",
});
```

### 6.4 步骤 3：实现 Ed25519 签名

**不同平台的实现**：

| 平台           | 库               | 核心代码                                        |
| -------------- | ---------------- | ----------------------------------------------- |
| **TypeScript** | `@noble/ed25519` | `signAsync(data, privateKey)`                   |
| **Swift**      | `CryptoKit`      | `Curve25519.Signing.PrivateKey.signature(for:)` |
| **Kotlin**     | `java.security`  | `Signature.getInstance("Ed25519")`              |
| **Python**     | `pynacl`         | `SigningKey(sign_key).sign(message)`            |
| **Rust**       | `ed25519-dalek`  | `keypair.sign(message)`                         |

**Payload 格式** (`src/gateway/device-auth.ts:13-31`)：

```typescript
// v1 格式 (无 nonce)
"v1|<deviceId>|<clientId>|<clientMode>|<role>|<scopes>|<signedAtMs>|<token>";

// v2 格式 (带 nonce)
"v2|<deviceId>|<clientId>|<clientMode>|<role>|<scopes>|<signedAtMs>|<token>|<nonce>";

function buildDeviceAuthPayload(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce?: string | null;
}): string {
  const version = params.nonce ? "v2" : "v1";
  const scopes = params.scopes.join(",");
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    params.token ?? "",
  ];
  if (version === "v2") {
    base.push(params.nonce ?? "");
  }
  return base.join("|");
}
```

### 6.5 Node 角色额外实现

如果需要实现设备能力（Node 角色）：

```typescript
// 1. 连接时声明能力和命令
await client.request("connect", {
  role: "node",
  caps: ["camera", "location", "screen"],
  commands: ["camera.snap", "location.get", "screen.record"],
  // ...
});

// 2. 监听命令请求
client.onEvent((event) => {
  if (event.event === "node.invoke.request") {
    const { id, nodeId, command, paramsJSON } = event.payload;

    // 处理命令
    const result = handleCommand(command, paramsJSON);

    // 返回结果
    client.request("node.invoke.result", {
      id,
      nodeId,
      ok: result.ok,
      payloadJSON: result.payload,
      error: result.error,
    });
  }
});

function handleCommand(command: string, params: any) {
  switch (command) {
    case "camera.snap":
      return { ok: true, payload: takePhoto() };
    case "location.get":
      return { ok: true, payload: getLocation() };
    case "screen.record":
      return { ok: true, payload: startRecording() };
    default:
      return { ok: false, error: { code: "UNKNOWN", message: "Unknown command" } };
  }
}
```

---

## 七、常用方法参考

### 7.1 Operator 角色方法

| 方法            | 参数                                 | 说明                |
| --------------- | ------------------------------------ | ------------------- |
| `agent`         | `{ message, sessionKey?, agentId? }` | 发送消息给 AI Agent |
| `agent.wait`    | `{ runId, timeoutMs? }`              | 等待 Agent 执行完成 |
| `chat.send`     | `{ message, sessionKey? }`           | 发送聊天消息        |
| `chat.history`  | `{ sessionKey?, limit? }`            | 获取聊天历史        |
| `config.get`    | `{ path }`                           | 获取配置            |
| `config.set`    | `{ path, value }`                    | 设置配置            |
| `models.list`   | `{}`                                 | 获取可用模型列表    |
| `sessions.list` | `{}`                                 | 获取会话列表        |
| `agents.list`   | `{}`                                 | 获取 Agent 列表     |
| `health`        | `{}`                                 | 健康检查            |

### 7.2 Node 角色方法

| 方法                 | 说明             |
| -------------------- | ---------------- |
| `node.invoke.result` | 返回命令执行结果 |
| `node.event`         | 上报 Node 事件   |

### 7.3 事件类型

| 事件                  | 说明             |
| --------------------- | ---------------- |
| `connect.challenge`   | 连接挑战（可选） |
| `agent.stream`        | Agent 流式输出   |
| `agent.tool`          | Agent 工具调用   |
| `agent.done`          | Agent 执行完成   |
| `chat`                | 聊天消息         |
| `presence`            | 在线状态变化     |
| `node.invoke.request` | Node 命令请求    |

---

## 八、总结

### 8.1 接入流程

```
┌────────────────────────────────────────────────────────────────────────┐
│                        接入流程                                       │
├────────────────────────────────────────────────────────────────────────┤
│
│  1. 修改服务端 (添加客户端 ID)                                      │
│     └── src/gateway/protocol/client-info.ts                        │
│
│  2. 客户端实现                                                      │
│     ├── WebSocket 连接                                               │
│     ├── 设备身份 (Ed25519)                                         │
│     ├── 认证流程                                                    │
│     └── 请求处理                                                    │
│
│  3. 调用 Gateway 方法                                              │
│     ├── connect (建立连接)                                          │
│     ├── agent (调用 AI)                                            │
│     └── 监听事件                                                   │
│
└────────────────────────────────────────────────────────────────────────┘
```

### 8.2 复用程度

| 组件       | 可复用  | 说明           |
| ---------- | ------- | -------------- |
| 协议处理   | ✅ 100% | 无需修改       |
| 认证授权   | ✅ 100% | 4 种方式已实现 |
| 方法路由   | ✅ 100% | 20+ Handler    |
| 权限控制   | ✅ 100% | Role + Scope   |
| 会话管理   | ✅ 100% | 完整实现       |
| Agent 执行 | ✅ 100% | Pi LLM         |
| 客户端 ID  | ⚠️ 1 行 | 需添加常量     |

---

_文档生成时间: 2026-02-13_
