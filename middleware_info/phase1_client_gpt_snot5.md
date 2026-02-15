# OpenClaw 客户端层详细分析 (Phase 1)

## 1. 客户端概览

OpenClaw 支持 4 种客户端类型：

- **Web UI** (`ui/`): 基于 Lit (Web Components) 的浏览器端控制界面
- **macOS App** (`apps/macos/`): SwiftUI 原生应用，包含菜单栏集成和语音唤醒
- **iOS App** (`apps/ios/`): SwiftUI 原生应用，支持相机、位置、通讯录等设备能力
- **Android App** (`apps/android/`): Kotlin + Jetpack Compose 原生应用

所有客户端通过 **WebSocket** 连接到中心化的 **Gateway** 服务，使用统一的 **JSON-RPC 协议**。

---

## 2. 共同架构特征

### 2.1 统一通信协议

所有客户端使用相同的 Gateway 协议，定义在 `src/gateway/protocol/`：

**连接参数** (`ConnectParamsSchema`，见 `src/gateway/protocol/schema/frames.ts`):

```typescript
{
  minProtocol: 3,
  maxProtocol: 3,
  client: {
    id: "openclaw-ios" | "openclaw-android" | "openclaw-macos" | "openclaw-control-ui",
    version: "2026.2.10",
    platform: "iOS 18.0.0" | "android" | "macOS 15.0.0" | "web",
    mode: "node" | "webchat" | "ui",
    instanceId: "unique-device-id"
  },
  role: "node" | "operator",
  scopes: [],
  caps: ["canvas", "camera", "screen", ...],
  commands: ["camera.snap", "canvas.present", ...],
  device: { id, publicKey, signature, signedAt },
  auth: { token?, password? }
}
```

**帧格式**:

- **RequestFrame**: `{ type: "req", id, method, params }`
- **ResponseFrame**: `{ type: "res", id, ok, payload?, error? }`
- **EventFrame**: `{ type: "event", event, payload?, seq }`

### 2.2 设备身份认证 (Device Identity)

所有客户端实现了 **Ed25519** 签名的设备身份系统：

- **Web UI**: `ui/src/ui/device-identity.ts` - 使用 `@noble/ed25519` + `crypto.subtle`
- **iOS/macOS**: `apps/shared/OpenClawKit/Sources/OpenClawKit/DeviceIdentity.swift` - 使用 `CryptoKit.Curve25519.Signing`
- **Android**: `apps/android/app/src/main/java/ai/openclaw/android/gateway/DeviceIdentityStore.kt` - 使用 `java.security.KeyPairGenerator("Ed25519")`

**流程**:

1. 生成 Ed25519 密钥对
2. 计算 `deviceId = SHA256(publicKey)`
3. 签名 `payload = deviceId + clientId + role + scopes + timestamp + token + nonce`
4. 发送 `{ device: { id, publicKey, signature, signedAt } }` 到 Gateway
5. Gateway 验证签名后颁发 `deviceToken`

### 2.3 双会话模式 (iOS/Android)

原生移动应用维护 **两个并行的 WebSocket 连接**：

1. **Node Session** (`role: "node"`)
   - 用途: 设备能力调用 (`node.invoke.*`)
   - 能力: `canvas`, `camera`, `screen`, `location`, `contacts`, `photos`, `calendar`, `reminders`, `motion`
   - 命令: `camera.snap`, `camera.clip`, `canvas.present`, `screen.record`, ...

2. **Operator Session** (`role: "operator"`)
   - 用途: 聊天、配置、日志查看
   - 方法: `chat.send`, `chat.history`, `config.get`, `config.set`, `logs.stream`, ...

**实现**:

- iOS: `apps/ios/Sources/Gateway/GatewayConnectConfig.swift`
- Android: `apps/android/app/src/main/java/ai/openclaw/android/NodeRuntime.kt` (L525-L547)

---

## 3. 各客户端详细对比

### 3.1 Web UI

**技术栈**:

- Lit 3.3 (Web Components)
- Vite 7.3 (构建工具)
- TypeScript (ESM)
- DOMPurify + Marked (Markdown 渲染)

**核心文件**:

- `ui/src/ui/gateway.ts` - `GatewayBrowserClient` WebSocket 客户端
- `ui/src/ui/app.ts` - 主应用组件 (`OpenClawApp`)
- `ui/src/ui/app-gateway.ts` - 连接管理和事件处理
- `ui/src/ui/device-identity.ts` - 设备身份生成

**构建**:

```bash
cd ui
pnpm install
pnpm build  # 输出到 dist/control-ui/
```

**配置**:

- Gateway URL: 通过 UI 输入框配置 (例如 `ws://100.x.y.z:18789`)
- Token/Password: 存储在 `localStorage`
- 设备身份: 存储在 `localStorage` (`openclaw-device-identity-v1`)

**特点**:

- 纯浏览器端，无需安装
- 支持 HTTPS/WSS (Tailscale Serve)
- 不支持 HTTP 环境下的设备身份 (需要 `crypto.subtle`)

### 3.2 macOS App

**技术栈**:

