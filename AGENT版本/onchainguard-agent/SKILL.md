---
name: onchainguard
description: "AI 链上侦探 & Meme 币安全扫描器 - 专为 OpenClaw AI Agent 设计。追踪黑客/诈骗资金流向，多跳资金追踪，风险评分，生成调查报告。扫描 Meme 币安全性，检测 Rug Pull、貔貅盘、狙击手。支持查询：'调查这个钱包 0x...', '扫描这个代币安全性', '追踪资金流向', '检查这个 Meme 币是不是貔貅盘', '这个开发者有黑历史吗'"
license: MIT
metadata:
  author: Mc1314Server
  version: "1.0.0"
  homepage: "https://github.com/Mc1314Server/OnChainGuard"
---

# OnChainGuard - AI 链上侦探

一个专为 OpenClaw AI Agent 设计的链上安全分析工具，基于 OKX OnchainOS Skills API。

## 功能特性

### 🔍 AI 链上侦探
- **多跳资金追踪**：1-3 层深度追踪可疑地址的资金流向
- **风险评分**：7 项因子综合评估地址风险等级（LOW/MEDIUM/HIGH）
- **关联地址分析**：自动发现与目标地址交互的钱包
- **聪明钱信号**：整合 Smart Money、巨鲸、KOL 交易信号
- **调查报告导出**：生成完整分析报告

### 🛡️ Meme 币安全扫描
- **安全评分**：综合分析代币合约安全性（0-100分）
- **开发者分析**：追踪开发者历史项目、Rug Pull 记录
- **捆绑/狙击手检测**：识别 Bundle 和 Sniper 行为
- **持有者风险分布**：分析持有者集中度和风险标记

### 🌐 多链支持
Ethereum、Solana、BSC、Base、Arbitrum、Polygon、Tron、Avalanche

## 使用方法

### CLI 命令

```bash
# 调查钱包地址
onchainguard investigate <address> [chain] [depth]

# 扫描 Meme 代币安全性
onchainguard scan <token_address> [chain]

# 获取新 Meme 代币列表
onchainguard list [chain] [stage]
```

### 示例

```bash
# 调查以太坊地址，追踪深度 2
onchainguard investigate 0x1234567890abcdef... ethereum 2

# 扫描 Solana 上的 Meme 代币
onchainguard scan ABC123... solana

# 获取 Solana 上新发布的 Meme 代币
onchainguard list solana NEW
```

### 在 AI Agent 中使用

用户可以通过自然语言与 AI Agent 交互：

```
调查这个钱包：0x1234...abcd
追踪这个地址的资金流向
分析 0xabcd...efgh 的风险等级

扫描这个代币：0xtoken...address
检查这个 Meme 币是不是貔貅盘
这个代币安全吗？

这个代币的开发者有黑历史吗？
查看这个代币的开发者信息
```

## 依赖

需要配置 OKX OnchainOS API 密钥。

### 环境变量配置

在 `.env` 文件中配置：

```env
OKX_API_KEY=your_api_key
OKX_SECRET_KEY=your_secret_key
OKX_PASSPHRASE=your_passphrase
```

## 输出示例

### 钱包调查结果

```json
{
  "target": {
    "address": "0x...",
    "totalValue": 125000,
    "riskTokenCount": 2,
    "holdings": [...]
  },
  "risk": {
    "score": 45,
    "level": "MEDIUM",
    "factors": ["2 个风险代币", "跨 4 个 DEX 活动频繁"]
  },
  "summary": {
    "connectedAddresses": 23,
    "totalTrades": 156
  }
}
```

### Meme 代币扫描结果

```json
{
  "token": {
    "symbol": "PEPE",
    "marketCap": 50000000,
    "holders": 12000
  },
  "security": {
    "score": 75,
    "level": "SAFE",
    "warnings": [],
    "dangers": []
  },
  "developer": {
    "rugPullCount": 0,
    "totalTokens": 3
  }
}
```

## License

MIT
