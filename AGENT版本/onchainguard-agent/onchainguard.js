#!/usr/bin/env node
/**
 * OnChainGuard - AI 链上侦探 & Meme 币安全扫描器
 * 专为 OpenClaw AI Agent 设计
 * 基于 OKX OnchainOS Skills API
 */

const crypto = require('crypto');
const https = require('https');

// API 配置
const BASE_URL = 'web3.okx.com';
const API_KEY = process.env.OKX_API_KEY || '';
const SECRET_KEY = process.env.OKX_SECRET_KEY || '';
const PASSPHRASE = process.env.OKX_PASSPHRASE || '';

// 链 ID 映射
const CHAIN_MAP = {
  'ethereum': '1', 'eth': '1',
  'solana': '501', 'sol': '501',
  'bsc': '56', 'bnb': '56',
  'polygon': '137',
  'arbitrum': '42161', 'arb': '42161',
  'base': '8453',
  'xlayer': '196', 'okb': '196',
  'avalanche': '43114', 'avax': '43114',
  'tron': '195', 'trx': '195',
  'optimism': '10', 'op': '10'
};

function resolveChain(name) {
  if (!name) return '1';
  const lower = name.toLowerCase().trim();
  return CHAIN_MAP[lower] || lower;
}

function sign(timestamp, method, requestPath, body) {
  const prehash = timestamp + method + requestPath + body;
  return crypto.createHmac('sha256', SECRET_KEY).update(prehash).digest('base64');
}

