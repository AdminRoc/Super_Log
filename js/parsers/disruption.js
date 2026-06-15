window.WF = window.WF || {};

WF.DisruptionParser = (function () {
  const MIN_ROUNDS = 45;

  const PAT = {
    connected:     'Game successfully connected to:',
    missionName:   'ThemedSquadOverlay.lua: Mission name:',
    ssStarted:     'SS_WAITING_FOR_PLAYERS to SS_STARTED',
    modeState:     'SentientArtifactMission.lua: ModeState =',
    conduitStart:  'SentientArtifactMission.lua: Disruption: Starting defense for artifact',
    conduitDone:   'SentientArtifactMission.lua: Disruption: Completed defense for artifact',
    conduitFail:   'SentientArtifactMission.lua: Disruption: Failed defense for artifact',
    totalScore:    'SentientArtifactMission.lua: Disruption: Total score is',
    eom:           'ExtractionTimer.lua: EOM: All players extracting',
    abort:         'TopMenu.lua: Abort',
    failed:        'EndOfMatch.lua: Mission Failed',
    killed:        'was killed by',
    agentCreated:  'OnAgentCreated',
  };

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
        killEvents: [],       // absolute timestamps of all in-round kills (for chart)
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
      });
      mission.prevEndT = t;
      mission.openConduits = [];
      mission.roundOpen = false;
      mission.currentRoundKills = 0;
      mission.currentRoundSpawned = 0;
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
            roundStartT = t;
          } else if (state === 4) {
            closeRoundAt(t);
          }
          return;
        }
        if (line.indexOf(PAT.conduitStart) !== -1) {
          mission.isDisruption = true;
          const rBase  = roundStartT !== null ? roundStartT : (mission.prevEndT || effectiveStart());
          const artRx  = /Starting defense for artifact\s+(\d+)/.exec(line);
          const artNum = artRx ? parseInt(artRx[1], 10) : null;
          mission.openConduits.push({ success: null, artNum, insertT: t, insertRelT: t - rBase });
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

        // Enemy spawn counting — only during active round
        if (mission.roundOpen &&
            line.indexOf(PAT.agentCreated) !== -1 &&
            line.indexOf('/Npc/') !== -1) {
          let skip = false;
          for (let k = 0; k < AGENT_SKIP.length; k++) {
            if (line.indexOf(AGENT_SKIP[k]) !== -1) { skip = true; break; }
          }
          if (!skip) mission.currentRoundSpawned++;
          return;
        }

        if (line.indexOf(PAT.killed) !== -1 && mission.roundOpen) {
          mission.currentRoundKills++;
          mission.killEvents.push(t);   // store timestamp for chart
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
