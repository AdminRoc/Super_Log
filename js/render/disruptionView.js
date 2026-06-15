window.WF = window.WF || {};

WF.disruptionView = (function () {
  const U = WF.utils;

  function summary(rec) {
    const avgRound = rec.totalDuration / rec.roundCount;
    return {
      title: `中断 ${rec.roundCount} 轮${rec.name ? ' · ' + rec.name : ''}`,
      sub: `${U.fmtDurationLong(rec.totalDuration)} ｜ 平均每轮 ${U.fmtDuration(avgRound)}`,
    };
  }

  function render(container, rec) {
    container.innerHTML = '';

    // ── 总览统计行 ────────────────────────────────────────────
    const avgRound = rec.totalDuration / rec.roundCount;
    const hero = U.el('div', 'hero-row');
    hero.appendChild(_st('任务总时长', U.fmtDurationLong(rec.totalDuration), 'big'));
    hero.appendChild(_st('完成轮次',   String(rec.roundCount), 'accent'));
    hero.appendChild(_st('平均每轮时长', U.fmtDuration(avgRound), ''));
    if (rec.totalConduits > 0) {
      const rate = (rec.conduitRate * 100).toFixed(1) + '%';
      hero.appendChild(_st('导管成功率', `${rate}（${rec.successConduits}/${rec.totalConduits}）`, ''));
    }
    if (rec.name) hero.appendChild(_st('任务地图', rec.name, ''));
    container.appendChild(hero);

    // ── 每轮耗时条形图（概览） ────────────────────────────────
    const maxDur = Math.max(...rec.rounds.map(r => r.duration));
    const barH = 6, gap = 2, w = 760;
    const h = rec.rounds.length * (barH + gap);
    let svg = `<svg viewBox="0 0 ${w} ${h}" height="${h}" class="round-chart" preserveAspectRatio="none">`;
    rec.rounds.forEach((r, i) => {
      const bw  = Math.max(2, (r.duration / maxDur) * (w - 60));
      const y   = i * (barH + gap);
      const ok  = r.conduits.length === 0 || r.conduits.every(c => c.success);
      svg += `<rect x="50" y="${y}" width="${bw}" height="${barH}" rx="2" class="${ok ? 'bar-ok' : 'bar-fail'}"><title>第 ${r.index} 轮：${U.fmtDuration(r.duration)}</title></rect>`;
      if (i % 5 === 4 || i === 0) svg += `<text x="44" y="${y + barH}" class="bar-label" text-anchor="end">${r.index}</text>`;
    });
    svg += '</svg>';
    const chartBox = U.el('div', 'chart-box');
    chartBox.innerHTML = svg;
    container.appendChild(chartBox);

    // ── 插钥匙时间轴（HTML div，天然填满容器宽度，圆点不拉伸） ─
    const hasInsertTiming = rec.rounds.some(r =>
      r.conduits.length > 0 && r.conduits.some(c => c.insertRelT != null)
    );
    const hasConduitTiming = hasInsertTiming || rec.rounds.some(r =>
      r.conduits.length > 0 && r.conduits.some(c => c.doneRelT != null)
    );
    if (hasConduitTiming) {
      const tlWrap = U.el('div', 'chart-box dis-tl-wrap');
      tlWrap.appendChild(U.el('div', 'dis-tl-title', '插钥匙时间轴（每轮 · 相对本轮战斗起点）'));

      const rows = U.el('div', 'dis-tl-rows');
      rec.rounds.forEach((r, i) => {
        const row = U.el('div', 'dis-tl-row');

        // Round number label (round 1, then every 5th)
        const numEl = U.el('span', 'dis-tl-rownum');
        if (i === 0 || i % 5 === 4) numEl.textContent = String(r.index);
        row.appendChild(numEl);

        // Track bar with dots
        const track = U.el('div', 'dis-tl-track');
        const maxT = Math.max(r.combatDuration, 1);

        r.conduits.forEach(c => {
          const posRelT = c.insertRelT != null ? c.insertRelT : c.doneRelT;
          if (posRelT == null) return;
          const pct = Math.min(100, Math.max(0, (posRelT / maxT) * 100)).toFixed(2);
          const col = _conduitColor(c);
          let tip = _conduitEffectLabel(c);
          if (c.insertRelT != null) tip += (tip ? '\n' : '') + `插入 +${U.fmtDuration(c.insertRelT)}`;
          if (c.doneRelT != null) tip += (tip ? '\n' : '') + (c.success ? '成功' : '失败') + ` +${U.fmtDuration(c.doneRelT)}`;
          const dot = U.el('div', 'dis-tl-dot');
          dot.style.left = pct + '%';
          dot.style.background = col;
          if (tip) dot.title = tip;
          track.appendChild(dot);
        });

        row.appendChild(track);
        rows.appendChild(row);
      });

      tlWrap.appendChild(rows);
      const legend = U.el('div', 'dis-tl-legend');
      legend.innerHTML = '<span class="cd ok">●</span> 守卫成功 &nbsp;&nbsp;<span class="cd fail">●</span> 守卫失败 &nbsp;&nbsp;<span style="color:#ffd700">●</span> 危险Buff效果（已守住）&nbsp;&nbsp;<span style="color:var(--c-text2);font-size:11px">横向位置 = 插入时间占本轮时长的比例 · 悬停查看效果名称</span>';
      tlWrap.appendChild(legend);
      container.appendChild(tlWrap);
    }

    // ── 击杀走势折线图（点击全屏） ───────────────────────────
    container.appendChild(_buildKillChart(rec));

    // ── 轮次详情表格 ─────────────────────────────────────────
    const tbl = U.el('table', 'round-table');
    tbl.innerHTML = '<thead><tr><th>轮次</th><th>本轮耗时</th><th>累计耗时</th><th>导管</th><th>击杀 / 生成</th></tr></thead>';

    const tbody = U.el('tbody');
    rec.rounds.forEach(r => {
      const tr = U.el('tr');
      tr.appendChild(U.el('td', 'td-idx', String(r.index)));
      tr.appendChild(U.el('td', 'td-mono', U.fmtDuration(r.duration)));
      tr.appendChild(U.el('td', 'td-mono', U.fmtDurationLong(r.cumulative)));

      const cd = U.el('td', 'td-conduits');
      if (r.conduits.length === 0) {
        cd.textContent = '—';
      } else {
        r.conduits.forEach(c => {
          const label = c.success === true ? '✓' : c.success === false ? '✗' : '?';
          const cls   = c.success === true ? 'cd ok' : c.success === false ? 'cd fail' : 'cd';
          const sp    = U.el('span', cls, label);
          let tip = _conduitEffectLabel(c);
          if (c.insertRelT != null) tip += (tip ? '\n' : '') + `插入 +${U.fmtDuration(c.insertRelT)}`;
          if (c.doneRelT   != null) tip += (tip ? '\n' : '') + `${c.success ? '守卫成功' : '守卫失败'} +${U.fmtDuration(c.doneRelT)}`;
          if (tip) sp.title = tip;
          if (_isBadDebuff(c)) sp.style.outline = '1.5px solid #ffd700';
          cd.appendChild(sp);
        });
      }
      tr.appendChild(cd);

      const ksCell = U.el('td', 'td-mono');
      const spawnStr = r.spawned != null && r.spawned > 0 ? String(r.spawned) : '—';
      ksCell.textContent = `${r.kills} / ${spawnStr}`;
      if (r.spawned > 0 && r.kills < r.spawned) ksCell.style.color = 'var(--c-text2)';
      tr.appendChild(ksCell);

      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);

    const tblWrap = U.el('div', 'table-wrap');
    tblWrap.appendChild(tbl);
    container.appendChild(tblWrap);

    container.appendChild(U.el('div', 'note',
      '每轮信息依赖任务房主（Host）日志。击杀/生成均限于轮次战斗期间（ModeState=3→4）。折线图可点击全屏查看；悬停标记可见精确时间戳。'));
  }

  // ── 击杀走势折线图构建 ─────────────────────────────────────
  function _buildKillChart(rec) {
    const start = rec.startT;
    const dur   = rec.totalDuration;

    const killTimes = (rec.killEvents || [])
      .map(t => t - start)
      .filter(t => t >= 0 && t <= dur)
      .sort((a, b) => a - b);
    const totalKills = killTimes.length;

    const insertEvts = [];
    const doneEvts   = [];
    rec.rounds.forEach(r => {
      r.conduits.forEach(c => {
        if (c.insertT != null) {
          const relT = c.insertT - start;
          if (relT >= 0) insertEvts.push({ relT, round: r.index, artNum: c.artNum, effectKind: c.effectKind, effectId: c.effectId });
        }
        if (c.doneT != null) {
          const relT = c.doneT - start;
          if (relT >= 0) doneEvts.push({ relT, round: r.index, success: c.success, artNum: c.artNum, effectKind: c.effectKind, effectId: c.effectId });
        }
      });
    });

    // ── SVG layout ──────────────────────────────────────────
    const pxPerMin = 50;
    const W    = Math.max(1400, Math.ceil(dur / 60) * pxPerMin + 120);
    const H    = 400;
    const ML   = 72, MR = 24, MT = 36;
    const plotH = 210;
    const plotW = W - ML - MR;
    const xAxisY = MT + plotH;
    const stripY   = xAxisY + 30;
    const insRowY  = stripY + 12;
    const doneRowY = stripY + 36;
    const legendY  = stripY + 62;

    const tx = relT => ML + Math.min(plotW, Math.max(0, (relT / dur) * plotW));
    const ty = k    => xAxisY - (totalKills > 0 ? (k / totalKills) * plotH : 0);

    const niceX = [15, 30, 60, 120, 300, 600];
    const tickX = niceX.find(n => n >= dur / 18) || 600;
    const niceY = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
    const tickY = totalKills > 0 ? (niceY.find(n => n >= totalKills / 8) || 1000) : 10;

    let svgStr = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;font-family:inherit">`;

    svgStr += `<rect x="${ML}" y="${MT}" width="${plotW}" height="${plotH}" fill="rgba(255,255,255,0.015)" rx="2"/>`;

    rec.rounds.forEach(r => {
      const x = tx(r.startT - start).toFixed(1);
      svgStr += `<line x1="${x}" y1="${MT}" x2="${x}" y2="${xAxisY}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`;
    });
    rec.rounds
      .filter((r, i) => i === 0 || r.index % 5 === 0)
      .forEach(r => {
        const x = tx(r.startT - start).toFixed(1);
        svgStr += `<text x="${x}" y="${MT - 5}" fill="var(--c-text2)" font-size="9" text-anchor="middle">R${r.index}</text>`;
      });

    for (let k = tickY; k <= totalKills + tickY; k += tickY) {
      const y = ty(k);
      if (y < MT - 2) break;
      svgStr += `<line x1="${ML}" y1="${y.toFixed(1)}" x2="${(ML + plotW).toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.07)" stroke-width="1" stroke-dasharray="4,4"/>`;
      svgStr += `<text x="${(ML - 6).toFixed(1)}" y="${(y + 4).toFixed(1)}" fill="var(--c-text2)" font-size="10" text-anchor="end">${k}</text>`;
    }

    if (killTimes.length > 0) {
      let d = `M ${ML.toFixed(1)},${xAxisY.toFixed(1)}`;
      let k = 0;
      for (const relT of killTimes) {
        k++;
        d += ` H ${tx(relT).toFixed(1)} V ${ty(k).toFixed(1)}`;
      }
      d += ` H ${(ML + plotW).toFixed(1)}`;
      svgStr += `<path d="${d} V ${xAxisY.toFixed(1)} Z" fill="rgba(65,255,142,0.07)" stroke="none"/>`;
      svgStr += `<path d="${d}" fill="none" stroke="#41ff8e" stroke-width="1.5" stroke-linejoin="round"/>`;
      svgStr += `<text x="${(ML + plotW + 4).toFixed(1)}" y="${ty(totalKills).toFixed(1)}" fill="#41ff8e" font-size="10" dominant-baseline="middle">${totalKills}</text>`;
    }

    svgStr += `<line x1="${ML}" y1="${xAxisY}" x2="${(ML + plotW).toFixed(1)}" y2="${xAxisY}" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>`;

    for (let t2 = 0; t2 <= dur + tickX * 0.5; t2 += tickX) {
      if (t2 > dur + 1) break;
      const x  = tx(t2).toFixed(1);
      const mm = Math.floor(t2 / 60);
      const ss = String(Math.floor(t2 % 60)).padStart(2, '0');
      svgStr += `<line x1="${x}" y1="${xAxisY}" x2="${x}" y2="${xAxisY + 5}" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>`;
      svgStr += `<text x="${x}" y="${xAxisY + 17}" fill="var(--c-text2)" font-size="10" text-anchor="middle">${mm}:${ss}</text>`;
    }

    svgStr += `<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${xAxisY}" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>`;
    const ylx = ML - 52, yly = MT + plotH / 2;
    svgStr += `<text transform="rotate(-90,${ylx},${yly})" x="${ylx}" y="${yly}" fill="var(--c-text2)" font-size="10" text-anchor="middle" dominant-baseline="middle">累计击杀数</text>`;
    svgStr += `<line x1="${ML}" y1="${stripY + 2}" x2="${(ML + plotW).toFixed(1)}" y2="${stripY + 2}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
    svgStr += `<text x="${ML - 4}" y="${insRowY + 4}" fill="#5bc8ff" font-size="9" text-anchor="end">插入</text>`;
    svgStr += `<text x="${ML - 4}" y="${doneRowY + 4}" fill="var(--c-text2)" font-size="9" text-anchor="end">完成</text>`;

    insertEvts.forEach(ev => {
      const effLabel = ev.effectKind ? _conduitEffectLabel(ev) : '';
      const tip = `R${ev.round}${ev.artNum != null ? ' 导管' + ev.artNum : ''}${effLabel ? ' ' + effLabel : ''} 插入 +${U.fmtDuration(ev.relT)}`;
      const x  = tx(ev.relT);
      const x1 = x.toFixed(1), x2 = (x - 4).toFixed(1), x3 = (x + 4).toFixed(1);
      const y1 = (insRowY - 7).toFixed(1), y23 = (insRowY + 5).toFixed(1);
      svgStr += `<polygon points="${x1},${y1} ${x2},${y23} ${x3},${y23}" fill="#5bc8ff" opacity="0.85"><title>${tip}</title></polygon>`;
    });

    doneEvts.forEach(ev => {
      const x   = tx(ev.relT).toFixed(1);
      const col = _conduitColor(ev);
      const lbl = ev.success === true ? '守卫成功' : ev.success === false ? '守卫失败' : '结果未知';
      const effLabel = ev.effectKind ? _conduitEffectLabel(ev) : '';
      const tip = `R${ev.round}${ev.artNum != null ? ' 导管' + ev.artNum : ''}${effLabel ? ' ' + effLabel : ''} ${lbl} +${U.fmtDuration(ev.relT)}`;
      svgStr += `<circle cx="${x}" cy="${doneRowY}" r="4.5" fill="${col}" opacity="0.82"><title>${tip}</title></circle>`;
    });

    const lx = ML;
    svgStr += `<rect x="${lx}" y="${legendY}" width="18" height="2.5" rx="1" fill="#41ff8e"/>`;
    svgStr += `<text x="${lx + 22}" y="${legendY + 10}" fill="var(--c-text2)" font-size="10">击杀累计折线</text>`;
    svgStr += `<polygon points="${lx+105},${legendY-1} ${lx+101},${legendY+11} ${lx+109},${legendY+11}" fill="#5bc8ff" opacity="0.85"/>`;
    svgStr += `<text x="${lx + 114}" y="${legendY + 10}" fill="var(--c-text2)" font-size="10">钥匙插入</text>`;
    svgStr += `<circle cx="${lx + 210}" cy="${legendY + 5}" r="4.5" fill="#41ff8e" opacity="0.82"/>`;
    svgStr += `<text x="${lx + 220}" y="${legendY + 10}" fill="var(--c-text2)" font-size="10">守卫成功</text>`;
    svgStr += `<circle cx="${lx + 278}" cy="${legendY + 5}" r="4.5" fill="#ff5f6b" opacity="0.82"/>`;
    svgStr += `<text x="${lx + 288}" y="${legendY + 10}" fill="var(--c-text2)" font-size="10">守卫失败</text>`;
    svgStr += `<circle cx="${lx + 346}" cy="${legendY + 5}" r="4.5" fill="#ffd700" opacity="0.82"/>`;
    svgStr += `<text x="${lx + 356}" y="${legendY + 10}" fill="var(--c-text2)" font-size="10">危险Buff效果</text>`;
    svgStr += `</svg>`;

    // ── 容器：小图（可横向滚动） + 点击弹出全屏 ──────────────
    const section = U.el('div', 'chart-box dis-tl-wrap');
    section.appendChild(U.el('div', 'dis-tl-title', '击杀走势 · 全程累计折线 + 导管事件时间轴'));

    const hint = U.el('div', 'dis-chart-hint', '▸ 点击图表查看全屏（支持悬停查看精确时间戳）');
    hint.style.cssText = 'margin-bottom:8px';
    section.appendChild(hint);

    const scroll = U.el('div', 'dis-chart-zoom');
    scroll.style.cssText = 'overflow-x:auto;padding-bottom:6px';
    scroll.innerHTML = svgStr;

    // tooltip 数据包（供内联图和全屏图共用）
    const tipData = { ML, MT, plotH, plotW, xAxisY, W, dur, killTimes, totalKills };
    _addKillChartInteractivity(scroll.querySelector('svg'), tipData);
    scroll.addEventListener('click', () => _showFullscreen(svgStr, tipData));
    section.appendChild(scroll);

    return section;
  }

  // ── 折线图交互提示（二分查找 + SVG crosshair） ────────────
  function _addKillChartInteractivity(svgEl, td) {
    if (!svgEl || td.killTimes.length === 0) return;
    const ns = 'http://www.w3.org/2000/svg';
    const ktimes = td.killTimes;

    // 二分查找：时间 t 时的累计击杀数
    function bisect(t) {
      let lo = 0, hi = ktimes.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (ktimes[m] <= t) lo = m + 1; else hi = m; }
      return lo;
    }
    const txFn = relT => td.ML + Math.min(td.plotW, Math.max(0, (relT / td.dur) * td.plotW));
    const tyFn = k    => td.xAxisY - (td.totalKills > 0 ? (k / td.totalKills) * td.plotH : 0);

    // Crosshair group
    const g = document.createElementNS(ns, 'g');
    g.style.pointerEvents = 'none'; g.style.display = 'none';

    const vline = document.createElementNS(ns, 'line');
    vline.setAttribute('stroke', 'rgba(255,255,255,0.3)');
    vline.setAttribute('stroke-width', '1');
    vline.setAttribute('stroke-dasharray', '4,3');
    g.appendChild(vline);

    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('r', '4.5');
    dot.setAttribute('fill', '#41ff8e');
    dot.setAttribute('stroke', 'rgba(0,0,0,0.55)');
    dot.setAttribute('stroke-width', '1.5');
    g.appendChild(dot);

    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('rx', '3');
    bg.setAttribute('fill', 'rgba(4,5,12,0.88)');
    bg.setAttribute('stroke', 'rgba(255,255,255,0.14)');
    bg.setAttribute('stroke-width', '1');
    g.appendChild(bg);

    const txt = document.createElementNS(ns, 'text');
    txt.setAttribute('fill', 'rgba(255,255,255,0.92)');
    txt.setAttribute('font-size', '11');
    txt.setAttribute('font-family', 'monospace');
    g.appendChild(txt);

    svgEl.appendChild(g);

    // Transparent hit area over the plot region
    const hit = document.createElementNS(ns, 'rect');
    hit.setAttribute('x', String(td.ML));
    hit.setAttribute('y', String(td.MT));
    hit.setAttribute('width', String(td.plotW));
    hit.setAttribute('height', String(td.plotH));
    hit.setAttribute('fill', 'transparent');
    hit.style.cursor = 'crosshair';
    svgEl.appendChild(hit);

    hit.addEventListener('mousemove', e => {
      const rect = svgEl.getBoundingClientRect();
      const svgW = parseFloat(svgEl.getAttribute('width') || svgEl.viewBox.baseVal.width);
      const scaleX = svgW / rect.width;
      const svgX = (e.clientX - rect.left) * scaleX;
      const relT = Math.max(0, Math.min(td.dur, ((svgX - td.ML) / td.plotW) * td.dur));
      const k    = bisect(relT);
      const mm   = String(Math.floor(relT / 60));
      const ss   = String(Math.floor(relT % 60)).padStart(2, '0');
      const label = `${mm}:${ss}  击杀 ${k}`;

      const lx = txFn(relT), ly = tyFn(k);
      vline.setAttribute('x1', String(lx)); vline.setAttribute('y1', String(td.MT));
      vline.setAttribute('x2', String(lx)); vline.setAttribute('y2', String(td.xAxisY));
      dot.setAttribute('cx', String(lx)); dot.setAttribute('cy', String(ly));

      const isRight = lx > svgW * 0.65;
      const anchor  = isRight ? 'end' : 'start';
      const tx2     = isRight ? lx - 7 : lx + 7;
      txt.setAttribute('x', String(tx2));
      txt.setAttribute('y', String(td.MT + 16));
      txt.setAttribute('text-anchor', anchor);
      txt.textContent = label;

      const bw = label.length * 6.6 + 10;
      const bx = isRight ? tx2 - bw + 4 : tx2 - 5;
      bg.setAttribute('x', String(bx)); bg.setAttribute('y', String(td.MT + 4));
      bg.setAttribute('width', String(bw)); bg.setAttribute('height', '17');

      g.style.display = '';
    });
    hit.addEventListener('mouseleave', () => { g.style.display = 'none'; });
  }

  // ── 全屏弹窗 ──────────────────────────────────────────────
  function _showFullscreen(svgStr, tipData) {
    const overlay = U.el('div', 'dis-chart-overlay');

    const modal = U.el('div', 'dis-chart-modal');
    modal.innerHTML = svgStr;
    if (tipData) _addKillChartInteractivity(modal.querySelector('svg'), tipData);
    modal.addEventListener('click', e => e.stopPropagation());
    overlay.appendChild(modal);

    overlay.appendChild(U.el('div', 'dis-chart-hint', '点击空白处 或 按 Esc 关闭'));

    const close = () => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey);
    };
    const onKey = e => { if (e.key === 'Escape') close(); };
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  }

  // ── Conduit effect helpers ────────────────────────────────
  // Dangerous debuff IDs (highlighted yellow): 能量消耗(1)、敌人使用毒素武器(11)、群居狩猎野兽(26)
  const BAD_IDS = new Set([1, 11, 26]);

  // Debuff ID → Chinese display name（按维基减益效果顺序排列，ID 映射待游戏内验证）
  const DEBUFF_NAMES = {
    1:  '能量消耗',
    2:  '护盾消耗',
    3:  '生命值消耗',
    4:  '敌人速度加成',
    5:  '敌人伤害加成',
    6:  '敌人护甲强化',
    7:  '敌人护盾强化',
    8:  '敌人使用火焰武器',
    9:  '敌人使用冰冻武器',
    10: '敌人使用电击武器',
    11: '敌人使用毒素武器',
    12: '敌人获得技能抗性',
    13: '敌人获得伤害抗性',
    14: '更强大的密钥输送者',
    15: '卓越者攻击波',
    16: '带电导管',
    17: '安全警报',
    18: '月震',
    19: 'Sentient涌入',
    20: '磁场异常',
    21: '雷区',
    22: '尸鬼暴穴',
    23: '系统超载',
    24: '机器人的猛攻',
    25: '虚能导管',
    26: '群居狩猎野兽',
    27: '孵窠涌流',
  };

  // Buff ID → Chinese display name（按维基增益效果顺序排列）
  const BUFF_NAMES = {
    31: '+50% 经验值加成',
    32: '+50% 资源数量加成',
    33: '+50% 现金数量加成',
    34: 'Tenno获得武器吸血效果',
    35: 'Tenno获得射速加成',
    36: 'Tenno获得移动速度加成',
    37: '补给导管',
    38: '导管卫士',
  };

  function _isBadDebuff(c) {
    return c.effectKind === 'debuff' && c.effectId != null && BAD_IDS.has(c.effectId);
  }

  function _effectName(c) {
    if (c.effectKind === 'buff') {
      return c.effectId != null ? (BUFF_NAMES[c.effectId] || `待翻译 (ID:${c.effectId})`) : '—';
    }
    return c.effectId != null ? (DEBUFF_NAMES[c.effectId] || `待翻译 (ID:${c.effectId})`) : '—';
  }

  function _conduitEffectLabel(c) {
    if (c.effectKind == null) return '';
    return `Buff效果: ${_effectName(c)}`;
  }

  function _conduitColor(c) {
    if (c.success === false) return '#ff5f6b';   // 失守 → 红色（最高优先级）
    if (_isBadDebuff(c))     return '#ffd700';   // 危险减益但守住 → 黄色
    if (c.success === true)  return '#41ff8e';   // 普通成功 → 绿色
    return '#aaa';
  }

  function _st(label, value, cls) {
    const d = U.el('div', 'stat ' + (cls || ''));
    d.appendChild(U.el('div', 'stat-value', value));
    d.appendChild(U.el('div', 'stat-label', label));
    return d;
  }

  return { render, summary };
})();
