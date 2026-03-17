---
name: onchaindetective
description: "AI 链上侦探 & Meme 币安全扫描器 - 基于 Binance Web3 Skills API。追踪钱包持仓，代币安全审计，Meme 代币扫描，热门话题发现。支持查询：'调查这个钱包 0x...', '扫描这个代币安全性', '获取热门 Meme 代币', '检查这个代币是不是貔貅盘'"
license: MIT
metadata:
  author: YOUR_GITHUB_USERNAME
  version: "1.0.0"
  homepage: "https://github.com/binance/binance-skills-hub"
---

# OnChainDetective - AI 链上侦探

一个基于 Binance Web3 Skills API 的链上安全分析工具，为 AI Agent 提供强大的区块链数据分析能力。

## 功能特性

### 🔍 AI 链上侦探
- **钱包持仓查询**：查询任意钱包地址的代币持仓
- **资金流向追踪**：分析钱包资产分布
- **风险评分**：综合评估地址风险等级（LOW/MEDIUM/HIGH）

### 🛡️ 代币安全扫描
- **安全审计**：检测 Honeypot、Rug Pull、诈骗合约
- **风险评估**：返回风险等级（LOW/MEDIUM/HIGH）
- **税率检测**：检查买入/卖出税率
- **合约验证**：验证合约代码是否开源

### 🚀 Meme 代币追踪
- **新币发现**：获取 Pump.fun、Four.meme 等平台新发行的 Meme 代币
- **迁移监控**：追踪即将迁移到 DEX 的代币
- **开发者分析**：分析开发者历史记录

### 🔥 热门话题
- **AI 话题发现**：自动发现市场热门叙事
- **资金流向**：追踪话题相关代币的净流入
- **KOL/聪明钱追踪**：识别 KOL 和聪明钱持有的代币

## 支持的链

| 链 | chainId |
|---|---------|
| BSC | 56 |
| Solana | CT_501 |
| Ethereum | 1 |
| Base | 8453 |

## 使用方法

### CLI 命令

```bash
# 调查钱包地址
onchaindetective investigate <address> [chain] [depth]

# 扫描代币安全性
onchaindetective scan <token_address> [chain]

# 获取 Meme 代币列表
onchaindetective list [chain] [stage]

# 获取热门话题
onchaindetective topics [chain] [stage]

# 获取交易信号
onchaindetective signals [chain]
```

### 示例

```bash
# 调查 BSC 地址
onchaindetective investigate 0x1234567890abcdef... bsc 2

# 扫描 Solana 上的代币安全性
onchaindetective scan ABC123... solana

# 获取 Solana 上新发布的 Meme 代币
onchaindetective list solana NEW

# 获取热门话题
onchaindetective topics solana VIRAL
```

### 在 AI Agent 中使用

用户可以通过自然语言与 AI Agent 交互：

```
调查这个钱包：0x1234...abcd
查看这个地址的持仓

扫描这个代币：0xtoken...address
检查这个代币是不是貔貅盘
这个代币安全吗？

获取热门 Meme 代币
查看最新的 Meme 币
发现即将迁移的代币

获取热门话题
查看趋势叙事
```

## API 参考

本工具基于 Binance Web3 Skills API，主要使用以下接口：

### 钱包持仓查询
- **端点**: `GET /bapi/defi/v3/public/wallet-direct/buw/wallet/address/pnl/active-position-list`
- **参数**: `address`, `chainId`, `offset`

### 代币安全审计
- **端点**: `POST /bapi/defi/v1/public/wallet-direct/security/token/audit`
- **参数**: `binanceChainId`, `contractAddress`, `requestId`

### Meme Rush 列表
- **端点**: `POST /bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/rank/list`
- **参数**: `chainId`, `rankType`, `limit`, 各种过滤器

### Topic Rush 列表
- **端点**: `GET /bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/social-rush/rank/list`
- **参数**: `chainId`, `rankType`, `sort`

## 环境变量配置

Binance Web3 Skills API 是公开 API，无需配置 API Key。

如需增强功能，可在 `.env` 文件中配置：

```env
BINANCE_API_KEY=your_api_key
BINANCE_SECRET_KEY=your_secret_key
```

## 输出示例

### 钱包调查结果

```json
{
  "target": {
    "address": "0x...",
    "totalValue": 125000,
    "tokenCount": 15,
    "holdings": [...]
  },
  "risk": {
    "score": 25,
    "level": "LOW",
    "factors": []
  }
}
```

### 代币安全扫描结果

```json
{
  "token": {
    "address": "0x...",
    "chain": "bsc"
  },
  "security": {
    "riskLevelEnum": "LOW",
    "riskLevel": 1,
    "buyTax": "0",
    "sellTax": "0",
    "isVerified": true,
    "warnings": [],
    "dangers": []
  },
  "disclaimer": "⚠️ This audit result is for reference only..."
}
```

### Meme 代币列表

```json
[
  {
    "symbol": "PEPE",
    "name": "Pepe Token",
    "address": "0x...",
    "marketCap": 50000000,
    "holders": 12000,
    "progress": "85",
    "isRisky": false
  }
]
```

## 免责声明

本工具仅供信息参考，不构成任何投资建议。区块链投资存在高风险，请自行研究后做出决策。

## License

MIT
