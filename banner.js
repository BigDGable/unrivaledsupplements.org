/* Unrivaled Supplements: animated page banners.
   Three scenes are drawn on canvas: a capsule-filling turret, an autosampler vial tray and a bottle capping line.
   Each frame renders a blurred base layer plus a sharp layer masked to the focal band, for a shallow depth of field. */
(function () {
  "use strict";

  var nodes = document.querySelectorAll(".banner");
  if (!nodes.length) return;

  var TAU = Math.PI * 2;
  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var PAUSE_KEY = "unrivaled-banner-paused";
  var paused = false;
  try { paused = window.localStorage.getItem(PAUSE_KEY) === "1"; } catch (e) { paused = false; }

  /* ---------- helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(x) { x = clamp(x, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function hash(a, b, seed) {
    var h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function makeCanvas(w, h) {
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  function mod(v, m) { return ((v % m) + m) % m; }
  function cycle(t, T, moveDur) {
    var k = Math.floor(t / T);
    var p = t - k * T;
    return { k: k, p: p, m: ease(p / moveDur) };
  }
  /* 0 = raised, 1 = lowered: ramps down a..b, holds, ramps up c..d */
  function stroke(p, a, b, c, d) {
    if (p <= a || p >= d) return 0;
    if (p < b) return ease((p - a) / (b - a));
    if (p <= c) return 1;
    return 1 - ease((p - c) / (d - c));
  }
  function ellipse(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, TAU);
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (w <= 0 || h <= 0) return;
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function glow(ctx, x, y, r, rgb, a) {
    var c = rgb.join(",");
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(" + c + "," + a + ")");
    g.addColorStop(0.5, "rgba(" + c + "," + (a * 0.42) + ")");
    g.addColorStop(1, "rgba(" + c + ",0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  function motes(ctx, W, H, t, seed, count) {
    for (var i = 0; i < count; i++) {
      var sp = 5 + hash(i, 3, seed) * 14;
      var x = mod(hash(i, 1, seed) * W + t * sp * 0.7, W + 40) - 20;
      var y = mod(hash(i, 2, seed) * H - t * sp, H + 40) - 20;
      var r = 0.6 + hash(i, 4, seed) * 1.5;
      var a = (0.06 + hash(i, 5, seed) * 0.2) * (0.65 + 0.35 * Math.sin(t * 0.9 + i));
      ctx.fillStyle = "rgba(225,236,238," + a.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  var GRAIN = (function () {
    var c = makeCanvas(160, 160);
    var g = c.getContext("2d");
    var img = g.createImageData(160, 160);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = (Math.random() * 255) | 0;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  })();

  /* =====================================================================
     Scene 1: capsule-filling turret (close-up of the dosing disc)
     ===================================================================== */
  function tp(s, X, Z, Y) {
    var d = s.D - Z;
    return { x: s.cx + s.F * X / d, y: s.hy + s.F * (s.HC - Y) / d, k: s.F / d, d: d };
  }
  function discPath(ctx, s, r, Y, a0, a1, n) {
    ctx.beginPath();
    for (var i = 0; i <= n; i++) {
      var th = a0 + (a1 - a0) * i / n;
      var p = tp(s, r * Math.cos(th), r * Math.sin(th), Y);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
  }
  function boreRadius(s, r) { return Math.min(0.37 * TAU * r / s.N, 0.034); }

  function turretStatic(g, s, W, H) {
    var bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0a1114");
    bg.addColorStop(1, "#141d22");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    for (var i = 0; i < 7; i++) {
      var x = W * (0.02 + i * 0.15) + hash(i, 3, s.seed) * W * 0.05;
      var w = W * (0.035 + hash(i, 4, s.seed) * 0.06);
      var cg = g.createLinearGradient(x, 0, x + w, 0);
      cg.addColorStop(0, "#12191c");
      cg.addColorStop(0.45, "#29343a");
      cg.addColorStop(1, "#0f1517");
      g.fillStyle = cg;
      g.fillRect(x, -10, w, H * (0.32 + hash(i, 5, s.seed) * 0.22));
    }
    glow(g, W * 0.9, H * 0.08, H * 0.2, [233, 160, 58], 0.3);
    glow(g, W * 0.66, H * 0.03, H * 0.1, [233, 160, 58], 0.18);
    glow(g, W * 0.32, H * 0.06, H * 0.16, [120, 190, 200], 0.14);

    // disc surface
    discPath(g, s, 1, 0, -Math.PI, Math.PI, 180);
    g.closePath();
    var dg = g.createLinearGradient(0, H * 0.15, 0, H);
    dg.addColorStop(0, "#5a666d");
    dg.addColorStop(0.35, "#3f4a50");
    dg.addColorStop(1, "#283136");
    g.fillStyle = dg;
    g.fill();
    g.save();
    g.clip();
    var hl = g.createRadialGradient(s.cx - W * 0.14, H * 0.42, 0, s.cx - W * 0.14, H * 0.42, Math.max(W, H) * 0.6);
    hl.addColorStop(0, "rgba(225,238,242,0.16)");
    hl.addColorStop(1, "rgba(225,238,242,0)");
    g.fillStyle = hl;
    g.fillRect(0, 0, W, H);
    var wl = g.createRadialGradient(W * 1.0, H * 0.2, 0, W * 1.0, H * 0.2, H * 0.9);
    wl.addColorStop(0, "rgba(233,160,58,0.12)");
    wl.addColorStop(1, "rgba(233,160,58,0)");
    g.fillStyle = wl;
    g.fillRect(0, 0, W, H);
    g.lineWidth = 1;
    for (var r = 0.475, n = 0; r < 1; r += 0.0105, n++) {
      g.strokeStyle = n % 2 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.07)";
      discPath(g, s, r, 0, -Math.PI, 0, 100);
      g.stroke();
    }
    g.restore();

    // far rim
    g.lineWidth = 3;
    g.strokeStyle = "rgba(0,0,0,0.5)";
    discPath(g, s, 1.012, 0, -Math.PI, 0, 120);
    g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = "rgba(235,244,246,0.3)";
    discPath(g, s, 0.997, 0, -Math.PI, 0, 120);
    g.stroke();

    // central recess
    discPath(g, s, 0.47, 0, -Math.PI, Math.PI, 140);
    g.closePath();
    g.fillStyle = "#11171a";
    g.fill();
    g.save();
    g.clip();
    var fl = g.createLinearGradient(0, H * 0.5, 0, H);
    fl.addColorStop(0, "#182024");
    fl.addColorStop(1, "#0d1215");
    g.fillStyle = fl;
    g.fillRect(0, 0, W, H);
    g.lineWidth = 1;
    g.strokeStyle = "rgba(255,255,255,0.06)";
    discPath(g, s, 0.39, -0.09, -Math.PI, 0, 100);
    g.stroke();
    discPath(g, s, 0.29, -0.09, -Math.PI, 0, 100);
    g.stroke();
    g.restore();
    // far inner wall of the recess
    g.beginPath();
    for (var a = 0; a <= 100; a++) {
      var th = -Math.PI + Math.PI * a / 100;
      var p = tp(s, 0.47 * Math.cos(th), 0.47 * Math.sin(th), 0);
      if (a === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
    }
    for (var b = 100; b >= 0; b--) {
      var th2 = -Math.PI + Math.PI * b / 100;
      var q = tp(s, 0.465 * Math.cos(th2), 0.465 * Math.sin(th2), -0.09);
      g.lineTo(q.x, q.y);
    }
    g.closePath();
    g.fillStyle = "#2b353a";
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = "rgba(235,244,246,0.22)";
    discPath(g, s, 0.47, 0, -Math.PI, 0, 120);
    g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = "rgba(255,255,255,0.07)";
    discPath(g, s, 0.495, 0, -Math.PI, 0, 120);
    g.stroke();
  }

  function capsuleTop(ctx, x, y, rx, ry, amber, sharp) {
    var cy = y - ry * 0.3;
    var crx = rx * 0.78;
    var cry = ry * 0.8 + rx * 0.22;
    if (!sharp) {
      ellipse(ctx, x, cy, crx, cry);
      ctx.fillStyle = amber ? "#d39443" : "#d9d7d1";
      ctx.fill();
      return;
    }
    ellipse(ctx, x, cy, crx, cry);
    ctx.fillStyle = amber ? "#9a5f1d" : "#a3a19b";
    ctx.fill();
    ellipse(ctx, x, cy - cry * 0.12, crx * 0.95, cry * 0.86);
    ctx.fillStyle = amber ? "#e3a64f" : "#ebe9e4";
    ctx.fill();
    ellipse(ctx, x - crx * 0.3, cy - cry * 0.38, crx * 0.32, cry * 0.22);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fill();
  }

  function turretBores(ctx, s, t, W, H, mode) {
    var cy = cycle(t, s.T, s.move);
    var pitch = TAU / s.N;
    var phi = -(cy.k + cy.m) * pitch;
    var loaded = cy.p > 1.3;
    var sharp = mode === "sharp";
    for (var ri = 0; ri < s.rings.length; ri++) {
      var r = s.rings[ri];
      var br = boreRadius(s, r);
      for (var kk = 0; kk < s.N; kk++) {
        var th = kk * pitch + phi;
        var Z = r * Math.sin(th);
        if (Z > 0.05) continue;
        var X = r * Math.cos(th);
        var p = tp(s, X, Z, 0);
        var rx = br * p.k;
        if (p.x < -rx * 2 || p.x > W + rx * 2 || p.y < -rx || p.y > H + rx) continue;
        var ry = rx * s.HC / Math.sqrt(s.HC * s.HC + p.d * p.d);
        if (sharp) {
          ellipse(ctx, p.x, p.y, rx, ry);
          ctx.fillStyle = "#283136";
          ctx.fill();
          ctx.save();
          ctx.clip();
          ellipse(ctx, p.x, p.y + ry * 0.5, rx * 1.04, ry);
          ctx.fillStyle = "#06080a";
          ctx.fill();
          ctx.restore();
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, rx, ry, 0, 0.2, Math.PI - 0.2);
          ctx.strokeStyle = "rgba(235,245,248,0.3)";
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ellipse(ctx, p.x, p.y, rx, ry);
          ctx.fillStyle = "#0a0e10";
          ctx.fill();
        }
        if (ri >= s.pinFrom) {
          var u = mod(s.sIdx - kk + cy.k, s.N);
          if (u >= s.N - 8) u -= s.N;
          var filled = (u >= 0 && u < 34) || (u === -1 && loaded);
          if (filled) capsuleTop(ctx, p.x, p.y, rx, ry, hash(ri, kk, s.seed) < 0.16, sharp);
        }
      }
    }
  }

  function turretStation(ctx, s, t, W, H) {
    var cy = cycle(t, s.T, s.move);
    var down = stroke(cy.p, 0.92, 1.28, 1.55, 1.95);
    var lift = 0.012 + 0.1 * (1 - down);
    var pins = [];
    for (var ri = s.rings.length - 1; ri >= s.pinFrom; ri--) {
      var r = s.rings[ri];
      var X = r * Math.cos(s.thS), Z = r * Math.sin(s.thS);
      var bore = tp(s, X, Z, 0);
      var rx = boreRadius(s, r) * bore.k;
      pins.push({
        bore: bore,
        tip: tp(s, X, Z, lift),
        top: tp(s, X, Z, lift + 0.2),
        rx: rx,
        ry: rx * s.HC / Math.sqrt(s.HC * s.HC + bore.d * bore.d)
      });
    }
    var far = pins[0], near = pins[pins.length - 1];

    // soft shadow of the head on the disc
    var sx = (far.bore.x + near.bore.x) / 2, sy = (far.bore.y + near.bore.y) / 2;
    var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.abs(near.bore.y - far.bore.y) + near.rx * 4);
    sg.addColorStop(0, "rgba(0,0,0," + (0.18 + 0.2 * down).toFixed(3) + ")");
    sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(sx - W, sy - H, W * 2, H * 2);

    // head block
    var lx = near.top.x - near.rx * 2.4;
    var midX = far.top.x + far.rx * 1.8;
    ctx.beginPath();
    ctx.moveTo(lx, near.top.y);
    ctx.lineTo(midX, far.top.y);
    ctx.lineTo(W + 20, far.top.y);
    ctx.lineTo(W + 20, -20);
    ctx.lineTo(lx, -20);
    ctx.closePath();
    var bg = ctx.createLinearGradient(lx, 0, W, 0);
    bg.addColorStop(0, "#3a454b");
    bg.addColorStop(0.3, "#5e6a71");
    bg.addColorStop(0.62, "#3b464c");
    bg.addColorStop(1, "#262e33");
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = "rgba(240,246,248,0.3)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(lx, near.top.y);
    ctx.lineTo(midX, far.top.y);
    ctx.lineTo(W + 20, far.top.y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.moveTo(lx + 0.5, near.top.y);
    ctx.lineTo(lx + 0.5, -20);
    ctx.stroke();
    var seam = midX + far.rx * 3;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(seam, -20, 2, far.top.y + 20);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(seam + 2, -20, 1, far.top.y + 20);
    // socket-head bolt
    var bx = seam + far.rx * 2.6, by = far.top.y - far.rx * 1.5, brr = far.rx * 0.95;
    if (by - brr > -brr) {
      ellipse(ctx, bx, by, brr, brr);
      ctx.fillStyle = "#2b3439";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      for (var h = 0; h < 6; h++) {
        var a = h * TAU / 6 + 0.3;
        var hx = bx + Math.cos(a) * brr * 0.45, hy = by + Math.sin(a) * brr * 0.45;
        if (h === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fillStyle = "#0c1012";
      ctx.fill();
    }

    // pins with capsules (far to near)
    for (var i = 0; i < pins.length; i++) {
      var p = pins[i];
      var cw = p.rx * 1.42;
      var ch = cw * 1.95;
      var capTop = p.tip.y - ch;
      var plateBottom = capTop + ch * 0.36;
      var pw = p.rx * 1.7;
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.tip.x - pw * 2, -1e4, pw * 4, p.bore.y + p.ry * 0.15 + 1e4);
      ctx.clip();
      rr(ctx, p.tip.x - cw / 2, capTop, cw, ch, cw / 2);
      ctx.fillStyle = "#ebe9e4";
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = "rgba(0,0,0,0.17)";
      ctx.fillRect(p.tip.x + cw * 0.12, capTop, cw * 0.4, ch);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillRect(p.tip.x - cw * 0.3, capTop, cw * 0.12, ch);
      ctx.restore();
      ctx.restore();
      ctx.fillStyle = "#14191c";
      ctx.fillRect(p.top.x - pw / 2, p.top.y, pw, plateBottom - p.top.y);
      ctx.fillStyle = "#2e383d";
      ctx.fillRect(p.top.x + pw / 2, p.top.y, pw * 0.24, plateBottom - p.top.y - pw * 0.08);
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(p.top.x - pw / 2, p.top.y, Math.max(1, pw * 0.08), plateBottom - p.top.y);
    }
  }

  var TURRET = {
    start: 1.45,
    focus: [0.05, 0.3, 0.7, 1, 0.6],
    setup: function (W, H, dpr, seed) {
      var s = { seed: seed, D: 1.55, HC: 1.5, N: 64, T: 2.4, move: 0.8, rings: [0.53, 0.61, 0.69, 0.77, 0.85, 0.93], pinFrom: 1 };
      var yFar = H * 0.2, yC = H * 1.06;
      s.F = (yC - yFar) / (s.HC * (1 / s.D - 1 / (s.D + 1)));
      s.hy = yC - s.F * s.HC / s.D;
      s.cx = Math.min(W * 0.57, W - H * 0.62);
      var pitch = TAU / s.N;
      s.sIdx = Math.round((-Math.PI / 2 + 0.75) / pitch);
      s.thS = s.sIdx * pitch;
      s.bg = makeCanvas(W * dpr, H * dpr);
      var g = s.bg.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      turretStatic(g, s, W, H);
      return s;
    },
    draw: function (ctx, s, t, W, H, mode) {
      ctx.drawImage(s.bg, 0, 0, W, H);
      turretBores(ctx, s, t, W, H, mode);
    },
    over: function (ctx, s, t, W, H) { turretStation(ctx, s, t, W, H); }
  };

  /* =====================================================================
     Scene 2: autosampler vial tray with a sampling needle
     ===================================================================== */
  function vp(s, X, Y, Z) {
    return { x: s.cx + s.F * X / Z, y: s.hy + s.F * (s.HC - Y) / Z, k: s.F / Z };
  }
  var CAPS = [
    ["#2d5c78", "#4a7c98"], ["#2d5c78", "#4a7c98"], ["#2d5c78", "#4a7c98"], ["#2d5c78", "#4a7c98"],
    ["#b4762a", "#d89a47"], ["#27535d", "#3d717d"], ["#c9cfcc", "#e6e9e7"]
  ];
  var LIQ = ["214,160,70", "190,215,222", "150,196,182", "214,160,70", "196,122,62", "190,215,222"];

  function vialsStatic(g, s, W, H) {
    var bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#091013");
    bg.addColorStop(1, "#121b20");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    var farY = vp(s, 0, 0, s.Zf).y;
    g.fillStyle = "#141c20";
    g.fillRect(0, farY * 0.32, W, farY * 0.1);
    g.fillStyle = "rgba(170,210,220,0.08)";
    g.fillRect(W * 0.08, farY * 0.18, W * 0.5, farY * 0.06);
    glow(g, W * 0.12, farY * 0.45, H * 0.16, [233, 160, 58], 0.22);
    glow(g, W * 0.58, farY * 0.2, H * 0.14, [120, 190, 200], 0.16);
    glow(g, W * 0.88, farY * 0.5, H * 0.08, [110, 200, 140], 0.2);
    glow(g, W * 0.95, farY * 0.2, H * 0.12, [233, 160, 58], 0.16);

    var a = vp(s, -80, 0, s.Zf), b = vp(s, 80, 0, s.Zf), c = vp(s, 80, 0, 2.6), d = vp(s, -80, 0, 2.6);
    g.beginPath();
    g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y);
    g.closePath();
    var tg = g.createLinearGradient(0, a.y, 0, H);
    tg.addColorStop(0, "#2a353b");
    tg.addColorStop(1, "#172025");
    g.fillStyle = tg;
    g.fill();
    var lipTop = vp(s, 0, 0.28, s.Zf + 0.05).y;
    g.fillStyle = "#36424a";
    g.fillRect(0, lipTop, W, farY - lipTop + 1);
    g.fillStyle = "rgba(235,244,246,0.24)";
    g.fillRect(0, lipTop, W, 1);
    g.strokeStyle = "rgba(0,0,0,0.22)";
    g.lineWidth = 1;
    for (var z = s.Zf - 0.5; z > 3; z -= 1) {
      var y = vp(s, 0, 0, z).y;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
  }

  function vial(ctx, s, X, Z, h, pierced, sharp) {
    var r = s.r;
    var b = vp(s, X, 0, Z), bt = vp(s, X, 1.0, Z), nk = vp(s, X, 1.1, Z), ct = vp(s, X, 1.32, Z), lq = vp(s, X, 0.52, Z);
    var rx = r * b.k;
    function sinA(Y) { var e = s.HC - Y; return e / Math.sqrt(e * e + Z * Z); }
    var cap = CAPS[Math.floor(h * 997) % CAPS.length];
    var liq = LIQ[Math.floor(h * 7919) % LIQ.length];

    ctx.fillStyle = "rgba(180,205,212,0.065)";
    ctx.fillRect(b.x - rx, bt.y, rx * 2, b.y - bt.y);
    ctx.fillStyle = "rgba(" + liq + ",0.3)";
    ctx.fillRect(b.x - rx * 0.92, lq.y, rx * 1.84, b.y - lq.y);
    ellipse(ctx, b.x, lq.y, rx * 0.92, rx * 0.92 * sinA(0.52));
    ctx.fillStyle = "rgba(" + liq + ",0.55)";
    ctx.fill();
    if (sharp) {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillRect(b.x - rx * 0.78, bt.y, Math.max(1, rx * 0.07), b.y - bt.y);
      ctx.fillStyle = "rgba(255,255,255,0.13)";
      ctx.fillRect(b.x + rx * 0.68, bt.y, Math.max(1, rx * 0.05), b.y - bt.y);
    }
    // crimp ring
    ellipse(ctx, b.x, bt.y, rx * 0.9, rx * 0.9 * sinA(1.0));
    ctx.fillStyle = "#6f7a80";
    ctx.fill();
    ctx.fillStyle = "#7f8a90";
    ctx.fillRect(b.x - rx * 0.9, nk.y, rx * 1.8, bt.y - nk.y);
    // cap
    ellipse(ctx, b.x, nk.y, rx, rx * sinA(1.1));
    ctx.fillStyle = cap[0];
    ctx.fill();
    ctx.fillRect(b.x - rx, ct.y, rx * 2, nk.y - ct.y);
    if (sharp) {
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(b.x - rx * 0.82, ct.y, rx * 0.42, nk.y - ct.y);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(b.x + rx * 0.35, ct.y, rx * 0.65, nk.y - ct.y);
    }
    var st = sinA(1.32);
    ellipse(ctx, b.x, ct.y, rx, rx * st);
    ctx.fillStyle = cap[1];
    ctx.fill();
    ellipse(ctx, b.x, ct.y, rx * 0.48, rx * 0.48 * st);
    ctx.fillStyle = "#e6e1d8";
    ctx.fill();
    if (pierced && sharp) {
      ellipse(ctx, b.x, ct.y, rx * 0.08, rx * 0.08 * st);
      ctx.fillStyle = "#3a3631";
      ctx.fill();
    }
  }

  function needle(ctx, s, down, sharp) {
    var tipY = 1.32 + 1.6 * (1 - down) - 0.42 * down;
    var X = s.Xn, Z = s.Zn - 0.02;
    var capY = vp(s, X, 1.32, Z).y;
    var tip = vp(s, X, tipY, Z), sl = vp(s, X, tipY + 0.3, Z), slt = vp(s, X, tipY + 1.5, Z), car = vp(s, X, tipY + 2.6, Z);
    var k = tip.k;
    var cg = ctx.createLinearGradient(tip.x - 0.55 * k, 0, tip.x + 0.55 * k, 0);
    cg.addColorStop(0, "#2a3338");
    cg.addColorStop(0.35, "#4b575d");
    cg.addColorStop(1, "#20282c");
    ctx.fillStyle = cg;
    ctx.fillRect(tip.x - 0.55 * k, car.y, 1.1 * k, slt.y - car.y);
    ctx.fillStyle = "#1a2024";
    ctx.fillRect(tip.x - 0.55 * k, slt.y - 0.06 * k, 1.1 * k, 0.06 * k);
    if (sharp) {
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(tip.x - 0.55 * k, car.y, 1, slt.y - car.y);
      glow(ctx, tip.x + 0.34 * k, slt.y - 0.2 * k, 0.16 * k, [233, 160, 58], 0.35 + 0.55 * down);
      ellipse(ctx, tip.x + 0.34 * k, slt.y - 0.2 * k, 0.025 * k, 0.025 * k);
      ctx.fillStyle = down > 0.5 ? "#ffd58f" : "#c98a35";
      ctx.fill();
    }
    var sleeveBottom = Math.min(sl.y, capY);
    ctx.fillStyle = "#909ba1";
    ctx.fillRect(tip.x - 0.05 * k, slt.y, 0.1 * k, sleeveBottom - slt.y);
    if (sharp) {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(tip.x - 0.04 * k, slt.y, Math.max(1, 0.015 * k), sleeveBottom - slt.y);
    }
    var nb = Math.min(tip.y, capY);
    if (nb > sl.y) {
      ctx.fillStyle = "#d5dcdf";
      ctx.fillRect(tip.x - Math.max(0.6, 0.012 * k), sl.y, Math.max(1.2, 0.024 * k), nb - sl.y);
    }
  }

  var VIALS = {
    start: 1.6,
    focus: [0.04, 0.22, 0.8, 1, 0.6],
    setup: function (W, H, dpr, seed) {
      var s = { seed: seed, HC: 3.2, Z0: 3.0, Zf: 12.5, T: 2.6, move: 0.85, r: 0.36 };
      var yNear = H * 1.08, yFar = H * 0.2;
      s.F = (yNear - yFar) / (s.HC * (1 / s.Z0 - 1 / s.Zf));
      s.hy = yNear - s.F * s.HC / s.Z0;
      s.cx = W * 0.5;
      s.rows = [];
      for (var z = 11.5; z >= 3.5; z -= 1) s.rows.push(z);
      s.Zn = 5.5;
      s.Xn = Math.max(0, Math.round((W * 0.74 - s.cx) * s.Zn / s.F));
      s.bg = makeCanvas(W * dpr, H * dpr);
      var g = s.bg.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      vialsStatic(g, s, W, H);
      return s;
    },
    draw: function (ctx, s, t, W, H, mode) {
      ctx.drawImage(s.bg, 0, 0, W, H);
      var cy = cycle(t, s.T, s.move);
      var pan = cy.k + cy.m;
      var down = stroke(cy.p, 1.0, 1.35, 1.75, 2.15);
      var sampled = cy.p > 1.35;
      var sharp = mode === "sharp";
      for (var j = 0; j < s.rows.length; j++) {
        var Z = s.rows[j];
        var x0 = (-80 - s.cx) * Z / s.F + pan, x1 = (W + 80 - s.cx) * Z / s.F + pan;
        var sin0 = s.HC / Math.sqrt(s.HC * s.HC + Z * Z);
        for (var i = Math.floor(x0); i <= Math.ceil(x1); i++) {
          var X = i - pan;
          var h = hash(i, j, s.seed);
          var base = vp(s, X, 0, Z);
          var hr = 0.44 * base.k;
          ellipse(ctx, base.x, base.y, hr, hr * sin0);
          ctx.fillStyle = "#06090b";
          ctx.fill();
          if (h < 0.07) continue;
          var pierced = Z === s.Zn && (X < s.Xn - 0.5 || (Math.abs(X - s.Xn) <= 0.5 && sampled));
          vial(ctx, s, X, Z, h, pierced, sharp);
        }
        if (Z === s.Zn) needle(ctx, s, down, sharp);
      }
    }
  };

  /* =====================================================================
     Scene 3: bottle capping line
     ===================================================================== */
  function lineStatic(g, s, W, H) {
    var bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b1215");
    bg.addColorStop(1, "#162026");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    var win = g.createLinearGradient(0, 0, 0, H * 0.45);
    win.addColorStop(0, "rgba(190,220,228,0.12)");
    win.addColorStop(1, "rgba(190,220,228,0)");
    g.fillStyle = win;
    g.fillRect(W * 0.46, 0, W * 0.5, H * 0.45);
    g.fillStyle = "#1c252a";
    g.fillRect(0, H * 0.3, W, H * 0.035);
    for (var i = 0; i < 5; i++) {
      var x = W * (0.08 + i * 0.22) + hash(i, 9, s.seed) * W * 0.05;
      g.fillStyle = "#172025";
      g.fillRect(x, 0, W * 0.025, H * 0.6);
    }
    glow(g, W * 0.24, H * 0.16, H * 0.18, [233, 160, 58], 0.24);
    glow(g, W * 0.84, H * 0.1, H * 0.16, [190, 220, 228], 0.14);
    glow(g, W * 0.6, H * 0.36, H * 0.07, [110, 200, 140], 0.16);
    var yb2 = s.yb2;
    g.fillStyle = "#273237";
    g.fillRect(0, yb2, W, H * 0.06);
    g.fillStyle = "#1b2327";
    g.fillRect(0, yb2 - H * 0.012, W, H * 0.014);
  }
  function lineFront(g, s, W, H) {
    var bh = s.bh, yb = s.yb;
    g.fillStyle = "#5c676d";
    g.fillRect(0, yb - bh * 0.52 - 1.5, W, 3);
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fillRect(0, yb - bh * 0.52 - 1.5, W, 1);
    g.fillStyle = "#1d2428";
    g.fillRect(0, yb - bh * 0.06, W, bh * 0.11);
    var fg = g.createLinearGradient(0, yb + bh * 0.05, 0, H);
    fg.addColorStop(0, "#344046");
    fg.addColorStop(0.08, "#2b363b");
    fg.addColorStop(1, "#182024");
    g.fillStyle = fg;
    g.fillRect(0, yb + bh * 0.05, W, H - yb);
    g.fillStyle = "rgba(240,246,248,0.24)";
    g.fillRect(0, yb + bh * 0.05, W, 1);
    for (var x = 60; x < W; x += 180) {
      ellipse(g, x, yb + bh * 0.11, 3.5, 3.5);
      g.fillStyle = "#1a2125";
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.18)";
      g.lineWidth = 1;
      g.stroke();
    }
  }
  function smallBottle(ctx, x, yb, bh) {
    var bw = bh * 0.56;
    rr(ctx, x - bw / 2, yb - bh * 0.8, bw, bh * 0.8, bw * 0.16);
    ctx.fillStyle = "#c6ccca";
    ctx.fill();
    ctx.fillStyle = "#1d4650";
    ctx.fillRect(x - bw / 2, yb - bh * 0.62, bw, bh * 0.46);
    ctx.fillStyle = "#17363e";
    ctx.fillRect(x - bw * 0.35, yb - bh * 0.98, bw * 0.7, bh * 0.15);
  }
  function bottle(ctx, s, x, hasCap) {
    var bh = s.bh, bw = s.bw, yb = s.yb;
    var top = yb - bh * 0.8;
    ellipse(ctx, x + bw * 0.08, yb + bh * 0.01, bw * 0.62, bh * 0.035);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();
    var nw = bw * 0.62, n0 = yb - bh * 0.86;
    ctx.fillStyle = "#d3d9d6";
    ctx.fillRect(x - nw / 2, n0, nw, top - n0 + bh * 0.03);
    rr(ctx, x - bw / 2, top, bw, yb - top, bw * 0.16);
    ctx.fillStyle = "#e4e8e6";
    ctx.fill();
    ctx.save();
    ctx.clip();
    var l0 = yb - bh * 0.62, l1 = yb - bh * 0.16;
    ctx.fillStyle = "#1d4650";
    ctx.fillRect(x - bw / 2, l0, bw, l1 - l0);
    ctx.fillStyle = "#e39a2c";
    ctx.fillRect(x - bw / 2, l1 - bh * 0.065, bw, bh * 0.024);
    ctx.fillStyle = "rgba(233,241,239,0.85)";
    ctx.fillRect(x - bw * 0.3, l0 + bh * 0.07, bw * 0.46, bh * 0.034);
    ctx.fillStyle = "rgba(233,241,239,0.45)";
    ctx.fillRect(x - bw * 0.3, l0 + bh * 0.13, bw * 0.3, bh * 0.022);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(x - bw * 0.36, top, bw * 0.09, yb - top);
    ctx.fillStyle = "rgba(10,25,30,0.26)";
    ctx.fillRect(x + bw * 0.18, top, bw * 0.32, yb - top);
    ctx.fillStyle = "rgba(10,25,30,0.14)";
    ctx.fillRect(x - bw / 2, top, bw * 0.08, yb - top);
    ctx.restore();
    if (hasCap) {
      var cw = bw * 0.7, c0 = yb - bh * 0.985, c1 = yb - bh * 0.85;
      rr(ctx, x - cw / 2, c0, cw, c1 - c0, bw * 0.04);
      ctx.fillStyle = "#17363e";
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,0.09)";
      for (var rx = x - cw / 2 + cw / 14; rx < x + cw / 2; rx += cw / 7) ctx.fillRect(rx, c0, 1, c1 - c0);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(x - cw * 0.34, c0, cw * 0.1, c1 - c0);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(x + cw * 0.18, c0, cw * 0.32, c1 - c0);
      ctx.restore();
      ellipse(ctx, x, c0, cw / 2, bh * 0.018);
      ctx.fillStyle = "#2a5a65";
      ctx.fill();
    } else {
      ellipse(ctx, x, n0, nw / 2, bh * 0.022);
      ctx.fillStyle = "#c3c9c6";
      ctx.fill();
      ellipse(ctx, x, n0 + 0.5, nw * 0.36, bh * 0.014);
      ctx.fillStyle = "#0e1417";
      ctx.fill();
    }
  }
  function capper(ctx, s, t, down) {
    var bw = s.bw, bh = s.bh, xc = s.xc;
    var cw = bw * 0.86, ch = bh * 0.2;
    var chuckBottom = s.capTop + bh * 0.02 - (1 - down) * bh * 0.34;
    var chuckTop = chuckBottom - ch;
    var houseBottom = s.capTop - bh * 0.62;
    ctx.fillStyle = "#8b969b";
    ctx.fillRect(xc - bw * 0.11, houseBottom, bw * 0.22, chuckTop - houseBottom + 2);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(xc - bw * 0.08, houseBottom, Math.max(1, bw * 0.03), chuckTop - houseBottom);
    rr(ctx, xc - cw / 2, chuckTop, cw, ch, bw * 0.05);
    ctx.fillStyle = "#3d484e";
    ctx.fill();
    ctx.save();
    ctx.clip();
    var spacing = cw / 6;
    var off = mod(t * 90 * down, spacing);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (var x = xc - cw / 2 - spacing + off; x < xc + cw / 2; x += spacing) ctx.fillRect(x, chuckTop, 2, ch);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(xc - cw * 0.36, chuckTop, cw * 0.1, ch);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(xc + cw * 0.2, chuckTop, cw * 0.3, ch);
    ctx.restore();
    ctx.fillStyle = "#15191c";
    ctx.fillRect(xc - cw * 0.42, chuckBottom - ch * 0.16, cw * 0.84, ch * 0.16);
    var hw = bw * 2.5;
    var hg = ctx.createLinearGradient(xc - hw / 2, 0, xc + hw / 2, 0);
    hg.addColorStop(0, "#2c353a");
    hg.addColorStop(0.32, "#566168");
    hg.addColorStop(1, "#20282c");
    ctx.fillStyle = hg;
    ctx.fillRect(xc - hw / 2, -10, hw, houseBottom + 10);
    ctx.fillStyle = "#1e252a";
    ctx.fillRect(xc - hw / 2 - 6, houseBottom - 10, hw + 12, 10);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(xc - hw / 2 - 6, houseBottom - 10, hw + 12, 1);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(xc + hw * 0.12, -10, 2, houseBottom - 10);
    var ly = Math.max(16, houseBottom - 30);
    glow(ctx, xc + hw * 0.32, ly, 14, [233, 160, 58], 0.3 + 0.6 * down);
    ellipse(ctx, xc + hw * 0.32, ly, 3, 3);
    ctx.fillStyle = down > 0.5 ? "#ffd58f" : "#b97c2f";
    ctx.fill();
  }

  var LINE = {
    start: 1.4,
    focus: null,
    setup: function (W, H, dpr, seed) {
      var s = { seed: seed, T: 2.2, move: 0.75 };
      s.bh = clamp(H * 0.36, 110, 230);
      s.bw = s.bh * 0.56;
      s.pitch = s.bw * 1.75;
      s.yb = H * 0.84;
      s.yb2 = H * 0.56;
      s.xc = W >= 760 ? W * 0.7 : W * 0.66;
      s.capTop = s.yb - s.bh * 0.985;
      s.bg = makeCanvas(W * dpr, H * dpr);
      var g = s.bg.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      lineStatic(g, s, W, H);
      s.fg = makeCanvas(W * dpr, H * dpr);
      var f = s.fg.getContext("2d");
      f.setTransform(dpr, 0, 0, dpr, 0, 0);
      lineFront(f, s, W, H);
      return s;
    },
    draw: function (ctx, s, t, W, H, mode) {
      if (mode === "blur") {
        ctx.drawImage(s.bg, 0, 0, W, H);
        var bh2 = s.bh * 0.5, p2 = bh2 * 0.56 * 1.9;
        var span = W + p2 * 2;
        for (var i = 0; i * p2 < span; i++) {
          smallBottle(ctx, mod(i * p2 - t * 42, span) - p2, s.yb2, bh2);
        }
        return;
      }
      ctx.drawImage(s.fg, 0, 0, W, H);
      var cy = cycle(t, s.T, s.move);
      var pan = cy.k + cy.m;
      var down = stroke(cy.p, 0.85, 1.15, 1.55, 1.9);
      var capped = cy.p > 1.15;
      var bh = s.bh, yb = s.yb;
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      var off = mod(pan * s.pitch, 26);
      for (var x = -26 + off; x < W + 26; x += 26) {
        ctx.beginPath();
        ctx.moveTo(x, yb - bh * 0.06);
        ctx.lineTo(x - 6, yb + bh * 0.05);
        ctx.stroke();
      }
      var iMin = Math.floor(pan - (W + s.bw - s.xc) / s.pitch) - 1;
      var iMax = Math.ceil(pan + (s.xc + s.bw) / s.pitch) + 1;
      for (var n = iMax; n >= iMin; n--) {
        var bx = s.xc + (pan - n) * s.pitch;
        if (bx < -s.bw || bx > W + s.bw) continue;
        bottle(ctx, s, bx, n <= cy.k || (n === cy.k + 1 && capped));
      }
      var ry = yb - bh * 0.28;
      for (var bx2 = 120; bx2 < W; bx2 += 260) {
        ctx.fillStyle = "#3f4a50";
        ctx.fillRect(bx2, ry, 7, yb + bh * 0.05 - ry);
      }
      ctx.fillStyle = "#7d888e";
      ctx.fillRect(0, ry - 2, W, 4);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillRect(0, ry - 2, W, 1);
      capper(ctx, s, t, down);
    }
  };

  var SCENES = { turret: TURRET, vials: VIALS, line: LINE };

  /* =====================================================================
     Banner controller
     ===================================================================== */
  function Banner(el, cv) {
    this.el = el;
    this.cv = cv;
    this.ctx = cv.getContext("2d");
    this.scene = SCENES[cv.getAttribute("data-scene")] || TURRET;
    this.seed = parseInt(cv.getAttribute("data-seed") || "7", 10) || 7;
    this.time = this.scene.start;
    this.last = 0;
    this.inView = true;
    this.ready = false;
    this.btn = el.querySelector(".banner-pause");
    this.resize();
  }
  Banner.prototype.resize = function () {
    var W = this.el.clientWidth, H = this.el.clientHeight;
    if (!W || !H) { this.ready = false; return; }
    if (this.ready && W === this.W && H === this.H) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.W = W; this.H = H; this.dpr = dpr;
    this.cv.width = Math.round(W * dpr);
    this.cv.height = Math.round(H * dpr);
    this.sharp = makeCanvas(this.cv.width, this.cv.height);
    this.low = makeCanvas(W / 4, H / 4);
    this.low2 = makeCanvas(W / 9, H / 9);
    this.state = this.scene.setup(W, H, dpr, this.seed);
    var sx = this.sharp.getContext("2d");
    var f = this.scene.focus;
    this.mask = null;
    if (f) {
      var m = sx.createLinearGradient(0, 0, 0, H);
      m.addColorStop(0, "rgba(0,0,0,0)");
      m.addColorStop(f[0], "rgba(0,0,0,0)");
      m.addColorStop(f[1], "rgba(0,0,0,1)");
      m.addColorStop(f[2], "rgba(0,0,0,1)");
      m.addColorStop(f[3], "rgba(0,0,0," + f[4] + ")");
      this.mask = m;
    }
    var R = Math.max(W, H);
    var v = this.ctx.createRadialGradient(W * 0.6, H * 0.45, R * 0.15, W * 0.6, H * 0.45, R * 0.85);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.5)");
    this.vig = v;
    this.grain = this.ctx.createPattern(GRAIN, "repeat");
    this.moteCount = Math.round(W * H / 18000);
    this.ready = true;
  };
  Banner.prototype.render = function () {
    if (!this.ready) return;
    var W = this.W, H = this.H, dpr = this.dpr, s = this.state, t = this.time, sc = this.scene, c = this.ctx;

    var l = this.low.getContext("2d");
    l.setTransform(this.low.width / W, 0, 0, this.low.height / H, 0, 0);
    l.clearRect(0, 0, W, H);
    sc.draw(l, s, t, W, H, "blur");
    var l2 = this.low2.getContext("2d");
    l2.imageSmoothingEnabled = true;
    l2.clearRect(0, 0, this.low2.width, this.low2.height);
    l2.drawImage(this.low, 0, 0, this.low2.width, this.low2.height);

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.fillStyle = "#0b1317";
    c.fillRect(0, 0, this.cv.width, this.cv.height);
    c.drawImage(this.low2, 0, 0, this.cv.width, this.cv.height);

    var x = this.sharp.getContext("2d");
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.globalCompositeOperation = "source-over";
    x.clearRect(0, 0, W, H);
    sc.draw(x, s, t, W, H, "sharp");
    if (this.mask) {
      x.globalCompositeOperation = "destination-in";
      x.fillStyle = this.mask;
      x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = "source-over";
    }
    c.drawImage(this.sharp, 0, 0);

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (sc.over) sc.over(c, s, t, W, H);
    motes(c, W, H, t, this.seed, this.moteCount);
    c.fillStyle = this.vig;
    c.fillRect(0, 0, W, H);
    if (this.grain) {
      c.save();
      c.globalAlpha = 0.1;
      c.globalCompositeOperation = "overlay";
      var ox = (Math.random() * 160) | 0, oy = (Math.random() * 160) | 0;
      c.translate(-ox, -oy);
      c.fillStyle = this.grain;
      c.fillRect(ox, oy, W, H);
      c.restore();
    }
  };

  var items = [];
  Array.prototype.forEach.call(nodes, function (el) {
    var cv = el.querySelector(".banner-canvas");
    if (!cv || !cv.getContext) return;
    var b = new Banner(el, cv);
    try { b.render(); } catch (e) { /* leave the banner's background color showing */ }
    items.push(b);
  });
  if (!items.length) return;

  var raf = 0;
  function active(b) { return !paused && !reduceMotion && b.inView && b.ready && !document.hidden; }
  function frame(now) {
    raf = 0;
    var any = false;
    for (var i = 0; i < items.length; i++) {
      var b = items[i];
      if (active(b)) {
        var dt = b.last ? Math.min((now - b.last) / 1000, 0.1) : 0;
        b.last = now;
        b.time += dt;
        b.render();
        any = true;
      } else {
        b.last = 0;
      }
    }
    if (any) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (!raf && !paused && !reduceMotion) raf = requestAnimationFrame(frame);
  }

  function syncButtons() {
    items.forEach(function (b) {
      if (!b.btn) return;
      if (reduceMotion) { b.btn.hidden = true; return; }
      b.btn.setAttribute("aria-pressed", paused ? "true" : "false");
      b.btn.setAttribute("aria-label", paused ? "Play background animation" : "Pause background animation");
    });
  }
  items.forEach(function (b) {
    if (!b.btn) return;
    b.btn.addEventListener("click", function () {
      paused = !paused;
      try { window.localStorage.setItem(PAUSE_KEY, paused ? "1" : "0"); } catch (e) { /* storage unavailable */ }
      syncButtons();
      kick();
    });
  });
  syncButtons();

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        items.forEach(function (b) { if (b.el === en.target) b.inView = en.isIntersecting; });
      });
      kick();
    });
    items.forEach(function (b) { io.observe(b.el); });
  }
  if ("ResizeObserver" in window) {
    var ro = new ResizeObserver(function () {
      items.forEach(function (b) {
        var w = b.el.clientWidth, h = b.el.clientHeight;
        if (!b.ready || w !== b.W || h !== b.H) {
          b.resize();
          try { b.render(); } catch (e) { /* keep last frame */ }
        }
      });
    });
    items.forEach(function (b) { ro.observe(b.el); });
  }
  document.addEventListener("visibilitychange", kick);
  kick();
})();
