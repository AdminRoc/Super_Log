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
    'SetSquadMissionResult', 'MapRedux::NodeRollOver', 'Cached mission name=',
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
      // 检测会话重置：时间戳骤降 > 60s 说明 EE.log 内包含多个游戏会话。
      // sessionOffset 累加保证跨会话的绝对排序单调递增（用于正确排序多会话记录）。
      if (state.lastT > 60 && t < state.lastT - 60) {
        state.sessionOffset += Math.ceil((state.lastT + 60) / 10000) * 10000;
      }
      if (state.firstT === null) state.firstT = t;
      state.lastT = t;
    }

    // wall-clock 基准行 — 每次出现都更新，支持多会话日志文件
    if (line.indexOf('Current time:') !== -1 && line.indexOf('Diag') !== -1) {
      const wm = RE_WALLCLOCK.exec(line);
      if (wm) {
        const d = new Date(wm[1]);
        if (!isNaN(d.getTime())) {
          state.wallClockAnchor = { t, date: d, offset: state.sessionOffset };
          state.sessions.push(state.wallClockAnchor);
        }
      }
    }

    if (matchesAny(line)) {
      // 将 sessionOffset 和当前会话锚点传给解析器，支持多会话绝对时间计算
      for (let i = 0; i < parsers.length; i++) {
        parsers[i].feed(t, line, state.sessionOffset, state.wallClockAnchor);
      }
    }
  }

  function _mkState() {
    return { lineCount: 0, firstT: null, lastT: 0, wallClockAnchor: null, sessions: [], sessionOffset: 0 };
  }

  function _mkResult(state) {
    return { lineCount: state.lineCount, firstT: state.firstT || 0, lastT: state.lastT,
             wallClockAnchor: state.wallClockAnchor, sessions: state.sessions };
  }

  /* 同步扫描（小文件 / selftest.js 用） */
  function scan(text, parsers) {
    const state = _mkState();
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
    return _mkResult(state);
  }

  /* 大文件阈值（字节）：超过此大小使用异步分块扫描 */
  const LARGE_THRESHOLD = 2 * 1024 * 1024; // 2 MB
  const CHUNK_LINES = 25000;                // 每块行数，yield 一次

  /* 异步分块扫描：按字符索引逐行扫描，每处理 CHUNK_LINES 行 setTimeout(0) yield，保持 UI 响应。
   * 与 scan() 共用同一字符扫描逻辑，避免预先 split('\n') 造成的双倍内存占用。
   * 所有解析器（夜灵/中断/大蜘蛛/仲裁/通用）均通过统一入口受益于此优化。
   * onProgress(pct: 0-100)  — 可选进度回调
   * onDone(scanResult)       — 完成回调 */
  function scanAsync(text, parsers, onProgress, onDone) {
    const state = _mkState();
    const len   = text.length;
    let charPos = 0;
    let linesInBatch = 0;

    function step() {
      linesInBatch = 0;
      while (charPos < len && linesInBatch < CHUNK_LINES) {
        let nl = text.indexOf('\n', charPos);
        if (nl === -1) nl = len;
        processLine(text.substring(charPos, nl), state, parsers);
        charPos = nl + 1;
        linesInBatch++;
      }
      if (onProgress) onProgress(Math.round((charPos / len) * 95)); // 留 5% 给 finish
      if (charPos < len) {
        setTimeout(step, 0);
      } else {
        for (let i = 0; i < parsers.length; i++) {
          if (parsers[i].finish) parsers[i].finish(state.lastT);
        }
        if (onProgress) onProgress(100);
        onDone(_mkResult(state));
      }
    }
    setTimeout(step, 0); // 让 UI 先渲染 "解析中" 状态再开始
  }

  /* 构造 相对秒→绝对时间 的换算函数
   * 多会话日志中每条记录存有自己的 sessionAnchor，优先用它；
   * 此处的 toDate 作为全局回退（单会话场景与旧代码行为相同）。 */
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
