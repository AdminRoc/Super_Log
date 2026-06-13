/* 生成合成测试日志（中断 45 轮 + Profit-Taker 一次击杀），用于无真实样本时验证解析器。
 * 用法：node tools/makeSynthetic.js > tools/synthetic.log */
const L = [];
let t = 10.0;
const push = (dt, s) => { t += dt; L.push(`${t.toFixed(3)} ${s}`); };

push(0, 'Sys [Diag]: Current time: Mon Jun 08 20:00:00 2026 [UTC: Tue Jun 09 00:00:00 2026]');

// ===== 中断任务：45 轮 =====
push(5, 'Sys [Info]: ===[ Game successfully connected to: /Lotus/Levels/Proc/Corpus/CorpusShipDisruption/AAAA.lp ]===');
push(2, 'Script [Info]: ThemedSquadOverlay.lua: Mission name: APOLLO (Lua)');
push(3, 'Sys [Info]: GameRulesImpl - changing state from SS_WAITING_FOR_PLAYERS to SS_STARTED');
push(2, 'Script [Info]: SentientArtifactMission.lua: ModeState = 1');
push(8, 'Script [Info]: SentientArtifactMission.lua: ModeState = 2');
for (let r = 1; r <= 45; r++) {
  push(8, 'Script [Info]: SentientArtifactMission.lua: ModeState = 3');
  for (let c = 0; c < 4; c++) {
    const ok = !(r === 7 && c === 3); // 第7轮失败一个传导体
    push(9, `Script [Info]: SentientArtifactMission.lua: Disruption: ${ok ? 'Completed' : 'Failed'} defense for artifact ${c}`);
  }
  push(4, 'Script [Info]: SentientArtifactMission.lua: ModeState = 4');
  push(6, 'Script [Info]: SentientArtifactMission.lua: ModeState = 6');
}
push(3, 'Script [Info]: SentientArtifactMission.lua: Disruption: Total score is 179');
push(20, 'Script [Info]: ExtractionTimer.lua: EOM: All players extracting');

