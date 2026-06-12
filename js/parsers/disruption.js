/* 中断任务 (Disruption) 解析器
 * 模式来源：petamorikei/disruption-log-parser（仅 host 端日志含完整 ModeState 信息）。
 * 任务总时长 = 任务加载瞬间(Game successfully connected) → 结算瞬间(EOM: All players extracting)。
 * 每轮：ModeState=4 (ARTIFACT_ROUND_DONE) 为轮次终点；
 *   第 i 轮耗时 = 本轮终点 − 上一轮终点（首轮相对任务加载瞬间，轮间 INTERVAL 计入下一轮）；
 *   累计耗时 = 本轮终点 − 任务加载瞬间。
 * 仅保留 已完成轮次 ≥ 45 且正常结算 的任务。
 */
window.WF = window.WF || {};

WF.DisruptionParser = (function () {
  const MIN_ROUNDS = 45;

  const PAT = {
    connected: 'Game successfully connected to:',
    missionName: 'ThemedSquadOverlay.lua: Mission name:',
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
        name: null,
        rounds: [],          // {index, endT, duration, cumulative, conduits:[bool]}
        openConduits: [],    // 当前进行中轮次的传导体结果
        roundOpen: false,
        prevEndT: t,
        score: null,
        isDisruption: false,
      };
    }

    function closeRoundAt(t) {
      if (!mission) return;
      const idx = mission.rounds.length + 1;
      mission.rounds.push({
        index: idx,
        endT: t,
        duration: t - mission.prevEndT,
        cumulative: t - mission.loadT,
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
            records.push({
              type: 'disruption',
              startT: mission.loadT,
              endT: t,
              totalDuration: t - mission.loadT,
              name: mission.name,
              score: mission.score,
              rounds: mission.rounds,
              roundCount: mission.rounds.length,
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
