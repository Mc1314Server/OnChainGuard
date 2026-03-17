#!/usr/bin/env node
/**
 * OnChainDetective - AI 链上侦探 & Meme 币安全扫描器
 * 专为 AI Agent 设计
 * 基于 Binance Web3 Skills API
 */

const https = require('https');

// API 配置 - Binance Web3 Skills API
const BASE_URL = 'web3.binance.com';
const USER_AGENT = 'binance-web3/1.0 (Skill)';

// 链 ID 映射 (Binance格式)
const CHAIN_MAP = {
  'ethereum': '1', 'eth': '1',
  'bsc': '56', 'bnb': '56', 'binance': '56',
  'base': '8453',
  'solana': 'CT_501', 'sol': 'CT_501'
};

function resolveChain(name) {
  if (!name) return '56';
  const lower = name.toLowerCase().trim();
  return CHAIN_MAP[lower] || name;
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
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

    const headers = {
      'Accept-Encoding': 'identity',
      'User-Agent': USER_AGENT
    };

    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
    } else {
      headers['clienttype'] = 'web';
      headers['clientversion'] = '1.2.0';
    }

    const options = {
      hostname: BASE_URL,
      path: requestPath,
      method: method,
      timeout: 30000,
      headers: headers
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
 * 查询钱包地址持仓信息
 */
async function queryAddressInfo(address, chain = 'bsc') {
  const chainId = resolveChain(chain);
  const result = await makeRequest('GET', '/bapi/defi/v3/public/wallet-direct/buw/wallet/address/pnl/active-position-list', {
    address,
    chainId,
    offset: 0
  });

  if (!result.success || result.code !== '000000') {
    throw new Error(result.message || 'Failed to query address info');
  }

  const holdings = (result.data?.list || []).map(t => ({
    chainId: t.chainId,
    contractAddress: t.contractAddress,
    name: t.name,
    symbol: t.symbol,
    decimals: t.decimals,
    price: parseFloat(t.price || 0),
    percentChange24h: parseFloat(t.percentChange24h || 0),
    quantity: parseFloat(t.remainQty || 0),
    usdValue: parseFloat(t.remainQty || 0) * parseFloat(t.price || 0)
  }));

  holdings.sort((a, b) => b.usdValue - a.usdValue);

  return {
    address,
    chainId,
    totalValue: holdings.reduce((s, t) => s + t.usdValue, 0),
    tokenCount: holdings.length,
    holdings: holdings.slice(0, 50)
  };
}

/**
 * 调查钱包地址 - 综合分析
 */
async function investigateWallet(address, chain = 'bsc', depth = 2) {
  const chainId = resolveChain(chain);
  const maxDepth = Math.min(depth, 3);

  // Step 1: 获取钱包持仓
  const balanceResult = await queryAddressInfo(address, chain);
  const holdings = balanceResult.holdings;
  const targetTotalValue = balanceResult.totalValue;

  // Step 2: 风险评分
  let riskScore = 0;
  const riskFactors = [];
  
  // 基于持仓分析风险
  if (holdings.length > 20) { riskScore += 10; riskFactors.push('持有大量代币种类'); }
  if (targetTotalValue > 100000) { riskScore += 10; riskFactors.push('大额持仓 (潜在巨鲸)'); }
  
  const nodes = [{
    id: address.toLowerCase(),
    address: address,
    label: 'TARGET',
    type: 'target',
    totalValue: targetTotalValue,
    tokenCount: holdings.length
  }];

  return {
    target: {
      address,
      holdings: holdings.slice(0, 30),
      totalValue: targetTotalValue,
      tokenCount: holdings.length
    },
    graph: { nodes, edges: [] },
    risk: {
      score: Math.min(100, riskScore),
      level: riskScore >= 60 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW',
      factors: riskFactors
    },
    summary: {
      totalValue: targetTotalValue,
      tokenCount: holdings.length
    }
  };
}

/**
 * 扫描代币安全性 - 使用 Binance Token Audit API
 */
async function scanMemeToken(address, chain = 'bsc') {
  const chainId = resolveChain(chain);
  
  const result = await makeRequest('POST', '/bapi/defi/v1/public/wallet-direct/security/token/audit', null, {
    binanceChainId: chainId,
    contractAddress: address,
    requestId: generateUUID()
  });

  if (!result.success || result.code !== '000000') {
    throw new Error(result.message || 'Failed to audit token');
  }

  const data = result.data;
  const riskItems = data.riskItems || [];
  
  const warnings = [];
  const dangers = [];

  riskItems.forEach(item => {
    (item.details || []).forEach(detail => {
      if (detail.isHit) {
        if (detail.riskType === 'RISK') {
          dangers.push(detail.title);
        } else {
          warnings.push(detail.title);
        }
      }
    });
  });

  const extraInfo = data.extraInfo || {};

  return {
    token: {
      address: address,
      chain: chain,
      chainId: chainId
    },
    security: {
      hasResult: data.hasResult,
      isSupported: data.isSupported,
      riskLevelEnum: data.riskLevelEnum,
      riskLevel: data.riskLevel,
      level: data.riskLevelEnum || 'UNKNOWN',
      score: data.riskLevel ? (5 - data.riskLevel) * 20 : 50,
      warnings,
      dangers,
      buyTax: extraInfo.buyTax,
      sellTax: extraInfo.sellTax,
      isVerified: extraInfo.isVerified
    },
    riskItems: riskItems,
    disclaimer: '⚠️ This audit result is for reference only and does not constitute investment advice. Always conduct your own research.'
  };
}

/**
 * 获取 Meme 代币列表 - 使用 Binance Meme Rush API
 */
async function getNewMemeTokens(chain = 'solana', stage = 'NEW') {
  const chainId = resolveChain(chain);
  
  // rankType: 10=New, 20=Finalizing, 30=Migrated
  const rankTypeMap = {
    'NEW': 10,
    'FINALIZING': 20,
    'MIGRATED': 30
  };
  const rankType = rankTypeMap[stage.toUpperCase()] || 10;

  const result = await makeRequest('POST', '/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/rank/list', null, {
    chainId,
    rankType,
    limit: 50
  });

  if (!result.success) {
    throw new Error(result.message || 'Failed to get meme tokens');
  }

  const tokens = (result.data || []).map(t => ({
    symbol: t.symbol,
    name: t.name,
    address: t.contractAddress,
    chainId: t.chainId,
    price: parseFloat(t.price || 0),
    priceChange: parseFloat(t.priceChange || 0),
    marketCap: parseFloat(t.marketCap || 0),
    liquidity: parseFloat(t.liquidity || 0),
    volume: parseFloat(t.volume || 0),
    holders: t.holders,
    progress: t.progress,
    protocol: t.protocol,
    devAddress: t.devAddress,
    devSellPercent: t.devSellPercent,
    devMigrateCount: t.devMigrateCount,
    holdersTop10Percent: t.holdersTop10Percent,
    holdersDevPercent: t.holdersDevPercent,
    holdersSniperPercent: t.holdersSniperPercent,
    bundlerHoldingPercent: t.bundlerHoldingPercent,
    isRisky: parseFloat(t.holdersDevPercent || 0) > 10 || parseFloat(t.bundlerHoldingPercent || 0) > 20,
    socials: t.socials,
    createTime: t.createTime,
    migrateStatus: t.migrateStatus
  }));

  return tokens;
}

/**
 * 获取热门话题 - 使用 Binance Topic Rush API
 */
async function getHotTopics(chain = 'solana', stage = 'VIRAL') {
  const chainId = resolveChain(chain);
  
  // rankType: 10=Latest, 20=Rising, 30=Viral
  const rankTypeMap = {
    'LATEST': 10,
    'RISING': 20,
    'VIRAL': 30
  };
  const rankType = rankTypeMap[stage.toUpperCase()] || 30;
  
  // sort: 10=create time, 20=net inflow, 30=viral time
  const sortMap = {
    'LATEST': 10,
    'RISING': 10,
    'VIRAL': 30
  };
  const sort = sortMap[stage.toUpperCase()] || 30;

  const result = await makeRequest('GET', '/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/social-rush/rank/list', {
    chainId,
    rankType,
    sort,
    asc: false
  });

  if (!result.success) {
    throw new Error(result.message || 'Failed to get hot topics');
  }

  const topics = (result.data || []).map(t => ({
    topicId: t.topicId,
    name: t.name,
    type: t.type,
    netInflow: t.topicNetInflow,
    netInflow1h: t.topicNetInflow1h,
    netInflowAth: t.topicNetInflowAth,
    tokenSize: t.tokenSize,
    createTime: t.createTime,
    aiSummary: t.aiSummary,
    tokens: (t.tokenList || []).map(tok => ({
      symbol: tok.symbol,
      address: tok.contractAddress,
      marketCap: tok.marketCap,
      liquidity: tok.liquidity,
      priceChange24h: tok.priceChange24h,
      netInflow: tok.netInflow,
      holders: tok.holders,
      kolHolders: tok.kolHolders,
      smartMoneyHolders: tok.smartMoneyHolders
    }))
  }));

  return topics;
}

/**
 * 获取加密货币市值排名
 */
async function getCryptoMarketRank(chain = 'bsc', limit = 50) {
  const chainId = resolveChain(chain);

  const result = await makeRequest('GET', '/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/rank/list', {
    chainId,
    rankType: 30, // Migrated tokens
    limit
  });

  if (!result.success) {
    throw new Error(result.message || 'Failed to get market rank');
  }

  return (result.data || []).map((t, i) => ({
    rank: i + 1,
    symbol: t.symbol,
    name: t.name,
    address: t.contractAddress,
    marketCap: parseFloat(t.marketCap || 0),
    liquidity: parseFloat(t.liquidity || 0),
    volume: parseFloat(t.volume || 0),
    priceChange: parseFloat(t.priceChange || 0),
    holders: t.holders
  }));
}

/**
 * 获取交易信号
 */
async function getTradingSignal(chain = 'solana') {
  const chainId = resolveChain(chain);
  
  // 使用 Meme Rush 获取热门代币作为交易信号
  const result = await makeRequest('POST', '/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/rank/list', null, {
    chainId,
    rankType: 10, // New tokens
    limit: 20,
    kolHoldersMin: 1 // 有 KOL 持有
  });

  if (!result.success) {
    throw new Error(result.message || 'Failed to get trading signals');
  }

  return (result.data || []).map(t => ({
    symbol: t.symbol,
    name: t.name,
    address: t.contractAddress,
    signal: t.kolHolders > 0 ? 'KOL_HOLDING' : 'NEW_LISTING',
    kolHolders: t.kolHolders,
    proHolders: t.proHolders,
    smartMoneyHolders: t.smartMoneyHolders,
    priceChange: parseFloat(t.priceChange || 0),
    volume: parseFloat(t.volume || 0),
    progress: t.progress
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
        const chain = args[2] || 'bsc';
        const depth = parseInt(args[3]) || 2;
        if (!address) {
          console.error('Usage: onchaindetective investigate <address> [chain] [depth]');
          process.exit(1);
        }
        console.log(`🔍 正在调查钱包: ${address}`);
        const result = await investigateWallet(address, chain, depth);
        console.log('\n📊 调查结果:');
        console.log(JSON.stringify(result, null, 2));
      }
      else if (cmd === 'scan' || cmd === 'audit') {
        const address = args[1];
        const chain = args[2] || 'bsc';
        if (!address) {
          console.error('Usage: onchaindetective scan <token_address> [chain]');
          process.exit(1);
        }
        console.log(`🛡️ 正在扫描代币: ${address}`);
        const result = await scanMemeToken(address, chain);
        console.log('\n📊 安全扫描结果:');
        console.log(JSON.stringify(result, null, 2));
      }
      else if (cmd === 'list' || cmd === 'meme') {
        const chain = args[1] || 'solana';
        const stage = args[2] || 'NEW';
        console.log(`📋 获取 ${stage} Meme 代币列表...`);
        const result = await getNewMemeTokens(chain, stage);
        console.log(JSON.stringify(result, null, 2));
      }
      else if (cmd === 'topics' || cmd === 'hot') {
        const chain = args[1] || 'solana';
        const stage = args[2] || 'VIRAL';
        console.log(`🔥 获取热门话题...`);
        const result = await getHotTopics(chain, stage);
        console.log(JSON.stringify(result, null, 2));
      }
      else if (cmd === 'signals') {
        const chain = args[1] || 'solana';
        console.log(`📈 获取交易信号...`);
        const result = await getTradingSignal(chain);
        console.log(JSON.stringify(result, null, 2));
      }
      else {
        console.log(`
OnChainDetective - AI 链上侦探 & Meme 币安全扫描器
基于 Binance Web3 Skills API

用法:
  onchaindetective investigate <address> [chain] [depth]  - 调查钱包地址
  onchaindetective scan <token_address> [chain]           - 扫描代币安全性
  onchaindetective list [chain] [stage]                   - 获取 Meme 代币列表
  onchaindetective topics [chain] [stage]                 - 获取热门话题
  onchaindetective signals [chain]                        - 获取交易信号

支持的链: bsc, solana, ethereum, base

Meme 代币阶段: NEW, FINALIZING, MIGRATED
话题阶段: LATEST, RISING, VIRAL

示例:
  onchaindetective investigate 0x1234... bsc 2
  onchaindetective scan 0xtoken... bsc
  onchaindetective list solana NEW
  onchaindetective topics solana VIRAL
        `);
      }
    } catch (e) {
      console.error('❌ 错误:', e.message);
      process.exit(1);
    }
  })();
}

module.exports = {
  investigateWallet,
  scanMemeToken,
  getNewMemeTokens,
  getHotTopics,
  getTradingSignal,
  getCryptoMarketRank,
  queryAddressInfo
};
