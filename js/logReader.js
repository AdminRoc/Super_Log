/* 通用日志读取层：按行切分、时间戳解析、绝对时间换算 */
window.WF = window.WF || {};

WF.logReader = (function () {
  // 行首相对秒数（容错前缀杂字符，如 "!2775.057"）
  const RE_TIME = /^[^0-9]{0,4}(\d+\.\d{3})\s/;
  // 绝对时间基准（部分客户端日志含此行）："Sys [Diag]: Current time: Mon Dec 09 19:21:53 2024 [UTC: ...]"
  const RE_WALLCLOCK = /Current time: (\w{3} \w{3} [ \d]\d \d{2}:\d{2}:\d{2} \d{4})/;

  /**
   * 单遍扫描日志文本，将每行 (t, line) 依次喂给所有 parser 的 feed(t, line)。
   * 返回 { lineCount, firstT, lastT, wallClockAnchor: {t, date}|null }
   */
  function scan(text, parsers) {
    let lineCount = 0;
    let firstT = null;
    let lastT = 0;
    let wallClockAnchor = null;

    let pos = 0;
    const len = text.length;
    while (pos < len) {
      let nl = text.indexOf('\n', pos);
      if (nl === -1) nl = len;
      let line = text.substring(pos, nl);
      pos = nl + 1;
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (!line) continue;
      lineCount++;

      const m = RE_TIME.exec(line);
      const t = m ? parseFloat(m[1]) : lastT; // 无时间戳的续行沿用上一行时间
      if (m) {
        if (firstT === null) firstT = t;
        lastT = t;
      }

      if (!wallClockAnchor && line.indexOf('Current time:') !== -1 && line.indexOf('Diag') !== -1) {
        const wm = RE_WALLCLOCK.exec(line);
        if (wm) {
          const d = new Date(wm[1]);
          if (!isNaN(d.getTime())) wallClockAnchor = { t, date: d };
        }
      }

      for (let i = 0; i < parsers.length; i++) parsers[i].feed(t, line);
    }

    for (let i = 0; i < parsers.length; i++) {
      if (parsers[i].finish) parsers[i].finish(lastT);
    }

    return { lineCount, firstT: firstT || 0, lastT, wallClockAnchor };
  }

  /**
   * 构造 相对秒 → 绝对时间 的换算函数。
   * 优先使用日志内的 wall-clock 基准；否则用文件修改时间锚定日志末行（标记为估算）。
   * 返回 { toDate(t): Date|null, approx: bool, available: bool }
   */
  function makeClock(scanResult, fileLastModified) {
    const { wallClockAnchor, lastT } = scanResult;
    if (wallClockAnchor) {
      return {
        available: true,
        approx: false,
        toDate: (t) => new Date(wallClockAnchor.date.getTime() + (t - wallClockAnchor.t) * 1000),
      };
    }
    if (fileLastModified) {
      return {
        available: true,
        approx: true,
        toDate: (t) => new Date(fileLastModified + (t - lastT) * 1000),
      };
    }
    return { available: false, approx: true, toDate: () => null };
  }

  return { scan, makeClock };
})();
