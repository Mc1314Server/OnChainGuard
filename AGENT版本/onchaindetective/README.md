# OnChainGuard - AI Agent 版本

专为 OpenClaw AI Agent 设计的链上安全分析工具。

## 功能

- 🔍 **钱包调查**：多跳资金追踪、风险评分、关联地址分析
- 🛡️ **Meme 币扫描**：安全评分、Rug Pull 检测、开发者分析
- 🌐 **多链支持**：Ethereum、Solana、BSC、Base 等

## 安装

```bash
cd onchainguard-agent
npm install
```

## 配置

复制 `.env.example` 为 `.env`，填入 OKX API 密钥：

```env
OKX_API_KEY=your_api_key
OKX_SECRET_KEY=your_secret_key
OKX_PASSPHRASE=your_passphrase
```

## 使用

```bash
# 调查钱包
node onchainguard.js investigate 0x... ethereum 2

# 扫描代币
node onchainguard.js scan 0xtoken... solana

# 获取新 Meme 列表
node onchainguard.js list solana NEW
```

## 作为模块调用

```javascript
const { investigateWallet, scanMemeToken } = require('./onchainguard');

const result = await investigateWallet('0x...', ['ethereum'], 2);
const scan = await scanMemeToken('0xtoken...', 'solana');
```
