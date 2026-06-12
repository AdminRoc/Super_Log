/* 夜灵 (Eidolon) 解析器 —— 计时口径对齐 idalon.com "real time"：
 *   小轮起点 = 夜晚开始（每次进平原后 TeralystEncounter 脚本打出的 "It's nighttime!" 行；
 *              首轮提前进门等夜时，该行即真实夜晚开始瞬间）
 *   小轮终点 = 水力使捕获后赋能掉落在地上（SnapPickupToGround DefaultArcanePickup，
 *              固定在捕获判定后约 15 秒的死亡动画结束时）
 * 三只共用日志行 "TeralystAvatarScript.lua: Teralyst Captured"，按序列推断：
 *   第1次=兆力使 Teralyst → spawning SUCCESS → 第2次=巨力使 Gantulyst → SUCCESS → 第3次=水力使 Hydrolyst。
 * 一晚 ≥6 个完整小轮（全捕获）才生成记录；6×3 / 6×3+k / n×3 标签；
 * 平均真实时间取连续 6 轮窗口中平均值最小者。
 */
window.WF = window.WF || {};

WF.EidolonParser = (function () {
  const PAT = {
    connected: 'Game successfully connected to:',
    plains: 'EidolonLandscape', // 兼容经典平原与新战甲后平原
    streamTo: 'EIDOLONMP: Start streaming to layer ',
    loaderDone: 'EIDOLONMP: LEVEL LOADER DONE',
    nighttime: "TeralystEncounter.lua: It's nighttime!",
    daytime: "TeralystEncounter.lua: It's daytime!",
    captured: 'AvatarScript.lua: Teralyst Captured',
    killed: 'AvatarScript.lua: Teralyst Killed',
    spawnSuccess: 'Eidolon spawning SUCCESS',
    teralystSpawned: 'TeralystEncounter.lua: Teralyst spawned',
    arcaneDrop: 'SnapPickupToGround.lua: Snapping pickup to ground (DefaultArcanePickup)',
  };
  const EIDOLON_NAMES = ['兆力使 Teralyst', '巨力使 Gantulyst', '水力使 Hydrolyst'];
  const NIGHT_GAP = 5400; // 超过 90 分钟无夜灵事件视为另一个夜晚

  function create() {
    const nights = []; // 完成的夜晚记录

    let inPlains = false;
    let pendingEnterPlains = false; // 已发出 streaming layer 255，等 LEVEL LOADER DONE
    let night = null;   // 当前夜晚 {startT, lastEventT, attempts:[], endingT}
    let round = null;   // 当前小轮尝试

    function newRound(t) {
      round = {
        loadDoneAt: t,
        startAnchor: null,   // 进平原后首个 "It's nighttime!" = idalon 计时起点
        captures: [],
        lootT: null,         // 水力使赋能掉落 = idalon 计时终点
        awaitLoot: false,
        killed: false,
        teralystSpawnedAt: null,
      };
    }

    function closeRound(endT) {
      if (!round || !night) { round = null; return; }
      const effStart = round.startAnchor != null ? round.startAnchor : Math.max(round.loadDoneAt, night.startT);
      const effEnd = round.lootT != null ? round.lootT : (round.captures.length === 3 ? round.captures[2] : null);
      const complete = round.captures.length === 3 && !round.killed;
      night.attempts.push({
        loadDoneAt: round.loadDoneAt,
        effStart,
        captures: round.captures.slice(),
        lootT: round.lootT,
        lootApprox: complete && round.lootT == null, // 缺掉落行时退化用捕获瞬间
        killed: round.killed,
        complete,
        endT,
        duration: complete ? effEnd - effStart : null,
      });
      round = null;
    }

    function closeNight(endT) {
      if (!night) return;
      closeRound(endT);
      const rec = summarize(night, endT);
      if (rec) nights.push(rec);
      night = null;
    }

    function summarize(n, endT) {
      const completes = n.attempts.filter((a) => a.complete);
      if (completes.length < 6) return null;

      // 连续 6 个完整小轮的窗口，取平均最小者
      let best = null;
      for (let i = 0; i + 6 <= completes.length; i++) {
        const win = completes.slice(i, i + 6);
        const sum = win.reduce((s, r) => s + r.duration, 0);
        if (!best || sum < best.sum) best = { start: i, sum };
      }

      // 额外捕获：第 6 个完整小轮之后的不完整尝试中的捕获数
      const idxOf6th = n.attempts.indexOf(completes[5]);
      let extraCaptures = 0;
      const extras = [];
      n.attempts.forEach((a, i) => {
        if (i > idxOf6th && !a.complete && a.captures.length > 0) {
          extraCaptures += a.captures.length;
          extras.push(a);
        }
      });

      let label;
      if (completes.length >= 7) label = `${completes.length}×3`;
      else label = extraCaptures > 0 ? `6×3+${extraCaptures}` : '6×3';

      return {
        type: 'eidolon',
        startT: n.startT,
        endT,
        attempts: n.attempts,
        completes,
        label,
        completeCount: completes.length,
        extraCaptures,
        extras,
        window: { start: best.start, end: best.start + 5 },
        realTime: best.sum,
        avgTime: best.sum / 6,
      };
    }

    return {
      feed(t, line) {
        // ---- 区域/加载状态 ----
        if (line.indexOf(PAT.connected) !== -1) {
          if (line.indexOf(PAT.plains) !== -1) {
            inPlains = true;
            if (night && t - night.lastEventT > NIGHT_GAP) closeNight(night.lastEventT);
            newRound(t);
            if (night) night.lastEventT = t;
          } else {
            // 完整加载去了其他地方：离开平原
            if (inPlains) { closeRound(t); if (night && night.endingT != null) closeNight(t); }
            inPlains = false;
            pendingEnterPlains = false;
          }
          return;
        }
        if (line.indexOf(PAT.streamTo) !== -1) {
          const layer = line.charAt(line.indexOf(PAT.streamTo) + PAT.streamTo.length);
          if (layer === '0') {
            // 无缝回城
            if (inPlains) { closeRound(t); if (night && night.endingT != null) closeNight(t); }
            inPlains = false;
            pendingEnterPlains = false;
          } else {
            pendingEnterPlains = true; // layer 255 → 进平原
          }
          return;
        }
        if (pendingEnterPlains && line.indexOf(PAT.loaderDone) !== -1) {
          pendingEnterPlains = false;
          inPlains = true;
          if (night && t - night.lastEventT > NIGHT_GAP) closeNight(night.lastEventT);
          newRound(t);
          if (night) night.lastEventT = t;
          return;
        }

        // ---- 夜晚边界 ----
        if (line.indexOf(PAT.nighttime) !== -1) {
          if (night && t - night.lastEventT > NIGHT_GAP) closeNight(night.lastEventT);
          if (!night) night = { startT: t, lastEventT: t, attempts: [], endingT: null };
          else night.lastEventT = t;
          if (round && round.startAnchor == null) round.startAnchor = t; // idalon 计时起点
          return;
        }
        if (line.indexOf(PAT.daytime) !== -1) {
          if (round && round.awaitLoot && round.lootT == null) {
            // 第三捕已完成、赋能尚未落地（掉落行在 daytime 之后约 15s 处）：延迟收夜
            night.endingT = t;
          } else {
            closeNight(t);
          }
          return;
        }

        if (!night) return;

        // ---- 夜灵事件 ----
        if (line.indexOf(PAT.teralystSpawned) !== -1) {
          if (round) round.teralystSpawnedAt = t;
          night.lastEventT = t;
        } else if (line.indexOf(PAT.captured) !== -1) {
          if (round && round.captures.length < 3) {
            round.captures.push(t);
            if (round.captures.length === 3) round.awaitLoot = true;
          }
          night.lastEventT = t;
        } else if (line.indexOf(PAT.killed) !== -1) {
          if (round) round.killed = true;
          night.lastEventT = t;
        } else if (line.indexOf(PAT.spawnSuccess) !== -1) {
          night.lastEventT = t;
        } else if (line.indexOf(PAT.arcaneDrop) !== -1) {
          if (round && round.awaitLoot && round.lootT == null) {
            round.lootT = t;
            closeRound(t);
            if (night.endingT != null) closeNight(t); // 白天已开始：补完掉落后收夜
          }
          if (night) night.lastEventT = t;
        }
      },

      finish(lastT) {
        closeNight(lastT);
      },

      results() {
        return nights;
      },

      EIDOLON_NAMES,
    };
  }

  return { create, EIDOLON_NAMES };
})();
