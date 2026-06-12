/* 锚点探测：列出每个小轮附近所有候选锚点时间，反推 idalon 的计时口径 */
const fs = require('fs');
const path = require('path');
const text = fs.readFileSync(path.join(__dirname, '..', '夜灵.log'), 'utf8');

const events = [];
const pats = [
  ['gateTouch', 'EidolonMP.lua: TryEidolonTransition'],
  ['stream255', 'EIDOLONMP: Start streaming to layer 255'],
  ['stream0', 'EIDOLONMP: Start streaming to layer 0'],
  ['loaderDone', 'EIDOLONMP: LEVEL LOADER DONE'],
  ['leftZone', 'EIDOLONMP: Avatar left the zone'],
  ['connected', 'Game successfully connected to:'],
  ['night', "It's nighttime!"],
  ['day', "It's daytime!"],
  ['teraSpawned', 'TeralystEncounter.lua: Teralyst spawned'],
  ['captured', 'AvatarScript.lua: Teralyst Captured'],
  ['spawnOK', 'Eidolon spawning SUCCESS'],
  ['townTrans', 'EIDOLONMP: TryTownTransition'],
];
for (const line of text.split('\n')) {
  const m = /^[^0-9]{0,4}(\d+\.\d{3})\s/.exec(line);
  if (!m) continue;
  const t = parseFloat(m[1]);
  if (t < 2400 || t > 5800) continue; // 夜晚时间窗
  for (const [name, pat] of pats) {
    if (line.includes(pat)) { events.push({ t, name }); break; }
  }
}
events.sort((a, b) => a.t - b.t);
for (const e of events) console.log(e.t.toFixed(3).padStart(9), e.name);
