/* Profit-Taker 详情视图：PTA 风格阶段卡片 */
window.WF = window.WF || {};

WF.profitTakerView = (function () {
  const U = WF.utils;

  function summary(rec) {
    return {
      title: 'Profit-Taker 击杀',
      sub: `总时长 ${U.fmtDurationLong(rec.totalDuration)} ｜ 飞行 ${U.fmtDuration(rec.flightTime)}`,
    };
  }

  function render(container, rec) {
    container.innerHTML = '';

    const hero = U.el('div', 'hero-row');
    hero.appendChild(stat('总时长（出门→击杀）', U.fmtDurationLong(rec.totalDuration), 'big'));
    hero.appendChild(stat('飞行', U.fmtDuration(rec.flightTime), ''));
    hero.appendChild(stat('护盾合计', U.fmtDuration(rec.totals.shield), ''));
    hero.appendChild(stat('断腿合计', U.fmtDuration(rec.totals.leg), ''));
    hero.appendChild(stat('本体合计', U.fmtDuration(rec.totals.body), ''));
    hero.appendChild(stat('塔架合计', U.fmtDuration(rec.totals.pylon), ''));
    container.appendChild(hero);

    const grid = U.el('div', 'phase-grid');
    rec.phases.forEach((p) => {
      const card = U.el('div', 'phase-card');
      const head = U.el('div', 'round-head');
      head.appendChild(U.el('span', 'round-no', `阶段 ${p.number}`));
      head.appendChild(U.el('span', 'round-dur', U.fmtDuration(p.totalTime)));
      card.appendChild(head);

      if (p.shields.length) {
        const sec = U.el('div', 'pt-sec');
        sec.appendChild(U.el('div', 'pt-sec-title', `护盾 ${U.fmtDuration(p.shieldTime)}`));
        const row = U.el('div', 'shield-row');
        p.shields.forEach((s) => {
          const b = U.el('span', 'elem-badge', `${s.element.cn} ${U.fmtDuration(s.time)}`);
          b.title = s.element.key;
          row.appendChild(b);
        });
        sec.appendChild(row);
        card.appendChild(sec);
      }
      if (p.legs.length) {
        const sec = U.el('div', 'pt-sec');
        sec.appendChild(U.el('div', 'pt-sec-title', `断腿 ${U.fmtDuration(p.legTime)}`));
        const row = U.el('div', 'shield-row');
        p.legs.forEach((l, i) => row.appendChild(U.el('span', 'leg-badge', `腿${i + 1} ${U.fmtDuration(l.time)}`)));
        sec.appendChild(row);
        card.appendChild(sec);
      }
      if (p.bodyTime > 0) {
        card.appendChild(kv(card, '本体', U.fmtDuration(p.bodyTime)));
      }
      if (p.pylonTime > 0) {
        card.appendChild(kv(card, '塔架', U.fmtDuration(p.pylonTime)));
      }
      grid.appendChild(card);
    });
    container.appendChild(grid);

    container.appendChild(U.el('div', 'note',
      '口径对齐 Profit-Taker Analytics：总时长 = 出城门 → 第四阶段本体击杀；阶段时长含护盾/断腿/本体/塔架。'));
  }

  function kv(card, k, v) {
    const sec = U.el('div', 'pt-sec pt-kv');
    sec.appendChild(U.el('span', 'pt-sec-title', k));
    sec.appendChild(U.el('span', 'td-mono', v));
    return sec;
  }

  function stat(label, value, cls) {
    const d = U.el('div', 'stat ' + (cls || ''));
    d.appendChild(U.el('div', 'stat-value', value));
    d.appendChild(U.el('div', 'stat-label', label));
    return d;
  }

  return { render, summary };
})();