- SwiftUI (macOS 15+)
- Swift 6.0 (Strict Concurrency)
- Swift Package Manager
- Sparkle (自动更新)
- Peekaboo (浏览器自动化)

**核心文件**:

- `apps/macos/Sources/OpenClaw/` - 主应用代码
- `apps/shared/OpenClawKit/` - 共享 Swift 库 (协议、Gateway 客户端)
- `apps/macos/Package.swift` - 依赖声明

**构建**:

```bash
cd apps/macos
swift build
# 或使用 Xcode
xcodebuild -scheme OpenClaw -configuration Release
```

**配置**:

- Gateway 发现: mDNS (`_openclaw-gw._tcp`) + Tailscale DNS
- Token: 存储在 Keychain
- 设备身份: `~/Library/Application Support/OpenClaw/identity/device.json`

**特点**:

- 菜单栏常驻应用
- 语音唤醒 (Voice Wake)
- 本地 Gateway 托管 (内置 Node.js 运行时)
- 屏幕录制、浏览器自动化 (Peekaboo)

### 3.3 iOS App

**技术栈**:

- SwiftUI (iOS 18+)
- Swift 6.0
- XcodeGen (项目生成)
- OpenClawKit (共享库)

**核心文件**:

- `apps/ios/Sources/` - 应用源码
- `apps/ios/Sources/Gateway/GatewayConnectionController.swift` - Gateway 连接管理
- `apps/ios/Sources/Model/NodeAppModel.swift` - 应用状态模型
- `apps/ios/project.yml` - XcodeGen 配置

**构建**:

```bash
cd apps/ios
xcodegen generate
xcodebuild -scheme OpenClaw -configuration Release
```

**配置**:

- Gateway 发现: mDNS + Tailscale
- Token: 存储在 Keychain (`GatewaySettingsStore`)
- 设备身份: App 沙盒 `Application Support/OpenClaw/identity/device.json`
- 权限: 相机、麦克风、位置、通讯录、日历、提醒事项、照片库、语音识别

**能力** (`GatewayConnectionController.swift` L458-L484):

```swift
caps: ["canvas", "screen", "camera", "voiceWake", "location",
       "device", "photos", "contacts", "calendar", "reminders", "motion"]
commands: ["canvas.present", "camera.snap", "camera.clip", "screen.record",
           "location.get", "device.status", "photos.latest", "contacts.search", ...]
```

### 3.4 Android App

**技术栈**:

- Kotlin 1.9 + Jetpack Compose
- Gradle 8.x
- OkHttp 5.3 (WebSocket)
- kotlinx.serialization (JSON)

**核心文件**:

- `apps/android/app/src/main/java/ai/openclaw/android/` - 应用代码
- `apps/android/app/src/main/java/ai/openclaw/android/gateway/GatewaySession.kt` - WebSocket 客户端
- `apps/android/app/src/main/java/ai/openclaw/android/NodeRuntime.kt` - 运行时管理
- `apps/android/app/build.gradle.kts` - Gradle 配置

**构建**:

```bash
cd apps/android
./gradlew assembleRelease
# 输出: app/openclaw-2026.2.10-release.apk
```

**配置**:

- Gateway 发现: mDNS (dnsjava 3.6.4)
- Token: 加密存储 (`androidx.security.security-crypto`)
- 设备身份: `context.filesDir/openclaw/identity/device.json`
- 权限: 相机、位置、SMS、录音、通知

**能力** (`NodeRuntime.kt` L475-L487):

```kotlin
caps: ["canvas", "screen", "camera", "sms", "voiceWake", "location"]
commands: ["canvas.present", "canvas.hide", "canvas.navigate", "canvas.eval",
           "canvas.snapshot", "canvas.a2ui.push", "screen.record",
           "camera.snap", "camera.clip", "location.get", "sms.send"]
```

---

## 4. 二次开发接入指南

### 4.1 新增 Web UI 功能

**步骤**:

1. 在 `ui/src/ui/views/` 添加新视图组件
2. 在 `ui/src/ui/controllers/` 添加控制器逻辑
3. 在 `ui/src/ui/navigation.ts` 注册新 Tab
4. 调用 Gateway 方法: `app.gateway.request(method, params)`

**示例** (添加新 Tab):

```typescript
// ui/src/ui/views/my-feature.ts
import { html } from 'lit';
export function renderMyFeature(app: OpenClawApp) {
  return html`<div>My Feature</div>`;
}

// ui/src/ui/navigation.ts
export const TABS = [..., 'my-feature'] as const;

// ui/src/ui/app-render.ts
case 'my-feature': return renderMyFeature(this);
```

### 4.2 新增原生客户端能力 (iOS/Android)

**步骤**:

1. 在 `apps/shared/OpenClawKit/Sources/OpenClawKit/` 定义新命令枚举:

   ```swift
   // MyFeatureCommands.swift
   public enum OpenClawMyFeatureCommand: String, Codable, Sendable {
       case doSomething = "myfeature.do"
   }
   ```

