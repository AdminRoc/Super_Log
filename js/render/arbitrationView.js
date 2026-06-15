/* 仲裁详情视图 — 参考 wxhn1225/warframe-arbitration 展示逻辑
 * 布局：评分徽章 + 核心指标网格 + 母液细项 + 分轮表格 */
window.WF = window.WF || {};

WF.arbitrationView = (function () {
  const U = WF.utils;

  function summary(rec) {
    return {
      title: `仲裁 ${rec.missionTypeName}${rec.name ? ' · ' + rec.name : ''}`,
      sub: `${U.fmtDurationLong(rec.duration)} ｜ 无人机 ${rec.droneCount} ｜ 评分 ${rec.score} ${rec.scoreLabel}`,
    };
  }

  function render(container, rec) {
    container.innerHTML = '';

    /* ─── 第一行：评分徽章 + 任务元信息 ─── */
    const topRow = U.el('div', 'arb-top-row');

    // 评分徽章
    const badge = U.el('div', 'arb-score-badge grade-' + rec.scoreLabel.toLowerCase());
    badge.appendChild(U.el('div', 'arb-score-label', rec.scoreLabel));
    badge.appendChild(U.el('div', 'arb-score-num', String(rec.score)));
    badge.appendChild(U.el('div', 'arb-score-sub', '/ 100'));
    badge.title = `满 Buff 期望母液 / 小时：${rec.essence.fullBuffPerHour.toFixed(1)}`;
    topRow.appendChild(badge);

    // 任务元信息
    const meta = U.el('div', 'arb-meta');
    const metaTitle = U.el('div', 'arb-meta-title');
    metaTitle.textContent = [rec.name, rec.missionTypeName].filter(Boolean).join(' · ');
    meta.appendChild(metaTitle);

    const metaSubs = [
      `任务时长 ${U.fmtDurationLong(rec.duration)}`,
      rec.rounds > 0 ? `${rec.rounds} ${rec.missionType === 'survival' ? '轮' : '波'}` : null,
      rec.nodeId ? `节点 ID：${rec.nodeId}` : null,
      !rec.complete ? '（未检测到结算，时长为估算值）' : null,
    ].filter(Boolean);
    metaSubs.forEach((s) => meta.appendChild(U.el('div', 'arb-meta-sub', s)));

    // 评分说明
    const gradeDesc = {
      S: '极优 — 满 Buff ≥ 800 精华/小时',
      A: '良好 — 满 Buff 600-799 精华/小时',
      B: '一般 — 满 Buff 400-599 精华/小时',
      C: '较差 — 满 Buff 200-399 精华/小时',
      D: '低效 — 满 Buff < 200 精华/小时',
    };
    meta.appendChild(U.el('div', 'arb-grade-desc', gradeDesc[rec.scoreLabel] || ''));
    topRow.appendChild(meta);
    container.appendChild(topRow);

    /* ─── 第二行：8 格核心指标 ─── */
    const grid = U.el('div', 'arb-metrics-grid');
    const metrics = [
      { label: '任务总时长',    value: U.fmtDurationLong(rec.duration),               cls: 'big' },
      { label: '无人机生成数', value: String(rec.droneCount),                          cls: 'accent' },
      { label: '敌人生成数',   value: String(rec.maxSpawned),                         cls: '' },
      { label: '每分钟无人机', value: rec.dronesPerMin.toFixed(2),                    cls: '' },
      { label: '期望赋灵母液', value: rec.essence.total.toFixed(2),                   cls: 'big' },
      { label: '满 Buff 期望', value: rec.essence.fullBuffTotal.toFixed(2),           cls: 'accent' },
      { label: '母液 / 小时',  value: rec.essence.perHour.toFixed(1),                 cls: '' },
      { label: '母液 / 分钟',  value: rec.essence.perMin.toFixed(3),                 cls: '' },
    ];
    if (rec.rounds > 0) {
      metrics.splice(4, 0, { label: rec.missionType === 'survival' ? '生存轮次' : '防御波次', value: String(rec.rounds), cls: '' });
      metrics.pop(); // 保持 8 格
    }
    metrics.forEach(({ label, value, cls }) => {
      const cell = U.el('div', 'stat ' + cls);
      cell.appendChild(U.el('div', 'stat-value', value));
      cell.appendChild(U.el('div', 'stat-label', label));
      grid.appendChild(cell);
    });
    container.appendChild(grid);

    /* ─── 第三行：母液计算细项 ─── */
    const essBox = U.el('div', 'arb-ess-box');
    essBox.appendChild(U.el('div', 'section-title', '赋灵母液计算'));

    const essRows = [
      ['无人机贡献', `${rec.droneCount} × 6% = ${rec.essence.fromDrones.toFixed(2)}`],
      ['轮次贡献',   rec.rounds > 0 ? `${rec.rounds} × 1.3 = ${rec.essence.fromRounds.toFixed(2)}` : '—'],
      ['普通期望',   `${rec.essence.total.toFixed(2)}`],
      ['满 Buff 期望', `${rec.essence.fullBuffTotal.toFixed(2)}（无人机项 × 5.9 + 轮次项）`],
      ['Buff 组成', '蓝盒 ×2 · 富足 ×1.18 · 黄盒 ×2 · 祝福 ×1.25 = 5.9'],
      ['满 Buff / 小时', `${rec.essence.fullBuffPerHour.toFixed(1)}`],
    ];
    const essTable = U.el('div', 'arb-ess-rows');
    essRows.forEach(([k, v]) => {
      const row = U.el('div', 'arb-ess-row');
      row.appendChild(U.el('span', 'arb-ess-key', k));
      row.appendChild(U.el('span', 'arb-ess-val', v));
      essTable.appendChild(row);
    });
    essBox.appendChild(essTable);
    container.appendChild(essBox);

    /* ─── 第四行：分轮无人机分布表 ─── */
    if (rec.boundaries.length) {
      container.appendChild(U.el('div', 'section-title', '各轮无人机分布'));
      const tbl = U.el('table', 'round-table');
      tbl.innerHTML = `<thead><tr>
        <th>轮次 / 波次</th><th>完成时间</th>
        <th>本段无人机</th><th>累计无人机</th><th>本段期望母液</th>
      </tr></thead>`;
      const tbody = U.el('tbody');
      let prev = 0, cum = 0;
      rec.boundaries.forEach((b) => {
        const inSeg = rec.drones.filter((d) => d >= prev && d < b.t).length;
        cum += inSeg;
        const segEss = (inSeg * BASE_DROP + EXTRA_PER_ROUND).toFixed(2);
        const tr = U.el('tr');
        tr.appendChild(U.el('td', 'td-idx', b.label));
        tr.appendChild(U.el('td', 'td-mono', U.fmtDurationLong(b.t)));
        tr.appendChild(U.el('td', 'td-mono', String(inSeg)));
        tr.appendChild(U.el('td', 'td-mono', String(cum)));
        tr.appendChild(U.el('td', 'td-mono', segEss));
        tbody.appendChild(tr);
        prev = b.t;
      });
      // 末段
      const tail = rec.drones.filter((d) => d >= prev).length;
      if (tail > 0) {
        const tr = U.el('tr');
        tr.appendChild(U.el('td', 'td-idx', '末段（未结算）'));
        tr.appendChild(U.el('td', 'td-mono', '—'));
        tr.appendChild(U.el('td', 'td-mono', String(tail)));
        tr.appendChild(U.el('td', 'td-mono', String(cum + tail)));
        tr.appendChild(U.el('td', 'td-mono', '—'));
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      const wrap = U.el('div', 'table-wrap');
      wrap.appendChild(tbl);
      container.appendChild(wrap);
    }

    container.appendChild(U.el('div', 'note',
      '无人机统计与轮次边界依赖房主（Host）日志。评分基于满 Buff 期望母液/小时（S ≥ 800 / A 600-799 / B 400-599 / C 200-399 / D < 200）。'));
  }

  // 内联常量供模板计算（避免引用解析器内部）
  const BASE_DROP       = 0.06;
  const EXTRA_PER_ROUND = 1.3;

  return { render, summary };
})();
