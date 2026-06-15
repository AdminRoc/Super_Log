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
    let svg = `<svg viewBox="0 0 ${w} ${h}" class="round-chart" preserveAspectRatio="none">`;
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

    // ── 插钥匙时间轴（多轮堆叠 SVG） ─────────────────────────
    const hasInsertTiming = rec.rounds.some(r =>
      r.conduits.length > 0 && r.conduits.some(c => c.insertRelT != null)
    );
    const hasConduitTiming = hasInsertTiming || rec.rounds.some(r =>
      r.conduits.length > 0 && r.conduits.some(c => c.doneRelT != null)
    );
    if (hasConduitTiming) {
      const tlWrap = U.el('div', 'chart-box dis-tl-wrap');
      tlWrap.appendChild(U.el('div', 'dis-tl-title', '插钥匙时间轴（每轮 · 相对本轮战斗起点）'));

      const rowH = 14, rowGap = 5, labelW = 44, tlW = 680;
      const totalH = rec.rounds.length * (rowH + rowGap);

      let tlSvg = `<svg viewBox="0 0 ${labelW + tlW + 4} ${totalH}" class="dis-tl-svg">`;
      rec.rounds.forEach((r, i) => {
        const y    = i * (rowH + rowGap);
        const maxT = Math.max(r.combatDuration, 1);

        if (i % 5 === 4 || i === 0) {
          tlSvg += `<text x="${labelW - 4}" y="${y + rowH - 1}" class="bar-label" text-anchor="end">${r.index}</text>`;
        }
        tlSvg += `<rect x="${labelW}" y="${y + 3}" width="${tlW}" height="${rowH - 6}" rx="2" class="dis-tl-track"/>`;

        r.conduits.forEach(c => {
          // prefer insertion time for position; fall back to done time
          const posRelT = c.insertRelT != null ? c.insertRelT : c.doneRelT;
          if (posRelT == null) return;
          const cx  = labelW + Math.min(1, Math.max(0, posRelT / maxT)) * tlW;
          const col = c.success ? '#41ff8e' : c.success === false ? '#ff5f6b' : '#aaa';
          let tip = c.insertRelT != null ? `插入 +${U.fmtDuration(c.insertRelT)}` : '';
          if (c.doneRelT != null) tip += (tip ? ' → ' : '') + (c.success ? '成功' : '失败') + ` +${U.fmtDuration(c.doneRelT)}`;
          tlSvg += `<circle cx="${cx.toFixed(1)}" cy="${(y + rowH / 2).toFixed(1)}" r="4" fill="${col}" opacity="0.88" stroke="${col}44" stroke-width="2"><title>${tip}</title></circle>`;
        });
      });
      tlSvg += '</svg>';
      const tlBox = U.el('div', 'dis-tl-svg-box');
      tlBox.innerHTML = tlSvg;
      tlWrap.appendChild(tlBox);

      const legend = U.el('div', 'dis-tl-legend');
      legend.innerHTML = '<span class="cd ok">●</span> 导管守卫成功 &nbsp;&nbsp;<span class="cd fail">●</span> 导管守卫失败 &nbsp;&nbsp;<span style="color:var(--c-text2);font-size:11px">标记横向位置 = 插入钥匙时间占本轮战斗时长的比例</span>';
      tlWrap.appendChild(legend);
      container.appendChild(tlWrap);
    }

    // ── 轮次详情表格 ─────────────────────────────────────────
    const hasKills = rec.rounds.some(r => r.kills > 0);
    const tbl = U.el('table', 'round-table');
    const headCols = ['轮次', '本轮耗时', '累计耗时', '导管'];
    if (hasKills) headCols.push('击杀');
    tbl.innerHTML = `<thead><tr>${headCols.map(c => `<th>${c}</th>`).join('')}</tr></thead>`;

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
          let tip = '';
          if (c.insertRelT != null) tip += `插入 +${U.fmtDuration(c.insertRelT)}`;
          if (c.doneRelT   != null) tip += (tip ? '\n' : '') + `${c.success ? '守卫成功' : '守卫失败'} +${U.fmtDuration(c.doneRelT)}`;
          if (tip) sp.title = tip;
          cd.appendChild(sp);
        });
      }
      tr.appendChild(cd);

      if (hasKills) tr.appendChild(U.el('td', 'td-mono', String(r.kills)));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);

    const tblWrap = U.el('div', 'table-wrap');
    tblWrap.appendChild(tbl);
    container.appendChild(tblWrap);

    container.appendChild(U.el('div', 'note',
      '每轮信息依赖任务房主（Host）日志；非房主日志可能缺少轮次状态行。插钥匙时间轴的横轴位置 = 钥匙插入时间相对本轮战斗起点的比例。'));
  }

  function _st(label, value, cls) {
    const d = U.el('div', 'stat ' + (cls || ''));
    d.appendChild(U.el('div', 'stat-value', value));
    d.appendChild(U.el('div', 'stat-label', label));
    return d;
  }

  return { render, summary };
})();
