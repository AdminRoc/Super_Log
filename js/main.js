/* 入口：文件上传、解析调度、Tab 路由 */
(function () {
  const U = WF.utils;

  const TABS = [
    { id: 'eidolon', label: '夜灵', en: 'EIDOLON', view: () => WF.eidolonView, empty: '未找到满足 6×3 条件的夜灵捕获记录' },
    { id: 'disruption', label: '中断', en: 'DISRUPTION', view: () => WF.disruptionView, empty: '未找到完成 ≥45 轮且成功结算的中断任务（需房主日志）' },
    { id: 'profitTaker', label: '大蜘蛛', en: 'PROFIT-TAKER', view: () => WF.profitTakerView, empty: '未找到完整的 Profit-Taker 击杀记录' },
    { id: 'arbitration', label: '仲裁', en: 'ARBITRATION', view: () => WF.arbitrationView, empty: '未找到有效的仲裁任务记录（需房主日志，时长 ≥60 秒）' },
  ];

  let state = { results: null, clock: null, activeTab: 'eidolon' };

  const $ = (id) => document.getElementById(id);

  function init() {
    const drop = $('dropzone');
    const fileInput = $('file-input');

    drop.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); });

    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.classList.add('dragging');
    }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.classList.remove('dragging');
    }));
    drop.addEventListener('drop', (e) => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(f);
    });

    const tabBar = $('tab-bar');
    TABS.forEach((tab) => {
      const btn = U.el('button', 'tab-btn');
      btn.dataset.tab = tab.id;
      btn.appendChild(U.el('span', 'tab-cn', tab.label));
      btn.appendChild(U.el('span', 'tab-en', tab.en));
      const badge = U.el('span', 'tab-count', '');
      badge.style.display = 'none';
      btn.appendChild(badge);
      btn.addEventListener('click', () => switchTab(tab.id));
      tabBar.appendChild(btn);
    });
    updateTabBar();
  }

  function loadFile(file) {
    $('dropzone-status').textContent = `解析中… ${file.name}`;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        parseText(reader.result, file);
      } catch (err) {
        $('dropzone-status').textContent = `解析失败：${err.message}`;
        console.error(err);
      }
    };
    reader.onerror = () => { $('dropzone-status').textContent = '文件读取失败'; };
    reader.readAsText(file);
  }

  function parseText(text, file) {
    const t0 = performance.now();
    const eidolon = WF.EidolonParser.create();
    const disruption = WF.DisruptionParser.create();
    const profitTaker = WF.ProfitTakerParser.create();
    const arbitration = WF.ArbitrationParser.create();

    const scan = WF.logReader.scan(text, [eidolon, disruption, profitTaker, arbitration]);
    const clock = WF.logReader.makeClock(scan, file.lastModified);

    state.results = {
      eidolon: eidolon.results(),
      disruption: disruption.results(),
      profitTaker: profitTaker.results(),
      arbitration: arbitration.results(),
    };
    state.clock = clock;

    const ms = (performance.now() - t0).toFixed(0);
    const r = state.results;
    $('dropzone-status').innerHTML =
      `<b>${U.escapeHtml(file.name)}</b>（${(file.size / 1048576).toFixed(1)} MB，${scan.lineCount.toLocaleString()} 行，${ms} ms）` +
      ` — 夜灵 <b>${r.eidolon.length}</b> ｜ 中断 <b>${r.disruption.length}</b> ｜ 大蜘蛛 <b>${r.profitTaker.length}</b> ｜ 仲裁 <b>${r.arbitration.length}</b>` +
      (clock.approx && clock.available ? '<br><span class="muted">日志内无系统时间行，绝对时间按文件修改时间估算（前缀 ≈）</span>' : '');

    document.body.classList.add('has-data');

    const firstWithData = TABS.find((t) => state.results[t.id].length) || TABS[0];
    switchTab(firstWithData.id);
  }

  function updateTabBar() {
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === state.activeTab);
      const badge = b.querySelector('.tab-count');
      if (state.results) {
        const n = state.results[b.dataset.tab].length;
        badge.textContent = String(n);
        badge.style.display = '';
        badge.classList.toggle('zero', n === 0);
      }
    });
  }

  function switchTab(tabId) {
    state.activeTab = tabId;
    updateTabBar();

    const listBox = $('record-list');
    const detailBox = $('detail');
    listBox.innerHTML = '';
    detailBox.innerHTML = '';

    if (!state.results) {
      detailBox.appendChild(U.el('div', 'empty-state', '上传 EE.log 后在此查看分析结果'));
      return;
    }
    const tab = TABS.find((t) => t.id === tabId);
    const records = state.results[tabId];
    const view = tab.view();

    if (!records.length) {
      detailBox.appendChild(U.el('div', 'empty-state', tab.empty));
      return;
    }
    WF.recordList.render(listBox, records, state.clock, view.summary, (rec) => {
      view.render(detailBox, rec, state.clock);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
