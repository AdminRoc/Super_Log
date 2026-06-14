window.WF = window.WF || {};

WF.disruptionView = (function () {
  const U = WF.utils;

  function summary(rec) {
    const rpm = rec.roundsPerMin != null ? rec.roundsPerMin.toFixed(2) : '—';
    return {
      title: `中断 ${rec.roundCount} 轮${rec.name ? ' · ' + rec.name : ''}`,
      sub: `${U.fmtDurationLong(rec.totalDuration)} ｜ 评分 ${rec.perfScore ?? '—'} ${rec.perfGrade ?? ''} ｜ ${rpm} 轮/分钟`,
    };
  }

  function render(container, rec) {
    container.innerHTML = '';

    // ── 评分徽章 ──────────────────────────────────────────────
    if (rec.perfScore != null) {
      const topRow = U.el('div', 'arb-top-row');
      const badge  = U.el('div', 'arb-score-badge grade-' + (rec.perfGrade || 'd').toLowerCase());
      badge.appendChild(U.el('div', 'arb-score-label', rec.perfGrade || '—'));
      badge.appendChild(U.el('div', 'arb-score-num',   String(rec.perfScore)));
      badge.appendChild(U.el('div', 'arb-score-sub',   '/ 100'));
      badge.title = '效率分（轮次/分钟 × 70%）+ 传导体成功率（× 30%）';
      topRow.appendChild(badge);

      const meta = U.el('div', 'arb-meta');
      const metaTitle = U.el('div', 'arb-meta-title');
      metaTitle.textContent = [rec.name, rec.roundCount + ' 轮'].filter(Boolean).join(' · ');
      meta.appendChild(metaTitle);
      [
        `总时长 ${U.fmtDurationLong(rec.totalDuration)}`,
        `每分钟 ${rec.roundsPerMin != null ? rec.roundsPerMin.toFixed(2) : '—'} 轮`,
        rec.totalConduits > 0 ? `传导体成功率 ${(rec.conduitRate * 100).toFixed(1)}%（${rec.successConduits}/${rec.totalConduits}）` : null,
      ].filter(Boolean).forEach(s => meta.appendChild(U.el('div', 'arb-meta-sub', s)));
      const gradeDesc = {
        S: '极优 — 每分钟 ≥ 1.8 轮 + 高传导体成功率',
        A: '良好 — 每分钟 ≈ 1.5 轮',
        B: '一般 — 每分钟 ≈ 1.2 轮',
        C: '较差 — 每分钟 ≈ 0.9 轮',
        D: '低效 — 每分钟 < 0.9 轮',
      };
      meta.appendChild(U.el('div', 'arb-grade-desc', gradeDesc[rec.perfGrade] || ''));
      topRow.appendChild(meta);
      container.appendChild(topRow);
    }

    // ── 总览统计行 ────────────────────────────────────────────
    const hero = U.el('div', 'hero-row');
    hero.appendChild(_st('任务总时长', U.fmtDurationLong(rec.totalDuration), 'big'));
    hero.appendChild(_st('完成轮次', String(rec.roundCount), 'accent'));
    if (rec.roundsPerMin != null) hero.appendChild(_st('每分钟轮数', rec.roundsPerMin.toFixed(2), ''));
    if (rec.totalConduits > 0)   hero.appendChild(_st('传导体成功率', (rec.conduitRate * 100).toFixed(1) + '%', ''));
    if (rec.score != null)       hero.appendChild(_st('游戏得分', String(rec.score), ''));
    if (rec.name)                hero.appendChild(_st('任务地图', rec.name, ''));
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

    // ── 传导体完成时间轴（多轮堆叠 SVG） ─────────────────────
    const hasConduitTiming = rec.rounds.some(r => r.conduits.length > 0 && r.combatDuration > 0);
    if (hasConduitTiming) {
      const tlWrap = U.el('div', 'chart-box dis-tl-wrap');
      tlWrap.appendChild(U.el('div', 'dis-tl-title', '传导体完成时间轴（每轮 · 相对本轮战斗起点）'));

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
          const cx  = labelW + Math.min(1, Math.max(0, c.relT / maxT)) * tlW;
          const col = c.success ? '#41ff8e' : '#ff5f6b';
          const tip = `${c.success ? '✓' : '✗'} +${U.fmtDuration(c.relT)} 后完成`;
          tlSvg += `<circle cx="${cx.toFixed(1)}" cy="${(y + rowH / 2).toFixed(1)}" r="4" fill="${col}" opacity="0.88" stroke="${col}44" stroke-width="2"><title>${tip}</title></circle>`;
        });
      });
      tlSvg += '</svg>';
      const tlBox = U.el('div', 'dis-tl-svg-box');
      tlBox.innerHTML = tlSvg;
      tlWrap.appendChild(tlBox);

      const legend = U.el('div', 'dis-tl-legend');
      legend.innerHTML = '<span class="cd ok">●</span> 传导体成功 &nbsp;&nbsp;<span class="cd fail">●</span> 传导体失败 &nbsp;&nbsp;<span style="color:var(--c-text2);font-size:11px">标记横向位置 = 完成时间占本轮战斗时长的比例</span>';
      tlWrap.appendChild(legend);
      container.appendChild(tlWrap);
    }

    // ── 轮次详情表格 ─────────────────────────────────────────
    const hasKills = rec.rounds.some(r => r.kills > 0);
    const tbl = U.el('table', 'round-table');
    const headCols = ['轮次', '本轮耗时', '累计耗时', '传导体'];
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
          const sp = U.el('span', c.success ? 'cd ok' : 'cd fail', c.success ? '✓' : '✗');
          sp.title = '+' + U.fmtDuration(c.relT) + ' 后完成';
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
      '每轮信息依赖任务房主（Host）日志；非房主日志可能缺少轮次状态行。评分 = 效率分（轮次/分钟基准 1.8，权重 70%）+ 传导体成功率（权重 30%），S ≥ 90 / A ≥ 75 / B ≥ 55 / C ≥ 35 / D < 35。击杀数统计包含所有实体击杀事件（含玩家死亡，误差极小）。'));
  }

  function _st(label, value, cls) {
    const d = U.el('div', 'stat ' + (cls || ''));
    d.appendChild(U.el('div', 'stat-value', value));
    d.appendChild(U.el('div', 'stat-label', label));
    return d;
  }

  return { render, summary };
})();