// ===== Profit-Taker =====
push(60, 'Sys [Info]: ===[ Game successfully connected to: /Lotus/Levels/Proc/Venus/VenusLandscape/BBBB.lp ]===');
push(5, 'Script [Info]: jobId=/Lotus/Types/Gameplay/Venus/Jobs/Heists/HeistProfitTakerBountyFour');
push(8, 'Script [Info]: EidolonMP.lua: EIDOLONMP: Avatar left the zone: TennoAvatar1');
push(25, 'Script [Info]: CamperHeistOrbFight.lua: Orb Fight - Starting first attack Orb phase');
// 阶段1：盾(2段) → 腿4 → 体 → 塔架
push(1, 'AI [Info]: Camper->SwitchShieldVulnerability() - Switching shield damage vulnerability type to DT_VIRAL');
push(6, 'AI [Info]: Camper->SwitchShieldVulnerability() - Switching shield damage vulnerability type to DT_MAGNETIC');
push(5, 'Sys [Info]: ResourceLoader /Lotus/Sounds/Dialog/FortunaOrbHeist/Business/DBntyFourInterPrTk0920TheBusiness loading');
for (let i = 0; i < 4; i++) push(2.5, 'AI [Info]: Camper: Leg freshly destroyed at part LEG_PART');
push(1, 'AI [Info]: Camper->StartVulnerable() - The Camper can now be damaged!');
push(4, 'Script [Info]: CamperHeistOrbFight.lua: Landscape - New State: 3');
push(2, 'Script [Info]: CamperHeistOrbFight.lua: Pylon launch complete');
push(20, 'Script [Info]: CamperHeistOrbFight.lua: Orb Fight - Starting second attack Orb phase');
// 阶段2：盾(1段) → 腿4 → 体
push(1, 'AI [Info]: Camper->SwitchShieldVulnerability() - Switching shield damage vulnerability type to DT_FIRE');
push(7, 'Sys [Info]: ResourceLoader /Lotus/Sounds/Dialog/FortunaOrbHeist/Business/DBntyFourInterPrTk0890TheBusiness loading');
for (let i = 0; i < 4; i++) push(2.2, 'AI [Info]: Camper: Leg freshly destroyed at part LEG_PART');
push(1, 'AI [Info]: Camper->StartVulnerable() - The Camper can now be damaged!');
push(3.5, 'Script [Info]: CamperHeistOrbFight.lua: Landscape - New State: 3');
push(5, 'Script [Info]: CamperHeistOrbFight.lua: Orb Fight - Starting third attack Orb phase');
// 阶段3：盾(2段) → 腿4 → 体 → 塔架
push(1, 'AI [Info]: Camper->SwitchShieldVulnerability() - Switching shield damage vulnerability type to DT_ELECTRICITY');
push(5.5, 'AI [Info]: Camper->SwitchShieldVulnerability() - Switching shield damage vulnerability type to DT_POISON');
push(6, 'Sys [Info]: ResourceLoader /Lotus/Sounds/Dialog/FortunaOrbHeist/Business/DBntyFourInterPrTk0890TheBusiness loading');
for (let i = 0; i < 4; i++) push(2.8, 'AI [Info]: Camper: Leg freshly destroyed at part LEG_PART');
push(1, 'AI [Info]: Camper->StartVulnerable() - The Camper can now be damaged!');
push(4.2, 'Script [Info]: CamperHeistOrbFight.lua: Landscape - New State: 3');
push(2, 'Script [Info]: CamperHeistOrbFight.lua: Pylon launch complete');
push(22, 'Script [Info]: CamperHeistOrbFight.lua: Orb Fight - Starting final attack Orb phase');
// 阶段4：盾(1段) → 腿4 → 体×3（击杀）
push(1, 'AI [Info]: Camper->SwitchShieldVulnerability() - Switching shield damage vulnerability type to DT_RADIATION');
push(8, 'Sys [Info]: ResourceLoader /Lotus/Sounds/Dialog/FortunaOrbHeist/Business/DBntyFourSatelReal0930TheBusiness loading');
for (let i = 0; i < 4; i++) push(2.0, 'AI [Info]: Camper: Leg freshly destroyed at part LEG_PART');
push(1.5, 'AI [Info]: Camper->StartVulnerable() - The Camper can now be damaged!');
push(2.0, 'AI [Info]: Camper->StartVulnerable() - The Camper can now be damaged!');
push(2.5, 'AI [Info]: Camper->StartVulnerable() - The Camper can now be damaged!');
push(10, 'Script [Info]: EidolonMP.lua: EIDOLONMP: TryTownTransition(nil)');

// ===== 仲裁：生存 20 分钟（4 个 tier），无人机若干 =====
push(60, 'Sys [Info]: ===[ Game successfully connected to: /Lotus/Levels/Proc/Grineer/GrineerGalleonSurvival/CCCC.lp ]===');
push(2, 'Script [Info]: ThemedSquadOverlay.lua: Mission name: 赛德娜 (Hydron) - 仲裁');
push(1, 'Script [Info]: ThemedSquadOverlay.lua: Host loading {"name":"SolNode25_EliteAlert"} ...');
push(15, 'Sys [Info]: GameRulesImpl - changing state from SS_WAITING_FOR_PLAYERS to SS_STARTED');
let tierAt = 0;
for (let tier = 1; tier <= 4; tier++) {
  // 每个 tier 5 分钟，期间散布无人机与敌人快照
  for (let i = 0; i < 10; i++) {
    push(18, `AI [Info]: OnAgentCreated /Npc/Lancer${tier}${i} Live 16 Spawned ${40 + tier * 10 + i} Ignored Ticking 12 Paused 4 IgnoredTicking 7 MonitoredTicking ${20 + ((i * 7 + tier * 3) % 25)} AllyLive 4`);
    if (i % 3 === 1) push(2, `AI [Info]: OnAgentCreated /Npc/CorpusEliteShieldDroneAgent${tier}${i} Live 16 Spawned ${41 + tier * 10 + i} MonitoredTicking ${22 + i}`);
  }
  tierAt += 300;
  push(300 - 200, `Script [Info]: SurvivalMission.lua: Survival: Gave reward tier ${tier} at ${tierAt}.0`);
}
push(30, 'Script [Info]: EndOfMatch.lua: Initialize');
push(5, 'Script [Info]: ExtractionTimer.lua: EOM: All players extracting');

process.stdout.write(L.join('\n') + '\n');
