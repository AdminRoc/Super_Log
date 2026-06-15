/* 通用工具：时间格式化、排序等 */
window.WF = window.WF || {};

WF.utils = (function () {
  /** 秒(float) → "m:ss.SSS" */
  function fmtDuration(sec) {
    if (sec == null || isNaN(sec)) return '--';
    const sign = sec < 0 ? '-' : '';
    sec = Math.abs(sec);
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    const sStr = s.toFixed(3).padStart(6, '0');
    return `${sign}${m}:${sStr}`;
  }

  /** 秒(float) → "h:mm:ss" （长时间用，如任务总时长） */
  function fmtDurationLong(sec) {
    if (sec == null || isNaN(sec)) return '--';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.round((sec % 1) * 1000);
    const core = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    return h > 0 ? `${h}:${core}` : core;
  }

  /** Date → "yyyy-MM-dd HH:mm:ss" */
  function fmtAbsTime(date, approx) {
    if (!date || isNaN(date.getTime())) return '时间未知';
    const p = (n) => String(n).padStart(2, '0');
    const s = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
    return approx ? `≈${s}` : s;
  }

  /** 日志内相对秒 → "HH:MM:SS"（日志时间轴显示） */
  function fmtLogTime(sec) {
    if (sec == null || isNaN(sec)) return '--';
    let total = Math.round(sec * 10) / 10; // 先按 0.1s 取整再拆位，避免 59.999→60.0 不进位
    const h = Math.floor(total / 3600);
    total -= h * 3600;
    const m = Math.floor(total / 60);
    const s = (total - m * 60).toFixed(1);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(h)}:${p(m)}:${s.padStart(4, '0')}`;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  return { fmtDuration, fmtDurationLong, fmtAbsTime, fmtLogTime, el, escapeHtml };
})();
