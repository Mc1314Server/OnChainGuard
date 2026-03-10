// ===== DETECTIVE MODULE =====
let investigationData = null;
let graphState = { nodes: [], edges: [], zoom: 1, panX: 0, panY: 0, drag: null, hover: null };

async function investigateWallet() {
    const address = document.getElementById('detective-address').value.trim();
    const chain = document.getElementById('detective-chain').value;
    const depth = document.getElementById('detective-depth').value;
    if (!address) return alert(t('js.enterAddress'));

    document.getElementById('detective-results').style.display = 'none';
    document.getElementById('detective-loading').style.display = 'flex';
    document.getElementById('btn-investigate').disabled = true;
    const prog = document.getElementById('investigate-progress');
    const progFill = document.getElementById('investigate-progress-fill');
    const progText = document.getElementById('investigate-progress-text');
    prog.style.display = 'block';
    progFill.style.width = '20%';
    progText.textContent = t('js.scanning');

    try {
        progFill.style.width = '40%';
        progText.textContent = t('js.tracing');

        const result = await apiPost('/api/detective/investigate', {
            address, chains: [chain], depth: parseInt(depth)
        });

        if (result.code !== '0' || !result.data) throw new Error(result.error || 'Investigation failed');

        progFill.style.width = '80%';
        progText.textContent = t('js.building');
        investigationData = result.data;

        renderSummary(result.data);
        renderRiskAssessment(result.data);
        renderFlowCanvas(result.data);
        renderTimeline(result.data);
        renderConnectedAddresses(result.data);
        renderWalletTokens(result.data);
        renderSignalsSection(result.data);
        renderInvestigationReport(result.data);

        progFill.style.width = '100%';
        progText.textContent = t('js.complete');
        document.getElementById('detective-results').style.display = 'block';
    } catch (e) {
        alert('Investigation failed: ' + e.message);
    } finally {
        document.getElementById('detective-loading').style.display = 'none';
        document.getElementById('btn-investigate').disabled = false;
        setTimeout(() => { prog.style.display = 'none'; }, 1500);
    }
}

function renderSummary(data) {
    const tgt = data.target, s = data.summary, r = data.risk;
    const riskColor = r.level === 'HIGH' ? 'var(--red)' : r.level === 'MEDIUM' ? 'var(--yellow)' : 'var(--green)';
    document.getElementById('detective-summary').innerHTML = `
        <div class="stat-card"><div class="stat-label">${t('js.portfolioValue')}</div><div class="stat-value" style="color:var(--accent)">${fmtUsd(tgt.totalValue)}</div></div>
        <div class="stat-card"><div class="stat-label">${t('js.connectedAddresses')}</div><div class="stat-value">${s.connectedAddresses}</div></div>
        <div class="stat-card"><div class="stat-label">${t('js.riskLevel')}</div><div class="stat-value" style="color:${riskColor}">${r.level} (${r.score})</div></div>
        <div class="stat-card"><div class="stat-label">${t('js.tokensHeld')}</div><div class="stat-value">${tgt.holdings.length}</div></div>
        <div class="stat-card"><div class="stat-label">${t('js.totalTrades')}</div><div class="stat-value">${s.totalTrades}</div></div>
        <div class="stat-card"><div class="stat-label">${t('js.flowVolume')}</div><div class="stat-value">${fmtUsd(s.totalFlowVolume)}</div></div>`;
}

