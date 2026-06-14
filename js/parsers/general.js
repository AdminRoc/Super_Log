window.WF = window.WF || {};

WF.GeneralParser = (function () {
  const MIN_DURATION = 5;

  const SKIP_TYPES = {
    MT_HUB: 1, MT_PVP: 1, MT_TUTORIAL: 1,
  };

  const TYPE_CN = {
    MT_EXTERMINATION:    '歼灭',
    MT_DEFENSE:          '防御',
    MT_SURVIVAL:         '生存',
    MT_EXCAVATION:       '掘矿',
    MT_INTERCEPTION:     '拦截',
    MT_CAPTURE:          '捕获',
    MT_RESCUE:           '救援',
    MT_SPY:              '间谍',
    MT_MOBILE_DEFENSE:   '移动防御',
    MT_ASSAULT:          '突击',
    MT_SABOTAGE:         '破坏',
    MT_HIVE:             '蜂巢',
    MT_JUNCTION:         '通道',
    MT_PURSUIT:          '追击',
    MT_ALCHEMY:          '炼金',
    MT_ASSASSINATION:    '暗杀',
    MT_ARENA:            '竞技场',
    MT_CACHES:           '缓存',
    MT_CORPUS_LOOT_DEFENSE: '奸商托管',
    MT_ARTIFACT:         '断裂遗迹',
    MT_LANDSCAPE:        '开放世界',
    MT_RAILJACK:         '铁骨战舰',
    MT_VOID_CASCADE:     '虚空瀑布',
    MT_VOID_FLOOD:       '虚空洪流',
    MT_VOID_ARMAGEDDON:  '虚空末日',
    MT_VOID_FISSURE:     '虚空裂缝',
    MT_DISRUPTION:       '中断',
    MT_NETHERCELLS:      '深渊',
  };

  const PAT = {
    connected:    'Game successfully connected to:',
    syncMission:  'SyncAutoPopulatedConsumables for mission ',
    missionName:  'MissionIntro.lua: MissionName:',
    ssStarted:    'SS_WAITING_FOR_PLAYERS to SS_STARTED',
    hudRedux:     'HUD REDUX: Pushing background movie from Update',
    eomUnlock:    'EOM missionLocationUnlocked',
    commitDB:     'CommitInventoryChangesToDB',
    abort:        'TopMenu.lua: Abort',
    failed:       'EndOfMatch.lua: Mission Failed',
    waveStart:    'WaveDefend.lua: Starting wave ',
    waveLeft:     'WaveDefend.lua: WaveDefend: num enemies left ',
    waveSleep:    'WaveDefend.lua: _SleepBetweenWaves',
    killed:       'was killed by',
  };

  function create() {
    const records = [];
    let m = null;

    function reset() { m = null; }

    function newMission(t) {
      m = {
        loadT: t, startT: null, firstFrameT: null, endT: null,
        missionType: null, missionName: null, locationNode: null,
        waves: [], currentWave: null,
        kills: 0, aborted: false,
      };
    }

    function closeCurrentWave(endT) {
      if (!m || !m.currentWave) return;
      const w = m.currentWave;
      w.endT = endT;
      w.duration = endT - w.startT;
      w.kills = w.totalEnemies - w.enemiesLeft;
      m.waves.push(w);
      m.currentWave = null;
    }

    function finalize(t) {
      if (!m || m.aborted) { reset(); return; }
      if (!m.missionType || SKIP_TYPES[m.missionType]) { reset(); return; }
      const start = m.startT || m.loadT;
      const end   = m.endT   || t;
      if (end - start < MIN_DURATION) { reset(); return; }
      closeCurrentWave(end);
      records.push({
        type:            'general',
        missionType:     m.missionType,
        missionTypeCN:   TYPE_CN[m.missionType] || m.missionType,
        missionName:     m.missionName || '—',
        locationNode:    m.locationNode,
        startT:          start,
        firstFrameT:     m.firstFrameT,
        endT:            end,
        totalDuration:   end - start,
        frameDuration:   (m.firstFrameT && m.endT) ? (m.endT - m.firstFrameT) : null,
        waves:           m.waves,
        kills:           m.kills,
      });
      reset();
    }

    return {
      feed(t, line) {
        if (line.indexOf(PAT.connected) !== -1) {
          newMission(t);
          return;
        }
        if (!m) return;

        if (line.indexOf(PAT.syncMission) !== -1) {
          const rx = /SyncAutoPopulatedConsumables for mission (\w+) with location (\w+)/.exec(line);
          if (rx) { m.missionType = rx[1]; m.locationNode = rx[2]; }
          return;
        }
        if (line.indexOf(PAT.missionName) !== -1) {
          const i = line.indexOf(PAT.missionName);
          m.missionName = line.substring(i + PAT.missionName.length).trim();
          return;
        }
        if (line.indexOf(PAT.ssStarted) !== -1) {
          m.startT = t;
          return;
        }
        if (line.indexOf(PAT.hudRedux) !== -1 && !m.firstFrameT) {
          m.firstFrameT = t;
          return;
        }

        // Defense wave tracking
        if (line.indexOf(PAT.waveStart) !== -1) {
          const rx = /Starting wave (\d+), spawning a total of (\d+)/.exec(line);
          if (rx) {
            closeCurrentWave(t);
            m.currentWave = {
              index:        parseInt(rx[1], 10),
              totalEnemies: parseInt(rx[2], 10),
              startT:       t, endT: null, duration: null,
              enemiesLeft:  0, kills: 0,
            };
          }
          return;
        }
        if (line.indexOf(PAT.waveLeft) !== -1 && m.currentWave) {
          const rx = /num enemies left (\d+)/.exec(line);
          if (rx) m.currentWave.enemiesLeft = parseInt(rx[1], 10);
          return;
        }
        if (line.indexOf(PAT.killed) !== -1) {
          m.kills++;
          if (m.currentWave) m.currentWave.kills++;
          return;
        }

        if (line.indexOf(PAT.eomUnlock) !== -1) {
          m.endT = t;
          finalize(t);
          return;
        }
        if (line.indexOf(PAT.commitDB) !== -1 && !m.endT) {
          m.endT = t;
          return;
        }
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
