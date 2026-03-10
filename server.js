const express = require('express');
const crypto = require('crypto');
const https = require('https');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');
const app = express();
const PORT = 3000;

const BASE_URL = 'web3.okx.com';
const API_KEY = process.env.OKX_API_KEY || '';
const SECRET_KEY = process.env.OKX_SECRET_KEY || '';
const PASSPHRASE = process.env.OKX_PASSPHRASE || '';

const PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || '';
const proxyAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : null;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

        if (proxyAgent) {
            options.agent = proxyAgent;
        }

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

// === API Routes ===

app.get('/api/wallet/balances', async (req, res) => {
    try {
        const { address, chains } = req.query;
        if (!address) return res.status(400).json({ error: 'address required' });
        const chainIndices = (chains || 'ethereum').split(',').map(c => resolveChain(c)).join(',');
        const result = await makeRequest('GET', '/api/v6/dex/balance/all-token-balances-by-address', {
            address, chains: chainIndices
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/market/trades', async (req, res) => {
    try {
        const { address, chain, limit } = req.query;
        if (!address) return res.status(400).json({ error: 'address required' });
        const result = await makeRequest('GET', '/api/v6/dex/market/trades', {
            chainIndex: resolveChain(chain),
            tokenContractAddress: address,
            limit: limit || '100'
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/market/signals', async (req, res) => {
    try {
        const body = req.body;
        if (body.chainIndex) body.chainIndex = resolveChain(body.chainIndex);
        const result = await makeRequest('POST', '/api/v6/dex/market/signal/list', null, body);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/token/search', async (req, res) => {
    try {
        const { query, chains } = req.query;
        if (!query) return res.status(400).json({ error: 'query required' });
        const chainIndices = (chains || '1,501').split(',').map(c => resolveChain(c)).join(',');
        const result = await makeRequest('GET', '/api/v6/dex/market/token/search', {
            chains: chainIndices, search: query
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/token/price-info', async (req, res) => {
    try {
        const items = req.body.map(item => ({
            chainIndex: resolveChain(item.chainIndex || item.chain),
            tokenContractAddress: item.tokenContractAddress || item.address
        }));
        const result = await makeRequest('POST', '/api/v6/dex/market/price-info', null, items);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/token/holders', async (req, res) => {
    try {
        const { address, chain } = req.query;
        if (!address) return res.status(400).json({ error: 'address required' });
        const result = await makeRequest('GET', '/api/v6/dex/market/token/holder', {
            chainIndex: resolveChain(chain),
            tokenContractAddress: address
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/market/kline', async (req, res) => {
    try {
        const { address, chain, bar, limit } = req.query;
        if (!address) return res.status(400).json({ error: 'address required' });
        const result = await makeRequest('GET', '/api/v6/dex/market/candles', {
            chainIndex: resolveChain(chain),
            tokenContractAddress: address,
            bar: bar || '1H',
            limit: limit || '100'
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/meme/chains', async (req, res) => {
    try {
        const result = await makeRequest('GET', '/api/v6/dex/market/memepump/supported/chainsProtocol', {});
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/meme/tokens', async (req, res) => {
    try {
        const { chain, stage, sortField, sortOrder } = req.query;
        const result = await makeRequest('GET', '/api/v6/dex/market/memepump/tokenList', {
            chainIndex: resolveChain(chain || 'solana'),
            stage: stage || 'NEW',
            sortField: sortField || '',
            sortOrder: sortOrder || ''
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/meme/token-details', async (req, res) => {
    try {
        const { address, chain } = req.query;
        if (!address) return res.status(400).json({ error: 'address required' });
        const result = await makeRequest('GET', '/api/v6/dex/market/memepump/tokenDetails', {
            chainIndex: resolveChain(chain || 'solana'),
            tokenContractAddress: address
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/meme/dev-info', async (req, res) => {
    try {
        const { address, chain } = req.query;
        if (!address) return res.status(400).json({ error: 'address required' });
        const result = await makeRequest('GET', '/api/v6/dex/market/memepump/tokenDevInfo', {
            chainIndex: resolveChain(chain || 'solana'),
            tokenContractAddress: address
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/meme/bundle-info', async (req, res) => {
    try {
        const { address, chain } = req.query;
        if (!address) return res.status(400).json({ error: 'address required' });
        const result = await makeRequest('GET', '/api/v6/dex/market/memepump/tokenBundleInfo', {
            chainIndex: resolveChain(chain || 'solana'),
            tokenContractAddress: address
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/meme/similar-tokens', async (req, res) => {
    try {
        const { address, chain } = req.query;
        if (!address) return res.status(400).json({ error: 'address required' });
        const result = await makeRequest('GET', '/api/v6/dex/market/memepump/similarToken', {
            chainIndex: resolveChain(chain || 'solana'),
            tokenContractAddress: address
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/meme/aped-wallets', async (req, res) => {
    try {
        const { address, chain } = req.query;
        if (!address) return res.status(400).json({ error: 'address required' });
        const result = await makeRequest('GET', '/api/v6/dex/market/memepump/apedWallet', {
            chainIndex: resolveChain(chain || 'solana'),
            tokenContractAddress: address
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// === Detective: Multi-hop fund tracing ===
app.post('/api/detective/investigate', async (req, res) => {
    try {
        const { address, chains, depth } = req.body;
        if (!address) return res.status(400).json({ error: 'address required' });
        const chainList = (chains || ['ethereum']).map(c => resolveChain(c));
        const chainIndices = chainList.join(',');
        const maxDepth = Math.min(depth || 2, 3);

        // Step 1: Get wallet holdings (include risk tokens for detection)
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

        // Step 2: For top tokens, get trade history to find connected wallets
        const topTokens = holdings.filter(t => t.usdValue > 0).slice(0, 8);
        const allTrades = [];
        const connectedAddresses = new Map();
        const flowEdges = [];

        const tradePromises = topTokens.map(async (token) => {
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
            } catch (e) { /* skip failed token trades */ }
        });
        await Promise.all(tradePromises);

        // Step 3: Get smart money / whale signals related to this address's tokens
        let signalData = [];
        try {
            for (const ci of chainList) {
                const sigResult = await makeRequest('POST', '/api/v6/dex/market/signal/list', null, {
                    chainIndex: ci,
                    walletType: '1,2,3'
                });
                if (Array.isArray(sigResult.data)) {
                    sigResult.data.forEach(sig => {
                        const triggerAddrs = (sig.triggerWalletAddress || '').toLowerCase();
                        if (triggerAddrs.includes(address.toLowerCase())) {
                            sig._matchType = 'direct';
                        }
                        signalData.push(sig);
                    });
                }
            }
        } catch (e) { /* signals optional */ }

        // Step 4: Depth-2 tracing
        const hop2Results = [];
        if (maxDepth >= 2) {
            const topConnected = [...connectedAddresses.entries()]
                .sort((a, b) => b[1].totalVolume - a[1].totalVolume)
                .slice(0, 5);

            const hop2Promises = topConnected.map(async ([addr, info]) => {
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
                                    if (val > 0) tokens2.push({ symbol: t.symbol, usdValue: val, chainIndex: t.chainIndex, isRiskToken: t.isRiskToken });
                                });
                            }
                        });
                    }
                    tokens2.sort((a, b) => b.usdValue - a.usdValue);

                    // Get hop2 trades for deeper tracing
                    let hop2Trades = [];
                    if (maxDepth >= 3 && tokens2.length > 0) {
                        try {
                            const t2 = tokens2[0];
                            const tr2 = await makeRequest('GET', '/api/v6/dex/market/trades', {
                                chainIndex: t2.chainIndex,
                                tokenContractAddress: t2['tokenContractAddress'] || '',
                                limit: '30'
                            });
                            hop2Trades = Array.isArray(tr2.data) ? tr2.data : [];
                        } catch(e) {}
                    }

                    hop2Results.push({
                        address: info.address,
                        totalValue: tokens2.reduce((s, t) => s + t.usdValue, 0),
                        topTokens: tokens2.slice(0, 5),
                        riskTokenCount: tokens2.filter(t => t.isRiskToken).length,
                        tradeVolume: info.totalVolume,
                        tokenOverlap: [...info.tokens],
                        hop2Trades: hop2Trades.slice(0, 10)
                    });
                } catch (e) { /* skip */ }
            });
            await Promise.all(hop2Promises);
        }

        // Step 5: Build graph nodes
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

        // Add hop2 sub-connections as additional nodes
        hop2Results.forEach(h2 => {
            if (h2.hop2Trades) {
                h2.hop2Trades.forEach(trade => {
                    const trader = (trade.userAddress || '').toLowerCase();
                    if (trader && !nodes.find(n => n.id === trader)) {
                        nodes.push({
                            id: trader,
                            address: trade.userAddress,
                            label: 'HOP2',
                            type: 'hop2',
                            totalVolume: parseFloat(trade.volume || 0),
                            tokens: [],
                            buyCount: trade.type === 'buy' ? 1 : 0,
                            sellCount: trade.type === 'sell' ? 1 : 0
                        });
                        flowEdges.push({
                            from: h2.address,
                            to: trade.userAddress,
                            token: trade.changedTokenInfo?.[0]?.tokenSymbol || '?',
                            amount: trade.volume,
                            time: trade.time,
                            type: trade.type,
                            dex: trade.dexName,
                            txUrl: trade.txHashUrl,
                            isHop2: true
                        });
                    }
                });
            }
        });

        // Step 6: Risk scoring
        const riskTokenCount = holdings.filter(t => t.isRiskToken).length;
        const riskTokenPct = holdings.length > 0 ? (riskTokenCount / holdings.length * 100) : 0;
        const highVolumeFlows = flowEdges.filter(e => parseFloat(e.amount || 0) > 10000);
        const uniqueDexes = new Set(flowEdges.map(e => e.dex).filter(Boolean));

        let riskScore = 0;
        const riskFactors = [];
        if (riskTokenCount > 3) { riskScore += 25; riskFactors.push(`${riskTokenCount} risk-flagged tokens detected`); }
        else if (riskTokenCount > 0) { riskScore += 10; riskFactors.push(`${riskTokenCount} risk-flagged token(s) in portfolio`); }
        if (highVolumeFlows.length > 5) { riskScore += 20; riskFactors.push(`${highVolumeFlows.length} high-volume ($10K+) transactions`); }
        if (targetTotalValue > 500000) { riskScore += 10; riskFactors.push('Large portfolio value (potential whale)'); }
        if (connectedAddresses.size > 30) { riskScore += 15; riskFactors.push(`Connected to ${connectedAddresses.size} addresses (high interaction volume)`); }
        if (uniqueDexes.size > 5) { riskScore += 10; riskFactors.push(`Activity across ${uniqueDexes.size} DEXes`); }
        const hop2RiskTokens = hop2Results.reduce((s, h) => s + (h.riskTokenCount || 0), 0);
        if (hop2RiskTokens > 0) { riskScore += 15; riskFactors.push(`Connected addresses hold ${hop2RiskTokens} risk tokens`); }
        riskScore = Math.min(100, riskScore);

        allTrades.sort((a, b) => parseInt(b.time || 0) - parseInt(a.time || 0));

        res.json({
            code: '0',
            data: {
                target: {
                    address,
                    holdings: holdings.slice(0, 30),
                    totalValue: targetTotalValue,
                    riskTokenCount,
                    riskTokenPct,
                    chainsScanned: chainList.length
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
                    tracedTokens: topTokens.map(t => t.symbol),
                    totalFlowVolume: flowEdges.reduce((s, e) => s + parseFloat(e.amount || 0), 0),
                    dexesUsed: [...uniqueDexes],
                    highVolumeFlows: highVolumeFlows.length,
                    analysisDepth: maxDepth,
                    chainsScanned: chainList.map(c => {
                        const entry = Object.entries(CHAIN_MAP).find(([k, v]) => v === c);
                        return entry ? entry[0] : c;
                    })
                }
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// === Detective: Watchlist management (in-memory) ===
const watchlist = new Map();

app.post('/api/detective/watchlist/add', (req, res) => {
    const { address, chain, label, notes } = req.body;
    if (!address) return res.status(400).json({ error: 'address required' });
    const key = address.toLowerCase();
    watchlist.set(key, {
        address, chain: chain || 'ethereum', label: label || '',
        notes: notes || '', addedAt: Date.now(),
        lastChecked: null, lastResult: null
    });
    res.json({ code: '0', data: { size: watchlist.size, entry: watchlist.get(key) } });
});

app.delete('/api/detective/watchlist/remove', (req, res) => {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'address required' });
    watchlist.delete(address.toLowerCase());
    res.json({ code: '0', data: { size: watchlist.size } });
});

app.get('/api/detective/watchlist', (req, res) => {
    const entries = [...watchlist.values()];
    res.json({ code: '0', data: entries });
});

app.get('/api/token/trending', async (req, res) => {
    try {
        const { chains, sortBy, timeFrame } = req.query;
        const chainIndices = (chains || '1,501').split(',').map(c => resolveChain(c)).join(',');
        const result = await makeRequest('GET', '/api/v6/dex/market/token/toplist', {
            chains: chainIndices,
            sortBy: sortBy || '5',
            timeFrame: timeFrame || '4'
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`OnChainGuard server running at http://localhost:${PORT}`);
    if (proxyAgent) {
        console.log(`Proxy: ${PROXY_URL}`);
    } else {
        console.log('No proxy configured (direct connection)');
    }
    console.log('All API calls go to OKX OnchainOS (web3.okx.com)');
});
