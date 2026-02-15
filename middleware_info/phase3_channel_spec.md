# Phase 3: Channel 接口规范详解

## 一、概述

本文档详细说明 OpenClaw 中 Channel 的标准化接口规范。当你需要接入自定义的 Channel 时，必须遵循这些接口规范才能正确对接到系统中。

---

## 二、Channel 插件完整接口

### 2.1 ChannelPlugin 主接口

位置：`src/channels/plugins/types.plugin.ts`

```typescript
export type ChannelPlugin<ResolvedAccount = any, Probe = unknown, Audit = unknown> = {
  // ========== 基础信息 ==========
  id: ChannelId; // 唯一标识符 (如 "telegram", "whatsapp")
  meta: ChannelMeta; // 元数据 (名称、文档路径等)
  capabilities: ChannelCapabilities; // 能力声明

  // ========== 可选配置 ==========
  defaults?: {
    queue?: {
      debounceMs?: number;
    };
  };
  reload?: {
    configPrefixes: string[];
    noopPrefixes?: string[];
  };

  // ========== 核心适配器 (必须实现) ==========
  onboarding?: ChannelOnboardingAdapter; // 用户引导
  config: ChannelConfigAdapter<ResolvedAccount>; // 配置管理
  configSchema?: ChannelConfigSchema; // 配置 Schema
  setup?: ChannelSetupAdapter; // 账号设置
  pairing?: ChannelPairingAdapter; // 配对管理
  security?: ChannelSecurityAdapter<ResolvedAccount>; // 安全策略
  groups?: ChannelGroupAdapter; // 群组管理
  mentions?: ChannelMentionAdapter; // @提及处理
  outbound?: ChannelOutboundAdapter; // 消息发送 (核心)
  status?: ChannelStatusAdapter<ResolvedAccount, Probe, Audit>; // 状态查询
  gateway?: ChannelGatewayAdapter<ResolvedAccount>; // 网关管理
  auth?: ChannelAuthAdapter; // 认证
  elevated?: ChannelElevatedAdapter; // 提权
  commands?: ChannelCommandAdapter; // 命令配置
  streaming?: ChannelStreamingAdapter; // 流式输出
  threading?: ChannelThreadingAdapter; // 线程管理
  messaging?: ChannelMessagingAdapter; // 消息处理
  agentPrompt?: ChannelAgentPromptAdapter; // Agent 提示词
  directory?: ChannelDirectoryAdapter; // 目录服务
  resolver?: ChannelResolverAdapter; // 目标解析
  actions?: ChannelMessageActionAdapter; // 消息操作
  agentTools?: ChannelAgentToolFactory; // Agent 工具
  heartbeat?: ChannelHeartbeatAdapter; // 心跳
};
```

---

## 三、核心接口详解

### 3.1 ChannelMeta - 渠道元数据

位置：`src/channels/plugins/types.core.ts`

```typescript
export type ChannelMeta = {
  id: ChannelId; // 渠道 ID
  label: string; // 显示名称 (如 "Telegram")
  selectionLabel: string; // 选择器中的描述
  docsPath: string; // 文档路径 (如 "/channels/telegram")
  docsLabel?: string; // 文档标签
  blurb: string; // 简短描述
  order?: number; // 显示顺序
  aliases?: string[]; // 别名
  detailLabel?: string; // 详情页标签
  systemImage?: string; // 系统图标名称
  showConfigured?: boolean; // 是否显示"已配置"
  quickstartAllowFrom?: boolean; // 是否允许快速开始
  forceAccountBinding?: boolean; // 是否强制账号绑定
  preferSessionLookupForAnnounceTarget?: boolean;
  preferOver?: string[]; // 优先于哪些渠道
};
```

### 3.2 ChannelCapabilities - 渠道能力声明

位置：`src/channels/plugins/types.core.ts`

```typescript
export type ChannelCapabilities = {
  chatTypes: Array<ChatType | "thread">; // 支持的聊天类型
  polls?: boolean; // 是否支持投票
  reactions?: boolean; // 是否支持表情回应
  edit?: boolean; // 是否支持消息编辑
  unsend?: boolean; // 是否支持撤回消息
  reply?: boolean; // 是否支持回复
  effects?: boolean; // 是否支持消息特效
  groupManagement?: boolean; // 是否支持群组管理
  threads?: boolean; // 是否支持线程
  media?: boolean; // 是否支持媒体
  nativeCommands?: boolean; // 是否支持原生命令
  blockStreaming?: boolean; // 是否支持阻断流式输出
};
```

