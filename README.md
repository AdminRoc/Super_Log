# Super Log — Warframe EE.log 分析器

纯前端单页应用：拖拽/点击上传 `EE.log`，在浏览器内解析并展示三类任务的精确时间指标。**零依赖、可离线使用**。

## 使用方法

直接双击打开 `index.html`（或任意静态服务器托管本目录），把 `EE.log` 拖入页面即可。
游戏日志默认位置：`%LOCALAPPDATA%\Warframe\EE.log`，可复制到本项目文件夹后上传。

## 功能

| 任务 | 筛选条件 | 指标 |
|---|---|---|
| 夜灵 Eidolon | 一晚 ≥6 个全捕获完整小轮（6×3 / 6×3+1 / 6×3+2 / 7×3…） | 每小轮真实时间（口径同 idalon.com "real time"：夜晚开始→水力使赋能掉落在地）、三只捕获+掉落分段、6 轮合计"真实时间"与"平均真实时间"（>6 轮时取平均最小的连续 6 轮窗口；额外捕获仅记录不参与计算） |
| 中断 Disruption | 完成轮次 ≥45 且成功结算（需房主日志） | 总时长（加载→结算）、每轮耗时、截至每轮累计耗时、每轮 4 个传导体成败、总分 |
| 大蜘蛛 Profit-Taker | 完整击杀记录 | 口径对齐 [Profit-Taker Analytics](https://github.com/Basiiii/Profit-Taker-Analytics)：总时长（出门→击杀）、飞行、各阶段时长、护盾元素分段、断腿、本体、塔架 |
| 仲裁 Arbitration | 有效仲裁任务（时长 ≥60 秒，需房主日志） | 任务类型（生存/防御/镜像防御/拦截）、时长、轮次/波次、磁盾无人机数与时间线、敌人存活曲线、期望赋灵母液（无人机×6% + 轮次×1.3，含满 Buff 期望与每小时产出） |

多条记录按时间由近及远排序，点击左侧列表切换查看。

细节约定：
- 夜灵三只共用日志行 `Teralyst Captured`，按"捕获→祭坛召唤 SUCCESS→捕获→…"序列推断兆力使/巨力使/水力使；小轮内出现击杀则该小轮无效。
- 夜灵计时口径对齐 idalon.com "real time"：起点 = 每轮进平原后 `It's nighttime!` 行（首轮即真实夜晚开始），终点 = 水力使捕获后赋能掉落行（`SnapPickupToGround … DefaultArcanePickup`，约捕获后 15 秒）。已用真实日志与 idalon 结果核对一致（7:44.938）。
- 绝对时间优先取日志内 `Sys [Diag]: Current time:` 行；缺失时（如国服 WeGame 客户端日志）按文件修改时间估算，显示带 `≈` 前缀。

## 开发/自测

```
node tools/selftest.js [日志路径]      # 命令行运行三个解析器，默认解析 夜灵.log
node tools/makeSynthetic.js > tools/synthetic.log   # 生成中断45轮 + PT击杀 的合成测试日志
```

## 日志模式来源

解析模式提取自以下开源项目并经真实日志验证：
[Warframe_Log_Reader](https://github.com/ennithing/Warframe_Log_Reader) ·
[warframe-deathlog](https://github.com/WFCD/warframe-deathlog) ·
[disruption-log-parser](https://github.com/petamorikei/disruption-log-parser) ·
[Profit-Taker-Analytics](https://github.com/Basiiii/Profit-Taker-Analytics)