function renderRiskAssessment(data) {
    const r = data.risk;
    const color = r.level === 'HIGH' ? 'var(--red)' : r.level === 'MEDIUM' ? 'var(--yellow)' : 'var(--green)';
    const icon = r.level === 'HIGH' ? '!' : r.level === 'MEDIUM' ? '?' : 'OK';
    let factorsHtml = '';
    if (r.factors.length > 0) {
        factorsHtml = '<ul style="margin-top:12px;padding-left:20px;font-size:13px;line-height:2">' +
            r.factors.map(f => `<li style="color:${r.level==='LOW'?'var(--text2)':color}">${f}</li>`).join('') + '</ul>';
    } else {
        factorsHtml = '<div style="margin-top:12px;color:var(--green);font-size:13px">' + t('js.noRiskFactors') + '</div>';
    }
    document.getElementById('risk-assessment').innerHTML = `
        <div class="risk-meter">
            <div class="risk-circle" style="border:4px solid ${color};color:${color}">${icon}</div>
            <div style="flex:1">
                <div style="font-size:18px;font-weight:700;color:${color}">${t('js.riskScore')}: ${r.score}/100 - ${r.level}</div>
                <div class="progress-bar" style="margin-top:6px"><div class="progress-fill" style="width:${r.score}%;background:${color}"></div></div>
                <div class="small" style="margin-top:4px">${t('js.chains')}: ${data.summary.chainsScanned.join(', ')} | ${t('js.dexes')}: ${data.summary.dexesUsed.join(', ') || 'N/A'} | ${t('js.depth')}: ${data.summary.analysisDepth}</div>
            </div>
        </div>${factorsHtml}`;
}

