window.WF = window.WF || {};

WF.profitTakerView = (function () {
  const U = WF.utils;

  const _ec = {
    DT_IMPACT:'#b0b8c8', DT_PUNCTURE:'#ffe06e', DT_SLASH:'#ff6060',
    DT_FREEZE:'#40e8ff', DT_FIRE:'#ff8040', DT_POISON:'#88df60',
    DT_ELECTRICITY:'#ffff60', DT_GAS:'#c8f060', DT_VIRAL:'#ff80c0',
    DT_MAGNETIC:'#6080ff', DT_RADIATION:'#ffd060', DT_CORROSIVE:'#80c040',
    DT_EXPLOSION:'#ffa040',
  };
  const _ph = ['pt-tl-p1','pt-tl-p2','pt-tl-p3','pt-tl-p4'];
  const _c = (k) => _ec[k] || '#9090a8';

  function summary(rec) {
    return {
      title: '大蜘蛛击杀',
      sub: `总时长 ${U.fmtDurationLong(rec.totalDuration)} ｜ 飞行 ${U.fmtDuration(rec.flightTime)}`,
    };
  }

  function render(container, rec) {
    container.innerHTML = '';

    const hero = U.el('div', 'hero-row');
    [
      ['总时长（出门→击杀）', U.fmtDurationLong(rec.totalDuration), 'big'],
      ['飞行', U.fmtDuration(rec.flightTime), ''],
      ['护盾合计', U.fmtDuration(rec.totals.shield), ''],
      ['断腿合计', U.fmtDuration(rec.totals.leg), ''],
      ['本体合计', U.fmtDuration(rec.totals.body), ''],
      ['塔架合计', U.fmtDuration(rec.totals.pylon), ''],
    ].forEach(([l, v, c]) => hero.appendChild(_st(l, v, c)));
    container.appendChild(hero);

    const tot = rec.totalDuration;
    const bw = U.el('div', 'chart-box pt-bar-wrap');
    bw.appendChild(U.el('div', 'pt-bar-label', '全程时间轴'));
    const tl = U.el('div', 'pt-timeline');
    const _ts = (cls, dur, lbl) => {
      const s = U.el('div', 'pt-tl-seg ' + cls);
      s.style.width = `${Math.max(0.5, (dur / tot) * 100)}%`;
      s.title = `${lbl}：${U.fmtDuration(dur)}（${((dur / tot) * 100).toFixed(1)}%）`;
      tl.appendChild(s);
    };
    _ts('pt-tl-flight', rec.flightTime, '飞行');
    rec.phases.forEach((p, i) => _ts(_ph[i] || 'pt-tl-p4', p.totalTime, `阶段 ${p.number}`));
    bw.appendChild(tl);

    const lg = U.el('div', 'pt-tl-legend');
    [
      { cls: 'pt-tl-flight', label: `飞行 ${U.fmtDuration(rec.flightTime)}` },
      ...rec.phases.map((p, i) => ({ cls: _ph[i] || 'pt-tl-p4', label: `P${p.number} ${U.fmtDuration(p.totalTime)}` })),
    ].forEach((it) => {
      const item = U.el('div', 'pt-tl-legend-item');
      item.appendChild(U.el('span', 'pt-tl-dot ' + it.cls));
      item.appendChild(document.createTextNode(it.label));
      lg.appendChild(item);
    });
    bw.appendChild(lg);
    container.appendChild(bw);

    const grid = U.el('div', 'phase-grid');
    rec.phases.forEach((p) => {
      const card = U.el('div', 'phase-card');

      const hd = U.el('div', 'round-head');
      hd.appendChild(U.el('span', 'round-no', `阶段 ${p.number}`));
      hd.appendChild(U.el('span', 'round-dur', U.fmtDuration(p.totalTime)));
      card.appendChild(hd);

      const pb = U.el('div', 'seg-bar');
      if (p.totalTime > 0) {
        [
          ['护盾', p.shieldTime, 'seg pt-seg-shield'],
          ['断腿', p.legTime, 'seg pt-seg-leg'],
          ['本体', p.bodyTime, 'seg pt-seg-body'],
          ['塔架', p.pylonTime, 'seg pt-seg-pylon'],
        ].forEach(([n, v, cls]) => {
          if (v <= 0) return;
          const s = U.el('div', cls);
          s.style.width = `${Math.max(0.5, (v / p.totalTime) * 100)}%`;
          s.title = `${n}：${U.fmtDuration(v)}`;
          pb.appendChild(s);
        });
      }
      card.appendChild(pb);

      const kv = U.el('div', 'pt-kv-row');
      [['护盾', p.shieldTime], ['断腿', p.legTime], ['本体', p.bodyTime], ['塔架', p.pylonTime]].forEach(([k, v]) => {
        const it = U.el('div', 'pt-kv-item');
        it.appendChild(U.el('span', 'pt-kv-label', k));
        it.appendChild(U.el('span', 'pt-kv-val', U.fmtDuration(v)));
        kv.appendChild(it);
      });
      card.appendChild(kv);

      if (p.shields.length) {
        const sec = U.el('div', 'pt-sec');
        sec.appendChild(U.el('div', 'pt-sec-title', `护盾元素 × ${p.shields.length} 段`));
        const row = U.el('div', 'shield-row');
        p.shields.forEach((s) => {
          const col = _c(s.element.key);
          const b = U.el('span', 'elem-badge', `${s.element.cn}  ${U.fmtDuration(s.time)}`);
          b.style.cssText = `color:${col};border-color:${col}55;background:${col}18;`;
          b.title = s.element.key;
          row.appendChild(b);
        });
        sec.appendChild(row);
        card.appendChild(sec);
      }

      if (p.legs.length) {
        const sec = U.el('div', 'pt-sec');
        sec.appendChild(U.el('div', 'pt-sec-title', `断腿 × ${p.legs.length}`));
        const row = U.el('div', 'shield-row');
        p.legs.forEach((l, i) => row.appendChild(U.el('span', 'leg-badge', `腿${i + 1}  ${U.fmtDuration(l.time)}`)));
        sec.appendChild(row);
        card.appendChild(sec);
      }

      grid.appendChild(card);
    });
    container.appendChild(grid);
  }

  function _st(label, value, cls) {
    const d = U.el('div', 'stat ' + (cls || ''));
    d.appendChild(U.el('div', 'stat-value', value));
    d.appendChild(U.el('div', 'stat-label', label));
    return d;
  }

  return { render, summary };
})();