**示例** (Telegram):

```typescript
capabilities: {
  chatTypes: ["direct", "group", "channel", "thread"],
  reactions: true,
  threads: true,
  media: true,
  nativeCommands: true,
  blockStreaming: true,
}
```

**示例** (WhatsApp):

```typescript
capabilities: {
  chatTypes: ["direct", "group"],
  polls: true,
  reactions: true,
  media: true,
}
```

---

## 四、输入输出接口规范 (重点)

### 4.1 统一输入格式 - AgentEnvelopeParams

位置：`src/auto-reply/envelope.ts`

**这是所有 Channel 必须将外部消息转换成的统一格式**：

```typescript
export type AgentEnvelopeParams = {
  channel: string; // 渠道 ID (如 "telegram", "whatsapp")
  from?: string; // 发送者 ID
  timestamp?: number | Date; // 消息时间戳
  host?: string; // 主机信息
  ip?: string; // IP 地址
  body: string; // 消息内容 (核心字段)
  previousTimestamp?: number | Date; // 上条消息时间戳
  envelope?: EnvelopeFormatOptions; // 格式选项
};
```

### 4.2 统一输出格式 - ReplyPayload

位置：`src/auto-reply/types.ts`

**这是 Agent 产生的回复统一格式**：

```typescript
export type ReplyPayload = {
  text?: string; // 文本内容
  mediaUrl?: string; // 媒体 URL
  mediaUrls?: string[]; // 多个媒体 URL
  replyToId?: string; // 回复目标消息 ID
  replyToTag?: boolean; // 是否 @ 对方
  replyToCurrent?: boolean; // 是否回复当前消息
  audioAsVoice?: boolean; // 是否发送为语音消息
  isError?: boolean; // 是否是错误消息
  channelData?: Record<string, unknown>; // 渠道特定数据
};
```

### 4.3 发送结果格式 - OutboundDeliveryResult

位置：`src/infra/outbound/deliver.ts`

**这是所有 Channel 发送后必须返回的统一结果格式**：

```typescript
export type OutboundDeliveryResult = {
  channel: Exclude<OutboundChannel, "none">; // 渠道 ID
  messageId: string; // 发送成功的消息 ID
  chatId?: string; // 聊天 ID
  channelId?: string; // 渠道 ID
  roomId?: string; // 房间/群组 ID
  conversationId?: string; // 会话 ID
  timestamp?: number; // 发送时间戳
  toJid?: string; // 目标 JID
  pollId?: string; // 投票 ID (WhatsApp)
  meta?: Record<string, unknown>; // 渠道特定元数据
};
```

---

## 五、消息发送接口 (ChannelOutboundAdapter)

位置：`src/channels/plugins/types.adapters.ts`

这是 Channel 最核心的接口，负责将 Agent 的回复发送到外部消息平台。

### 5.1 接口定义

```typescript
export type ChannelOutboundAdapter = {
  // 发送模式
  deliveryMode: "direct" | "gateway" | "hybrid";

  // 消息分块 (可选)
  chunker?: ((text: string, limit: number) => string[]) | null;
  chunkerMode?: "text" | "markdown";
  textChunkLimit?: number;

  // 投票选项上限
  pollMaxOptions?: number;

  // 目标解析
  resolveTarget?: (params: {
    cfg?: OpenClawConfig;
    to?: string;
    allowFrom?: string[];
    accountId?: string | null;
    mode?: ChannelOutboundTargetMode;
  }) => { ok: true; to: string } | { ok: false; error: Error };

  // 发送方法 (至少实现一个)
  sendPayload?: (ctx: ChannelOutboundPayloadContext) => Promise<OutboundDeliveryResult>;
  sendText?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;
  sendMedia?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;
  sendPoll?: (ctx: ChannelPollContext) => Promise<ChannelPollResult>;
};
```

### 5.2 发送上下文 - ChannelOutboundContext

```typescript
export type ChannelOutboundContext = {
  cfg: OpenClawConfig; // 系统配置
  to: string; // 目标接收者
  text: string; // 文本内容
  mediaUrl?: string; // 媒体 URL
  gifPlayback?: boolean; // GIF 播放
  replyToId?: string | null; // 回复 ID
  threadId?: string | number | null; // 线程 ID
  accountId?: string | null; // 账号 ID
  deps?: OutboundSendDeps; // 依赖注入
};

export type ChannelOutboundPayloadContext = ChannelOutboundContext & {
  payload: ReplyPayload; // 完整回复载荷
};
```

### 5.3 实现示例 - Telegram

