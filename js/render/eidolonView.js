/* 夜灵详情视图：真实时间仪表 + 小轮卡片 + 额外捕获
 * 计时口径 = idalon.com "real time"：夜晚开始 → 水力使赋能掉落 */
window.WF = window.WF || {};

WF.eidolonView = (function () {
  const U = WF.utils;
  const NAMES = ['兆力使', '巨力使', '水力使'];

  function summary(rec) {
    return {
      title: `夜灵捕获 ${rec.label}`,
      sub: `真实时间 ${U.fmtDurationLong(rec.realTime)} ｜ 平均 ${U.fmtDuration(rec.avgTime)}`,
    };
  }

  function render(container, rec, clock) {
    container.innerHTML = '';

    // ---- 顶部仪表 ----
    const hero = U.el('div', 'hero-row');
    hero.appendChild(stat('夜晚标签', rec.label, 'accent'));
    hero.appendChild(stat('真实时间（6轮合计）', U.fmtDurationLong(rec.realTime), 'big'));
    hero.appendChild(stat('平均真实时间', U.fmtDuration(rec.avgTime), 'big'));
    hero.appendChild(stat('完整小轮', `${rec.completeCount}`, ''));
    container.appendChild(hero);

    container.appendChild(U.el('div', 'note',
      '计时口径与 idalon.com “real time” 一致：起点 = 夜晚开始，终点 = 水力使赋能掉落在地（捕获判定后约 15 秒）。'));

    if (rec.completeCount > 6) {
      container.appendChild(U.el('div', 'note',
        `共 ${rec.completeCount} 个完整小轮，计算采用平均最小的连续 6 轮：第 ${rec.window.start + 1} ~ ${rec.window.end + 1} 轮。`));
    }
    if (rec.extraCaptures > 0) {
      container.appendChild(U.el('div', 'note',
        `6 轮完成后存在额外捕获 +${rec.extraCaptures} 只（仅记录，不参与真实时间计算）。`));
    }

    // ---- 小轮卡片 ----
    const maxDur = Math.max(...rec.completes.map((r) => r.duration));
    const grid = U.el('div', 'round-grid');
    rec.completes.forEach((r, i) => {
      const inWindow = i >= rec.window.start && i <= rec.window.end;
      const card = U.el('div', 'round-card' + (inWindow ? ' in-window' : ' out-window'));

      const head = U.el('div', 'round-head');
      head.appendChild(U.el('span', 'round-no', `第 ${i + 1} 轮`));
      head.appendChild(U.el('span', 'round-dur', U.fmtDuration(r.duration)));
      card.appendChild(head);

      // 分段条：兆 / 巨 / 水 / 掉落
      const endAnchor = r.lootT != null ? r.lootT : r.captures[2];
      const segPoints = [r.effStart, r.captures[0], r.captures[1], r.captures[2], endAnchor];
      const segNames = [NAMES[0], NAMES[1], NAMES[2], '掉落'];
      const bar = U.el('div', 'seg-bar');
      for (let k = 0; k < 4; k++) {
        const segDur = segPoints[k + 1] - segPoints[k];
        if (segDur <= 0) continue;
        const seg = U.el('div', `seg seg-${k}`);
        seg.style.width = `${(segDur / maxDur) * 100}%`;
        seg.title = `${segNames[k]}：${U.fmtDuration(segDur)}（累计 ${U.fmtDuration(segPoints[k + 1] - r.effStart)}）`;
        bar.appendChild(seg);
      }
      card.appendChild(bar);

      const splits = U.el('div', 'split-row');
      for (let k = 0; k < 4; k++) {
        const segDur = segPoints[k + 1] - segPoints[k];
        if (k === 3 && segDur <= 0) continue;
        const d = U.el('div', 'split');
        d.appendChild(U.el('span', `split-dot seg-${k}`, ''));
        d.appendChild(U.el('span', 'split-name', segNames[k]));
        d.appendChild(U.el('span', 'split-time', U.fmtDuration(segDur)));
        splits.appendChild(d);
      }
      card.appendChild(splits);

      const meta = U.el('div', 'round-meta');
      meta.appendChild(U.el('span', null, `进门加载完成 ${U.fmtLogTime(r.loadDoneAt)}`));
      meta.appendChild(U.el('span', 'meta-warn', `计时起点（夜晚开始）${U.fmtLogTime(r.effStart)}`));
      meta.appendChild(U.el('span', null, `水力使捕获 ${U.fmtLogTime(r.captures[2])}`));
      meta.appendChild(U.el('span', null, r.lootT != null
        ? `赋能掉落 ${U.fmtLogTime(r.lootT)}（计时终点）`
        : '赋能掉落行缺失，终点按捕获瞬间计'));
      card.appendChild(meta);

      grid.appendChild(card);
    });
    container.appendChild(grid);

    // ---- 额外捕获详情 ----
    if (rec.extras.length) {
      const box = U.el('div', 'extra-box');
      box.appendChild(U.el('div', 'section-title', '额外捕获（6 轮之后，不计入计算）'));
      rec.extras.forEach((a) => {
        const names = a.captures.map((_, k) => NAMES[k]).join('、');
        box.appendChild(U.el('div', 'extra-line',
          `进门 ${U.fmtLogTime(a.loadDoneAt)} ｜ 捕获 ${a.captures.length} 只（${names}）${a.killed ? ' ｜ 含击杀，无效' : ''}`));
      });
      container.appendChild(box);
    }
  }

  function stat(label, value, cls) {
    const d = U.el('div', 'stat ' + (cls || ''));
    d.appendChild(U.el('div', 'stat-value', value));
    d.appendChild(U.el('div', 'stat-label', label));
    return d;
  }

  return { render, summary };
})();
