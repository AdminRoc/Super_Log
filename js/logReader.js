/* 通用日志读取层：按行切分、时间戳解析、绝对时间换算
 * 性能优化：
 *  1. 关键字预过滤 — 仅将匹配行喂给解析器，跳过无关行（通常 90%+ 的行），加速 5~20×
 *  2. scanAsync — 大文件分块处理 + setTimeout yield，不阻塞 UI；小文件仍走同步路径
 */
window.WF = window.WF || {};

WF.logReader = (function () {
  const RE_TIME = /^[^0-9]{0,4}(\d+\.\d{3})\s/;
  const RE_WALLCLOCK = /Current time: (\w{3} \w{3} [ \d]\d \d{2}:\d{2}:\d{2} \d{4})/;

  /* 所有解析器关心的关键字集合（indexOf 逐一检测，匹配则送入解析器）。
   * 调整原则：宁可误传（false positive，增加少量解析器工作）不可漏传（false negative）。 */
  const KEYWORDS = [
    // 通用
    'Game successfully connected to:', 'Current time:', 'ExtractionTimer.lua: EOM:',
    'EndOfMatch.lua', 'TopMenu.lua: Abort', 'ThemedSquadOverlay.lua',
    'SS_WAITING_FOR_PLAYERS', 'GameRulesImpl',
    // 夜灵 Eidolon
    'EidolonLandscape', "It's nighttime!", 'Teralyst Captured', 'Teralyst Killed',
    'Eidolon spawning SUCCESS', 'streaming to layer', 'LEVEL LOADER DONE', 'DefaultArcanePickup',
    // 中断 Disruption
    'SentientArtifactMission.lua',
    // 大蜘蛛 Profit-Taker
    'HeistProfitTakerBountyFour', 'EIDOLONMP', 'Orb Fight - Starting',
    'SwitchShieldVulnerability', 'DBntyFourInterPrTk', 'DBntyFourSatelReal',
    'Leg freshly destroyed', 'StartVulnerable', 'CamperHeistOrbFight.lua',
    'Pylon launch complete', 'TryTownTransition', 'SetReturnToLobbyLevelArgs:',
    // 仲裁 Arbitration
    'CorpusEliteShieldDroneAgent', 'OnAgentCreated',
    'WaveDefend.lua', 'LoopDefend.lua', 'HudRedux.lua: Queuing',
    'DefenseReward.lua', 'SurvivalMission.lua', '仲裁', 'EliteAlert',
    // 通用任务 General
    'MissionIntro.lua', 'EOM missionLocationUnlocked', 'CommitInventoryChangesToDB',
    'HUD REDUX', 'SyncAutoPopulatedConsumables', 'was killed by', 'missionType=',
    'SetSquadMissionResult',
  ];

  /* 快速判断是否应送入解析器 */
  function matchesAny(line) {
    for (let k = 0; k < KEYWORDS.length; k++) {
      if (line.indexOf(KEYWORDS[k]) !== -1) return true;
    }
    return false;
  }

  /* 处理单行：更新时间状态 + wall-clock 检测 + 预过滤后喂给解析器 */
  function processLine(line, state, parsers) {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (!line) { state.lineCount++; return; }
    state.lineCount++;

    const m = RE_TIME.exec(line);
    const t = m ? parseFloat(m[1]) : state.lastT;
    if (m) {
      if (state.firstT === null) state.firstT = t;
      state.lastT = t;
    }

    // wall-clock 基准行（比较罕见，直接检测无需预过滤）
    if (!state.wallClockAnchor && line.indexOf('Current time:') !== -1 && line.indexOf('Diag') !== -1) {
      const wm = RE_WALLCLOCK.exec(line);
      if (wm) {
        const d = new Date(wm[1]);
        if (!isNaN(d.getTime())) state.wallClockAnchor = { t, date: d };
      }
    }

    if (matchesAny(line)) {
      for (let i = 0; i < parsers.length; i++) parsers[i].feed(t, line);
    }
  }

  /* 同步扫描（小文件 / selftest.js 用） */
  function scan(text, parsers) {
    const state = { lineCount: 0, firstT: null, lastT: 0, wallClockAnchor: null };
    let pos = 0;
    const len = text.length;
    while (pos < len) {
      let nl = text.indexOf('\n', pos);
      if (nl === -1) nl = len;
      const line = text.substring(pos, nl);
      pos = nl + 1;
      processLine(line, state, parsers);
    }
    for (let i = 0; i < parsers.length; i++) {
      if (parsers[i].finish) parsers[i].finish(state.lastT);
    }
    return { lineCount: state.lineCount, firstT: state.firstT || 0, lastT: state.lastT, wallClockAnchor: state.wallClockAnchor };
  }

  /* 大文件阈值（字节）：超过此大小使用异步分块扫描 */
  const LARGE_THRESHOLD = 5 * 1024 * 1024; // 5 MB
  const CHUNK_LINES = 20000;                // 每块行数，yield 一次

  /* 异步分块扫描：每 CHUNK_LINES 行 setTimeout(0) yield，保持 UI 响应
   * onProgress(pct: 0-100)  — 可选进度回调
   * onDone(scanResult)       — 完成回调 */
  function scanAsync(text, parsers, onProgress, onDone) {
    const state = { lineCount: 0, firstT: null, lastT: 0, wallClockAnchor: null };
    const lines = text.split('\n');
    const total = lines.length;
    let pos = 0;

    function step() {
      const end = Math.min(pos + CHUNK_LINES, total);
      for (; pos < end; pos++) {
        processLine(lines[pos], state, parsers);
      }
      if (onProgress) onProgress(Math.round((pos / total) * 95)); // 留 5% 给 finish
      if (pos < total) {
        setTimeout(step, 0);
      } else {
        for (let i = 0; i < parsers.length; i++) {
          if (parsers[i].finish) parsers[i].finish(state.lastT);
        }
        if (onProgress) onProgress(100);
        onDone({ lineCount: state.lineCount, firstT: state.firstT || 0, lastT: state.lastT, wallClockAnchor: state.wallClockAnchor });
      }
    }
    setTimeout(step, 0); // 让 UI 先渲染 "解析中" 状态再开始
  }

  /* 构造 相对秒→绝对时间 的换算函数 */
  function makeClock(scanResult, fileLastModified) {
    const { wallClockAnchor, lastT } = scanResult;
    if (wallClockAnchor) {
      return {
        available: true, approx: false,
        toDate: (t) => new Date(wallClockAnchor.date.getTime() + (t - wallClockAnchor.t) * 1000),
      };
    }
    if (fileLastModified) {
      return {
        available: true, approx: true,
        toDate: (t) => new Date(fileLastModified + (t - lastT) * 1000),
      };
    }
    return { available: false, approx: true, toDate: () => null };
  }

  return { scan, scanAsync, makeClock, LARGE_THRESHOLD };
})();
