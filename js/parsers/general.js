window.WF = window.WF || {};

WF.GeneralParser = (function () {
  const MIN_DURATION = 5;

  const SKIP_TYPES = {
    MT_HUB: 1, MT_PVP: 1, MT_TUTORIAL: 1,
  };

  const TYPE_CN = {
    MT_EXTERMINATION:       '歼灭',
    MT_DEFENSE:             '防御',
    MT_SURVIVAL:            '生存',
    MT_EXCAVATION:          '掘矿',
    MT_INTERCEPTION:        '拦截',
    MT_CAPTURE:             '捕获',
    MT_RESCUE:              '救援',
    MT_SPY:                 '间谍',
    MT_MOBILE_DEFENSE:      '移动防御',
    MT_ASSAULT:             '突击',
    MT_SABOTAGE:            '破坏',
    MT_HIVE:                '蜂巢',
    MT_JUNCTION:            '通道',
    MT_PURSUIT:             '追击',
    MT_ALCHEMY:             '炼金',
    MT_ASSASSINATION:       '暗杀',
    MT_ARENA:               '竞技场',
    MT_CACHES:              '缓存',
    MT_CORPUS_LOOT_DEFENSE: '奸商托管',
    MT_ARTIFACT:            '中断',
    MT_LANDSCAPE:           '开放世界',
    MT_RAILJACK:            '铁骨战舰',
    MT_VOID_CASCADE:        '虚空瀑布',
    MT_VOID_FLOOD:          '虚空洪流',
    MT_VOID_ARMAGEDDON:     '虚空末日',
    MT_VOID_FISSURE:        '虚空裂缝',
    MT_NETHERCELLS:         '深渊',
    MT_FEED_THE_TENNO:      '纳罗供养',
    MT_GENERIC_COOPTIVE:    '合作任务',
  };

  const PAT = {
    connected:    'Game successfully connected to:',
    syncMission:  'SyncAutoPopulatedConsumables for mission ',
    missionTypeFB:'missionType=',          // fallback from MissionInfo block (may lack timestamp)
    missionName:  'MissionIntro.lua: MissionName:',
    ssStarted:    'SS_WAITING_FOR_PLAYERS to SS_STARTED',
    hudRedux:     'HUD REDUX: Pushing background movie from Update',
    // EOM triggers — any one of these finalises the record
    eomUnlock:    'EOM missionLocationUnlocked',
    eomExtract:   'ExtractionTimer.lua: EOM: All players extracting',
    commitDB:     'CommitInventoryChangesToDB',
    squadResult:  'SetSquadMissionResult',
    // abort / fail
    abort:        'TopMenu.lua: Abort',
    failed:       'EndOfMatch.lua: Mission Failed',
    // defense waves
    waveStart:    'WaveDefend.lua: Starting wave ',
    waveLeft:     'WaveDefend.lua: WaveDefend: num enemies left ',
    killed:       'was killed by',
  };

  function create() {
    const records = [];
    let m = null;

    function reset() { m = null; }

    function newMission(t, carryType, carryNode) {
      m = {
        loadT: t, startT: null, firstFrameT: null, endT: null,
        missionType: carryType || null,
        missionName: null,
        locationNode: carryNode || null,
        waves: [], currentWave: null,
        kills: 0, aborted: false,
      };
    }

    function closeCurrentWave(endT) {
      if (!m || !m.currentWave) return;
      const w = m.currentWave;
      w.endT     = endT;
      w.duration = endT - w.startT;
      // prefer count derived from the "enemies left" tracker (accurate for defense)
      // falls back to incremental kill counter if tracker was never updated
      w.kills    = w.enemiesLeft === 0 && w.totalEnemies > 0
        ? w.totalEnemies - w.enemiesLeft
        : w.killCount;
      m.waves.push(w);
      m.currentWave = null;
    }

    function finalize(t) {
      if (!m || m.aborted) { reset(); return; }
      if (!m.missionType || SKIP_TYPES[m.missionType]) { reset(); return; }
      const start = m.startT || m.loadT;
      const end   = m.endT || t;
      if (end - start < MIN_DURATION) { reset(); return; }
      closeCurrentWave(end);
      records.push({
        type:           'general',
        missionType:    m.missionType,
        missionTypeCN:  TYPE_CN[m.missionType] || m.missionType,
        missionName:    m.missionName || '—',
        locationNode:   m.locationNode,
        startT:         start,
        firstFrameT:    m.firstFrameT,
        endT:           end,
        totalDuration:  end - start,
        frameDuration:  (m.firstFrameT != null) ? (end - m.firstFrameT) : null,
        waves:          m.waves,
        kills:          m.kills,
      });
      reset();
    }

    return {
      feed(t, line) {
        // SyncAutoPopulatedConsumables fires ~1s BEFORE connected to:
        // Carry the type forward so it isn't lost when newMission() resets m
        if (line.indexOf(PAT.connected) !== -1) {
          const carryType = m && !m.startT ? m.missionType : null;
          const carryNode = m && !m.startT ? m.locationNode : null;
          newMission(t, carryType, carryNode);
          return;
        }
        if (!m) return;

        // ── mission type & location ──────────────────────────
        if (line.indexOf(PAT.syncMission) !== -1) {
          const rx = /SyncAutoPopulatedConsumables for mission (\w+) with location (\w+)/.exec(line);
          if (rx) { m.missionType = rx[1]; m.locationNode = rx[2]; }
          return;
        }
        // fallback: parse missionType= from MissionInfo continuation lines
        if (!m.missionType && line.indexOf(PAT.missionTypeFB) !== -1) {
          const rx = /missionType=(\w+)/.exec(line);
          if (rx && rx[1] !== 'MT_HUB' && rx[1] !== 'MT_PVP') m.missionType = rx[1];
          return;
        }
        if (line.indexOf(PAT.missionName) !== -1) {
          const i = line.indexOf(PAT.missionName);
          m.missionName = line.substring(i + PAT.missionName.length).trim();
          return;
        }

        // ── timing anchors ───────────────────────────────────
        if (line.indexOf(PAT.ssStarted) !== -1) {
          m.startT = t;
          return;
        }
        if (line.indexOf(PAT.hudRedux) !== -1 && m.firstFrameT == null) {
          m.firstFrameT = t;
          return;
        }

        // ── defense wave tracking ────────────────────────────
        if (line.indexOf(PAT.waveStart) !== -1) {
          const rx = /Starting wave (\d+),?\s*spawning a total of (\d+)/.exec(line);
          if (rx) {
            closeCurrentWave(t);
            m.currentWave = {
              index:        parseInt(rx[1], 10),
              totalEnemies: parseInt(rx[2], 10),
              startT:       t, endT: null, duration: null,
              enemiesLeft:  0, killCount: 0, kills: 0,
            };
          }
          return;
        }
        if (line.indexOf(PAT.waveLeft) !== -1 && m.currentWave) {
          const rx = /num enemies left (\d+)/.exec(line);
          if (rx) m.currentWave.enemiesLeft = parseInt(rx[1], 10);
          return;
        }

        // ── kill counting ─────────────────────────────────────
        if (line.indexOf(PAT.killed) !== -1) {
          m.kills++;
          if (m.currentWave) m.currentWave.killCount++;
          return;
        }

        // ── EOM triggers (any one finalises) ─────────────────
        if (line.indexOf(PAT.eomUnlock)   !== -1 ||
            line.indexOf(PAT.eomExtract)  !== -1 ||
            line.indexOf(PAT.commitDB)    !== -1 ||
            line.indexOf(PAT.squadResult) !== -1) {
          if (!m.endT) m.endT = t;
          finalize(t);   // safe to call multiple times — m is null after first call
          return;
        }

        // ── abort / fail ──────────────────────────────────────
        if (line.indexOf(PAT.abort) !== -1 || line.indexOf(PAT.failed) !== -1) {
          m.aborted = true;
          reset();
        }
      },

      finish() {},
      results() { return records; },
    };
  }

  return { create };
})();
