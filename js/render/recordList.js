/* 左侧记录列表：按绝对时间由近及远排序、可点选 */
window.WF = window.WF || {};

WF.recordList = (function () {
  const U = WF.utils;

  /**
   * records: 解析记录数组（含 startT/endT）
   * clock: logReader.makeClock 结果
   * summaryFn(rec) → {title, sub} 摘要文本
   * onSelect(rec, index)
   */
  function render(container, records, clock, summaryFn, onSelect) {
    container.innerHTML = '';
    if (!records.length) return;

    // 由近及远：优先用 endAbsT（多会话绝对序），回退到 endT（单会话）
    const sorted = records.slice().sort((a, b) => {
      const aE = a.endAbsT !== undefined ? a.endAbsT : a.endT;
      const bE = b.endAbsT !== undefined ? b.endAbsT : b.endT;
      return bE - aE;
    });

    sorted.forEach((rec, i) => {
      const card = U.el('div', 'record-card');
      const s = summaryFn(rec);
      // 优先用记录自带的 startDate（多会话精确），回退到全局 clock
      const date = rec.startDate || (clock.available ? clock.toDate(rec.startT) : null);

      const head = U.el('div', 'record-card-head');
      head.appendChild(U.el('span', 'record-title', s.title));
      head.appendChild(U.el('span', 'record-time', date ? U.fmtAbsTime(date, clock.approx) : `日志 ${U.fmtLogTime(rec.startT)}`));
      card.appendChild(head);
      card.appendChild(U.el('div', 'record-sub', s.sub));

      card.addEventListener('click', () => {
        container.querySelectorAll('.record-card.selected').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        onSelect(rec, i);
      });
      container.appendChild(card);
      if (i === 0) card.click(); // 默认选中最近一条
    });
  }

  return { render };
})();
