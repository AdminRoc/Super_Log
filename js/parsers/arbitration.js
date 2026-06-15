/* 仲裁 (Arbitration) 解析器
 * 模式来源：wxhn1225/warframe-arbitration（web/src/lib/eelog/parser.ts）
 * 识别：任务名行含 "- 仲裁"（中文客户端）或节点 "X_EliteAlert"；
 * 统计：磁盾无人机(CorpusEliteShieldDroneAgent)、敌人生成数(maxSpawned via OnAgentCreated Spawned)、
 *       轮次边界（生存 tier / 防御 wave / 镜像防御 wave / 拦截轮）、任务时长；
 * 评分：0-100 分制，基于满 Buff 赋灵母液/小时，≥90 对应原项目 S 级。
 */
window.WF = window.WF || {};

WF.ArbitrationParser = (function () {
  const RE = {
    missionName:      /ThemedSquadOverlay\.lua: Mission name:\s*(.+?)\s*$/,
    cachedName:       /ThemedSquadOverlay\.lua: Cached mission name=(.+?)\s*$/,
    voteName:         /ThemedSquadOverlay\.lua: ShowMissionVote\s+(.+?)\s*$/,
    hostLoadingNode:  /ThemedSquadOverlay\.lua: Host loading .*"name":"([^"]+)_EliteAlert"/,
    // Vote/name lines often have parenthetical form (NodePath_EliteAlert) — ref: wxhn1225 reVoteNodeId
    voteNodeId:       /\(([A-Za-z0-9_/]+)_EliteAlert\)/,
    stateStarted:     /GameRulesImpl - changing state from SS_WAITING_FOR_PLAYERS to SS_STARTED/,
    stateEnding:      /GameRulesImpl - changing state from SS_STARTED to SS_ENDING/,
    eomInit:          /EndOfMatch\.lua: Initialize\b/,
    allExtracting:    /ExtractionTimer\.lua: EOM: All players extracting/,
    shieldDrone:      /AI \[Info\]: OnAgentCreated \/Npc\/CorpusEliteShieldDroneAgent\d*\b/,
    onAgentCreated:   /AI \[Info\]: OnAgentCreated\b/,
    spawned:          /\bSpawned\s+(\d+)\b/,
    defenseWave:      /WaveDefend\.lua: Defense wave:\s*(\d+)\b/,
    loopDefenseWave:  /LoopDefend\.lua: Loop Defense wave:\s*(\d+)\b/,
    interceptionRound:/HudRedux\.lua: Queuing new transmission: InterNewRoundLotusTransmission\b/,
    rewardTransitionOut: /DefenseReward\.lua: DefenseReward::TransitionOut\b/,
    survivalTier:     /SurvivalMission\.lua: Survival: Gave reward tier (\d+) at ([\d.]+)/,
    connected:        /Game successfully connected to:/,
  };
  const ARB_NAME_MARK = '- 仲裁';

  // 期望母液常量（来源 warframe-arbitration metrics.ts）
  const BASE_DROP      = 0.06;                 // 每个无人机基础期望
  const EXTRA_PER_ROUND = 1 + 0.1 * 3;        // 每轮 1.3（1 + 10% 概率额外掉 3 个）
  const FULL_BUFF_MUL  = 2 * 1.18 * 2 * 1.25; // 蓝盒×富足×黄盒×祝福 = 5.9（仅作用于无人机项）

  const TYPE_NAMES = {
    survival: '生存', defense: '防御', loopDefense: '镜像防御',
    interception: '拦截', rounds: '轮次型', unknown: '未知',
  };

  /* 0-100 评分（基于满 Buff 母液/小时，对齐原项目 S≥800/hr = 本项目 ≥90 分） */
  function computeScore(perHour) {
    if (perHour >= 1200) return 100;
    if (perHour >= 800)  return Math.round(90 + (perHour - 800)  / 400 * 10);
    if (perHour >= 600)  return Math.round(75 + (perHour - 600)  / 200 * 14);
    if (perHour >= 400)  return Math.round(55 + (perHour - 400)  / 200 * 19);
    if (perHour >= 200)  return Math.round(35 + (perHour - 200)  / 200 * 19);
    return Math.round((perHour / 200) * 34);
  }
  function scoreLabel(s) {
    if (s >= 90) return 'S';
    if (s >= 75) return 'A';
    if (s >= 55) return 'B';
    if (s >= 35) return 'C';
    return 'D';
  }

  function create() {
    const records = [];
    let m = null;

    function newMission(t, name) {
      m = {
        nameLineT: t,
        name:      name || null,
        nodeId:    null,
        startedT:  null,
        type:      'unknown',
        drones:    [],     // 无人机生成时刻（相对于 startedT 的秒数）
        droneCount: 0,
        maxSpawned: 0,     // 累计敌人生成数（取 OnAgentCreated Spawned 字段最大值）
        boundaries: [],    // 轮次边界 {t(相对), label}
        maxWave:    0,
        endT:       null,
      };
    }

    function finalize(endT, viaEom) {
      if (!m || m.startedT == null) { m = null; return; }
      const duration = endT - m.startedT;
      const valid = viaEom ? duration >= 60 : (duration >= 60 && m.droneCount > 0);
      if (valid) {
        const rounds      = m.boundaries.length;
        const fromDrones  = m.droneCount * BASE_DROP;
        const fromRounds  = rounds * EXTRA_PER_ROUND;
        const total       = fromDrones + fromRounds;
        const fullBuffTotal = fromDrones * FULL_BUFF_MUL + fromRounds;
        const perHour     = duration > 0 ? total * 3600 / duration : 0;
        const fullBuffPerHour = duration > 0 ? fullBuffTotal * 3600 / duration : 0;
        const perMin      = duration > 0 ? total * 60 / duration : 0;
        const dronesPerMin = duration > 0 ? m.droneCount / (duration / 60) : 0;
        const score       = computeScore(fullBuffPerHour);

        records.push({
          type:             'arbitration',
          startT:           m.startedT,
          endT,
          duration,
          name:             m.name,
          nodeId:           m.nodeId,
          missionType:      m.type,
          missionTypeName:  TYPE_NAMES[m.type] || m.type,
          droneCount:       m.droneCount,
          drones:           m.drones,
          maxSpawned:       m.maxSpawned,
          boundaries:       m.boundaries,
          rounds,
          dronesPerMin,
          complete:         viaEom,
          essence: {
            fromDrones, fromRounds, total,
            fullBuffTotal, perHour, fullBuffPerHour, perMin,
          },
          score,
          scoreLabel: scoreLabel(score),
        });
      }
      m = null;
    }

    return {
      feed(t, line) {
        // ---- 任务识别 ----
        let nm = null;
        if (line.indexOf('ThemedSquadOverlay.lua') !== -1) {
          const r = RE.missionName.exec(line) || RE.cachedName.exec(line) || RE.voteName.exec(line);
          if (r && r[1].indexOf(ARB_NAME_MARK) !== -1) {
            nm = r[1].replace(ARB_NAME_MARK, '').replace(/-\s*$/, '').trim();
          }
          const h = RE.hostLoadingNode.exec(line);
          if (h) {
            if (!m) newMission(t, null);
            m.nodeId = h[1];
          }
          // Also try the parenthetical form: (NodePath_EliteAlert)
          if (!h) {
            const v = RE.voteNodeId.exec(line);
            if (v) {
              if (!m) newMission(t, null);
              if (!m.nodeId) m.nodeId = v[1];
            }
          }
        }
        if (nm) {
          if (m && m.startedT != null) finalize(t, false);
          if (!m || m.startedT != null) newMission(t, nm);
          else m.name = nm;
          return;
        }
        if (!m) return;

        if (m.startedT == null) {
          if (RE.stateStarted.test(line)) m.startedT = t;
          return;
        }

        // ---- 任务内事件 ----
        // 磁盾无人机（优先检测，比 onAgentCreated 更具体）
        if (RE.shieldDrone.test(line)) {
          m.droneCount++;
          m.drones.push(t - m.startedT);
          return;
        }
        // 普通敌人生成（仅追踪累计生成数 maxSpawned，不收集 ticking 数据）
        if (RE.onAgentCreated.test(line)) {
          const sp = RE.spawned.exec(line);
          if (sp) m.maxSpawned = Math.max(m.maxSpawned, parseInt(sp[1], 10));
          return;
        }

        let r;
        if ((r = RE.survivalTier.exec(line))) {
          m.type = 'survival';
          m.boundaries.push({ t: t - m.startedT, label: `轮 ${r[1]}` });
          return;
        }
        if ((r = RE.defenseWave.exec(line))) {
          m.type = 'defense';
          const w = parseInt(r[1], 10);
          if (w > m.maxWave) {
            m.maxWave = w;
            if (w > 1) m.boundaries.push({ t: t - m.startedT, label: `波 ${w - 1}` });
          }
          return;
        }
        if ((r = RE.loopDefenseWave.exec(line))) {
          m.type = 'loopDefense';
          const w = parseInt(r[1], 10);
          if (w > m.maxWave) {
            m.maxWave = w;
            if (w > 1) m.boundaries.push({ t: t - m.startedT, label: `波 ${w - 1}` });
          }
          return;
        }
        if (RE.interceptionRound.test(line)) {
          m.type = 'interception';
          return;
        }
        if (RE.rewardTransitionOut.test(line)) {
          if (m.type === 'unknown') m.type = 'rounds';
          if (m.type === 'interception' || m.type === 'rounds') {
            m.boundaries.push({ t: t - m.startedT, label: `轮 ${m.boundaries.length + 1}` });
          }
          return;
        }
        if (RE.eomInit.test(line) || RE.allExtracting.test(line)) {
          finalize(t, true);
          return;
        }
        if (RE.stateEnding.test(line)) {
          finalize(t, false);
        }
      },

      finish(lastT) {
        if (m && m.startedT != null) finalize(lastT, false);
      },

      results() { return records; },
    };
  }

  return { create };
})();
