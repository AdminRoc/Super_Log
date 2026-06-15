/* 入口：文件上传、解析调度、Tab 路由
 * 大文件（≥ LARGE_THRESHOLD）走 scanAsync 分块扫描，UI 保持响应并显示进度 */
(function () {
  const U = WF.utils;

  const TABS = [
    { id: 'eidolon',     label: '夜灵',  en: 'EIDOLON',       view: () => WF.eidolonView,     empty: '未找到满足 6×3 条件的夜灵捕获记录' },
    { id: 'disruption',  label: '中断',  en: 'DISRUPTION',    view: () => WF.disruptionView,  empty: '未找到完成 ≥45 轮且成功结算的中断任务（需房主日志）' },
    { id: 'profitTaker', label: '大蜘蛛', en: 'PROFIT-TAKER', view: () => WF.profitTakerView, empty: '未找到完整的 Profit-Taker 击杀记录' },
    { id: 'arbitration', label: '仲裁',  en: 'ARBITRATION',   view: () => WF.arbitrationView, empty: '未找到有效的仲裁任务记录（需房主日志，时长 ≥60 秒）' },
    { id: 'general',     label: '通用',  en: 'GENERAL',       view: () => WF.generalView,     empty: '未找到有效的通用任务记录（仅记录正常结算、非大厅/PVP 任务）' },
  ];

  const _urlTab = new URLSearchParams(window.location.search).get('tab');
  const _initTab = TABS.find((t) => t.id === _urlTab) ? _urlTab : 'eidolon';
  let state = { results: null, clock: null, activeTab: _initTab };
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
    const statusEl = $('dropzone-status');
    const sizeMB = (file.size / 1048576).toFixed(1);
    statusEl.innerHTML = `解析中… <b>${U.escapeHtml(file.name)}</b>（${sizeMB} MB）`;

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      const t0 = performance.now();

      const eidolon     = WF.EidolonParser.create();
      const disruption  = WF.DisruptionParser.create();
      const profitTaker = WF.ProfitTakerParser.create();
      const arbitration = WF.ArbitrationParser.create();
      const general     = WF.GeneralParser.create();
      const parsers = [eidolon, disruption, profitTaker, arbitration, general];

      function onDone(scan) {
        try {
          const clock = WF.logReader.makeClock(scan, file.lastModified);
          state.results = {
            general:     general.results(),
            eidolon:     eidolon.results(),
            disruption:  disruption.results(),
            profitTaker: profitTaker.results(),
            arbitration: arbitration.results(),
          };
          state.clock = clock;

          const ms = (performance.now() - t0).toFixed(0);
          const r = state.results;
          statusEl.innerHTML =
            `<b>${U.escapeHtml(file.name)}</b>（${sizeMB} MB，${scan.lineCount.toLocaleString()} 行，${ms} ms）` +
            ` — 通用 <b>${r.general.length}</b> ｜ 夜灵 <b>${r.eidolon.length}</b> ｜ 中断 <b>${r.disruption.length}</b>` +
            ` ｜ 大蜘蛛 <b>${r.profitTaker.length}</b> ｜ 仲裁 <b>${r.arbitration.length}</b>` +
            (clock.approx && clock.available ? '<br><span class="muted">日志内无系统时间行，绝对时间按文件修改时间估算（前缀 ≈）</span>' : '');

          document.body.classList.add('has-data');
          const urlTabHasData = _urlTab && state.results[_urlTab] && state.results[_urlTab].length;
          const firstWithData = urlTabHasData
            ? TABS.find((t) => t.id === _urlTab)
            : (TABS.find((t) => state.results[t.id].length) || TABS[0]);
          switchTab(firstWithData.id);
        } catch (err) {
          statusEl.textContent = `结果处理失败：${err.message}`;
          console.error(err);
        }
      }

      try {
        if (file.size >= WF.logReader.LARGE_THRESHOLD) {
          // 大文件：异步分块，UI 保持响应
          WF.logReader.scanAsync(
            text, parsers,
            (pct) => { statusEl.innerHTML = `解析中… <b>${U.escapeHtml(file.name)}</b>（${sizeMB} MB）&nbsp;&nbsp;${pct}%`; },
            onDone
          );
        } else {
          // 小文件：同步扫描
          const scan = WF.logReader.scan(text, parsers);
          onDone(scan);
        }
      } catch (err) {
        statusEl.textContent = `解析失败：${err.message}`;
        console.error(err);
      }
    };
    reader.onerror = () => { $('dropzone-status').textContent = '文件读取失败'; };
    reader.readAsText(file);
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

    const listBox   = $('record-list');
    const detailBox = $('detail');
    listBox.innerHTML   = '';
    detailBox.innerHTML = '';

    if (!state.results) {
      detailBox.appendChild(U.el('div', 'empty-state', '上传 EE.log 后在此查看分析结果'));
      return;
    }
    const tab     = TABS.find((t) => t.id === tabId);
    const records = state.results[tabId];
    const view    = tab.view();

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