// ===== FORCE-DIRECTED GRAPH =====
function renderFlowCanvas(data) {
    const canvas = document.getElementById('flow-canvas');
    const container = canvas.parentElement;
    canvas.width = container.offsetWidth * 2;
    canvas.height = 500 * 2;
    canvas.style.width = container.offsetWidth + 'px';
    canvas.style.height = '500px';
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const nodes = data.graph.nodes.map((n, i) => {
        const angle = (i / data.graph.nodes.length) * Math.PI * 2;
        const r = n.type === 'target' ? 0 : (n.type === 'hop2' ? 350 : 220);
        return { ...n, x: W/2 + Math.cos(angle)*r + (Math.random()-0.5)*80, y: H/2 + Math.sin(angle)*r + (Math.random()-0.5)*80, vx: 0, vy: 0, radius: n.type==='target'?28:n.type==='whale'?20:n.type==='hop2'?10:14 };
    });
    const edgeMap = new Map();
    data.graph.edges.forEach(e => {
        const key = (e.from||'').toLowerCase() + '-' + (e.to||'').toLowerCase();
        if (!edgeMap.has(key)) edgeMap.set(key, { ...e, count: 1, totalAmount: parseFloat(e.amount||0) });
        else { const ex = edgeMap.get(key); ex.count++; ex.totalAmount += parseFloat(e.amount||0); }
    });
    const edges = [...edgeMap.values()];
    graphState = { nodes, edges, zoom: 1, panX: 0, panY: 0, drag: null, hover: null };

    function simulate() {
        for (let iter = 0; iter < 80; iter++) {
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i+1; j < nodes.length; j++) {
                    let dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
                    let dist = Math.sqrt(dx*dx+dy*dy) || 1;
                    let force = 8000 / (dist * dist);
                    nodes[i].vx -= dx/dist*force; nodes[i].vy -= dy/dist*force;
                    nodes[j].vx += dx/dist*force; nodes[j].vy += dy/dist*force;
                }
            }
            edges.forEach(e => {
                const s = nodes.find(n=>n.id===(e.from||'').toLowerCase());
                const t = nodes.find(n=>n.id===(e.to||'').toLowerCase());
                if (!s||!t) return;
                let dx=t.x-s.x, dy=t.y-s.y, dist=Math.sqrt(dx*dx+dy*dy)||1;
                let force = (dist-200)*0.02;
                s.vx+=dx/dist*force; s.vy+=dy/dist*force;
                t.vx-=dx/dist*force; t.vy-=dy/dist*force;
            });
            nodes.forEach(n => {
                n.vx -= n.x*0.0001*(n.x-W/2); n.vy -= n.y*0.0001*(n.y-H/2);
                n.vx *= 0.8; n.vy *= 0.8;
                if (n.type !== 'target') { n.x += n.vx; n.y += n.vy; }
                n.x = Math.max(60, Math.min(W-60, n.x));
                n.y = Math.max(60, Math.min(H-60, n.y));
            });
        }
        const targetNode = nodes.find(n => n.type === 'target');
        if (targetNode) { targetNode.x = W/2; targetNode.y = H/2; }
    }
    simulate();

    function getColor(type) {
        return { target:'#f59e0b', whale:'#ef4444', frequent:'#f97316', hop2:'#6366f1', normal:'#00d4ff' }[type] || '#00d4ff';
    }

    function draw() {
        ctx.clearRect(0,0,W,H);
        ctx.save();
        ctx.translate(graphState.panX, graphState.panY);
        ctx.scale(graphState.zoom, graphState.zoom);
        edges.forEach(e => {
            const s = nodes.find(n=>n.id===(e.from||'').toLowerCase());
            const t = nodes.find(n=>n.id===(e.to||'').toLowerCase());
            if (!s||!t) return;
            ctx.beginPath(); ctx.moveTo(s.x,s.y); ctx.lineTo(t.x,t.y);
            ctx.strokeStyle = e.type==='sell'?'rgba(239,68,68,0.4)':'rgba(16,185,129,0.4)';
            ctx.lineWidth = Math.min(4, 1+e.count*0.5) * (e.isHop2?0.6:1);
            ctx.stroke();
            const mx=(s.x+t.x)/2, my=(s.y+t.y)/2;
            if (e.totalAmount > 100) {
                ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.font='16px sans-serif'; ctx.textAlign='center';
                ctx.fillText(fmtUsd(e.totalAmount), mx, my-6);
            }
            const dx=t.x-s.x, dy=t.y-s.y, len=Math.sqrt(dx*dx+dy*dy)||1;
            const ax=t.x-dx/len*(t.radius+8), ay=t.y-dy/len*(t.radius+8);
            const ang=Math.atan2(dy,dx);
            ctx.beginPath(); ctx.moveTo(ax,ay);
            ctx.lineTo(ax-14*Math.cos(ang-0.3),ay-14*Math.sin(ang-0.3));
            ctx.lineTo(ax-14*Math.cos(ang+0.3),ay-14*Math.sin(ang+0.3));
            ctx.closePath(); ctx.fillStyle=ctx.strokeStyle; ctx.fill();
        });
        nodes.forEach(n => {
            const c = getColor(n.type);
            ctx.beginPath(); ctx.arc(n.x,n.y,n.radius,0,Math.PI*2);
            ctx.fillStyle = n===graphState.hover ? c : c+'33';
            ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=2.5; ctx.stroke();
            ctx.fillStyle='#fff'; ctx.font=`bold ${n.type==='target'?18:n.type==='hop2'?14:16}px sans-serif`; ctx.textAlign='center';
            ctx.fillText(n.label==='TARGET'?'T':shortAddr(n.address).slice(0,6), n.x, n.y+5);
            if (n.type!=='hop2') {
                ctx.font='14px sans-serif'; ctx.fillStyle='rgba(255,255,255,0.7)';
                ctx.fillText(n.totalVolume?fmtUsd(n.totalVolume):fmtUsd(n.totalValue||0), n.x, n.y+n.radius+16);
            }
        });
        ctx.restore();
    }
    draw();

    function getMousePos(e) {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX-r.left)*2, y: (e.clientY-r.top)*2 };
    }
    function findNode(mx,my) {
        const sx=(mx-graphState.panX)/graphState.zoom, sy=(my-graphState.panY)/graphState.zoom;
        return nodes.find(n => { const d=Math.sqrt((n.x-sx)**2+(n.y-sy)**2); return d<n.radius+5; });
    }

    canvas.onmousedown = e => {
        const p=getMousePos(e), n=findNode(p.x,p.y);
        if (n) graphState.drag = { node:n, ox:p.x, oy:p.y };
        else graphState.drag = { pan:true, ox:p.x-graphState.panX, oy:p.y-graphState.panY };
    };
    canvas.onmousemove = e => {
        const p=getMousePos(e);
        if (graphState.drag) {
            if (graphState.drag.node) {
                graphState.drag.node.x += (p.x-graphState.drag.ox)/graphState.zoom;
                graphState.drag.node.y += (p.y-graphState.drag.oy)/graphState.zoom;
                graphState.drag.ox=p.x; graphState.drag.oy=p.y;
            } else {
                graphState.panX=p.x-graphState.drag.ox; graphState.panY=p.y-graphState.drag.oy;
            }
            draw();
        }
        const n=findNode(p.x,p.y);
        const tip=document.getElementById('graph-tooltip');
        if (n && n!==graphState.hover) {
            graphState.hover=n; draw();
            tip.style.display='block'; tip.style.left=(e.clientX+12)+'px'; tip.style.top=(e.clientY+12)+'px';
            tip.innerHTML=`<div style="font-weight:700;margin-bottom:4px">${n.label} ${n.type==='target'?t('js.investigationTarget'):''}</div>
                <div class="addr" style="margin-bottom:6px">${n.address}</div>
                ${n.totalValue?`<div>${t('js.portfolio')}: ${fmtUsd(n.totalValue)}</div>`:''}
                ${n.totalVolume?`<div>${t('js.tradeVolume')}: ${fmtUsd(n.totalVolume)}</div>`:''}
                ${n.tokens&&n.tokens.length?`<div>${t('js.tokens')}: ${n.tokens.join(', ')}</div>`:''}
                ${n.buyCount!==undefined?`<div>${t('js.buys')||t('js.buysSells').split('/')[0]}: ${n.buyCount} | ${t('js.sells')||t('js.buysSells').split('/')[1]}: ${n.sellCount}</div>`:''}
                ${n.hop2RiskTokens?`<div style="color:var(--red)">${t('js.riskTokens')}: ${n.hop2RiskTokens}</div>`:''}`;
        } else if (!n && graphState.hover) {
            graphState.hover=null; draw(); tip.style.display='none';
        }
    };
    canvas.onmouseup = () => { graphState.drag=null; };
    canvas.onmouseleave = () => { graphState.drag=null; document.getElementById('graph-tooltip').style.display='none'; };
    canvas.onwheel = e => {
        e.preventDefault();
        graphState.zoom *= e.deltaY>0?0.9:1.1;
        graphState.zoom = Math.max(0.3, Math.min(3, graphState.zoom));
        draw();
    };
}