2. 在 `apps/shared/OpenClawKit/Sources/OpenClawKit/Capabilities.swift` 添加能力:

   ```swift
   public enum OpenClawCapability: String, Codable, Sendable {
       case myFeature
   }
   ```

3. iOS: 在 `apps/ios/Sources/Capabilities/NodeCapabilityRouter.swift` 实现命令处理
4. Android: 在 `apps/android/app/src/main/java/ai/openclaw/android/NodeRuntime.kt` 添加能力和命令
5. 更新 `currentCaps()` 和 `currentCommands()` 方法

### 4.3 创建新客户端 (例如 Web Extension)

**必需实现**:

1. **WebSocket 客户端** (参考 `ui/src/ui/gateway.ts`):
   - 连接到 `ws://gateway-host:18789`
   - 发送 `connect` 请求 (包含 `ConnectParams`)
   - 处理 `hello-ok` 响应
   - 监听 `event` 帧

2. **设备身份** (参考 `ui/src/ui/device-identity.ts`):
   - 生成 Ed25519 密钥对
   - 计算 `deviceId = SHA256(publicKey)`
   - 签名连接 payload
   - 存储 `deviceToken`

3. **协议实现**:
   - 请求: `{ type: "req", id: uuid(), method, params }`
   - 响应处理: 匹配 `id` 并 resolve Promise
   - 事件订阅: 监听 `type: "event"` 帧

4. **配置存储**:
   - Gateway URL
   - Token/Password
   - 设备身份 (deviceId, publicKey, privateKey)

**最小示例** (TypeScript):

```typescript
import { GatewayBrowserClient } from "./gateway.ts";

const client = new GatewayBrowserClient({
  url: "ws://100.x.y.z:18789",
  token: "your-token",
  clientName: "my-client",
  mode: "ui",
  onHello: (hello) => console.log("Connected", hello),
  onEvent: (evt) => console.log("Event", evt),
});

client.start();

// 发送请求
const result = await client.request("config.get", { path: "agents" });
```

### 4.4 配置要求

**Gateway 端配置** (`src/gateway/server-methods.ts`):

- 确保客户端 `clientId` 在 `GATEWAY_CLIENT_IDS` 中注册 (见 `src/gateway/protocol/client-info.ts`)
- 配置 `gateway.controlUi.allowInsecureAuth` (如果不使用设备身份)
- 设置 `gateway.token` 或 `gateway.password` 用于认证

**客户端配置**:

- **Web UI**: 通过 UI 输入 Gateway URL + Token
- **原生应用**:
  - 自动发现: mDNS (`_openclaw-gw._tcp`)
  - 手动配置: Host + Port + TLS
  - Token 存储: Keychain (iOS/macOS) / EncryptedSharedPreferences (Android)

---

## 5. 关键差异总结

| 特性             | Web UI             | macOS               | iOS                 | Android             |
| ---------------- | ------------------ | ------------------- | ------------------- | ------------------- |
| **语言**         | TypeScript         | Swift               | Swift               | Kotlin              |
| **UI 框架**      | Lit                | SwiftUI             | SwiftUI             | Compose             |
| **WebSocket**    | 浏览器 `WebSocket` | `URLSession`        | `URLSession`        | OkHttp              |
| **设备身份**     | `@noble/ed25519`   | `CryptoKit`         | `CryptoKit`         | `java.security`     |
| **角色**         | `operator`         | `node` + `operator` | `node` + `operator` | `node` + `operator` |
| **能力**         | 无                 | 10+                 | 11+                 | 6+                  |
| **本地 Gateway** | ❌                 | ✅                  | ❌                  | ❌                  |
| **语音唤醒**     | ❌                 | ✅                  | ✅                  | ✅                  |
| **相机**         | ❌                 | ✅                  | ✅                  | ✅                  |
| **位置**         | ❌                 | ❌                  | ✅                  | ✅                  |
| **通讯录**       | ❌                 | ❌                  | ✅                  | ❌                  |
| **日历**         | ❌                 | ❌                  | ✅                  | ❌                  |
| **SMS**          | ❌                 | ❌                  | ❌                  | ✅                  |

---

## 6. 调试和测试

**Web UI**:

```bash
cd ui
pnpm dev  # http://localhost:5173
```

**iOS**:

```bash
cd apps/ios
xcodegen generate
open OpenClaw.xcodeproj
# Xcode: Run on Simulator/Device
```

**Android**:

```bash
cd apps/android
./gradlew installDebug
adb logcat | grep OpenClaw
```

**macOS**:

```bash
cd apps/macos
swift run OpenClaw
# 或使用 Xcode
```

**Gateway 日志**:

```bash
tail -f ~/.openclaw/logs/gateway.log
# 或通过 Web UI: Debug Tab
```

---

## 7. 参考文档

- Gateway 协议: `src/gateway/protocol/`
- 客户端 ID: `src/gateway/protocol/client-info.ts`
- 设备认证: `src/gateway/device-auth.ts`
- 共享 Swift 库: `apps/shared/OpenClawKit/`
- Android 能力与命令: `apps/android/app/src/main/java/ai/openclaw/android/NodeRuntime.kt`
