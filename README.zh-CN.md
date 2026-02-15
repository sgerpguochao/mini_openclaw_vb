# 🦞 OpenClaw — 个人 AI 助手

<p align="center">
  <img src="https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.png" alt="OpenClaw" width="500">
</p>

<p align="center">
  <strong>EXFOLIATE! EXFOLIATE!</strong>
</p>

<p align="center">
  <a href="https://github.com/openclaw/openclaw/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/openclaw/openclaw/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="https://github.com/openclaw/openclaw/releases"><img src="https://img.shields.io/github/v/release/openclaw/openclaw?include_prereleases&style=for-the-badge" alt="GitHub release"></a>
  <a href="https://discord.gg/clawd"><img src="https://img.shields.io/discord/1456350064065904867?label=Discord&logo=discord&logoColor=white&color=5865F2&style=for-the-badge" alt="Discord"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

**OpenClaw** 是一个运行在你自己设备上的 _个人 AI 助手_。

它可以在你已经在使用的渠道（WhatsApp、Telegram、Slack、Discord、Google Chat、Signal、iMessage、Microsoft Teams、WebChat）上回复你，还支持扩展渠道如 BlueBubbles、Matrix、Zalo 等。它可以在 macOS/iOS/Android 上说话和聆听，还可以渲染你控制的实时 Canvas。Gateway 只是控制平面——产品本身就是助手。

如果你想要一个感觉本地、快速、始终在线的个人助手，那就是它了。

[官网](https://openclaw.ai) · [文档](https://docs.openclaw.ai) · [开始使用](https://docs.openclaw.ai/start/getting-started)

---

## 特性

- 🤖 **多渠道支持**: WhatsApp、Telegram、Discord、Slack 等
- 📱 **跨平台**: macOS、iOS、Android
- 🎨 **Canvas**: 实时渲染和交互
- 🔌 **插件系统**: 灵活的扩展机制
- 🧠 **AI 运行时**: 基于 pi-agent-core
- 💾 **记忆系统**: 短期 + 长期记忆

## 快速开始

### 环境要求

- **Node.js**: ≥ 22
- **包管理器**: pnpm / npm / bun

### 安装

```bash
# 使用 pnpm（推荐）
pnpm install

# 或使用 npm
npm install

# 或使用 bun
bun install
```

### 启动

```bash
# 后台运行
./start.sh

# 或前台运行
pnpm openclaw gateway run --bind lan --port 18789
```

### 配置

运行向导进行初始配置：

```bash
pnpm openclaw onboard
```

### 配置模型

设置默认模型：

```bash
pnpm openclaw models set anthropic/claude-sonnet-4-5
pnpm openclaw models status
```

## 支持的模型

| 提供商         | 模型                      |
| -------------- | ------------------------- |
| Anthropic      | Claude 3.5, Claude 3 Opus |
| OpenAI         | GPT-4o, GPT-4             |
| Google         | Gemini Pro/Flash          |
| Amazon Bedrock | Claude, Llama             |
| Ollama         | 本地模型                  |

## 项目架构

```
Client Layer (客户端层)
    │
    ├── Web UI (TypeScript + Lit)
    ├── macOS (SwiftUI)
    ├── iOS (SwiftUI)
    └── Android (Kotlin)
           │
           ▼
Gateway Layer (网关层)
    │
    ├── 协议解析
    ├── 方法注册
    └── 安全认证
           │
           ▼
Channel Layer (通道层)
    │
    ├── Telegram
    ├── WhatsApp
    ├── Discord
    └── Slack
           │
           ▼
Agent Layer (代理层)
    │
    ├── 模型支持 (15+)
    ├── 工具系统 (三层)
    ├── 记忆系统
    └── 会话管理
```

## 文档

- [官方文档](https://docs.openclaw.ai)
- [开始使用](https://docs.openclaw.ai/start/getting-started)
- [配置模型](https://docs.openclaw.ai/concepts/models)
- [模型故障转移](https://docs.openclaw.ai/concepts/model-failover)

## 许可证

MIT License

## 相关链接

- [官网](https://openclaw.ai)
- [Discord 社区](https://discord.gg/clawd)
- [GitHub](https://github.com/openclaw/openclaw)