位置：`src/channels/plugins/outbound/telegram.ts`

```typescript
export const telegramOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: markdownToTelegramHtmlChunks,  // Markdown 转 HTML
  chunkerMode: "markdown",
  textChunkLimit: 4000,

  sendText: async ({ to, text, accountId, deps, replyToId, threadId }) => {
    const send = deps?.sendTelegram ?? sendMessageTelegram;
    const replyToMessageId = parseReplyToMessageId(replyToId);
    const messageThreadId = parseThreadId(threadId);

    const result = await send(to, text, {
      textMode: "html",
      messageThreadId,
      replyToMessageId,
      accountId: accountId ?? undefined,
    });

    return { channel: "telegram", ...result };
  },

  sendMedia: async ({ to, text, mediaUrl, accountId, deps, replyToId, threadId }) => {
    // 发送媒体消息
    const result = await send(to, text, { mediaUrl, ... });
    return { channel: "telegram", ...result };
  },

  sendPayload: async ({ to, payload, accountId, deps, replyToId, threadId }) => {
    // 处理完整载荷 (包含 buttons 等)
    const telegramData = payload.channelData?.telegram as {
      buttons?: Array<Array<{ text: string; callback_data: string }>>;
      quoteText?: string;
    } | undefined;
    // ... 处理逻辑
  },
};
```

---

## 六、配置管理接口

### 6.1 ChannelConfigAdapter

```typescript
export type ChannelConfigAdapter<ResolvedAccount> = {
  // 列出所有账号 ID
  listAccountIds: (cfg: OpenClawConfig) => string[];

  // 解析账号配置
  resolveAccount: (cfg: OpenClawConfig, accountId?: string | null) => ResolvedAccount;

  // 默认账号 ID
  defaultAccountId?: (cfg: OpenClawConfig) => string;

  // 设置账号启用状态
  setAccountEnabled?: (params: {
    cfg: OpenClawConfig;
    accountId: string;
    enabled: boolean;
  }) => OpenClawConfig;

  // 删除账号
  deleteAccount?: (params: { cfg: OpenClawConfig; accountId: string }) => OpenClawConfig;

  // 检查是否已配置
  isConfigured?: (account: ResolvedAccount, cfg: OpenClawConfig) => boolean | Promise<boolean>;

  // 描述账号状态
  describeAccount?: (account: ResolvedAccount, cfg: OpenClawConfig) => ChannelAccountSnapshot;

  // 解析允许列表
  resolveAllowFrom?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
  }) => string[] | undefined;

  // 格式化允许列表
  formatAllowFrom?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    allowFrom: Array<string | number>;
  }) => string[];
};
```

### 6.2 ChannelSetupInput - 账号设置输入

```typescript
export type ChannelSetupInput = {
  name?: string;
  token?: string;
  tokenFile?: string;
  botToken?: string;
  appToken?: string;
  signalNumber?: string;
  cliPath?: string;
  dbPath?: string;
  service?: "imessage" | "sms" | "auto";
  region?: string;
  authDir?: string;
  httpUrl?: string;
  httpHost?: string;
  httpPort?: string;
  webhookPath?: string;
  webhookUrl?: string;
  audienceType?: string;
  audience?: string;
  useEnv?: boolean;
  homeserver?: string;
  userId?: string;
  accessToken?: string;
  password?: string;
  deviceName?: string;
  initialSyncLimit?: number;
  ship?: string;
  url?: string;
  code?: string;
  groupChannels?: string[];
  dmAllowlist?: string[];
  autoDiscoverChannels?: boolean;
};
```

---

## 七、状态查询接口

### 7.1 ChannelStatusAdapter

