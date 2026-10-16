/* Hero sketch: a planar 3-link arm sorting coloured bricks into bins.
   Analytic 2-link IK for the wrist, gripper kept vertical.
   Units are normalised to the canvas width (1 = full width, y points down). */
(function () {
  'use strict';
  var canvas = document.getElementById('robot');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var hud = document.getElementById('hud');
  var modeEl = document.getElementById('cell-mode');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ASPECT = 0.68;
  var G = 0.6;                          // floor height
  var BASE = { x: 0.5, y: G - 0.075 };  // shoulder joint
  var L1 = 0.27, L2 = 0.24, L3 = 0.075; // upper arm, forearm, gripper
  var BW = 0.044, BH = 0.03;            // brick size
  var TRAVEL = G - 0.2;                 // wrist height for transit moves
  var COLORS = ['#e5484d', '#f5b301', '#3e7bfa'];
  var BINS = [0.66, 0.77, 0.88], BIN_W = 0.085, BIN_WALL = 0.045, BIN_FLOOR = 0.006;
  var SPEED = 0.55;                     // max wrist speed (widths per second)

  var bricks = [], steps = [], stepIdx = 0, waitT = 0;
  var wrist = { x: 0.62, y: TRAVEL }, goal = { x: 0.62, y: TRAVEL };
  var grip = 1, gripGoal = 1, held = null;
  var mode = 'auto', lastPointer = 0;
  var trail = [];
  var theme = {};
  var W = 600, dpr = 1;
  var running = false, visible = true, lastT = 0, hudT = 0;

  function readTheme() {
    var cs = getComputedStyle(document.documentElement);
    ['--text', '--muted', '--line', '--accent', '--surface', '--bg', '--arm'].forEach(function (k) {
      theme[k] = cs.getPropertyValue(k).trim();
    });
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- Task planning ---------- */
  function scatter() {
    var cols = shuffle([0, 0, 1, 1, 2, 2]);
    bricks = cols.map(function (c, i) {
      return { c: c, x: 0.085 + i * 0.054, y: G - BH / 2, state: 'table', alpha: 0 };
    });
    var counts = [0, 0, 0];
    steps = [];
    shuffle(bricks.slice()).forEach(function (b) {
      var bx = BINS[b.c];
      var by = G - BIN_FLOOR - BH * (counts[b.c]++ + 0.5);
      steps.push(
        { move: [b.x, TRAVEL] },
        { move: [b.x, G - BH / 2 - L3] },
        { grip: 0, brick: b },
        { move: [b.x, TRAVEL] },
        { move: [bx, TRAVEL] },
        { move: [bx, by - L3] },
        { grip: 1, brick: b, to: [bx, by] },
        { move: [bx, TRAVEL] }
      );
    });
    steps.push({ move: [0.5, TRAVEL - 0.04] }, { wait: 1.4 }, { reset: true });
    stepIdx = 0;
  }

  /* ---------- Kinematics ---------- */
  function ik(tx, ty) {
    var dx = tx - BASE.x, dy = ty - BASE.y, d = Math.hypot(dx, dy);
    var max = L1 + L2 - 1e-4, min = Math.abs(L1 - L2) + 1e-4;
    if (d > max) { dx *= max / d; dy *= max / d; d = max; }
    if (d < min) { dx *= min / d; dy *= min / d; d = min; }
    var a = Math.atan2(dy, dx);
    var off = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    // pick the elbow-up solution (smaller y on screen)
    var q1a = a - off, q1b = a + off;
    var q1 = Math.sin(q1a) < Math.sin(q1b) ? q1a : q1b;
    var ex = BASE.x + L1 * Math.cos(q1), ey = BASE.y + L1 * Math.sin(q1);
    var wx = BASE.x + dx, wy = BASE.y + dy;
    var q2abs = Math.atan2(wy - ey, wx - ex);
    return { ex: ex, ey: ey, wx: wx, wy: wy, q1: q1, q2: q2abs - q1, q3: Math.PI / 2 - q2abs };
  }

  /* ---------- Simulation step ---------- */
  function clampGoal(p) {
    var lowest = G - 0.004 - L3 - (held ? BH / 2 : 0);
    return { x: Math.max(0.03, Math.min(0.97, p.x)), y: Math.max(0.06, Math.min(lowest, p.y)) };
  }

  function update(dt) {
    if (mode === 'teleop' && performance.now() - lastPointer > 2200) setMode('auto');

    bricks.forEach(function (b) { if (b.alpha < 1) b.alpha = Math.min(1, b.alpha + dt * 2.5); });

    if (mode === 'auto') {
      var s = steps[stepIdx];
      if (s && s.move) {
        goal = { x: s.move[0], y: s.move[1] };
        if (Math.hypot(goal.x - wrist.x, goal.y - wrist.y) < 0.0015) stepIdx++;
      } else if (s && s.grip !== undefined) {
        gripGoal = s.grip;
        if (Math.abs(grip - gripGoal) < 0.02) {
          if (s.grip === 0) { held = s.brick; held.state = 'held'; }
          else {
            s.brick.state = 'bin'; s.brick.x = s.to[0]; s.brick.y = s.to[1];
            held = null;
          }
          stepIdx++;
        }
      } else if (s && s.wait) {
        waitT += dt;
        if (waitT >= s.wait) { waitT = 0; stepIdx++; }
      } else if (s && s.reset) {
        scatter();
      }
    }

    // move wrist toward goal: exponential approach, capped by max speed
    var dx = goal.x - wrist.x, dy = goal.y - wrist.y, dist = Math.hypot(dx, dy);
    if (dist > 1e-6) {
      var step = Math.min(dist, Math.max(dist * Math.min(1, dt * 7), 0.0008), SPEED * dt);
      wrist.x += dx / dist * step; wrist.y += dy / dist * step;
    }
    grip += Math.sign(gripGoal - grip) * Math.min(Math.abs(gripGoal - grip), dt * 4);

    if (held) { held.x = wrist.x; held.y = wrist.y + L3; }

    trail.push({ x: wrist.x, y: wrist.y + L3 });
    if (trail.length > 48) trail.shift();
  }

  /* ---------- Drawing ---------- */
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBrick(b) {
    ctx.globalAlpha = b.alpha;
    ctx.fillStyle = COLORS[b.c];
    var x = b.x - BW / 2, y = b.y - BH / 2;
    roundRect(x, y, BW, BH, 0.004); ctx.fill();
    // studs
    roundRect(x + BW * 0.14, y - 0.007, BW * 0.26, 0.008, 0.002); ctx.fill();
    roundRect(x + BW * 0.6, y - 0.007, BW * 0.26, 0.008, 0.002); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 0.003, y + 0.003, BW - 0.006, 0.004);
    ctx.globalAlpha = 1;
  }

  function draw() {
    var H = ASPECT;
    ctx.clearRect(0, 0, 1, H);

    // floor
    ctx.strokeStyle = theme['--muted'];
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 0.002;
    ctx.beginPath(); ctx.moveTo(0.03, G); ctx.lineTo(0.97, G); ctx.stroke();
    ctx.globalAlpha = 0.18;
    for (var hx = 0.04; hx < 0.97; hx += 0.025) {
      ctx.beginPath(); ctx.moveTo(hx, G); ctx.lineTo(hx - 0.015, G + 0.018); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // pick zone + bins
    ctx.setLineDash([0.006, 0.006]);
    ctx.strokeStyle = theme['--muted'];
    ctx.globalAlpha = 0.35;
    roundRect(0.05, G - 0.075, 0.33, 0.07, 0.008); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    BINS.forEach(function (bx, i) {
      ctx.strokeStyle = COLORS[i];
      ctx.lineWidth = 0.004;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(bx - BIN_W / 2, G - BIN_WALL);
      ctx.lineTo(bx - BIN_W / 2, G - 0.002);
      ctx.lineTo(bx + BIN_W / 2, G - 0.002);
      ctx.lineTo(bx + BIN_W / 2, G - BIN_WALL);
      ctx.stroke();
      ctx.globalAlpha = 0.08; ctx.fillStyle = COLORS[i];
      ctx.fillRect(bx - BIN_W / 2, G - BIN_WALL, BIN_W, BIN_WALL);
      ctx.globalAlpha = 1;
    });

    bricks.forEach(function (b) { if (b !== held) drawBrick(b); });

    // end-effector trail
    if (trail.length > 1) {
      ctx.lineWidth = 0.003; ctx.lineCap = 'round';
      for (var i = 1; i < trail.length; i++) {
        ctx.strokeStyle = theme['--accent'];
        ctx.globalAlpha = (i / trail.length) * 0.35;
        ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // teleop target
    if (mode === 'teleop') {
      var tx = goal.x, ty = goal.y + L3;
      ctx.strokeStyle = theme['--accent']; ctx.lineWidth = 0.002; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(tx, ty, 0.014, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx - 0.024, ty); ctx.lineTo(tx + 0.024, ty); ctx.moveTo(tx, ty - 0.024); ctx.lineTo(tx, ty + 0.024); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    var k = ik(wrist.x, wrist.y);

    // pedestal
    ctx.fillStyle = theme['--arm'];
    ctx.beginPath();
    ctx.moveTo(BASE.x - 0.06, G); ctx.lineTo(BASE.x - 0.035, BASE.y + 0.01);
    ctx.lineTo(BASE.x + 0.035, BASE.y + 0.01); ctx.lineTo(BASE.x + 0.06, G); ctx.closePath(); ctx.fill();

    // links
    ctx.lineCap = 'round';
    ctx.strokeStyle = theme['--arm'];
    ctx.lineWidth = 0.034;
    ctx.beginPath(); ctx.moveTo(BASE.x, BASE.y); ctx.lineTo(k.ex, k.ey); ctx.stroke();
    ctx.strokeStyle = theme['--accent'];
    ctx.lineWidth = 0.026;
    ctx.beginPath(); ctx.moveTo(k.ex, k.ey); ctx.lineTo(k.wx, k.wy); ctx.stroke();

    // gripper: wrist block, palm, two fingers
    var open = BW / 2 + 0.004 + grip * 0.016;
    ctx.strokeStyle = theme['--text'];
    ctx.lineWidth = 0.007;
    ctx.beginPath(); ctx.moveTo(k.wx, k.wy); ctx.lineTo(k.wx, k.wy + L3 * 0.38); ctx.stroke();
    ctx.lineWidth = 0.006;
    ctx.beginPath(); ctx.moveTo(k.wx - open - 0.004, k.wy + L3 * 0.38); ctx.lineTo(k.wx + open + 0.004, k.wy + L3 * 0.38); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(k.wx - open, k.wy + L3 * 0.38); ctx.lineTo(k.wx - open, k.wy + L3 + BH * 0.3);
    ctx.moveTo(k.wx + open, k.wy + L3 * 0.38); ctx.lineTo(k.wx + open, k.wy + L3 + BH * 0.3);
    ctx.stroke();

    if (held) drawBrick(held);

    // joints
    [[BASE.x, BASE.y, 0.022], [k.ex, k.ey, 0.018], [k.wx, k.wy, 0.013]].forEach(function (j) {
      ctx.fillStyle = theme['--surface'];
      ctx.strokeStyle = theme['--text'];
      ctx.lineWidth = 0.004;
      ctx.beginPath(); ctx.arc(j[0], j[1], j[2], 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = theme['--text'];
      ctx.beginPath(); ctx.arc(j[0], j[1], j[2] * 0.3, 0, Math.PI * 2); ctx.fill();
    });

    return k;
  }

  function deg(r) {
    var d = (-r * 180 / Math.PI);
    d = ((d + 540) % 360) - 180;
    return (d >= 0 ? '+' : '') + d.toFixed(1).padStart(5, ' ') + '°';
  }

  function writeHud(k) {
    hud.textContent =
      '/joint_states\n' +
      'shoulder ' + deg(k.q1) + '\n' +
      'elbow    ' + deg(k.q2) + '\n' +
      'wrist    ' + deg(k.q3) + '\n' +
      'gripper  ' + (grip < 0.05 ? 'closed' : grip > 0.95 ? 'open' : 'moving');
  }

  /* ---------- Loop, sizing, input ---------- */
  function frame(t) {
    if (!running) return;
    var dt = Math.min(0.05, (t - lastT) / 1000 || 0);
    lastT = t;
    update(dt);
    var k = draw();
    if (t - hudT > 100) { writeHud(k); hudT = t; }
    requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduce || !visible || document.hidden) return;
    running = true; lastT = performance.now();
    requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  function renderStatic() { writeHud(draw()); }

  function resize() {
    W = canvas.clientWidth || 600;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(W * ASPECT * dpr);
    ctx.setTransform(W * dpr, 0, 0, W * dpr, 0, 0);
    if (!running) renderStatic();
  }

  function setMode(m) {
    if (mode === m) return;
    mode = m;
    modeEl.textContent = m === 'teleop' ? 'teleop' : 'auto';
  }

  canvas.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    var tip = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.width };
    goal = clampGoal({ x: tip.x, y: tip.y - L3 });
    lastPointer = performance.now();
    setMode('teleop');
    if (reduce) { wrist = { x: goal.x, y: goal.y }; if (held) { held.x = wrist.x; held.y = wrist.y + L3; } renderStatic(); }
  });
  canvas.addEventListener('pointerleave', function () { lastPointer = performance.now() - 1600; });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start(); else stop();
    }).observe(canvas);
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
  window.addEventListener('themechange', function () { readTheme(); if (!running) renderStatic(); });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);

  readTheme();
  scatter();
  bricks.forEach(function (b) { b.alpha = 1; });
  resize();
  start();
})();
