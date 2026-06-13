(function () {
  var PAIRS = [
    ['#41ff8e','#3affd5'], ['#45c8ff','#6f8bff'], ['#a86bff','#e05fff'],
    ['#ff5f9e','#ff7a5f'], ['#ffff60','#ffd060'], ['#ff80c0','#ff5f9e'],
  ];
  var lastX = 0, lastY = 0, lastTime = 0;

  function spawn(cx, cy) {
    var n = 1 + Math.floor(Math.random() * 2);
    for (var i = 0; i < n; i++) {
      var el = document.createElement('span');
      var angle = Math.random() * Math.PI * 2;
      var dist = 28 + Math.random() * 68;
      var tx = Math.cos(angle) * dist;
      var ty = Math.sin(angle) * dist;
      var pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];
      var sz = 9 + Math.floor(Math.random() * 11);
      var deg = Math.floor(Math.random() * 360);
      el.textContent = 'FUCK';
      el.style.cssText = [
        'position:fixed',
        'left:' + cx + 'px',
        'top:' + cy + 'px',
        'pointer-events:none',
        'z-index:999999',
        'font-family:var(--f-px,monospace)',
        'font-size:' + sz + 'px',
        'letter-spacing:2px',
        'font-weight:bold',
        'background:linear-gradient(' + deg + 'deg,' + pair[0] + ',' + pair[1] + ')',
        '-webkit-background-clip:text',
        'background-clip:text',
        'color:transparent',
        'white-space:nowrap',
        'transform:translate(-50%,-50%)',
        '--tx:' + tx + 'px',
        '--ty:' + ty + 'px',
        'animation:wordFly 5s ease-out forwards',
        'animation-delay:' + (i * 55) + 'ms',
      ].join(';');
      document.body.appendChild(el);
      (function (node, delay) {
        setTimeout(function () { node.remove(); }, 5500 + delay);
      })(el, i * 55);
    }
  }

  document.addEventListener('mousemove', function (e) {
    var dx = e.clientX - lastX;
    var dy = e.clientY - lastY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var now = Date.now();
    if (dist >= 8 && now - lastTime >= 120) {
      spawn(e.clientX, e.clientY);
      lastTime = now;
    }
    lastX = e.clientX;
    lastY = e.clientY;
  });
})();
