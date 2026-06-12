/* 大蜘蛛 (Profit-Taker) 解析器
 * 逻辑对齐 Basiiii/Profit-Taker-Analytics (rust_core lib_profit_taker_parser)：
 *  - 计时起点：接取 HeistProfitTakerBountyFour 后离开电梯/城门（Avatar left the zone）。
 *  - 飞行时间 = 第一阶段开始行("Starting first attack Orb phase") − 起点。
 *  - 阶段 1/2/3 终点 = 下一阶段开始行；阶段 4 终点 = 第三次 BODY_VULNERABLE（击杀瞬间）。
 *  - 护盾：SwitchShieldVulnerability 链式分段；护盾阶段结束由特定语音行锚定。
 *  - 断腿：Leg freshly destroyed，链式分段；本体 = body_kill − body_vuln；
 *  - 塔架时间 = 阶段终点 − Pylon launch complete。
 *  - 总时长 = 飞行 + Σ阶段时长 = 击杀瞬间 − 起点。
 * 仅保留完整击杀记录（中止/回城/迁移的不保留）。
 */
window.WF = window.WF || {};

WF.ProfitTakerParser = (function () {
  const PAT = {
    heistStart: 'jobId=/Lotus/Types/Gameplay/Venus/Jobs/Heists/HeistProfitTakerBountyFour',
    elevatorExit: 'EidolonMP.lua: EIDOLONMP: Avatar left the zone',
    phase1Start: 'Orb Fight - Starting first attack Orb phase',
    phaseEnds1: 'Orb Fight - Starting second attack Orb phase',
    phaseEnds2: 'Orb Fight - Starting third attack Orb phase',
    phaseEnds3: 'Orb Fight - Starting final attack Orb phase',
    shieldSwitch: 'SwitchShieldVulnerability',
    shieldPhaseEnd1: 'DBntyFourInterPrTk0920TheBusiness',
    shieldPhaseEnd3: 'DBntyFourInterPrTk0890TheBusiness',
    shieldPhaseEnd4: 'DBntyFourSatelReal0930TheBusiness',
    legKill: 'Leg freshly destroyed at part',
    bodyVuln: 'Camper->StartVulnerable() - The Camper can now be damaged!',
    stateChange: 'CamperHeistOrbFight.lua: Landscape - New State: ',
    pylons: 'Pylon launch complete',
    backToTown: 'EidolonMP.lua: EIDOLONMP: TryTownTransition',
    heistAbort: 'SetReturnToLobbyLevelArgs: ',
    abortMission: 'GameRulesImpl - changing state from SS_STARTED to SS_ENDING',
  };

  const ELEMENTS = {
    DT_IMPACT: '冲击', DT_PUNCTURE: '穿刺', DT_SLASH: '切割',
    DT_FREEZE: '冰冻', DT_FIRE: '火焰', DT_POISON: '毒素', DT_ELECTRICITY: '电击',
    DT_GAS: '毒气', DT_VIRAL: '病毒', DT_MAGNETIC: '磁力', DT_RADIATION: '辐射',
    DT_CORROSIVE: '腐蚀', DT_EXPLOSION: '爆炸',
  };

  function elementFromLine(line) {
    const m = /DT_[A-Z_]+/.exec(line);
    if (!m) return { key: '?', cn: '未知' };
    const key = m[0].replace(/_(DAMAGE|ANTIFACTION)$/, '');
    return { key, cn: ELEMENTS[key] || key };
  }

  function create() {
    const records = [];

    let run = null; // 当前战斗

    function newRun(jobStartT) {
      run = {
        jobStartT,
        startT: null,          // 离开电梯（计时起点）
        flightTime: null,
        phases: [],            // 已完成阶段
        cur: null,             // 当前阶段
        phaseEndStamp: null,   // 上一阶段终点（阶段时长基准）
        prevShield: null,      // 当前在场护盾元素
        shieldRefT: null,
        legRefT: null,
        killSeq: 0,
        endT: null,
      };
    }

    function newPhase(num, t) {
      run.cur = {
        number: num,
        shields: [],   // {element, time}
        legs: [],      // {time}
        bodyVulnT: null,
        bodyKillT: null,
        pylonLaunchT: null,
        startT: t,
      };
      run.prevShield = null;
      run.shieldRefT = t;
      run.legRefT = t;
      run.killSeq = 0;
    }

    function submitPhase(t) {
      const p = run.cur;
      p.totalTime = t - run.phaseEndStamp;
      p.shieldTime = p.shields.reduce((s, x) => s + x.time, 0);
      p.legTime = p.legs.reduce((s, x) => s + x.time, 0);
      p.bodyTime = (p.bodyKillT != null && p.bodyVulnT != null) ? p.bodyKillT - p.bodyVulnT : 0;
      p.pylonTime = p.pylonLaunchT != null ? t - p.pylonLaunchT : 0;
      p.endT = t;
      run.phases.push(p);
      run.phaseEndStamp = t;
    }

    function finalizeRun(t) {
      run.endT = t;
      const totalDuration = t - run.startT;
      records.push({
        type: 'profitTaker',
        startT: run.startT,
        endT: t,
        totalDuration,
        flightTime: run.flightTime,
        phases: run.phases,
        totals: {
          shield: run.phases.reduce((s, p) => s + p.shieldTime, 0),
          leg: run.phases.reduce((s, p) => s + p.legTime, 0),
          body: run.phases.reduce((s, p) => s + p.bodyTime, 0),
          pylon: run.phases.reduce((s, p) => s + p.pylonTime, 0),
        },
      });
      run = null;
    }

    function recordShieldBreak(t) {
      if (run.prevShield == null) return;
      run.cur.shields.push({ element: run.prevShield, time: t - run.shieldRefT });
      run.shieldRefT = t;
    }

    return {
      feed(t, line) {
        if (line.indexOf(PAT.heistStart) !== -1) {
          newRun(t);
          return;
        }
        if (!run) return;

        // 计时起点：接取赏金后离开城门
        if (run.startT == null) {
          if (line.indexOf(PAT.elevatorExit) !== -1) run.startT = t;
          return;
        }

        // 中止 / 回城 → 不完整，丢弃
        if (line.indexOf(PAT.abortMission) !== -1 || line.indexOf(PAT.heistAbort) !== -1 ||
            line.indexOf(PAT.backToTown) !== -1) {
          run = null;
          return;
        }

        if (line.indexOf(PAT.phase1Start) !== -1) {
          run.flightTime = t - run.startT;
          run.phaseEndStamp = t;
          newPhase(1, t);
          return;
        }
        if (!run.cur) return;

        if (line.indexOf(PAT.phaseEnds1) !== -1) { submitPhase(t); newPhase(2, t); return; }
        if (line.indexOf(PAT.phaseEnds2) !== -1) { submitPhase(t); newPhase(3, t); return; }
        if (line.indexOf(PAT.phaseEnds3) !== -1) { submitPhase(t); newPhase(4, t); return; }

        if (line.indexOf(PAT.shieldSwitch) !== -1) {
          const elem = elementFromLine(line);
          if (run.prevShield == null) {
            run.prevShield = elem;
            run.shieldRefT = t;
          } else {
            recordShieldBreak(t);
            run.prevShield = elem;
          }
          return;
        }
        if (line.indexOf(PAT.shieldPhaseEnd1) !== -1 || line.indexOf(PAT.shieldPhaseEnd3) !== -1 ||
            line.indexOf(PAT.shieldPhaseEnd4) !== -1) {
          // 护盾阶段结束：记录最后一段护盾，进入断腿阶段
          recordShieldBreak(t);
          run.prevShield = null;
          run.legRefT = t;
          return;
        }
        if (line.indexOf(PAT.legKill) !== -1) {
          run.cur.legs.push({ time: t - run.legRefT });
          run.legRefT = t;
          if (run.cur.legs.length > 4) run.bugged = true;
          return;
        }
        if (line.indexOf(PAT.bodyVuln) !== -1) {
          if (run.cur.bodyVulnT == null) run.cur.bodyVulnT = t;
          if (run.cur.number === 4) {
            run.killSeq++;
            if (run.killSeq === 3) {
              run.cur.bodyKillT = t;
              submitPhase(t);
              finalizeRun(t);
            }
          }
          return;
        }
        if (line.indexOf(PAT.stateChange) !== -1) {
          const m = /New State:\s*(\d+)/.exec(line);
          if (m && run.cur.number < 4) {
            const st = parseInt(m[1], 10);
            if (st === 3 || st === 5 || st === 6) {
              if (run.cur.bodyVulnT != null && run.cur.bodyKillT == null) run.cur.bodyKillT = t;
            }
          }
          return;
        }
        if (line.indexOf(PAT.pylons) !== -1) {
          run.cur.pylonLaunchT = t;
        }
      },

      finish() { /* 未完成的战斗不保留 */ },

      results() { return records; },
    };
  }

  return { create };
})();
