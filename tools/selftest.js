/* Node 自测脚本：node tools/selftest.js [日志路径]
 * 在无浏览器环境下运行三个解析器并打印结果摘要。 */
const fs = require('fs');
const path = require('path');

global.window = global; // 兼容浏览器全局命名空间
const base = path.join(__dirname, '..');
for (const f of ['js/utils.js', 'js/logReader.js', 'js/parsers/eidolon.js', 'js/parsers/disruption.js', 'js/parsers/profitTaker.js', 'js/parsers/arbitration.js']) {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(base, f), 'utf8'));
}

const file = process.argv[2] || path.join(base, '夜灵.log');
const text = fs.readFileSync(file, 'utf8');

const eidolon = WF.EidolonParser.create();
const disruption = WF.DisruptionParser.create();
const profitTaker = WF.ProfitTakerParser.create();
const arbitration = WF.ArbitrationParser.create();

const t0 = Date.now();
const scan = WF.logReader.scan(text, [eidolon, disruption, profitTaker, arbitration]);
console.log(`扫描 ${scan.lineCount} 行，耗时 ${Date.now() - t0} ms，wallClock=${scan.wallClockAnchor ? '有' : '无'}`);

const fmt = WF.utils.fmtDuration;

const nights = eidolon.results();
console.log(`\n=== 夜灵记录：${nights.length} 条 ===`);
for (const n of nights) {
  console.log(`标签 ${n.label}  完整轮 ${n.completeCount}  额外捕获 ${n.extraCaptures}`);
  console.log(`真实时间 ${WF.utils.fmtDurationLong(n.realTime)}  平均 ${fmt(n.avgTime)}  窗口 第${n.window.start + 1}~${n.window.end + 1}轮`);
  n.completes.forEach((r, i) => {
    const segs = [];
    let prev = r.effStart;
    for (const c of r.captures) { segs.push(fmt(c - prev)); prev = c; }
    console.log(`  R${i + 1}: 进门 ${r.loadDoneAt.toFixed(3)}  起点 ${r.effStart.toFixed(3)}  终点 ${r.captures[2].toFixed(3)}  时长 ${fmt(r.duration)}  [兆 ${segs[0]} | 巨 ${segs[1]} | 水 ${segs[2]}]`);
  });
  if (n.extras.length) n.extras.forEach((a) => console.log(`  额外: 进门 ${a.loadDoneAt.toFixed(3)} 捕获 ${a.captures.length} 只${a.killed ? '（含击杀）' : ''}`));
}

const dis = disruption.results();
console.log(`\n=== 中断记录：${dis.length} 条 ===`);
for (const d of dis) {
  console.log(`${d.name || '?'}  轮次 ${d.roundCount}  总时长 ${WF.utils.fmtDurationLong(d.totalDuration)}  总分 ${d.score}`);
}

const arbs = arbitration.results();
console.log(`\n=== 仲裁记录：${arbs.length} 条 ===`);
for (const a of arbs) {
  console.log(`${a.name || a.nodeId || '?'}  类型 ${a.missionTypeName}  时长 ${WF.utils.fmtDurationLong(a.duration)}  轮次 ${a.rounds}  无人机 ${a.droneCount}`);
  console.log(`  期望母液 ${a.essence.total.toFixed(2)}（无人机 ${a.essence.fromDrones.toFixed(2)} + 轮次 ${a.essence.fromRounds.toFixed(2)}）  满buff ${a.essence.fullBuffTotal.toFixed(2)}  每小时 ${a.essence.perHour.toFixed(1)}`);
  console.log(`  存活快照点 ${a.ticking.length}  边界 ${a.boundaries.map((b) => b.label + '@' + b.t.toFixed(0) + 's').join(', ')}`);
}

const pts = profitTaker.results();
console.log(`\n=== Profit-Taker 记录：${pts.length} 条 ===`);
for (const p of pts) {
  console.log(`总时长 ${WF.utils.fmtDurationLong(p.totalDuration)}  飞行 ${fmt(p.flightTime)}  阶段数 ${p.phases.length}`);
  p.phases.forEach((ph) => console.log(`  阶段${ph.number}: ${fmt(ph.totalTime)}  盾 ${fmt(ph.shieldTime)} 腿 ${fmt(ph.legTime)} 体 ${fmt(ph.bodyTime)} 塔 ${fmt(ph.pylonTime)}  盾段 ${ph.shields.map((s) => s.element.cn + ' ' + fmt(s.time)).join(', ')}`));
}
