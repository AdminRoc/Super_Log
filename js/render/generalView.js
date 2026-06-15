window.WF = window.WF || {};

WF.generalView = (function () {
  const U = WF.utils;

  function summary(rec) {
    const loc = rec.locationDisplay || rec.locationNode || '';
    return {
      title: `${rec.missionTypeCN}  ${rec.missionName !== '—' ? rec.missionName : (loc || '')}`,
      sub:   U.fmtDurationLong(rec.totalDuration) + (loc ? `  ｜  ${loc}` : ''),
    };
  }

  function render(container, rec, clock) {
    container.innerHTML = '';

    // ── 任务标头（核心一览） ──────────────────────────────────
    const hero = U.el('div', 'hero-row');
    hero.appendChild(_st('任务模式', rec.missionTypeCN, 'accent'));
    if (rec.missionName && rec.missionName !== '—') {
      hero.appendChild(_st('任务名称', rec.missionName, ''));
    }
    hero.appendChild(_st('总时长', U.fmtDurationLong(rec.totalDuration), 'big'));
    const locLabel = rec.locationDisplay || rec.locationNode;
    if (locLabel) hero.appendChild(_st('任务节点', locLabel, ''));
    if (rec.frameDuration != null) {
      hero.appendChild(_st('首帧→尾帧', U.fmtDurationLong(rec.frameDuration), ''));
    }
    container.appendChild(hero);

    // ── 时间节点详情 ──────────────────────────────────────────
    const timingBox = U.el('div', 'gen-timing-box');
    timingBox.appendChild(U.el('div', 'gen-timing-title', '时间节点'));
    const timingGrid = U.el('div', 'gen-timing-grid');

    // 优先用记录自带的精确日期（多会话场景），回退到全局 clock
    const _recDate = (t, recDate) => recDate || (clock && clock.available ? clock.toDate(t) : null);
    const approx = clock ? clock.approx : true;
    {
      const absDate = _recDate(rec.startT, rec.startDate);
      if (absDate) {
        _timingRow(timingGrid, '任务开始时刻',
          U.fmtAbsTime(absDate, approx),
          '由日志内 Current time 行换算的实际时钟时间，精度约 ±1s');
      }
      if (rec.firstFrameT != null) {
        const ffDate = _recDate(rec.firstFrameT, rec.firstFrameDate);
        if (ffDate) {
          _timingRow(timingGrid, '首帧时刻',
            U.fmtAbsTime(ffDate, approx),
            'HUD REDUX 首次渲染（载入完成 UI 就绪）的实际时刻');
        }
      }
      const endDate = _recDate(rec.endT, rec.endDate);
      if (endDate) {
        _timingRow(timingGrid, '尾帧时刻',
          U.fmtAbsTime(endDate, approx),
          'EOM 结算信号触发时刻（任务成功/提取屏出现瞬间）');
      }
    }

    _timingRow(timingGrid, '任务总时长',
      U.fmtDurationLong(rec.totalDuration),
      'SS_STARTED → EOM 触发，与游戏结算界面显示数字一致');

    if (rec.firstFrameT != null) {
      const ffOffset = rec.firstFrameT - rec.startT;
      _timingRow(timingGrid, '首帧偏移（相对任务计时起点）',
        (ffOffset >= 0 ? '+' : '') + U.fmtDuration(ffOffset),
        'HUD REDUX 首次渲染相对 SS_STARTED 的偏移；通常 ≤ 0.1s，可能略负');
    }
    if (rec.frameDuration != null) {
      _timingRow(timingGrid, '首帧 → 尾帧时差',
        U.fmtDurationLong(rec.frameDuration),
        '尾帧时刻 − 首帧时刻，最接近"按下第一个键→成功屏弹出"的体感时长');
    }

    timingBox.appendChild(timingGrid);
    container.appendChild(timingBox);

    // ── 无尽任务 / 击杀概况 ─────────────────────────────────
    const hasWaves    = rec.waves      && rec.waves.length      > 0;
    const hasSurvival = rec.survivalSegs && rec.survivalSegs.length > 0;
    const hasInter    = rec.interSegs  && rec.interSegs.length  > 0;
    const hasKillData = rec.spawned > 0;  // 击杀数不可靠（EE.log 不记录玩家击杀），以生成数为准

    if (hasWaves) {
      _renderWaveSection(container, rec);
    } else if (hasSurvival) {
      _renderSurvivalSection(container, rec);
    } else if (hasInter) {
      _renderInterceptionSection(container, rec);
    } else if (hasKillData) {
      _renderKillSummary(container, rec);
    }

    // ── 备注 ─────────────────────────────────────────────────
    container.appendChild(U.el('div', 'note',
      '总时长 = SS_STARTED → EOM，与游戏结算界面一致。' +
      '首帧 = HUD REDUX 首次渲染。尾帧 = 最先触发的 EOM 信号。' +
      '波次/轮次时间相对首帧计算。生成（近似）来自 OnAgentCreated，已过滤宠物/目标实体。'));
  }

  // ── 防御 / 镜像防御 波次表 ─────────────────────────────────
  function _renderWaveSection(container, rec) {
    const isLoop    = rec.endlessType === 'loopDefense';
    const waveLbl   = isLoop ? '波次（镜像防御）' : '波次详情';
    const waveNoun  = isLoop ? '波' : '波';
    const segTotal  = rec.waves.length;

    const section = U.el('div', 'gen-section');
    section.appendChild(U.el('div', 'gen-section-title',
      `${waveLbl}（共 ${segTotal} ${waveNoun}）`));

    const totalKills   = rec.waves.reduce((s, w) => s + (w.kills || 0), 0);
    const totalSpawned = rec.waves.reduce((s, w) => s + (w.actualSpawned || w.totalEnemies || w.spawned || 0), 0);
    const avgDur       = rec.waves.reduce((s, w) => s + (w.duration || 0), 0) / segTotal;
    const statRow = U.el('div', 'hero-row');
    statRow.appendChild(_st('总波次', String(segTotal), 'accent'));
    statRow.appendChild(_st('波均时长', U.fmtDuration(avgDur), ''));
    if (totalKills > 0 || totalSpawned > 0)
      statRow.appendChild(_st('总击杀 / 生成', `${totalKills} / ${totalSpawned}`, ''));
    section.appendChild(statRow);

    // 时长条形图
    const maxDur = Math.max(...rec.waves.map(w => w.duration || 0), 1);
    const barH = 8, barGap = 3, svgW = 760;
    const svgH = segTotal * (barH + barGap);
    let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" height="${svgH}" class="round-chart" preserveAspectRatio="none">`;
    rec.waves.forEach((w, i) => {
      const bw = Math.max(2, ((w.duration || 0) / maxDur) * (svgW - 60));
      const y  = i * (barH + barGap);
      const sp = w.actualSpawned || w.totalEnemies || w.spawned || 0;
      svg += `<rect x="50" y="${y}" width="${bw}" height="${barH}" rx="2" class="bar-ok">` +
        `<title>第 ${w.index} 波：${U.fmtDuration(w.duration)} | 击杀 ${w.kills} / 生成 ${sp}</title></rect>`;
      if (i % 5 === 4 || i === 0)
        svg += `<text x="44" y="${y + barH}" class="bar-label" text-anchor="end">${w.index}</text>`;
    });
    svg += '</svg>';
    const chartBox = U.el('div', 'chart-box');
    chartBox.innerHTML = svg;
    section.appendChild(chartBox);

    // 波次明细表
    const timeBase = rec.firstFrameT != null ? rec.firstFrameT : rec.startT;
    const tbl = U.el('table', 'round-table');
    tbl.innerHTML = '<thead><tr><th>波次</th><th>起始（相对首帧）</th><th>结束（相对首帧）</th><th>波次时长</th><th>击杀 / 生成</th></tr></thead>';
    const tbody = U.el('tbody');
    rec.waves.forEach(w => {
      const tr = U.el('tr');
      tr.appendChild(U.el('td', 'td-idx', String(w.index)));
      tr.appendChild(U.el('td', 'td-mono', U.fmtDuration(w.startT - timeBase)));
      tr.appendChild(U.el('td', 'td-mono', w.endT != null ? U.fmtDuration(w.endT - timeBase) : '—'));
      tr.appendChild(U.el('td', 'td-mono', w.duration != null ? U.fmtDuration(w.duration) : '—'));
      const sp = w.actualSpawned || w.totalEnemies || w.spawned || 0;
      const killCell = U.el('td', 'td-mono');
      killCell.textContent = `${w.kills} / ${sp}`;
      if (w.totalEnemies) killCell.title = `波次上限 ${w.totalEnemies} 只`;
      if (w.kills < sp) killCell.style.color = 'var(--c-text2)';
      tr.appendChild(killCell);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    const tblWrap = U.el('div', 'table-wrap');
    tblWrap.appendChild(tbl);
    section.appendChild(tblWrap);
    container.appendChild(section);
  }

  // ── 生存 轮次/档位表 ──────────────────────────────────────
  function _renderSurvivalSection(container, rec) {
    const segs = rec.survivalSegs;
    const section = U.el('div', 'gen-section');
    section.appendChild(U.el('div', 'gen-section-title',
      `生存奖励档次（共 ${segs.length} 档）`));

    const totalDur = segs.reduce((s, sg) => s + (sg.duration || 0), 0);
    const avgDur   = totalDur / segs.length;
    const statRow  = U.el('div', 'hero-row');
    statRow.appendChild(_st('奖励档数', String(segs.length), 'accent'));
    statRow.appendChild(_st('档均时长', U.fmtDuration(avgDur), ''));
    statRow.appendChild(_st('生存总时长', U.fmtDurationLong(totalDur), ''));
    section.appendChild(statRow);

    // 时长条形图（每档可视化）
    const maxDur = Math.max(...segs.map(sg => sg.duration || 0), 1);
    const barH = 8, barGap = 3, svgW = 760;
    const svgH = segs.length * (barH + barGap);
    let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" height="${svgH}" class="round-chart" preserveAspectRatio="none">`;
    segs.forEach((sg, i) => {
      const bw = Math.max(2, ((sg.duration || 0) / maxDur) * (svgW - 60));
      const y  = i * (barH + barGap);
      svg += `<rect x="50" y="${y}" width="${bw}" height="${barH}" rx="2" class="bar-ok">` +
        `<title>第 ${sg.tier} 档：${U.fmtDuration(sg.duration)}</title></rect>`;
      svg += `<text x="44" y="${y + barH}" class="bar-label" text-anchor="end">${sg.tier}</text>`;
    });
    svg += '</svg>';
    const chartBox = U.el('div', 'chart-box');
    chartBox.innerHTML = svg;
    section.appendChild(chartBox);

    // 档次明细表
    const timeBase = rec.firstFrameT != null ? rec.firstFrameT : rec.startT;
    const tbl = U.el('table', 'round-table');
    tbl.innerHTML = '<thead><tr><th>档次</th><th>开始（相对首帧）</th><th>结束（相对首帧）</th><th>本档时长</th><th>累计生存</th></tr></thead>';
    const tbody = U.el('tbody');
    let cumulative = 0;
    segs.forEach(sg => {
      cumulative += sg.duration || 0;
      const tr = U.el('tr');
      tr.appendChild(U.el('td', 'td-idx', `第 ${sg.tier} 档`));
      tr.appendChild(U.el('td', 'td-mono', U.fmtDuration(sg.startT - timeBase)));
      tr.appendChild(U.el('td', 'td-mono', sg.endT != null ? U.fmtDuration(sg.endT - timeBase) : '—'));
      tr.appendChild(U.el('td', 'td-mono', sg.duration != null ? U.fmtDuration(sg.duration) : '—'));
      tr.appendChild(U.el('td', 'td-mono', U.fmtDurationLong(cumulative)));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    const tblWrap = U.el('div', 'table-wrap');
    tblWrap.appendChild(tbl);
    section.appendChild(tblWrap);
    container.appendChild(section);
  }

  // ── 拦截 轮次表 ────────────────────────────────────────────
  function _renderInterceptionSection(container, rec) {
    const segs = rec.interSegs;
    const section = U.el('div', 'gen-section');
    section.appendChild(U.el('div', 'gen-section-title',
      `拦截轮次（共 ${segs.length} 轮）`));

    const totalDur = segs.reduce((s, sg) => s + (sg.duration || 0), 0);
    const avgDur   = totalDur / segs.length;
    const statRow  = U.el('div', 'hero-row');
    statRow.appendChild(_st('完成轮次', String(segs.length), 'accent'));
    statRow.appendChild(_st('轮均时长', U.fmtDuration(avgDur), ''));
    statRow.appendChild(_st('拦截总时长', U.fmtDurationLong(totalDur), ''));
    section.appendChild(statRow);

    // 时长条形图
    const maxDur = Math.max(...segs.map(sg => sg.duration || 0), 1);
    const barH = 8, barGap = 3, svgW = 760;
    const svgH = segs.length * (barH + barGap);
    let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" height="${svgH}" class="round-chart" preserveAspectRatio="none">`;
    segs.forEach((sg, i) => {
      const bw = Math.max(2, ((sg.duration || 0) / maxDur) * (svgW - 60));
      const y  = i * (barH + barGap);
      svg += `<rect x="50" y="${y}" width="${bw}" height="${barH}" rx="2" class="bar-ok">` +
        `<title>第 ${sg.round} 轮：${U.fmtDuration(sg.duration)}</title></rect>`;
      svg += `<text x="44" y="${y + barH}" class="bar-label" text-anchor="end">${sg.round}</text>`;
    });
    svg += '</svg>';
    const chartBox = U.el('div', 'chart-box');
    chartBox.innerHTML = svg;
    section.appendChild(chartBox);

    // 轮次明细表
    const timeBase = rec.firstFrameT != null ? rec.firstFrameT : rec.startT;
    const tbl = U.el('table', 'round-table');
    tbl.innerHTML = '<thead><tr><th>轮次</th><th>开始（相对首帧）</th><th>结束（相对首帧）</th><th>本轮时长</th><th>累计时长</th></tr></thead>';
    const tbody = U.el('tbody');
    let cumulative = 0;
    segs.forEach(sg => {
      cumulative += sg.duration || 0;
      const tr = U.el('tr');
      tr.appendChild(U.el('td', 'td-idx', `第 ${sg.round} 轮`));
      tr.appendChild(U.el('td', 'td-mono', U.fmtDuration(sg.startT - timeBase)));
      tr.appendChild(U.el('td', 'td-mono', sg.endT != null ? U.fmtDuration(sg.endT - timeBase) : '—'));
      tr.appendChild(U.el('td', 'td-mono', sg.duration != null ? U.fmtDuration(sg.duration) : '—'));
      tr.appendChild(U.el('td', 'td-mono', U.fmtDurationLong(cumulative)));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    const tblWrap = U.el('div', 'table-wrap');
    tblWrap.appendChild(tbl);
    section.appendChild(tblWrap);
    container.appendChild(section);
  }

  // ── 单轮任务敌人生成概况 ─────────────────────────────────
  function _renderKillSummary(container, rec) {
    const killSection = U.el('div', 'gen-section');
    killSection.appendChild(U.el('div', 'gen-section-title', '敌人生成概况'));
    const killRow = U.el('div', 'hero-row');
    killRow.appendChild(_st('生成（近似）', String(rec.spawned), 'accent'));
    killSection.appendChild(killRow);
    killSection.appendChild(U.el('div', 'note',
      'EE.log 不记录玩家击杀个别敌人的事件；仅防御/波次任务可通过"生成−剩余"推算击杀数。'));
    container.appendChild(killSection);
  }

  // ── 共用组件 ──────────────────────────────────────────────
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
