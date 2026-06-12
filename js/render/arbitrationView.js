/* 仲裁详情视图：时长/无人机/期望母液 + 敌人存活曲线与无人机时间线 */
window.WF = window.WF || {};

WF.arbitrationView = (function () {
  const U = WF.utils;

  function summary(rec) {
    return {
      title: `仲裁 ${rec.missionTypeName}${rec.name ? ' · ' + rec.name : ''}`,
      sub: `时长 ${U.fmtDurationLong(rec.duration)} ｜ 无人机 ${rec.droneCount} ｜ 期望母液 ${rec.essence.total.toFixed(1)}`,
    };
  }

  function render(container, rec) {
    container.innerHTML = '';

    const hero = U.el('div', 'hero-row');
    hero.appendChild(stat('任务时长', U.fmtDurationLong(rec.duration), 'big'));
    hero.appendChild(stat('类型', rec.missionTypeName, 'accent'));
    if (rec.rounds > 0) hero.appendChild(stat('轮次/波次', `${rec.rounds}`, ''));
    hero.appendChild(stat('磁盾无人机', `${rec.droneCount}`, 'accent'));
    hero.appendChild(stat('期望赋灵母液', rec.essence.total.toFixed(1), 'big'));
    hero.appendChild(stat('满 Buff 期望', rec.essence.fullBuffTotal.toFixed(1), ''));
    hero.appendChild(stat('母液/小时', rec.essence.perHour.toFixed(1), ''));
    container.appendChild(hero);

    const noteBits = [
      `期望母液 = 无人机 ${rec.droneCount}×6% (${rec.essence.fromDrones.toFixed(1)})` +
      (rec.rounds > 0 ? ` + 轮次 ${rec.rounds}×1.3 (${rec.essence.fromRounds.toFixed(1)})` : ''),
      '满 Buff = 蓝盒×2 · 富足×1.18 · 黄盒×2 · 祝福×1.25（仅作用于无人机掉落项）',
    ];
    if (!rec.complete) noteBits.push('该任务未检测到结算事件，时长按状态结束行估算');
    container.appendChild(U.el('div', 'note', noteBits.join(' ｜ ')));

    // ---- 时间线图：敌人存活曲线 + 无人机散点 + 轮次边界 ----
    if (rec.ticking.length > 1 || rec.drones.length) {
      container.appendChild(timelineChart(rec));
    }

    // ---- 每轮无人机表 ----
    if (rec.boundaries.length) {
      const tbl = U.el('table', 'round-table');
      tbl.innerHTML = '<thead><tr><th>轮次/波次</th><th>完成于</th><th>本段无人机</th><th>累计无人机</th></tr></thead>';
      const tbody = U.el('tbody');
      let prev = 0, cum = 0;
      rec.boundaries.forEach((b) => {
        const inSeg = rec.drones.filter((d) => d >= prev && d < b.t).length;
        cum += inSeg;
        const tr = U.el('tr');
        tr.appendChild(U.el('td', 'td-idx', b.label));
        tr.appendChild(U.el('td', 'td-mono', U.fmtDurationLong(b.t)));
        tr.appendChild(U.el('td', 'td-mono', String(inSeg)));
        tr.appendChild(U.el('td', 'td-mono', String(cum)));
        tbody.appendChild(tr);
        prev = b.t;
      });
      const tail = rec.drones.filter((d) => d >= prev).length;
      if (tail > 0) {
        const tr = U.el('tr');
        tr.appendChild(U.el('td', 'td-idx', '末段(未结轮)'));
        tr.appendChild(U.el('td', 'td-mono', '—'));
        tr.appendChild(U.el('td', 'td-mono', String(tail)));
        tr.appendChild(U.el('td', 'td-mono', String(cum + tail)));
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      const wrap = U.el('div', 'table-wrap');
      wrap.appendChild(tbl);
      container.appendChild(wrap);
    }

    container.appendChild(U.el('div', 'note',
      '注：无人机与轮次统计依赖房主(host)日志；MonitoredTicking 曲线为日志记录的存活敌人快照（敌人饱和度）。'));
  }

  function timelineChart(rec) {
    const W = 820, H = 200, padL = 40, padB = 22, padT = 12;
    const dur = rec.duration;
    const x = (sec) => padL + (sec / dur) * (W - padL - 8);
    const maxV = Math.max(1, ...rec.ticking.map((p) => p.v));
    const y = (v) => padT + (1 - v / maxV) * (H - padT - padB);

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="arb-chart">`;
    // 轮次边界竖线
    rec.boundaries.forEach((b) => {
      svg += `<line x1="${x(b.t)}" y1="${padT}" x2="${x(b.t)}" y2="${H - padB}" class="arb-boundary"/>` +
        `<text x="${x(b.t) + 3}" y="${padT + 10}" class="arb-blabel">${U.escapeHtml(b.label)}</text>`;
    });
    // 敌人存活曲线
    if (rec.ticking.length > 1) {
      const pts = rec.ticking.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
      const first = rec.ticking[0], last = rec.ticking[rec.ticking.length - 1];
      svg += `<polygon points="${x(first.t).toFixed(1)},${H - padB} ${pts} ${x(last.t).toFixed(1)},${H - padB}" class="arb-area"/>`;
      svg += `<polyline points="${pts}" class="arb-line"/>`;
    }
    // 无人机散点（底部刻度带）
    rec.drones.forEach((d) => {
      svg += `<circle cx="${x(d).toFixed(1)}" cy="${H - padB + 8}" r="2.4" class="arb-drone"><title>无人机 @ ${U.fmtDurationLong(d)}</title></circle>`;
    });
    // 坐标轴标注
    svg += `<text x="${padL - 6}" y="${y(maxV) + 4}" class="arb-axis" text-anchor="end">${maxV}</text>`;
    svg += `<text x="${padL - 6}" y="${H - padB + 4}" class="arb-axis" text-anchor="end">0</text>`;
    for (let i = 0; i <= 4; i++) {
      const sec = (dur / 4) * i;
      svg += `<text x="${x(sec)}" y="${H - 4}" class="arb-axis" text-anchor="middle">${U.fmtDurationLong(sec)}</text>`;
    }
    svg += `<text x="${W - 10}" y="${padT + 10}" class="arb-legend" text-anchor="end">— 存活敌人 ● 无人机生成</text>`;
    svg += '</svg>';

    const box = WF.utils.el('div', 'chart-box');
    box.innerHTML = svg;
    return box;
  }

  function stat(label, value, cls) {
    const d = U.el('div', 'stat ' + (cls || ''));
    d.appendChild(U.el('div', 'stat-value', value));
    d.appendChild(U.el('div', 'stat-label', label));
    return d;
  }

  return { render, summary };
})();
