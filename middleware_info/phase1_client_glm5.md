# OpenClaw 客户端层架构深度解析

## 目录

1. [概述](#1-概述)
2. [统一通信协议详解](#2-统一通信协议详解)
3. [各客户端构建过程对比](#3-各客户端构建过程对比)
4. [相同点与差异点深度分析](#4-相同点与差异点深度分析)
5. [二次开发接入指南](#5-二次开发接入指南)
6. [附录：关键源码路径](#6-附录关键源码路径)

---

## 1. 概述

OpenClaw 采用 **Client-Gateway** 架构，所有客户端通过 **WebSocket** 连接到中心化的 **Gateway** 服务。目前支持四种客户端：

| 客户端  | 目录位置        | 技术栈                   | 角色                |
| ------- | --------------- | ------------------------ | ------------------- |
| Web UI  | `ui/`           | TypeScript + Lit + Vite  | `operator`          |
| macOS   | `apps/macos/`   | Swift 6.0 + SwiftUI      | `node` + `operator` |
| iOS     | `apps/ios/`     | Swift 6.0 + SwiftUI      | `node` + `operator` |
| Android | `apps/android/` | Kotlin + Jetpack Compose | `node` + `operator` |

---

## 2. 统一通信协议详解

### 2.1 协议版本

所有客户端使用 **Protocol Version 3**：

```typescript
// src/gateway/protocol/schema/frames.ts
minProtocol: 3,
maxProtocol: 3
```

### 2.2 连接帧结构

所有客户端连接时发送的 `connect` 请求结构完全一致：

```typescript
// 定义于 src/gateway/protocol/schema/frames.ts
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
      deviceFamily: "iPhone",
      modelIdentifier: "iPhone15,2",
      mode: "node" | "webchat" | "ui",
      instanceId: "unique-instance-id"
    },
    role: "node" | "operator",
    scopes: ["operator.admin", "operator.approvals"],
    caps: ["canvas", "camera", "screen"],
    commands: ["camera.snap", "canvas.present"],
    permissions: { "camera": true, "microphone": true },
    device: {
      id: "<device-id-sha256>",
      publicKey: "<base64url-encoded>",
      signature: "<base64url-encoded>",
      signedAt: 1739424000000,
      nonce: "<optional-challenge-nonce>"
    },
    auth: {
      token: "<gateway-token-or-device-token>",
      password: "<optional-password>"
    },
    locale: "en-US",
    userAgent: "OpenClawAndroid/2026.2.10 (Android 14; SDK 34)"
  }
}
```

### 2.3 帧格式

**请求帧 (RequestFrame)**:

```json
{ "type": "req", "id": "uuid-1234", "method": "chat.send", "params": { ... } }
```

**响应帧 (ResponseFrame)**:

```json
{ "type": "res", "id": "uuid-1234", "ok": true, "payload": { ... } }
```

**事件帧 (EventFrame)**:

```json
{ "type": "event", "event": "chat", "payload": { ... }, "seq": 42 }
```

### 2.4 设备身份认证 Payload 格式

定义于 `src/gateway/device-auth.ts`:

```typescript
// v1 格式 (无 nonce)
"v1|<deviceId>|<clientId>|<clientMode>|<role>|<scopes>|<signedAtMs>|<token>";

// v2 格式 (带 nonce)
"v2|<deviceId>|<clientId>|<clientMode>|<role>|<scopes>|<signedAtMs>|<token>|<nonce>";
```

---

## 3. 各客户端构建过程对比

### 3.1 Web UI 构建

**构建工具链**:

- Vite 7.3.1 (ESM bundler)
- TypeScript (ESM modules)
- Lit 3.3.2 (Web Components)

**核心构建文件**:

```
ui/
├── package.json          # 依赖声明
├── vite.config.ts        # Vite 配置
└── src/
    ├── main.ts           # 入口点
    └── ui/
        ├── gateway.ts        # WebSocket 客户端
        ├── device-identity.ts # 设备身份
        ├── app.ts            # 主应用组件
        └── app-gateway.ts    # 连接管理
```

**构建命令**:

```bash
cd ui
pnpm install
pnpm build  # 输出到 ../dist/control-ui/
```

**连接流程** (`ui/src/ui/gateway.ts`):

```typescript
class GatewayBrowserClient {
  constructor(private opts: GatewayBrowserClientOptions) {}

  // 1. 创建 WebSocket 连接
  private connect() {
    this.ws = new WebSocket(this.opts.url);
    this.ws.addEventListener("open", () => this.queueConnect());
    this.ws.addEventListener("message", (ev) => this.handleMessage(String(ev.data)));
  }

  // 2. 发送 connect 请求
  private async sendConnect() {
    const deviceIdentity = await loadOrCreateDeviceIdentity();
    const payload = buildDeviceAuthPayload({
      deviceId: deviceIdentity.deviceId,
      clientId: this.opts.clientName ?? "openclaw-control-ui",
      clientMode: this.opts.mode ?? "webchat",
      role: "operator",
      scopes: ["operator.admin", "operator.approvals", "operator.pairing"],
      signedAtMs: Date.now(),
      token: authToken,
      nonce: this.connectNonce,
    });
    const signature = await signDevicePayload(deviceIdentity.privateKey, payload);
    // ... 发送 connect 请求
  }

  // 3. 发送请求
  request<T>(method: string, params?: unknown): Promise<T> {
    const id = generateUUID();
    const frame = { type: "req", id, method, params };
    this.ws.send(JSON.stringify(frame));
    return pendingPromise;
  }
}
```

**设备身份存储**: `localStorage` (key: `openclaw-device-identity-v1`)

**限制**: 需要 HTTPS 环境才能使用 `crypto.subtle` 进行设备身份签名。

### 3.2 iOS 构建

**构建工具链**:

- Xcode 16+ / xcodebuild
- XcodeGen (项目生成)
- Swift Package Manager

**核心构建文件**:

```
apps/ios/
├── project.yml           # XcodeGen 配置
└── Sources/
    ├── OpenClawApp.swift      # 入口点
    ├── Gateway/
    │   ├── GatewayConnectionController.swift  # 连接管理
    │   └── GatewayConnectConfig.swift         # 双会话配置
    └── Model/
        └── NodeAppModel.swift                 # 应用状态

apps/shared/OpenClawKit/Sources/OpenClawKit/
├── GatewayChannel.swift       # WebSocket 客户端
├── GatewayNodeSession.swift   # Node 会话管理
├── DeviceIdentity.swift       # 设备身份
└── Capabilities.swift         # 能力定义
```

**构建命令**:

```bash
cd apps/ios
xcodegen generate
xcodebuild -scheme OpenClaw -configuration Release -destination 'generic/platform=iOS'
```

**连接流程** (`apps/shared/OpenClawKit/Sources/OpenClawKit/GatewayChannel.swift`):

```swift
public actor GatewayChannelActor {
  private let session: WebSocketSessioning

  // 1. 创建 WebSocket Task
  public func connect() async throws {
    self.task = self.session.makeWebSocketTask(url: self.url)
    self.task?.resume()
    try await self.sendConnect()
    self.listen()
  }

  // 2. 发送 connect 请求
  private func sendConnect() async throws {
    let options = self.connectOptions ?? GatewayConnectOptions(
      role: "operator",
      scopes: ["operator.admin", "operator.approvals", "operator.pairing"],
      caps: [], commands: [], permissions: [:],
      clientId: "openclaw-macos",
      clientMode: "ui",
      clientDisplayName: InstanceIdentity.displayName
    )

    let identity = DeviceIdentityStore.loadOrCreate()
    let payload = [
      "v1" or "v2",
      identity?.deviceId ?? "",
      clientId, clientMode, role, scopes, signedAtMs, token, nonce
    ].joined(separator: "|")

    let signature = DeviceIdentityStore.signPayload(payload, identity: identity)
    // ... 发送 connect 请求
  }
}
```

**双会话模式** (`apps/ios/Sources/Gateway/GatewayConnectionController.swift`):

```swift
// Node Session (设备能力)
let connectOptions = GatewayConnectOptions(
  role: "node",
  scopes: [],
  caps: ["canvas", "screen", "camera", "voiceWake", "location",
         "device", "photos", "contacts", "calendar", "reminders", "motion"],
  commands: ["canvas.present", "camera.snap", "camera.clip", "screen.record",
             "location.get", "device.status", "photos.latest", "contacts.search", ...],
  permissions: ["camera": true, "microphone": true, ...],
  clientId: "openclaw-ios",
  clientMode: "node",
  clientDisplayName: displayName
)

// Operator Session (聊天/配置)
// role: "operator", caps: [], commands: []
```

**设备身份存储**: App 沙盒 `Application Support/OpenClaw/identity/device.json`

### 3.3 Android 构建

**构建工具链**:

- Gradle 8.x + Kotlin DSL
- Jetpack Compose
- kotlinx.serialization

**核心构建文件**:

```
apps/android/app/
├── build.gradle.kts       # Gradle 配置
└── src/main/java/ai/openclaw/android/
    ├── MainActivity.kt         # 入口 Activity
    ├── MainViewModel.kt        # ViewModel
    ├── NodeRuntime.kt          # 运行时管理
    └── gateway/
        ├── GatewaySession.kt       # WebSocket 客户端
        └── DeviceIdentityStore.kt  # 设备身份
```

**构建命令**:

```bash
cd apps/android
./gradlew assembleRelease
# 输出: app/build/outputs/apk/release/openclaw-2026.2.10-release.apk
```

**连接流程** (`apps/android/app/src/main/java/ai/openclaw/android/gateway/GatewaySession.kt`):

```kotlin
class GatewaySession(...) {
  // 1. 创建 WebSocket (OkHttp)
  private fun buildClient(): OkHttpClient {
    val builder = OkHttpClient.Builder()
    // TLS 配置...
    return builder.build()
  }

  private inner class Listener : WebSocketListener() {
    override fun onOpen(webSocket: WebSocket, response: Response) {
      scope.launch {
        val nonce = awaitConnectNonce()
        sendConnect(nonce)
      }
    }
  }

  // 2. 发送 connect 请求
  private suspend fun sendConnect(connectNonce: String?) {
    val identity = identityStore.loadOrCreate()
    val payload = buildDeviceAuthPayload(
      deviceId = identity.deviceId,
      clientId = client.id,
      clientMode = client.mode,
      role = options.role,
      scopes = options.scopes,
      signedAtMs = System.currentTimeMillis(),
      token = authToken,
      nonce = connectNonce,
    )
    val signature = identityStore.signPayload(payload, identity)
    // ... 发送 connect 请求
  }

  // 3. 发送请求
  suspend fun request(method: String, params: JsonElement?, timeoutMs: Long): RpcResponse {
    val id = UUID.randomUUID().toString()
    val frame = buildJsonObject {
      put("type", JsonPrimitive("req"))
      put("id", JsonPrimitive(id))
      put("method", JsonPrimitive(method))
      if (params != null) put("params", params)
    }
    sendJson(frame)
    return withTimeout(timeoutMs) { deferred.await() }
  }
}
```

**双会话模式** (`apps/android/app/src/main/java/ai/openclaw/android/NodeRuntime.kt`):

```kotlin
// Node Session
private fun buildNodeConnectOptions(): GatewayConnectOptions {
  return GatewayConnectOptions(
    role = "node",
    scopes = emptyList(),
    caps = buildCapabilities(),  // ["canvas", "screen", "camera", "sms", "voiceWake", "location"]
    commands = buildInvokeCommands(),
    permissions = emptyMap(),
    client = buildClientInfo(clientId = "openclaw-android", clientMode = "node"),
  )
}

// Operator Session
private fun buildOperatorConnectOptions(): GatewayConnectOptions {
  return GatewayConnectOptions(
    role = "operator",
    scopes = emptyList(),
    caps = emptyList(),
    commands = emptyList(),
    permissions = emptyMap(),
    client = buildClientInfo(clientId = "openclaw-control-ui", clientMode = "ui"),
  )
}
```

**设备身份存储**: `context.filesDir/openclaw/identity/device.json`

### 3.4 macOS 构建

**构建工具链**:

- Swift Package Manager
- Xcode 16+

**核心构建文件**:

```
apps/macos/
├── Package.swift          # SPM 配置
└── Sources/OpenClaw/
    ├── OpenClawApp.swift       # 入口点
    └── NodeMode/
        └── MacNodeModeCoordinator.swift  # Node 模式协调
```

**构建命令**:

```bash
cd apps/macos
swift build -c release
```

**特点**: macOS 应用与 iOS 共享 `OpenClawKit`，连接流程相同。

---

## 4. 相同点与差异点深度分析

### 4.1 完全相同的部分

#### 4.1.1 通信协议

| 特性     | 所有客户端                                      |
| -------- | ----------------------------------------------- |
| 协议版本 | Protocol 3                                      |
| 帧格式   | `{ type, id, method/ok, params/payload/error }` |
| 连接方法 | `connect` 请求                                  |
| 认证方式 | Ed25519 签名 + Token/Password                   |

#### 4.1.2 设备身份认证

所有客户端实现相同的 Ed25519 签名流程：

```
┌──────────────────────────────────────────────────────────────────┐
│                    设备身份认证流程                                │
├──────────────────────────────────────────────────────────────────┤
│  1. 生成 Ed25519 密钥对                                          │
│  2. 计算 deviceId = SHA256(publicKey).hex()                      │
│  3. 构建 payload = version|deviceId|clientId|mode|role|...       │
│  4. signature = Ed25519.sign(payload, privateKey)                │
│  5. 发送 { device: { id, publicKey, signature, signedAt } }      │
│  6. Gateway 验证后返回 deviceToken                               │
└──────────────────────────────────────────────────────────────────┘
```

**各平台实现**：

| 平台      | 密钥生成                      | 签名                               | 存储           |
| --------- | ----------------------------- | ---------------------------------- | -------------- |
| Web UI    | `@noble/ed25519`              | `signAsync()`                      | `localStorage` |
| iOS/macOS | `CryptoKit.Curve25519`        | `privateKey.signature(for:)`       | App Support    |
| Android   | `KeyPairGenerator("Ed25519")` | `Signature.getInstance("Ed25519")` | `filesDir`     |

#### 4.1.3 重连机制

所有客户端实现指数退避重连：

| 参数     | Web UI | iOS/macOS | Android |
| -------- | ------ | --------- | ------- |
| 初始延迟 | 800ms  | 500ms     | -       |
| 最大延迟 | 15s    | -         | -       |
| 退避因子 | 1.7x   | -         | -       |

### 4.2 差异点

#### 4.2.1 WebSocket 实现

| 平台      | 底层实现                  | 特点                               |
| --------- | ------------------------- | ---------------------------------- |
| Web UI    | 浏览器 `WebSocket` API    | 自动处理 TLS，受浏览器安全策略限制 |
| iOS/macOS | `URLSessionWebSocketTask` | 原生 Swift 并发，actor 隔离        |
| Android   | OkHttp `WebSocket`        | Kotlin 协程集成，自定义 TLS        |

#### 4.2.2 会话模式

| 客户端  | 会话模式                     | 说明                     |
| ------- | ---------------------------- | ------------------------ |
| Web UI  | 单会话 (`operator`)          | 仅用于聊天和配置管理     |
| macOS   | 双会话 (`node` + `operator`) | 支持设备能力调用         |
| iOS     | 双会话 (`node` + `operator`) | 支持相机、位置、通讯录等 |
| Android | 双会话 (`node` + `operator`) | 支持相机、位置、SMS      |

#### 4.2.3 能力 (Capabilities) 对比

```
能力对比表:
┌─────────────┬────────┬───────┬─────┬─────────┐
│ 能力        │ Web UI │ macOS │ iOS │ Android │
├─────────────┼────────┼───────┼─────┼─────────┤
│ canvas      │   ❌   │   ✅  │  ✅ │    ✅   │
│ camera      │   ❌   │   ✅  │  ✅ │    ✅   │
│ screen      │   ❌   │   ✅  │  ✅ │    ✅   │
│ voiceWake   │   ❌   │   ✅  │  ✅ │    ✅   │
│ location    │   ❌   │   ❌  │  ✅ │    ✅   │
│ device      │   ❌   │   ❌  │  ✅ │    ❌   │
│ photos      │   ❌   │   ❌  │  ✅ │    ❌   │
│ contacts    │   ❌   │   ❌  │  ✅ │    ❌   │
│ calendar    │   ❌   │   ❌  │  ✅ │    ❌   │
│ reminders   │   ❌   │   ❌  │  ✅ │    ❌   │
│ motion      │   ❌   │   ❌  │  ✅ │    ❌   │
│ sms         │   ❌   │   ❌  │  ❌ │    ✅   │
└─────────────┴────────┴───────┴─────┴─────────┘
```

#### 4.2.4 命令 (Commands) 对比

**iOS 命令集** (定义于 `apps/ios/Sources/Gateway/GatewayConnectionController.swift`):

```swift
commands: [
  // Canvas
  "canvas.present", "canvas.hide", "canvas.navigate", "canvas.eval", "canvas.snapshot",
  "canvas.a2ui.push", "canvas.a2ui.pushJSONL", "canvas.a2ui.reset",
  // Screen
  "screen.record",
  // Camera
  "camera.list", "camera.snap", "camera.clip",
  // Location
  "location.get",
  // Device
  "device.status", "device.info",
  // Photos
  "photos.latest",
  // Contacts
  "contacts.search", "contacts.add",
  // Calendar
  "calendar.events", "calendar.add",
  // Reminders
  "reminders.list", "reminders.add",
  // Motion
  "motion.activity", "motion.pedometer",
  // Talk
  "talk.pttStart", "talk.pttStop", "talk.pttCancel", "talk.pttOnce",
  // System
  "system.notify",
]
```

**Android 命令集** (定义于 `apps/android/app/src/main/java/ai/openclaw/android/NodeRuntime.kt`):

```kotlin
commands: [
  // Canvas
  "canvas.present", "canvas.hide", "canvas.navigate", "canvas.eval", "canvas.snapshot",
  "canvas.a2ui.push", "canvas.a2ui.pushJSONL", "canvas.a2ui.reset",
  // Screen
  "screen.record",
  // Camera
  "camera.snap", "camera.clip",
  // Location
  "location.get",
  // SMS
  "sms.send",
]
```

#### 4.2.5 存储机制对比

| 数据类型    | Web UI         | iOS/macOS        | Android                      |
| ----------- | -------------- | ---------------- | ---------------------------- |
| Gateway URL | `localStorage` | `UserDefaults`   | `SharedPreferences`          |
| Token       | `localStorage` | `Keychain`       | `EncryptedSharedPreferences` |
| 设备身份    | `localStorage` | App Support JSON | `filesDir` JSON              |
| 设备 Token  | `localStorage` | `Keychain`       | `EncryptedSharedPreferences` |

---

## 5. 二次开发接入指南

### 5.1 新增 Web UI 功能

#### 步骤 1: 创建视图组件

在 `ui/src/ui/views/` 创建新文件：

```typescript
// ui/src/ui/views/my-feature.ts
import { html, type HTMLTemplateResult } from "lit";
import type { OpenClawApp } from "./app.ts";

export function renderMyFeature(app: OpenClawApp): HTMLTemplateResult {
  return html`
    <div class="my-feature">
      <h2>My Feature</h2>
      <button @click=${() => handleMyAction(app)}>Do Something</button>
    </div>
  `;
}

async function handleMyAction(app: OpenClawApp) {
  const result = await app.gateway?.request("my.method", { param: "value" });
  console.log("Result:", result);
}
```

#### 步骤 2: 注册导航 Tab

修改 `ui/src/ui/navigation.ts`:

```typescript
export const TABS = [
  "chat",
  "sessions",
  "agents",
  "nodes",
  "config",
  "logs",
  "my-feature", // 新增
] as const;

export type Tab = (typeof TABS)[number];
```

#### 步骤 3: 添加渲染逻辑

修改 `ui/src/ui/app-render.ts`:

```typescript
import { renderMyFeature } from "./views/my-feature.ts";

// 在 renderApp 函数中添加
case "my-feature":
  return renderMyFeature(this);
```

#### 步骤 4: 添加样式 (可选)

修改 `ui/src/styles/components.css`:

```css
.my-feature {
  padding: 1rem;
}
```

### 5.2 新增原生客户端能力 (iOS/Android)

#### 步骤 1: 定义能力枚举

在 `apps/shared/OpenClawKit/Sources/OpenClawKit/Capabilities.swift` 添加：

```swift
public enum OpenClawCapability: String, Codable, Sendable {
    // ... 现有能力
    case myFeature  // 新增
}
```

#### 步骤 2: 定义命令枚举

创建新文件 `apps/shared/OpenClawKit/Sources/OpenClawKit/MyFeatureCommands.swift`:

```swift
import Foundation

public enum OpenClawMyFeatureCommand: String, Codable, Sendable {
    case doSomething = "myfeature.do"
    case getSomething = "myfeature.get"
}
```

#### 步骤 3: iOS 实现命令处理

修改 `apps/ios/Sources/Capabilities/NodeCapabilityRouter.swift`:

```swift
private func handleInvoke(_ req: BridgeInvokeRequest) async -> BridgeInvokeResponse {
    do {
        let command = req.command
        switch command {
        // ... 现有命令

        case OpenClawMyFeatureCommand.doSomething.rawValue:
            return try await handleMyFeatureDo(req)

        case OpenClawMyFeatureCommand.getSomething.rawValue:
            return try await handleMyFeatureGet(req)

        default:
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: OpenClawNodeError(code: .invalidRequest, message: "unknown command")
            )
        }
    } catch {
        // 错误处理
    }
}

private func handleMyFeatureDo(_ req: BridgeInvokeRequest) async throws -> BridgeInvokeResponse {
    // 解析参数
    let params = try decodeParams(req.paramsJSON)
    // 执行逻辑
    let result = try await myFeatureService.doSomething(params)
    // 返回结果
    return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: result)
}
```

#### 步骤 4: 更新能力声明

修改 `apps/ios/Sources/Gateway/GatewayConnectionController.swift`:

```swift
private func currentCaps() -> [String] {
    var caps = [OpenClawCapability.canvas.rawValue, ...]

    // 添加新能力
    if myFeatureEnabled {
        caps.append(OpenClawCapability.myFeature.rawValue)
    }

    return caps
}

private func currentCommands() -> [String] {
    var commands: [String] = [...]

    // 添加新命令
    if myFeatureEnabled {
        commands.append(OpenClawMyFeatureCommand.doSomething.rawValue)
        commands.append(OpenClawMyFeatureCommand.getSomething.rawValue)
    }

    return commands
}
```

#### 步骤 5: Android 实现

修改 `apps/android/app/src/main/java/ai/openclaw/android/protocol/OpenClawProtocolConstants.kt`:

```kotlin
enum class OpenClawCapability(val rawValue: String) {
    // ... 现有能力
    MyFeature("myFeature"),
}

enum class OpenClawMyFeatureCommand(val rawValue: String) {
    DoSomething("myfeature.do"),
    GetSomething("myfeature.get"),
}
```

修改 `apps/android/app/src/main/java/ai/openclaw/android/NodeRuntime.kt`:

```kotlin
private fun buildCapabilities(): List<String> = buildList {
    // ... 现有能力
    if (myFeatureEnabled) add(OpenClawCapability.MyFeature.rawValue)
}

private fun buildInvokeCommands(): List<String> = buildList {
    // ... 现有命令
    if (myFeatureEnabled) {
        add(OpenClawMyFeatureCommand.DoSomething.rawValue)
        add(OpenClawMyFeatureCommand.GetSomething.rawValue)
    }
}

// 实现命令处理
suspend fun handleMyFeatureInvoke(req: InvokeRequest): InvokeResult {
    return when (req.command) {
        OpenClawMyFeatureCommand.DoSomething.rawValue -> {
            val params = parseParams(req.paramsJson)
            val result = myFeatureService.doSomething(params)
            InvokeResult.ok(payloadJson = result)
        }
        // ...
        else -> InvokeResult.error("UNKNOWN_COMMAND", "Unknown command: ${req.command}")
    }
}
```

### 5.3 创建全新客户端

#### 必需实现

1. **WebSocket 客户端**
2. **设备身份生成** (Ed25519)
3. **协议帧序列化**
4. **请求-响应匹配**
5. **事件处理**

#### 最小实现示例 (TypeScript)

```typescript
import { buildDeviceAuthPayload } from "./device-auth";

// 1. 设备身份
interface DeviceIdentity {
  deviceId: string;
  publicKey: string;
  privateKey: string;
}

async function generateIdentity(): Promise<DeviceIdentity> {
  const privateKey = crypto.getRandomValues(new Uint8Array(32));
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  const deviceId = bufferToHex(await crypto.subtle.digest("SHA-256", publicKey));
  return {
    deviceId,
    publicKey: base64UrlEncode(publicKey),
    privateKey: base64UrlEncode(privateKey),
  };
}

// 2. WebSocket 客户端
class MyClient {
  private ws: WebSocket;
  private pending = new Map<string, { resolve: Function; reject: Function }>();

  constructor(
    private url: string,
    private token?: string,
  ) {}

  async connect(identity: DeviceIdentity): Promise<void> {
    this.ws = new WebSocket(this.url);

    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    // 发送 connect
    const signedAtMs = Date.now();
    const payload = buildDeviceAuthPayload({
      deviceId: identity.deviceId,
      clientId: "my-client",
      clientMode: "ui",
      role: "operator",
      scopes: ["operator.admin"],
      signedAtMs,
      token: this.token,
    });
    const signature = await ed25519.signAsync(new TextEncoder().encode(payload), privateKey);

    const response = await this.request("connect", {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "my-client",
        version: "1.0.0",
        platform: "custom",
        mode: "ui",
      },
      role: "operator",
      scopes: ["operator.admin"],
      device: {
        id: identity.deviceId,
        publicKey: identity.publicKey,
        signature,
        signedAt: signedAtMs,
      },
      auth: this.token ? { token: this.token } : undefined,
    });

    console.log("Connected:", response);
  }

  request<T>(method: string, params?: unknown): Promise<T> {
    const id = crypto.randomUUID();
    const frame = JSON.stringify({ type: "req", id, method, params });

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(frame);
    });
  }

  private handleMessage(data: string) {
    const frame = JSON.parse(data);
    if (frame.type === "res") {
      const pending = this.pending.get(frame.id);
      if (pending) {
        this.pending.delete(frame.id);
        if (frame.ok) pending.resolve(frame.payload);
        else pending.reject(new Error(frame.error?.message));
      }
    } else if (frame.type === "event") {
      this.handleEvent(frame);
    }
  }

  private handleEvent(frame: any) {
    console.log("Event:", frame.event, frame.payload);
  }
}

// 使用
const identity = await generateIdentity();
const client = new MyClient("ws://gateway:18789", "my-token");
await client.connect(identity);
const result = await client.request("config.get", { path: "agents" });
```

### 5.4 Gateway 端配置

#### 注册客户端 ID

确保在 `src/gateway/protocol/client-info.ts` 中注册：

```typescript
export const GATEWAY_CLIENT_IDS = {
  // ... 现有 ID
  MY_CLIENT: "my-client",
} as const;
```

#### 配置认证

在 `openclaw.yaml`:

```yaml
gateway:
  token: "your-secure-token"
  # 或
  password: "your-password"

  # 如果不使用设备身份 (仅用于开发)
  controlUi:
    allowInsecureAuth: true
```

---

## 6. 附录：关键源码路径

### 6.1 协议定义

| 文件                                              | 说明                  |
| ------------------------------------------------- | --------------------- |
| `src/gateway/protocol/client-info.ts`             | 客户端 ID 和模式定义  |
| `src/gateway/protocol/schema/frames.ts`           | 帧结构定义            |
| `src/gateway/protocol/schema/protocol-schemas.ts` | 所有方法 schema       |
| `src/gateway/device-auth.ts`                      | 设备认证 payload 构建 |

### 6.2 Web UI

| 文件                           | 说明             |
| ------------------------------ | ---------------- |
| `ui/src/ui/gateway.ts`         | WebSocket 客户端 |
| `ui/src/ui/device-identity.ts` | 设备身份         |
| `ui/src/ui/app.ts`             | 主应用           |
| `ui/src/ui/app-gateway.ts`     | 连接管理         |
| `ui/src/ui/navigation.ts`      | 导航配置         |

### 6.3 iOS/macOS 共享库

| 文件                                                                   | 说明             |
| ---------------------------------------------------------------------- | ---------------- |
| `apps/shared/OpenClawKit/Sources/OpenClawKit/GatewayChannel.swift`     | WebSocket 客户端 |
| `apps/shared/OpenClawKit/Sources/OpenClawKit/GatewayNodeSession.swift` | Node 会话        |
| `apps/shared/OpenClawKit/Sources/OpenClawKit/DeviceIdentity.swift`     | 设备身份         |
| `apps/shared/OpenClawKit/Sources/OpenClawKit/Capabilities.swift`       | 能力定义         |
| `apps/shared/OpenClawKit/Sources/OpenClawKit/*Commands.swift`          | 命令定义         |

### 6.4 iOS App

| 文件                                                         | 说明     |
| ------------------------------------------------------------ | -------- |
| `apps/ios/Sources/OpenClawApp.swift`                         | 入口点   |
| `apps/ios/Sources/Gateway/GatewayConnectionController.swift` | 连接管理 |
| `apps/ios/Sources/Model/NodeAppModel.swift`                  | 应用状态 |
| `apps/ios/Sources/Capabilities/NodeCapabilityRouter.swift`   | 命令路由 |

### 6.5 Android App

| 文件                                                                                       | 说明             |
| ------------------------------------------------------------------------------------------ | ---------------- |
| `apps/android/app/src/main/java/ai/openclaw/android/MainActivity.kt`                       | 入口 Activity    |
| `apps/android/app/src/main/java/ai/openclaw/android/NodeRuntime.kt`                        | 运行时管理       |
| `apps/android/app/src/main/java/ai/openclaw/android/gateway/GatewaySession.kt`             | WebSocket 客户端 |
| `apps/android/app/src/main/java/ai/openclaw/android/gateway/DeviceIdentityStore.kt`        | 设备身份         |
| `apps/android/app/src/main/java/ai/openclaw/android/protocol/OpenClawProtocolConstants.kt` | 能力和命令定义   |

### 6.6 macOS App

| 文件                           | 说明       |
| ------------------------------ | ---------- |
| `apps/macos/Package.swift`     | SPM 配置   |
| `apps/macos/Sources/OpenClaw/` | 主应用代码 |
