# OnChainGuard — AI 链上侦探 & Meme 币安全扫描器

基于 **OKX OnchainOS Skills API** 构建的链上安全分析工具，提供可疑钱包追踪、多跳资金流向可视化、风险评估以及 Meme 币安全扫描等功能。

## 功能特性

### AI 链上侦探

- **多跳资金追踪**：支持 1-3 层深度追踪可疑地址的资金流向，自动发现关联地址
- **Canvas 力导向图**：交互式资金流向可视化，支持拖拽、缩放、平移、悬停提示
- **自动风险评分**：7 项因子（0-100 分）综合评估地址风险等级（LOW / MEDIUM / HIGH）
- **聪明钱信号集成**：整合 Smart Money、巨鲸、KOL 交易信号
- **交易时间线**：按买入/卖出筛选，点击地址跳转追踪
- **Watchlist 监控**：添加可疑地址至监控列表，一键调查
- **调查报告导出**：生成完整 TXT 格式调查报告并下载

### Meme 币安全扫描

- **安全评分**：综合分析代币合约安全性
- **开发者分析**：追踪开发者历史项目和行为
- **捆绑/狙击手检测**：识别代币中的 Bundle 和 Sniper 行为
- **同一开发者代币**：发现同一开发者部署的其他代币
- **持有者风险分布**：分析持有者集中度和风险标记
- **代币浏览**：浏览新代币、迁移中代币、已迁移代币

### 通用

- **中英双语**：右上角一键切换中文/英文，默认中文，语言偏好自动保存
- **多链支持**：Ethereum、Solana、BSC、Base、Arbitrum、Polygon、Tron、Avalanche

## 技术架构

```
OnChainGuard/
├── server.js            # Express 后端，OKX API 代理 + 业务逻辑
├── package.json
├── public/
│   ├── index.html       # 单页应用主页面（含 Meme 扫描器逻辑）
│   ├── detective.js     # 链上侦探前端模块（图表、时间线、报告）
│   └── i18n.js          # 中英文国际化模块
└── README.md
```

- **后端**：Node.js + Express，作为 OKX OnchainOS API 的安全代理层，处理 HMAC 签名认证
- **前端**：原生 HTML/CSS/JS 单页应用，Canvas 2D 绘制力导向图，无第三方前端框架依赖

## 使用的 OKX OnchainOS Skills

| Skill | 用途 |
|-------|------|
| `okx-wallet-portfolio` | 钱包持仓查询、余额分析 |
| `okx-dex-market` | DEX 交易历史、聪明钱信号、K 线数据 |
| `okx-dex-token` | 代币搜索、价格信息、持有者分布、趋势代币 |

## 快速开始

### 环境要求

- Node.js >= 14
- npm

### 安装与启动

```bash
# 克隆项目
git clone <repo-url>
cd onchain-detective

# 安装依赖
npm install

# 启动服务
npm start
```

服务启动后访问 http://localhost:3000

### 环境变量

复制 `.env.example` 为 `.env` 并填入你的 OKX OnchainOS API 密钥：

```bash
cp .env.example .env
# 编辑 .env 填入你的密钥
```

环境变量说明：

```bash
OKX_API_KEY=your_api_key        # OKX OnchainOS API Key
OKX_SECRET_KEY=your_secret_key  # OKX OnchainOS Secret Key
OKX_PASSPHRASE=your_passphrase  # OKX OnchainOS Passphrase
```

如需使用 HTTP 代理：

```bash
HTTPS_PROXY=http://127.0.0.1:10809
```

> 提示：可在启动命令前设置环境变量，例如：
> `OKX_API_KEY=xxx OKX_SECRET_KEY=xxx OKX_PASSPHRASE=xxx npm start`
> 或在 Windows 上使用 `set OKX_API_KEY=xxx` 后再执行 `npm start`

## 使用说明

### 链上侦探

1. 在输入框粘贴可疑钱包地址
2. 选择链和追踪深度（推荐 Depth 2）
3. 点击「开始调查」
4. 查看资金流向图、风险评估、交易时间线等分析结果
5. 可点击关联地址继续追踪，或导出报告

### Meme 币扫描

1. 切换到「Meme 币安全扫描」标签
2. 输入代币合约地址，选择链
3. 点击「立即扫描」查看安全评分和详细分析
4. 或点击「浏览新代币」发现最新上线的代币

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/detective/investigate` | 综合调查（持仓+交易+信号+风险评分） |
| POST | `/api/detective/watchlist/add` | 添加监控地址 |
| DELETE | `/api/detective/watchlist/remove` | 移除监控地址 |
| GET | `/api/detective/watchlist` | 获取监控列表 |
| GET | `/api/wallet/balances` | 钱包余额查询 |
| GET | `/api/market/trades` | 交易历史查询 |
| POST | `/api/market/signals` | 聪明钱信号 |
| GET | `/api/token/search` | 代币搜索 |
| GET | `/api/token/trending` | 趋势代币 |
| GET | `/api/meme/tokens` | Meme 代币列表 |
| GET | `/api/meme/token-details` | 代币详情 |
| GET | `/api/meme/dev-info` | 开发者信息 |
| GET | `/api/meme/bundle-info` | 捆绑交易信息 |

## License

MIT