function resetGraphView() {
    graphState.zoom=1; graphState.panX=0; graphState.panY=0;
    if (investigationData) renderFlowCanvas(investigationData);
}

// ===== TIMELINE =====
let allTradesCache = [];
function renderTimeline(data) {
    allTradesCache = data.trades || [];
    document.getElementById('timeline-count').textContent = `${allTradesCache.length} ${t('js.transactions')}`;
    displayTrades(allTradesCache);
}
function filterTimeline(type, btn) {
    document.querySelectorAll('#timeline-tabs .tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const filtered = type==='all' ? allTradesCache : allTradesCache.filter(tr=>tr.type===type);
    displayTrades(filtered);
}
function displayTrades(trades) {
    if (!trades.length) { document.getElementById('transfer-timeline').innerHTML='<div class="empty">'+t('js.noTrades')+'</div>'; return; }
    let html = `<table><thead><tr><th>${t('js.time')}</th><th>${t('js.type')}</th><th>${t('js.token')}</th><th>${t('js.volume')}</th><th>${t('js.dex')}</th><th>${t('js.trader')}</th><th>${t('js.tx')}</th></tr></thead><tbody>`;
    trades.slice(0,100).forEach(tr => {
        const time = tr.time ? new Date(parseInt(tr.time)).toLocaleString() : '---';
        const badge = tr.type==='buy'?'badge-green':'badge-red';
        html += `<tr>
            <td class="small">${time}</td>
            <td><span class="badge ${badge}">${(tr.type||'?').toUpperCase()}</span></td>
            <td><strong>${tr.relatedToken||'?'}</strong></td>
            <td>${fmtUsd(tr.volume)}</td>
            <td class="small">${tr.dexName||'---'}</td>
            <td><span class="addr" onclick="document.getElementById('detective-address').value='${tr.userAddress||''}'">${shortAddr(tr.userAddress)}</span></td>
            <td>${tr.txHashUrl?`<a href="${tr.txHashUrl}" target="_blank" class="badge badge-blue">${t('js.view')}</a>`:''}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('transfer-timeline').innerHTML = html;
}

// ===== CONNECTED ADDRESSES =====
function renderConnectedAddresses(data) {
    const hop2 = data.hop2 || [];
    const nodes = (data.graph.nodes||[]).filter(n=>n.type!=='target'&&n.type!=='hop2');
    if (!nodes.length && !hop2.length) {
        document.getElementById('connected-addresses').innerHTML = '<div class="empty">' + t('js.noConnected') + '</div>'; return;
    }
    let html = `<table><thead><tr><th>${t('js.address')}</th><th>${t('js.label')}</th><th>${t('js.volume')}</th><th>${t('js.tokens')}</th><th>${t('js.buysSells')}</th><th>${t('js.portfolio')}</th><th>${t('js.riskTokens')}</th><th>${t('js.action')}</th></tr></thead><tbody>`;
    nodes.slice(0,20).forEach(n => {
        const h2 = hop2.find(h=>h.address.toLowerCase()===n.id);
        html += `<tr>
            <td><span class="addr" onclick="document.getElementById('detective-address').value='${n.address}'">${shortAddr(n.address)}</span></td>
            <td><span class="badge badge-${n.type==='whale'?'red':n.type==='frequent'?'orange':'blue'}">${n.label}</span></td>
            <td>${fmtUsd(n.totalVolume)}</td>
            <td>${(n.tokens||[]).join(', ')}</td>
            <td>${n.buyCount||0}/${n.sellCount||0}</td>
            <td>${h2?fmtUsd(h2.totalValue):'---'}</td>
            <td>${h2&&h2.riskTokenCount?`<span class="badge badge-red">${h2.riskTokenCount}</span>`:'<span class="badge badge-green">0</span>'}</td>
            <td><button class="btn btn-sm btn-outline" onclick="document.getElementById('detective-address').value='${n.address}';investigateWallet()">${t('js.trace')}</button></td>
        </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('connected-addresses').innerHTML = html;
}

// ===== WALLET TOKENS =====
function renderWalletTokens(data) {
    const holdings = data.target.holdings || [];
    if (!holdings.length) { document.getElementById('wallet-tokens').innerHTML='<div class="empty">'+t('js.noTokens')+'</div>'; return; }
    let html = `<table><thead><tr><th>${t('js.token')}</th><th>${t('js.balance')}</th><th>${t('js.price')}</th><th>${t('js.value')}</th><th>${t('js.risk')}</th></tr></thead><tbody>`;
    holdings.slice(0,30).forEach(t => {
        html += `<tr>
            <td><strong>${t.symbol||'???'}</strong></td>
            <td>${parseFloat(t.balance||0).toFixed(4)}</td>
            <td>${fmtPrice(t.tokenPrice)}</td>
            <td>${fmtUsd(t.usdValue)}</td>
            <td>${t.isRiskToken?'<span class="badge badge-red">RISK</span>':'<span class="badge badge-green">SAFE</span>'}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('wallet-tokens').innerHTML = html;
}

// ===== SIGNALS =====
function renderSignalsSection(data) {
    const signals = data.signals || [];
    if (!signals.length) { document.getElementById('signals-section').innerHTML='<div class="empty">'+t('js.noSignals')+'</div>'; return; }
    let html = `<table><thead><tr><th>${t('js.time')}</th><th>${t('js.token')}</th><th>${t('js.type')}</th><th>${t('js.amount')}</th><th>${t('js.wallets')}</th></tr></thead><tbody>`;
    signals.slice(0,15).forEach(s => {
        const time = s.timestamp ? new Date(parseInt(s.timestamp)).toLocaleString() : '---';
        const typeMap = { 'SMART_MONEY':'badge-blue', 'WHALE':'badge-yellow', 'INFLUENCER':'badge-orange' };
        html += `<tr>
            <td class="small">${time}</td>
            <td><strong>${s.token?.symbol||'?'}</strong></td>
            <td><span class="badge ${typeMap[s.walletType]||'badge-blue'}">${s.walletType||'?'}</span></td>
            <td>${fmtUsd(s.amountUsd)}</td>
            <td>${s.triggerWalletCount||0}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('signals-section').innerHTML = html;
}

// ===== REPORT =====
function renderInvestigationReport(data) {
    const tgt = data.target, r = data.risk, s = data.summary;
    const riskColor = r.level==='HIGH'?'var(--red)':r.level==='MEDIUM'?'var(--yellow)':'var(--green)';
    document.getElementById('investigation-report').innerHTML = `
        <div style="display:flex;gap:24px;align-items:start;flex-wrap:wrap">
            <div class="risk-circle" style="border:4px solid ${riskColor};color:${riskColor}">
                ${r.level==='HIGH'?'!':r.level==='MEDIUM'?'?':'OK'}
            </div>
            <div style="flex:1;min-width:200px">
                <h3 style="margin-bottom:8px">${t('js.riskLevel')}: <span style="color:${riskColor}">${r.level}</span> (${t('js.riskScore')}: ${r.score}/100)</h3>
                <p class="small" style="margin-bottom:12px">${t('js.address')}: <span class="addr">${tgt.address}</span></p>
                <div class="grid3">
                    <div class="stat-card"><div class="stat-label">${t('js.portfolioValue')}</div><div style="font-size:16px;font-weight:600">${fmtUsd(tgt.totalValue)}</div></div>
                    <div class="stat-card"><div class="stat-label">${t('js.tokensHeld')}</div><div style="font-size:16px;font-weight:600">${tgt.holdings.length}</div></div>
                    <div class="stat-card"><div class="stat-label">${t('js.riskTokens')}</div><div style="font-size:16px;font-weight:600;color:${tgt.riskTokenCount>0?'var(--red)':'var(--green)'}">${tgt.riskTokenCount}</div></div>
                </div>
                <div class="report-section">
                    <strong>${t('js.findings')}:</strong>
                    <ul style="margin-top:8px;padding-left:20px;color:var(--text2);font-size:13px;line-height:1.8">
                        <li>${tgt.holdings.length} ${t('js.tokensFound')} - ${fmtUsd(tgt.totalValue)}</li>
                        <li>${s.connectedAddresses} ${t('js.connectedAddresses')}, ${s.totalTrades} ${t('js.transactions')}</li>
                        <li>${t('js.flowVolume')}: ${fmtUsd(s.totalFlowVolume)} | DEX: ${s.dexesUsed.join(', ')||'N/A'}</li>
                        ${tgt.riskTokenCount>0?`<li style="color:var(--red)">WARNING: ${tgt.riskTokenCount} ${t('js.riskTokens')} (${fmtPct(tgt.riskTokenPct)})</li>`:`<li style="color:var(--green)">${t('js.noRisk')}</li>`}
                        ${r.factors.map(f=>`<li style="color:${riskColor}">${f}</li>`).join('')}
                    </ul>
                </div>
            </div>
        </div>`;
}

// ===== EXPORT =====
function exportReport() {
    if (!investigationData) return alert(t('js.runFirst'));
    const d = investigationData, tgt = d.target, r = d.risk, s = d.summary;
    let text = `ON-CHAIN DETECTIVE INVESTIGATION REPORT\n${'='.repeat(50)}\nGenerated: ${new Date().toISOString()}\n\n`;
    text += `TARGET ADDRESS: ${tgt.address}\nRISK LEVEL: ${r.level} (Score: ${r.score}/100)\nPORTFOLIO VALUE: ${fmtUsd(tgt.totalValue)}\nTOKENS HELD: ${tgt.holdings.length}\nRISK TOKENS: ${tgt.riskTokenCount}\n\n`;
    text += `ANALYSIS SUMMARY\n${'-'.repeat(30)}\nConnected Addresses: ${s.connectedAddresses}\nTotal Trades Analyzed: ${s.totalTrades}\nTotal Flow Volume: ${fmtUsd(s.totalFlowVolume)}\nDEXes Used: ${s.dexesUsed.join(', ')||'N/A'}\nTraced Tokens: ${s.tracedTokens.join(', ')}\nAnalysis Depth: ${s.analysisDepth}\nChains Scanned: ${s.chainsScanned.join(', ')}\n\n`;
    text += `RISK FACTORS\n${'-'.repeat(30)}\n`;
    r.factors.forEach(f => { text += `- ${f}\n`; });
    text += `\nTOP HOLDINGS\n${'-'.repeat(30)}\n`;
    tgt.holdings.slice(0,15).forEach(h => { text += `${h.symbol||'?'}: ${parseFloat(h.balance||0).toFixed(4)} (${fmtUsd(h.usdValue)})${h.isRiskToken?' [RISK]':''}\n`; });
    text += `\nCONNECTED ADDRESSES\n${'-'.repeat(30)}\n`;
    (d.graph.nodes||[]).filter(n=>n.type!=='target').slice(0,15).forEach(n => {
        text += `${n.address} [${n.label}] Vol:${fmtUsd(n.totalVolume)} Buys:${n.buyCount} Sells:${n.sellCount}\n`;
    });
    text += `\nRECENT TRADES\n${'-'.repeat(30)}\n`;
    (d.trades||[]).slice(0,30).forEach(tr => {
        text += `${tr.time?new Date(parseInt(tr.time)).toISOString():'?'} ${tr.type} ${tr.relatedToken||'?'} ${fmtUsd(tr.volume)} via ${tr.dexName||'?'} by ${shortAddr(tr.userAddress)}\n`;
    });

    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `investigation_${tgt.address.slice(0,10)}_${Date.now()}.txt`;
    a.click();
}

// ===== WATCHLIST =====
async function addToWatchlist() {
    const address = document.getElementById('detective-address').value.trim();
    const chain = document.getElementById('detective-chain').value;
    if (!address) return alert(t('js.enterAddressFirst'));
    const label = prompt(t('js.labelPrompt'), '');
    try {
        await apiPost('/api/detective/watchlist/add', { address, chain, label: label||'' });
        refreshWatchlist();
        document.getElementById('watchlist-card').style.display = 'block';
    } catch(e) { alert('Failed to add: '+e.message); }
}

async function refreshWatchlist() {
    try {
        const result = await api('/api/detective/watchlist');
        const entries = result.data || [];
        const card = document.getElementById('watchlist-card');
        if (!entries.length) { card.style.display='none'; return; }
        card.style.display = 'block';
        let html = '';
        entries.forEach(e => {
            html += `<div class="token-row" style="padding:10px">
                <div style="flex:1;min-width:0">
                    <div style="font-weight:600">${e.label||t('js.unnamed')}</div>
                    <div class="addr" onclick="document.getElementById('detective-address').value='${e.address}';investigateWallet()">${shortAddr(e.address)}</div>
                    <div class="small">${e.chain} | Added: ${new Date(e.addedAt).toLocaleString()}</div>
                </div>
                <button class="btn btn-sm btn-outline" onclick="document.getElementById('detective-address').value='${e.address}';document.getElementById('detective-chain').value='${e.chain}';investigateWallet()">${t('js.investigate')}</button>
                <button class="btn btn-sm" style="background:var(--red);margin-left:4px" onclick="removeFromWatchlist('${e.address}')">${t('js.remove')}</button>
            </div>`;
        });
        document.getElementById('watchlist-entries').innerHTML = html;
    } catch(e) {}
}

async function removeFromWatchlist(address) {
    try {
        await fetch('/api/detective/watchlist/remove', {
            method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({address})
        });
        refreshWatchlist();
    } catch(e) {}
}

// Load watchlist on page init
document.addEventListener('DOMContentLoaded', () => { refreshWatchlist(); });
