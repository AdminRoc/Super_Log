/* 中断任务详情视图：总时长 + 每轮表格 + 耗时条形图 */
window.WF = window.WF || {};

WF.disruptionView = (function () {
  const U = WF.utils;

  function summary(rec) {
    return {
      title: `中断 ${rec.roundCount} 轮${rec.name ? ' · ' + rec.name : ''}`,
      sub: `总时长 ${U.fmtDurationLong(rec.totalDuration)}${rec.score != null ? ` ｜ 总分 ${rec.score}` : ''}`,
    };
  }

  function render(container, rec) {
    container.innerHTML = '';

    const hero = U.el('div', 'hero-row');
    hero.appendChild(stat('任务总时长（加载→结算）', U.fmtDurationLong(rec.totalDuration), 'big'));
    hero.appendChild(stat('完成轮次', `${rec.roundCount}`, 'accent'));
    if (rec.score != null) hero.appendChild(stat('总分', `${rec.score}`, ''));
    if (rec.name) hero.appendChild(stat('任务', rec.name, ''));
    container.appendChild(hero);

    // 条形图（SVG）
    const maxDur = Math.max(...rec.rounds.map((r) => r.duration));
    const barH = 6, gap = 2, w = 760;
    const h = rec.rounds.length * (barH + gap);
    let svg = `<svg viewBox="0 0 ${w} ${h}" class="round-chart" preserveAspectRatio="none">`;
    rec.rounds.forEach((r, i) => {
      const bw = Math.max(2, (r.duration / maxDur) * (w - 60));
      const y = i * (barH + gap);
      const ok = r.conduits.length === 0 || r.conduits.every(Boolean);
      svg += `<rect x="50" y="${y}" width="${bw}" height="${barH}" rx="2" class="${ok ? 'bar-ok' : 'bar-fail'}"><title>第 ${r.index} 轮：${U.fmtDuration(r.duration)}</title></rect>`;
      if (i % 5 === 4 || i === 0) svg += `<text x="44" y="${y + barH}" class="bar-label" text-anchor="end">${r.index}</text>`;
    });
    svg += '</svg>';
    const chartBox = U.el('div', 'chart-box');
    chartBox.innerHTML = svg;
    container.appendChild(chartBox);

    // 表格
    const tbl = U.el('table', 'round-table');
    tbl.innerHTML = '<thead><tr><th>轮次</th><th>本轮耗时</th><th>累计耗时</th><th>传导体</th></tr></thead>';
    const tbody = U.el('tbody');
    rec.rounds.forEach((r) => {
      const tr = U.el('tr');
      tr.appendChild(U.el('td', 'td-idx', String(r.index)));
      tr.appendChild(U.el('td', 'td-mono', U.fmtDuration(r.duration)));
      tr.appendChild(U.el('td', 'td-mono', U.fmtDurationLong(r.cumulative)));
      const cd = U.el('td', 'td-conduits');
      if (r.conduits.length === 0) cd.textContent = '—';
      else r.conduits.forEach((ok) => cd.appendChild(U.el('span', ok ? 'cd ok' : 'cd fail', ok ? '✓' : '✗')));
      tr.appendChild(cd);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    const tblWrap = U.el('div', 'table-wrap');
    tblWrap.appendChild(tbl);
    container.appendChild(tblWrap);

    container.appendChild(U.el('div', 'note',
      '注：每轮信息依赖任务房主(host)的日志；非房主日志可能缺少轮次状态行。轮间等待时间计入下一轮耗时。'));
  }

  function stat(label, value, cls) {
    const d = U.el('div', 'stat ' + (cls || ''));
    d.appendChild(U.el('div', 'stat-value', value));
    d.appendChild(U.el('div', 'stat-label', label));
    return d;
  }

  return { render, summary };
})();