```typescript
export<ResolvedAccount, Probe = unknown, type ChannelStatusAdapter Audit = unknown> = {
  // 默认运行时状态
  defaultRuntime?: ChannelAccountSnapshot;

  // 构建渠道摘要
  buildChannelSummary?: (params: {
    account: ResolvedAccount;
    cfg: OpenClawConfig;
    defaultAccountId: string;
    snapshot: ChannelAccountSnapshot;
  }) => Record<string, unknown> | Promise<Record<string, unknown>>;

  // 探测账号状态
  probeAccount?: (params: {
    account: ResolvedAccount;
    timeoutMs: number;
    cfg: OpenClawConfig;
  }) => Promise<Probe>;

  // 审计账号
  auditAccount?: (params: {
    account: ResolvedAccount;
    timeoutMs: number;
    cfg: OpenClawConfig;
    probe?: Probe;
  }) => Promise<Audit>;

  // 构建账号快照
  buildAccountSnapshot?: (params: {
    account: ResolvedAccount;
    cfg: OpenClawConfig;
    runtime?: ChannelAccountSnapshot;
    probe?: Probe;
    audit?: Audit;
  }) => ChannelAccountSnapshot | Promise<ChannelAccountSnapshot>;

  // 记录自身 ID
  logSelfId?: (params: {
    account: ResolvedAccount;
    cfg: OpenClawConfig;
    runtime: RuntimeEnv;
    includeChannelPrefix?: boolean;
  }) => void;

  // 解析账号状态
  resolveAccountState?: (params: {
    account: ResolvedAccount;
    cfg: OpenClawConfig;
    configured: boolean;
    enabled: boolean;
  }) => ChannelAccountState;

  // 收集状态问题
  collectStatusIssues?: (accounts: ChannelAccountSnapshot[]) => ChannelStatusIssue[];
};
```

### 7.2 ChannelAccountSnapshot - 账号快照

```typescript
export type ChannelAccountSnapshot = {
  accountId: string;
  name?: string;
  enabled?: boolean;
  configured?: boolean;
  linked?: boolean;
  running?: boolean;
  connected?: boolean;
  reconnectAttempts?: number;
  lastConnectedAt?: number | null;
  lastDisconnect?:
    | string
    | { at: number; status?: number; error?: string; loggedOut?: boolean }
    | null;
  lastMessageAt?: number | null;
  lastEventAt?: number | null;
  lastError?: string | null;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  mode?: string;
  dmPolicy?: string;
  allowFrom?: string[];
  tokenSource?: string;
  // ... 更多字段
};
```

---

## 八、网关管理接口

### 8.1 ChannelGatewayAdapter

```typescript
export type ChannelGatewayAdapter<ResolvedAccount = unknown> = {
  // 启动账号
  startAccount?: (ctx: ChannelGatewayContext<ResolvedAccount>) => Promise<unknown>;

  // 停止账号
  stopAccount?: (ctx: ChannelGatewayContext<ResolvedAccount>) => Promise<void>;

  // 开始 QR 登录
  loginWithQrStart?: (params: {
    accountId?: string;
    force?: boolean;
    timeoutMs?: number;
    verbose?: boolean;
  }) => Promise<ChannelLoginWithQrStartResult>;

  // 等待 QR 登录
  loginWithQrWait?: (params: {
    accountId?: string;
    timeoutMs?: number;
  }) => Promise<ChannelLoginWithQrWaitResult>;

  // 登出账号
  logoutAccount?: (ctx: ChannelLogoutContext<ResolvedAccount>) => Promise<ChannelLogoutResult>;
};
```

---

## 九、目录服务接口

### 9.1 ChannelDirectoryAdapter

```typescript
export type ChannelDirectoryAdapter = {
  // 获取自身信息
  self?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    runtime: RuntimeEnv;
  }) => Promise<ChannelDirectoryEntry | null>;

  // 列出联系人
  listPeers?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    query?: string | null;
    limit?: number | null;
    runtime: RuntimeEnv;
  }) => Promise<ChannelDirectoryEntry[]>;

  // 列出群组
  listGroups?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    query?: string | null;
    limit?: number | null;
    runtime: RuntimeEnv;
  }) => Promise<ChannelDirectoryEntry[]>;

  // 列出群成员
  listGroupMembers?: (params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    groupId: string;
    limit?: number | null;
    runtime: RuntimeEnv;
  }) => Promise<ChannelDirectoryEntry[]>;
};
```

### 9.2 ChannelDirectoryEntry

```typescript
export type ChannelDirectoryEntry = {
  kind: ChannelDirectoryEntryKind; // "user" | "group" | "channel"
  id: string;
  name?: string;
  handle?: string;
  avatarUrl?: string;
  rank?: number;
  raw?: unknown;
};
```

---

