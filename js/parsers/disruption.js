/* 中断任务 (Disruption) 解析器
 * 模式来源：petamorikei/disruption-log-parser（仅 host 端日志含完整 ModeState 信息）。
 * 任务总时长 = 小队开始瞬间(SS_WAITING_FOR_PLAYERS→SS_STARTED) → 结算瞬间(EOM)，
 *   与游戏结算屏显示时间对齐；若日志无该行则退回首个 ModeState=3 时刻。
 * 每轮：ModeState=4 (ARTIFACT_ROUND_DONE) 为轮次终点；
 *   第 i 轮耗时 = 本轮终点 − 上一轮终点（首轮相对小队开始瞬间）；
 *   累计耗时 = 本轮终点 − 小队开始瞬间。
 * 仅保留 已完成轮次 ≥ 45 且正常结算 的任务。
 */
window.WF = window.WF || {};

WF.DisruptionParser = (function () {
  const MIN_ROUNDS = 45;

  const PAT = {
    connected: 'Game successfully connected to:',
    missionName: 'ThemedSquadOverlay.lua: Mission name:',
    ssStarted: 'SS_WAITING_FOR_PLAYERS to SS_STARTED',
    modeState: 'SentientArtifactMission.lua: ModeState =',
    conduitDone: 'SentientArtifactMission.lua: Disruption: Completed defense for artifact',
    conduitFail: 'SentientArtifactMission.lua: Disruption: Failed defense for artifact',
    totalScore: 'SentientArtifactMission.lua: Disruption: Total score is',
    eom: 'ExtractionTimer.lua: EOM: All players extracting',
    abort: 'TopMenu.lua: Abort',
    failed: 'EndOfMatch.lua: Mission Failed',
  };

  function create() {
    const records = [];
    let mission = null; // 当前候选任务

    function reset() { mission = null; }

    function newMission(t) {
      mission = {
        loadT: t,
        startT: null,        // SS_STARTED 时刻（与游戏结算计时器对齐）
        name: null,
        rounds: [],          // {index, endT, duration, cumulative, conduits:[bool]}
        openConduits: [],    // 当前进行中轮次的传导体结果
        roundOpen: false,
        prevEndT: null,      // 首轮前用 startT 填入
        score: null,
        isDisruption: false,
      };
    }

    function effectiveStart() {
      // SS_STARTED 优先；没有则用第一个 ModeState=3 时刻（在 closeRoundAt 首次调用前设置）
      return mission.startT || mission.loadT;
    }

    function closeRoundAt(t) {
      if (!mission) return;
      // 首轮：将 prevEndT 对齐到 startT
      if (mission.prevEndT === null) mission.prevEndT = effectiveStart();
      const idx = mission.rounds.length + 1;
      mission.rounds.push({
        index: idx,
        endT: t,
        duration: t - mission.prevEndT,
        cumulative: t - effectiveStart(),
        conduits: mission.openConduits.slice(),
      });
      mission.prevEndT = t;
      mission.openConduits = [];
      mission.roundOpen = false;
    }

    return {
      feed(t, line) {
        if (line.indexOf(PAT.connected) !== -1) {
          // 新的关卡加载：上一个候选任务若未结算则弃掉
          newMission(t);
          return;
        }
        if (!mission) return;

        if (line.indexOf(PAT.missionName) !== -1) {
          const i = line.indexOf(PAT.missionName);
          mission.name = line.substring(i + PAT.missionName.length).trim();
          return;
        }
        if (line.indexOf(PAT.ssStarted) !== -1) {
          mission.startT = t;
          mission.prevEndT = null; // 重置，让首轮 prevEndT 用 startT
          return;
        }
        if (line.indexOf(PAT.modeState) !== -1) {
          mission.isDisruption = true;
          const m = /ModeState\s*=\s*(\d+)/.exec(line);
          if (!m) return;
          const state = parseInt(m[1], 10);
          if (state === 3) {            // ARTIFACT_ROUND：轮次进行中
            mission.roundOpen = true;
          } else if (state === 4) {     // ARTIFACT_ROUND_DONE：轮次结束
            closeRoundAt(t);
          }
          return;
        }
        if (line.indexOf(PAT.conduitDone) !== -1) {
          mission.isDisruption = true;
          mission.openConduits.push(true);
          return;
        }
        if (line.indexOf(PAT.conduitFail) !== -1) {
          mission.isDisruption = true;
          mission.openConduits.push(false);
          return;
        }
        if (line.indexOf(PAT.totalScore) !== -1) {
          const m = /Total score is\s*(\d+)/.exec(line);
          if (m) mission.score = parseInt(m[1], 10);
          return;
        }
        if (line.indexOf(PAT.eom) !== -1) {
          if (mission.isDisruption && mission.rounds.length >= MIN_ROUNDS) {
            const start = mission.startT || mission.loadT;
            const dur = t - start;
            const n = mission.rounds.length;
            const successConds = mission.rounds.reduce((s, r) => s + r.conduits.filter(Boolean).length, 0);
            const totalConds = mission.rounds.reduce((s, r) => s + r.conduits.length, 0);
            const condRate = totalConds > 0 ? successConds / totalConds : 1;
            const rndPerMin = n / (dur / 60);
            const effScore = Math.min(70, (rndPerMin / 1.8) * 70);
            const ps = Math.round(effScore + condRate * 30);
            const pg = ps >= 90 ? 'S' : ps >= 75 ? 'A' : ps >= 55 ? 'B' : ps >= 35 ? 'C' : 'D';
            records.push({
              type: 'disruption',
              startT: start,
              endT: t,
              totalDuration: dur,
              name: mission.name,
              score: mission.score,
              rounds: mission.rounds,
              roundCount: n,
              roundsPerMin: rndPerMin,
              conduitRate: condRate,
              successConduits: successConds,
              totalConduits: totalConds,
              perfScore: ps,
              perfGrade: pg,
            });
          }
          reset();
          return;
        }
        if (line.indexOf(PAT.abort) !== -1 || line.indexOf(PAT.failed) !== -1) {
          reset();
        }
      },

      finish() { /* 未结算的任务不保留 */ },

      results() { return records; },
      MIN_ROUNDS,
    };
  }

  return { create, MIN_ROUNDS };
})();