function makeRequest(method, apiPath, queryParams, postBody) {
  return new Promise((resolve, reject) => {
    let qs = '';
    if (queryParams && Object.keys(queryParams).length > 0) {
      const pairs = Object.entries(queryParams)
        .filter(([_, v]) => v !== '' && v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
      if (pairs.length > 0) qs = '?' + pairs.join('&');
    }

    const requestPath = apiPath + qs;
    const bodyStr = postBody ? JSON.stringify(postBody) : '';
    const timestamp = new Date().toISOString();
    const signature = sign(timestamp, method, requestPath, bodyStr);

    const options = {
      hostname: BASE_URL,
      path: requestPath,
      method: method,
      timeout: 15000,
      headers: {
        'OK-ACCESS-KEY': API_KEY,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-PASSPHRASE': PASSPHRASE,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'Content-Type': 'application/json',
        'ok-client-type': 'cli'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error('Failed to parse response: ' + data.substring(0, 100)));
        }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * 调查钱包地址 - 综合分析
 */
async function investigateWallet(address, chains = ['ethereum'], depth = 2) {
  const chainList = chains.map(c => resolveChain(c));
  const chainIndices = chainList.join(',');
  const maxDepth = Math.min(depth, 3);

  // Step 1: 获取钱包持仓
  const balResult = await makeRequest('GET', '/api/v6/dex/balance/all-token-balances-by-address', {
    address, chains: chainIndices, excludeRiskToken: '0'
  });

  const holdings = [];
  const chainData = balResult.data || [];
  if (Array.isArray(chainData)) {
    chainData.forEach(c => {
      if (c.tokenAssets) {
        c.tokenAssets.forEach(t => {
          const usdVal = parseFloat(t.balance || 0) * parseFloat(t.tokenPrice || 0);
          holdings.push({ ...t, usdValue: usdVal });
        });
      }
    });
  }
  holdings.sort((a, b) => b.usdValue - a.usdValue);

  // Step 2: 获取交易历史，发现关联地址
  const topTokens = holdings.filter(t => t.usdValue > 0).slice(0, 8);
  const allTrades = [];
  const connectedAddresses = new Map();
  const flowEdges = [];

  for (const token of topTokens) {
    try {
      const tradesResult = await makeRequest('GET', '/api/v6/dex/market/trades', {
        chainIndex: token.chainIndex,
        tokenContractAddress: token.tokenContractAddress,
        limit: '100'
      });
      const trades = tradesResult.data || [];
      if (Array.isArray(trades)) {
        trades.forEach(trade => {
          allTrades.push({
            ...trade,
            relatedToken: token.symbol,
            relatedTokenAddress: token.tokenContractAddress,
            chainIndex: token.chainIndex
          });
          const trader = (trade.userAddress || '').toLowerCase();
          if (trader && trader !== address.toLowerCase()) {
            if (!connectedAddresses.has(trader)) {
              connectedAddresses.set(trader, {
                address: trade.userAddress,
                trades: [],
                totalVolume: 0,
                tokens: new Set(),
                firstSeen: Infinity,
                lastSeen: 0,
                buyCount: 0,
                sellCount: 0
              });
            }
            const info = connectedAddresses.get(trader);
            info.trades.push(trade);
            info.totalVolume += parseFloat(trade.volume || 0);
            info.tokens.add(token.symbol);
            const ts = parseInt(trade.time || 0);
            if (ts < info.firstSeen) info.firstSeen = ts;
            if (ts > info.lastSeen) info.lastSeen = ts;
            if (trade.type === 'buy') info.buyCount++;
            else info.sellCount++;

            flowEdges.push({
              from: trade.type === 'sell' ? trade.userAddress : address,
              to: trade.type === 'sell' ? address : trade.userAddress,
              token: token.symbol,
              amount: trade.volume,
              time: trade.time,
              type: trade.type,
              dex: trade.dexName,
              txUrl: trade.txHashUrl,
              chainIndex: token.chainIndex
            });
          }
        });
      }
    } catch (e) { /* skip */ }
  }

  // Step 3: 获取聪明钱信号
  let signalData = [];
  try {
    for (const ci of chainList) {
      const sigResult = await makeRequest('POST', '/api/v6/dex/market/signal/list', null, {
        chainIndex: ci,
        walletType: '1,2,3'
      });
      if (Array.isArray(sigResult.data)) {
        signalData = signalData.concat(sigResult.data);
      }
    }
  } catch (e) { /* skip */ }

  // Step 4: Depth-2 追踪
  const hop2Results = [];
  if (maxDepth >= 2) {
    const topConnected = [...connectedAddresses.entries()]
      .sort((a, b) => b[1].totalVolume - a[1].totalVolume)
      .slice(0, 5);

    for (const [addr, info] of topConnected) {
      try {
        const bal2 = await makeRequest('GET', '/api/v6/dex/balance/all-token-balances-by-address', {
          address: info.address, chains: chainIndices
        });
        const tokens2 = [];
        const data2 = bal2.data || [];
        if (Array.isArray(data2)) {
          data2.forEach(c => {
            if (c.tokenAssets) {
              c.tokenAssets.forEach(t => {
                const val = parseFloat(t.balance || 0) * parseFloat(t.tokenPrice || 0);
                if (val > 0) tokens2.push({
                  symbol: t.symbol,
                  usdValue: val,
                  chainIndex: t.chainIndex,
                  isRiskToken: t.isRiskToken
                });
              });
            }
          });
        }
        tokens2.sort((a, b) => b.usdValue - a.usdValue);

        hop2Results.push({
          address: info.address,
          totalValue: tokens2.reduce((s, t) => s + t.usdValue, 0),
          topTokens: tokens2.slice(0, 5),
          riskTokenCount: tokens2.filter(t => t.isRiskToken).length,
          tradeVolume: info.totalVolume,
          tokenOverlap: [...info.tokens]
        });
      } catch (e) { /* skip */ }
    }
  }

  // Step 5: 构建图谱节点
  const targetTotalValue = holdings.reduce((s, t) => s + t.usdValue, 0);
  const nodes = [{
    id: address.toLowerCase(),
    address: address,
    label: 'TARGET',
    type: 'target',
    totalValue: targetTotalValue,
    tokenCount: holdings.length,
    riskTokens: holdings.filter(t => t.isRiskToken).length
  }];

  const sortedConnected = [...connectedAddresses.entries()]
    .sort((a, b) => b[1].totalVolume - a[1].totalVolume)
    .slice(0, 20);

  sortedConnected.forEach(([addr, info]) => {
    const hop2 = hop2Results.find(h => h.address.toLowerCase() === addr);
    nodes.push({
      id: addr,
      address: info.address,
      label: info.tokens.size > 2 ? 'FREQUENT' : 'CONNECTED',
      type: info.totalVolume > 50000 ? 'whale' : info.tokens.size > 2 ? 'frequent' : 'normal',
      totalVolume: info.totalVolume,
      tokens: [...info.tokens],
      buyCount: info.buyCount,
      sellCount: info.sellCount,
      firstSeen: info.firstSeen,
      lastSeen: info.lastSeen,
      hop2Value: hop2 ? hop2.totalValue : null,
      hop2Tokens: hop2 ? hop2.topTokens : null,
      hop2RiskTokens: hop2 ? hop2.riskTokenCount : null
    });
  });

  // Step 6: 风险评分
  const riskTokenCount = holdings.filter(t => t.isRiskToken).length;
  const riskTokenPct = holdings.length > 0 ? (riskTokenCount / holdings.length * 100) : 0;
  const highVolumeFlows = flowEdges.filter(e => parseFloat(e.amount || 0) > 10000);
  const uniqueDexes = new Set(flowEdges.map(e => e.dex).filter(Boolean));

  let riskScore = 0;
  const riskFactors = [];
  if (riskTokenCount > 3) { riskScore += 25; riskFactors.push(`${riskTokenCount} 个风险代币`); }
  else if (riskTokenCount > 0) { riskScore += 10; riskFactors.push(`${riskTokenCount} 个风险代币`); }
  if (highVolumeFlows.length > 5) { riskScore += 20; riskFactors.push(`${highVolumeFlows.length} 笔大额交易 ($10K+)`); }
  if (targetTotalValue > 500000) { riskScore += 10; riskFactors.push('大额持仓 (潜在巨鲸)'); }
  if (connectedAddresses.size > 30) { riskScore += 15; riskFactors.push(`关联 ${connectedAddresses.size} 个地址`); }
  if (uniqueDexes.size > 5) { riskScore += 10; riskFactors.push(`跨 ${uniqueDexes.size} 个 DEX 活动频繁`); }
  const hop2RiskTokens = hop2Results.reduce((s, h) => s + (h.riskTokenCount || 0), 0);
  if (hop2RiskTokens > 0) { riskScore += 15; riskFactors.push(`关联地址持有 ${hop2RiskTokens} 个风险代币`); }
  riskScore = Math.min(100, riskScore);

  allTrades.sort((a, b) => parseInt(b.time || 0) - parseInt(a.time || 0));

  return {
    target: {
      address,
      holdings: holdings.slice(0, 30),
      totalValue: targetTotalValue,
      riskTokenCount,
      riskTokenPct
    },
    graph: { nodes, edges: flowEdges },
    trades: allTrades.slice(0, 150),
    hop2: hop2Results,
    signals: signalData.slice(0, 20),
    risk: {
      score: riskScore,
      level: riskScore >= 60 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW',
      factors: riskFactors
    },
    summary: {
      totalTrades: allTrades.length,
      connectedAddresses: connectedAddresses.size,
      totalFlowVolume: flowEdges.reduce((s, e) => s + parseFloat(e.amount || 0), 0),
      dexesUsed: [...uniqueDexes]
    }
  };
}

/**
 * 扫描 Meme 代币安全性
 */
async function scanMemeToken(address, chain = 'solana') {
  const chainIndex = resolveChain(chain);

  const [details, devInfo, bundleInfo, similar] = await Promise.all([
    makeRequest('GET', '/api/v6/dex/market/memepump/tokenDetails', {
      chainIndex,
      tokenContractAddress: address
    }),
    makeRequest('GET', '/api/v6/dex/market/memepump/tokenDevInfo', {
      chainIndex,
      tokenContractAddress: address
    }),
    makeRequest('GET', '/api/v6/dex/market/memepump/tokenBundleInfo', {
      chainIndex,
      tokenContractAddress: address
    }),
    makeRequest('GET', '/api/v6/dex/market/memepump/similarToken', {
      chainIndex,
      tokenContractAddress: address
    })
  ]);

  const d = details.data || {};
  const tags = d.tags || {};
  const dev = devInfo.data?.devLaunchedInfo || {};
  const bundle = bundleInfo.data || {};

  // 计算安全评分
  let score = 100;
  const warnings = [];
  const dangers = [];

  const devPct = parseFloat(tags.devHoldingsPercent || 0);
  const top10Pct = parseFloat(tags.top10HoldingsPercent || 0);
  const bundlerPct = parseFloat(tags.bundlersPercent || 0);
  const sniperPct = parseFloat(tags.snipersPercent || 0);
  const rugPullCount = parseInt(dev.rugPullCount || 0);

  if (rugPullCount > 0) { score -= 30; dangers.push(`开发者有 ${rugPullCount} 次 Rug Pull 记录`); }
  if (devPct > 20) { score -= 20; dangers.push(`开发者持有 ${devPct.toFixed(1)}% 供应量`); }
  else if (devPct > 5) { score -= 10; warnings.push(`开发者持有 ${devPct.toFixed(1)}% 供应量`); }
  if (top10Pct > 50) { score -= 15; dangers.push(`前10大持有者占 ${top10Pct.toFixed(1)}%`); }
  if (bundlerPct > 15) { score -= 15; dangers.push(`Bundler 占比 ${bundlerPct.toFixed(1)}%`); }
  if (sniperPct > 10) { score -= 10; warnings.push(`狙击手占比 ${sniperPct.toFixed(1)}%`); }

  score = Math.max(0, score);

  return {
    token: {
      symbol: d.symbol,
      name: d.name,
      address: address,
      chain: chain,
      marketCap: d.market?.marketCapUsd,
      holders: tags.totalHolders,
      bondingPercent: d.bondingPercent
    },
    security: {
      score,
      level: score >= 70 ? 'SAFE' : score >= 40 ? 'CAUTION' : 'DANGER',
      warnings,
      dangers
    },
    developer: {
      totalTokens: dev.totalTokens,
      rugPullCount: dev.rugPullCount,
      migratedCount: dev.migratedCount,
      holdingPercent: devInfo.data?.devHoldingInfo?.devHoldingPercent
    },
    bundle: {
      totalBundlers: bundle.totalBundlers,
      bundlerAthPercent: bundle.bundlerAthPercent
    },
    riskTags: {
      devHoldings: tags.devHoldingsPercent,
      top10Holdings: tags.top10HoldingsPercent,
      bundlers: tags.bundlersPercent,
      snipers: tags.snipersPercent,
      insiders: tags.insidersPercent,
      freshWallets: tags.freshWalletsPercent
    },
    similarTokens: (similar.data || []).slice(0, 5)
  };
}

/**
 * 获取新 Meme 代币列表
 */
async function getNewMemeTokens(chain = 'solana', stage = 'NEW') {
  const result = await makeRequest('GET', '/api/v6/dex/market/memepump/tokenList', {
    chainIndex: resolveChain(chain),
    stage: stage
  });

  return (result.data || []).map(t => ({
    symbol: t.symbol,
    name: t.name,
    address: t.tokenAddress,
    marketCap: t.market?.marketCapUsd,
    bondingPercent: t.bondingPercent,
    devHoldings: t.tags?.devHoldingsPercent,
    bundlers: t.tags?.bundlersPercent,
    isRisky: parseFloat(t.tags?.devHoldingsPercent || 0) > 10 || parseFloat(t.tags?.bundlersPercent || 0) > 20
  }));
}

// CLI 入口
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];

  (async () => {
    try {
      if (cmd === 'investigate' || cmd === 'wallet') {
        const address = args[1];
        const chain = args[2] || 'ethereum';
        const depth = parseInt(args[3]) || 2;
        if (!address) {
          console.error('Usage: onchainguard investigate <address> [chain] [depth]');
          process.exit(1);
        }
        console.log(`🔍 正在调查钱包: ${address}`);
        const result = await investigateWallet(address, [chain], depth);
        console.log('\n📊 调查结果:');
        console.log(JSON.stringify(result, null, 2));
      }
      else if (cmd === 'scan' || cmd === 'meme') {
        const address = args[1];
        const chain = args[2] || 'solana';
        if (!address) {
          console.error('Usage: onchainguard scan <token_address> [chain]');
          process.exit(1);
        }
        console.log(`🛡️ 正在扫描代币: ${address}`);
        const result = await scanMemeToken(address, chain);
        console.log('\n📊 安全扫描结果:');
        console.log(JSON.stringify(result, null, 2));
      }
      else if (cmd === 'list' || cmd === 'new') {
        const chain = args[1] || 'solana';
        const stage = args[2] || 'NEW';
        console.log(`📋 获取 ${stage} Meme 代币列表...`);
        const result = await getNewMemeTokens(chain, stage);
        console.log(JSON.stringify(result, null, 2));
      }
      else {
        console.log(`
OnChainGuard - AI 链上侦探 & Meme 币安全扫描器

用法:
  onchainguard investigate <address> [chain] [depth]  - 调查钱包地址
  onchainguard scan <token_address> [chain]           - 扫描 Meme 代币安全性
  onchainguard list [chain] [stage]                   - 获取新 Meme 代币列表

支持的链: ethereum, solana, bsc, base, arbitrum, polygon, tron, avalanche

示例:
  onchainguard investigate 0x1234... ethereum 2
  onchainguard scan 0xtoken... solana
  onchainguard list solana NEW
        `);
      }
    } catch (e) {
      console.error('❌ 错误:', e.message);
      process.exit(1);
    }
  })();
}

module.exports = { investigateWallet, scanMemeToken, getNewMemeTokens };
