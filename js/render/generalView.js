window.WF = window.WF || {};

WF.generalView = (function () {
  const U = WF.utils;

  function summary(rec) {
    return {
      title: `${rec.missionTypeCN}  ${rec.missionName !== '—' ? rec.missionName : ''}`,
      sub:   U.fmtDurationLong(rec.totalDuration) + (rec.locationNode ? `  ｜  ${rec.locationNode}` : ''),
    };
  }

  function render(container, rec, clock) {
    container.innerHTML = '';

    // ── 任务标头 ─────────────────────────────────────────────
    const hero = U.el('div', 'hero-row');
    hero.appendChild(_st('任务模式',   rec.missionTypeCN, 'accent'));
    hero.appendChild(_st('任务名称',   rec.missionName,   ''));
    hero.appendChild(_st('总时长',     U.fmtDurationLong(rec.totalDuration), 'big'));
    if (rec.frameDuration != null) {
      hero.appendChild(_st('首帧→尾帧', U.fmtDurationLong(rec.frameDuration), ''));
    }
    if (rec.locationNode) hero.appendChild(_st('地图节点', rec.locationNode, ''));
    container.appendChild(hero);

    // ── 时间节点详情 ─────────────────────────────────────────
    const timingBox = U.el('div', 'gen-timing-box');
    timingBox.appendChild(U.el('div', 'gen-timing-title', '时间节点'));

    const timingGrid = U.el('div', 'gen-timing-grid');

    // absolute start time from clock if available
    if (clock && clock.available) {
      const absDate = clock.toDate(rec.startT);
      if (absDate) {
        _timingRow(timingGrid, '任务开始时刻',
          U.fmtAbsTime(absDate, clock.approx),
          '实际时钟时间，由日志内 Current time 行换算');
      }
    }

    _timingRow(timingGrid, '任务总时长（与游戏结算一致）',
      U.fmtDurationLong(rec.totalDuration),
      'SS_STARTED → EOM 触发，与游戏结算界面显示数字一致');

    if (rec.firstFrameT != null) {
      _timingRow(timingGrid, '首帧偏移（相对计时起点）',
        U.fmtDuration(rec.firstFrameT - rec.startT),
        'HUD REDUX 首次渲染相对 SS_STARTED 的偏移（通常 < 0.1s，可能略负）');
    }

    if (rec.frameDuration != null) {
      _timingRow(timingGrid, '首帧 → 尾帧时差',
        U.fmtDurationLong(rec.frameDuration),
        '尾帧时刻 − 首帧时刻，≈ 任务总时长');
    }

    timingBox.appendChild(timingGrid);
    container.appendChild(timingBox);

    // ── 防御波次表 ────────────────────────────────────────────
    if (rec.waves && rec.waves.length > 0) {
      const waveSection = U.el('div', 'gen-section');
      const waveTitle = U.el('div', 'gen-section-title');
      waveTitle.textContent = `防御波次详情（共 ${rec.waves.length} 波）`;
      waveSection.appendChild(waveTitle);

      // summary stats
      const totalKills = rec.waves.reduce((s, w) => s + (w.kills || 0), 0);
      const avgDur     = rec.waves.reduce((s, w) => s + (w.duration || 0), 0) / rec.waves.length;
      const statRow = U.el('div', 'hero-row');
      statRow.appendChild(_st('总波次', String(rec.waves.length), 'accent'));
      statRow.appendChild(_st('波均时长', U.fmtDuration(avgDur), ''));
      statRow.appendChild(_st('总击杀数', String(totalKills), ''));
      waveSection.appendChild(statRow);

      // wave overview chart
      const maxWaveDur = Math.max(...rec.waves.map(w => w.duration || 0), 1);
      const wbarH = 8, wgap = 3, ww = 760;
      const wh = rec.waves.length * (wbarH + wgap);
      let wsvg = `<svg viewBox="0 0 ${ww} ${wh}" class="round-chart" preserveAspectRatio="none">`;
      rec.waves.forEach((w, i) => {
        const bw  = Math.max(2, ((w.duration || 0) / maxWaveDur) * (ww - 60));
        const y   = i * (wbarH + wgap);
        wsvg += `<rect x="50" y="${y}" width="${bw}" height="${wbarH}" rx="2" class="bar-ok"><title>Wave ${w.index}：${U.fmtDuration(w.duration)} | 击杀 ${w.kills}/${w.totalEnemies}</title></rect>`;
        if (i % 5 === 4 || i === 0) wsvg += `<text x="44" y="${y + wbarH}" class="bar-label" text-anchor="end">${w.index}</text>`;
      });
      wsvg += '</svg>';
      const wChartBox = U.el('div', 'chart-box');
      wChartBox.innerHTML = wsvg;
      waveSection.appendChild(wChartBox);

      // wave table
      const tbl = U.el('table', 'round-table');
      tbl.innerHTML = '<thead><tr><th>波次</th><th>起始时刻</th><th>结束时刻</th><th>波次时长</th><th>击杀 / 派出</th></tr></thead>';
      const tbody = U.el('tbody');
      const missionStart = rec.startT;
      rec.waves.forEach(w => {
        const tr = U.el('tr');
        tr.appendChild(U.el('td', 'td-idx', String(w.index)));
        tr.appendChild(U.el('td', 'td-mono', U.fmtDuration(w.startT - missionStart)));
        tr.appendChild(U.el('td', 'td-mono', w.endT ? U.fmtDuration(w.endT - missionStart) : '—'));
        tr.appendChild(U.el('td', 'td-mono', w.duration ? U.fmtDuration(w.duration) : '—'));
        const killCell = U.el('td', 'td-mono');
        killCell.textContent = `${w.kills} / ${w.totalEnemies}`;
        if (w.kills < w.totalEnemies) killCell.style.color = 'var(--c-text2)';
        tr.appendChild(killCell);
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      const tblWrap = U.el('div', 'table-wrap');
      tblWrap.appendChild(tbl);
      waveSection.appendChild(tblWrap);
      container.appendChild(waveSection);
    }

    // ── 备注 ─────────────────────────────────────────────────
    container.appendChild(U.el('div', 'note',
      '任务总时长 = SS_STARTED → EOM missionLocationUnlocked，与游戏结算显示一致。首帧偏移 = HUD REDUX 首次渲染相对计时起点的偏差（通常 < 0.1s）。击杀数含所有实体死亡事件。'));
  }

  function _st(label, value, cls) {
    const d = U.el('div', 'stat ' + (cls || ''));
    d.appendChild(U.el('div', 'stat-value', value));
    d.appendChild(U.el('div', 'stat-label', label));
    return d;
  }

  function _timingRow(grid, label, value, hint) {
    const row = U.el('div', 'gen-timing-row');
    row.appendChild(U.el('span', 'gen-timing-label', label));
    const valEl = U.el('span', 'gen-timing-val', value);
    if (hint) valEl.title = hint;
    row.appendChild(valEl);
    if (hint) row.appendChild(U.el('span', 'gen-timing-hint', hint));
    grid.appendChild(row);
  }

  return { render, summary };
})();