## 十、消息流程图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        自定义 Channel 插件                               │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  export const myChannelPlugin: ChannelPlugin = {                │  │
│  │    id: "mychannel",                                             │  │
│  │    meta: { ... },                                               │  │
│  │    capabilities: { chatTypes: ["direct", "group"], ... },       │  │
│  │    config: { ... },                                             │  │
│  │    outbound: { sendText, sendMedia, ... },                      │  │
│  │    status: { probeAccount, buildAccountSnapshot, ... },         │  │
│  │    // ... 其他适配器                                            │  │
│  │  };                                                             │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      OpenClaw 核心系统                                  │
│                                                                         │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐               │
│   │   Gateway   │───▶│Auto-Reply   │───▶│    Agent    │               │
│   └─────────────┘    └─────────────┘    └─────────────┘               │
│         │                   │                   │                      │
│         │                   ▼                   │                      │
│         │          ┌─────────────────┐           │                      │
│         │          │    Envelope     │           │                      │
│         │          │ (统一输入格式)  │           │                      │
│         │          └─────────────────┘           │                      │
│         │                   │                   │                      │
│         │                   ▼                   │                      │
│         │          ┌─────────────────┐           │                      │
│         │          │  ReplyPayload   │           │                      │
│         │          │ (统一输出格式)  │           │                      │
│         │          └─────────────────┘           │                      │
│         │                   │                   │                      │
│         ▼                   ▼                   ▼                      │
│   ┌─────────────────────────────────────────────────────────┐          │
│   │              ChannelOutboundAdapter                     │          │
│   │  • sendText()  • sendMedia()  • sendPayload()         │          │
│   └─────────────────────────────────────────────────────────┘          │
│                          │                                             │
│                          ▼                                             │
│   ┌─────────────────────────────────────────────────────────┐          │
│   │              OutboundDeliveryResult                      │          │
│   │  • messageId  • timestamp  • channelId  • meta         │          │
│   └─────────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      外部消息平台                                       │
│           (Telegram / WhatsApp / Discord / 自定义平台)                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 十一、接入自定义 Channel 检查清单

实现自定义 Channel 时，必须检查以下项目：

### 11.1 必须实现的接口

- [ ] `id` - 唯一渠道 ID
- [ ] `meta` - 渠道元数据
- [ ] `capabilities` - 能力声明
- [ ] `config` - 配置管理 (至少 `listAccountIds`, `resolveAccount`)
- [ ] `outbound.sendText` - 发送文本消息

### 11.2 推荐实现的接口

- [ ] `outbound.sendMedia` - 发送媒体消息
- [ ] `outbound.sendPayload` - 发送完整载荷
- [ ] `status.probeAccount` - 探测账号状态
- [ ] `status.buildAccountSnapshot` - 构建账号快照
- [ ] `setup` - 账号设置
- [ ] `messaging.normalizeTarget` - 目标规范化

### 11.3 可选接口

- [ ] `gateway.startAccount` / `stopAccount` - 账号启停
- [ ] `directory` - 目录服务
- [ ] `groups` - 群组管理
- [ ] `threading` - 线程管理
- [ ] `actions` - 消息操作

---

## 十二、源码位置汇总

| 接口类型                  | 文件位置                                 | 说明       |
| ------------------------- | ---------------------------------------- | ---------- |
| `ChannelPlugin`           | `src/channels/plugins/types.plugin.ts`   | 主接口定义 |
| `ChannelMeta`             | `src/channels/plugins/types.core.ts`     | 元数据     |
| `ChannelCapabilities`     | `src/channels/plugins/types.core.ts`     | 能力声明   |
| `ChannelOutboundAdapter`  | `src/channels/plugins/types.adapters.ts` | 消息发送   |
| `ChannelOutboundContext`  | `src/channels/plugins/types.adapters.ts` | 发送上下文 |
| `OutboundDeliveryResult`  | `src/infra/outbound/deliver.ts`          | 发送结果   |
| `ReplyPayload`            | `src/auto-reply/types.ts`                | 回复载荷   |
| `AgentEnvelopeParams`     | `src/auto-reply/envelope.ts`             | 统一输入   |
| `ChannelConfigAdapter`    | `src/channels/plugins/types.adapters.ts` | 配置管理   |
| `ChannelStatusAdapter`    | `src/channels/plugins/types.adapters.ts` | 状态查询   |
| `ChannelGatewayAdapter`   | `src/channels/plugins/types.adapters.ts` | 网关管理   |
| `ChannelDirectoryAdapter` | `src/channels/plugins/types.adapters.ts` | 目录服务   |
| `ChannelAccountSnapshot`  | `src/channels/plugins/types.core.ts`     | 账号快照   |

---

## 十三、总结

接入自定义 Channel 的核心要点：

1. **统一输入**: 将外部消息转换为 `AgentEnvelopeParams` 格式
2. **统一输出**: Agent 回复格式为 `ReplyPayload`
3. **统一返回**: 发送结果返回 `OutboundDeliveryResult`
4. **实现适配器**: 根据 Channel 能力实现相应的 Adapter 接口
5. **声明能力**: 正确设置 `capabilities` 让系统知道 Channel 支持哪些功能
