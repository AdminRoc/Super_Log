window.WF = window.WF || {};

WF.DisruptionParser = (function () {
  const MIN_ROUNDS = 1;

  const PAT = {
    connected:     'Game successfully connected to:',
    missionName:   'ThemedSquadOverlay.lua: Mission name:',
    ssStarted:     'SS_WAITING_FOR_PLAYERS to SS_STARTED',
    modeState:     'SentientArtifactMission.lua: ModeState =',
    randomized:    'SentientArtifactMission.lua: Disruption: Randomized ',
    keyDropped:    'Disruption: Artifact',   // 与 ' unlocked' 联合检测 → 钥匙掉落
    conduitStart:  'SentientArtifactMission.lua: Disruption: Starting defense for artifact',
    conduitDone:   'SentientArtifactMission.lua: Disruption: Completed defense for artifact',
    conduitFail:   'SentientArtifactMission.lua: Disruption: Failed defense for artifact',
    totalScore:    'SentientArtifactMission.lua: Disruption: Total score is',
    eom:           'ExtractionTimer.lua: EOM: All players extracting',
    abort:         'TopMenu.lua: Abort',
    failed:        'EndOfMatch.lua: Mission Failed',
    agentCreated:  'OnAgentCreated',
  };

  // Conduit effect ID → Chinese display name（按维基表格顺序，ID 映射待游戏内验证）
  // 减益 (debuff) IDs 1-27；增益 (buff) IDs 31-38
  const EFFECT_NAMES = {
    // ── 减益效果 (debuffs) ── 已校准 ID 以实测 log 为准 ────────
    1:  '护盾消耗',
    2:  '生命值消耗',
    3:  '能量值消耗',
    4:  '敌人伤害加成',
    5:  '待翻译',
    6:  '更强大的密钥搬运者',
    7:  '待翻译',
    8:  '敌人技能抗性',
    9:  '敌人速度加成',
    10: '虚能导管',
    11: '待翻译',
    12: '通电的导管',
    13: '敌方火焰武器',
    14: '敌方冰冻武器',
    15: '敌方毒素武器',
    16: '敌方电击武器',
    17: '磁场异常',
    18: '待翻译',
    19: '待翻译',
    20: '待翻译',
    21: '敌人护甲增强',
    22: '待翻译',
    23: '群居狩猎野兽',
    24: '待翻译',
    25: '雷区',
    26: '待翻译',
    27: '待翻译',
    28: '灵刹涌入',
    // ── 增益效果 (buffs) ── 已校准 ────────────────────────────
    31: '补给导管',
    32: 'Tenno速度加成',
    33: '50%经验值加成',
    34: '50%资源加成',
    35: '50%现金加成',
    36: 'Tenno武器吸血加成',
    37: 'Tenno射速加成',
    38: '导管卫士',
  };

  // 危险减益 ID（需黄色高亮）：能量值消耗=3，更强大的密钥搬运者=6，群居狩猎野兽=23，敌方毒素武器=15
  const BAD_DEBUFF_IDS = new Set([3, 6, 15, 23]);

  // NPC path substrings indicating non-combat agents (pets, players, objectives, drones)
  const AGENT_SKIP = ['PetAgent', 'PlayerPawnAgent', 'DefenseAgent', 'CleaningDroneAgent', 'CrewAgent', 'CrewmemberAgent'];

  function create() {
    const records = [];
    let mission = null;
    let roundStartT = null;

    function reset() { mission = null; roundStartT = null; }

    function newMission(t) {
      mission = {
        loadT: t, startT: null,
        name: null,
        rounds: [],
        openConduits: [],
        roundOpen: false,
        prevEndT: null,
        score: null,
        isDisruption: false,
        currentRoundKills: 0,
        currentRoundSpawned: 0,
        killEvents: [],
        areaEffects: {},           // area 1-4 → {kind:'buff'|'debuff', id:N} for current round
        _prevLiveAfter: null,      // Live count after previous enemy agent was created (for kill delta)
        keysDropped: 0,            // 整局累计掉落钥匙数（Demolyst killed → Artifact N unlocked）
        keysInserted: 0,           // 整局累计插入钥匙数（Starting defense for artifact N）
        currentRoundKeysDropped: 0,
      };
      roundStartT = null;
    }

    function effectiveStart() {
      return mission.startT || mission.loadT;
    }

    function closeRoundAt(t) {
      if (!mission) return;
      if (mission.prevEndT === null) mission.prevEndT = effectiveStart();
      const idx   = mission.rounds.length + 1;
      const rStart = roundStartT !== null ? roundStartT : mission.prevEndT;
      const conduits = mission.openConduits.map(c => ({
        success:    c.success,
        artNum:     c.artNum,
        insertT:    c.insertT,
        insertRelT: c.insertRelT,
        doneT:      c.doneT,
        doneRelT:   c.doneRelT,
        effectKind: c.effectKind,
        effectId:   c.effectId,
      }));
      mission.rounds.push({
        index:           idx,
        startT:          rStart,
        endT:            t,
        combatDuration:  t - rStart,
        duration:        t - mission.prevEndT,
        cumulative:      t - effectiveStart(),
        conduits,
        kills:           mission.currentRoundKills,
        spawned:         mission.currentRoundSpawned,
        keysDropped:     mission.currentRoundKeysDropped,
        keysInserted:    conduits.filter(c => c.insertT != null).length,
      });
      mission.keysDropped  += mission.currentRoundKeysDropped;
      mission.prevEndT = t;
      mission.openConduits = [];
      mission.roundOpen = false;
      mission.currentRoundKills = 0;
      mission.currentRoundSpawned = 0;
      mission.currentRoundKeysDropped = 0;
      mission._prevLiveAfter = null;
      roundStartT = null;
    }

    return {
      feed(t, line) {
        if (line.indexOf(PAT.connected) !== -1) {
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
          mission.prevEndT = null;
          return;
        }
        if (line.indexOf(PAT.modeState) !== -1) {
          mission.isDisruption = true;
          const m = /ModeState\s*=\s*(\d+)/.exec(line);
          if (!m) return;
          const state = parseInt(m[1], 10);
          if (state === 3) {
            mission.roundOpen = true;
            mission.areaEffects = {};   // reset for new round
            mission._prevLiveAfter = null; // reset Live-delta tracking for new round
            roundStartT = t;
          } else if (state === 4) {
            closeRoundAt(t);
          }
          return;
        }
        if (line.indexOf(PAT.randomized) !== -1) {
          mission.isDisruption = true;
          const rx = /Randomized (buff|debuff) for area (\d+): (\d+)/.exec(line);
          if (rx) {
            mission.areaEffects[parseInt(rx[2], 10)] = {
              kind: rx[1],   // 'buff' | 'debuff'
              id:   parseInt(rx[3], 10),
            };
          }
          return;
        }
        // 钥匙掉落：Demolyst 被击杀后导管解锁（"Artifact N unlocked"）
        if (line.indexOf(PAT.keyDropped) !== -1 && line.indexOf(' unlocked') !== -1) {
          mission.isDisruption = true;
          mission.currentRoundKeysDropped++;
          return;
        }
        if (line.indexOf(PAT.conduitStart) !== -1) {
          mission.isDisruption = true;
          mission.keysInserted++;
          const rBase  = roundStartT !== null ? roundStartT : (mission.prevEndT || effectiveStart());
          const artRx  = /Starting defense for artifact\s+(\d+)/.exec(line);
          const artNum = artRx ? parseInt(artRx[1], 10) : null;
          const effect = (artNum != null && mission.areaEffects[artNum]) || null;
          mission.openConduits.push({
            success: null, artNum,
            insertT: t, insertRelT: t - rBase,
            effectKind: effect ? effect.kind : null,
            effectId:   effect ? effect.id   : null,
          });
          return;
        }
        if (line.indexOf(PAT.conduitDone) !== -1 || line.indexOf(PAT.conduitFail) !== -1) {
          mission.isDisruption = true;
          const ok    = line.indexOf(PAT.conduitDone) !== -1;
          const rBase = roundStartT !== null ? roundStartT : (mission.prevEndT || effectiveStart());
          const artRx  = /(Completed|Failed) defense for artifact\s+(\d+)/.exec(line);
          const artNum = artRx ? parseInt(artRx[2], 10) : null;
          const pending = mission.openConduits.find(c =>
            c.success === null && (artNum == null || c.artNum === artNum)
          );
          if (pending) {
            pending.success  = ok;
            pending.doneT    = t;
            pending.doneRelT = t - rBase;
          } else {
            mission.openConduits.push({ success: ok, artNum, insertT: null, insertRelT: null, doneT: t, doneRelT: t - rBase });
          }
          return;
        }

        // Kill + spawn counting via Live-delta on OnAgentCreated lines
        // Live=X means X agents alive BEFORE this new agent is created.
        // When Live drops between consecutive enemy spawns, enemies died in between.
        // SentinelAgent0 (Live=0 or very low) is a sentinel setup/reset — rebase the counter.
        if (mission.roundOpen &&
            line.indexOf(PAT.agentCreated) !== -1 &&
            line.indexOf('/Npc/') !== -1) {
          // Parse Live value from "Live N"
          const liveM = /\bLive\s+(\d+)/.exec(line);
          if (!liveM) return;
          const liveBefore = parseInt(liveM[1], 10);

          // Check if this is a sentinel agent (named "SentinelAgent")
          const isSentinel = line.indexOf('SentinelAgent') !== -1;

          if (isSentinel) {
            // Sentinel resets the baseline without contributing kills or spawns
            mission._prevLiveAfter = liveBefore + 1;
            return;
          }

          // Check skip list (pets, players, drones, etc.)
          let skip = false;
          for (let k = 0; k < AGENT_SKIP.length; k++) {
            if (line.indexOf(AGENT_SKIP[k]) !== -1) { skip = true; break; }
          }
          if (skip) return;

          // Compute kills from Live drop since last tracked agent
          if (mission._prevLiveAfter !== null) {
            const kills = Math.max(0, mission._prevLiveAfter - liveBefore);
            if (kills > 0) {
              mission.currentRoundKills += kills;
              for (let ki = 0; ki < kills; ki++) mission.killEvents.push(t);
            }
          }
          mission._prevLiveAfter = liveBefore + 1;
          mission.currentRoundSpawned++;
          return;
        }
        if (line.indexOf(PAT.totalScore) !== -1) {
          const m = /Total score is\s*(\d+)/.exec(line);
          if (m) mission.score = parseInt(m[1], 10);
          return;
        }
        if (line.indexOf(PAT.eom) !== -1) {
          if (mission.isDisruption && mission.rounds.length >= MIN_ROUNDS) {
            const start  = mission.startT || mission.loadT;
            const dur    = t - start;
            const n      = mission.rounds.length;
            const successConds = mission.rounds.reduce((s, r) => s + r.conduits.filter(c => c.success === true).length, 0);
            const totalConds   = mission.rounds.reduce((s, r) => s + r.conduits.filter(c => c.success !== null).length, 0);
            const condRate  = totalConds > 0 ? successConds / totalConds : 1;
            const rndPerMin = n / (dur / 60);
            const effScore  = Math.min(70, (rndPerMin / 1.8) * 70);
            const ps = Math.round(effScore + condRate * 30);
            const pg = ps >= 90 ? 'S' : ps >= 75 ? 'A' : ps >= 55 ? 'B' : ps >= 35 ? 'C' : 'D';
            records.push({
              type: 'disruption',
              startT: start, endT: t,
              totalDuration: dur,
              name: mission.name, score: mission.score,
              rounds: mission.rounds, roundCount: n,
              roundsPerMin: rndPerMin, conduitRate: condRate,
              successConduits: successConds, totalConduits: totalConds,
              perfScore: ps, perfGrade: pg,
              killEvents: mission.killEvents,
              keysDropped:  mission.keysDropped,
              keysInserted: mission.keysInserted,
            });
          }
          reset();
          return;
        }
        if (line.indexOf(PAT.abort) !== -1 || line.indexOf(PAT.failed) !== -1) {
          reset();
        }
      },

      finish() {},
      results() { return records; },
      MIN_ROUNDS,
    };
  }

  return { create, MIN_ROUNDS };
})();
