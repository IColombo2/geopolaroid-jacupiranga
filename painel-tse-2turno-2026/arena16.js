/* arena16.js — Arena 16 bits: pixel art procedural (sem imagens, sem rede). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Arena16 = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const root = typeof self !== "undefined" ? self : globalThis;
  const SW = 40, SH = 48, BW = 128, BH = 96;
  const CH = {
    lula:   { skin: "#d8a07a", skinD: "#b57d5a", hair: "#dcdcd8", hairD: "#a8a8a4", beard: "#efefec", tie: "#e63946", tieD: "#a8232f", beardOn: true,  flip: false },
    flavio: { skin: "#e2ac85", skinD: "#bd8661", hair: "#2b2321", hairD: "#15100f", beard: null,      tie: "#2b8cff", tieD: "#1760b1", beardOn: false, flip: true }
  };
  const SUIT = "#1b2640", SUITL = "#2e3f6b", SHIRT = "#f2f2ee", PANTS = "#141b2d", SHOE = "#07090f", INK = "#12161f", SHADOW = "rgba(0,0,0,.35)";

  /* f/b = [cotovelo x, y, punho x, y] (braço da frente / de trás). Ombros: frente (26,20), trás (14,20). */
  const POSE = {
    idle0:     { dx: 0,  dy: 0, hx: 0,  hy: 0, eyes: "open",   f: [29, 25, 31, 19], b: [13, 26, 16, 21] },
    idle1:     { dx: 0,  dy: 1, hx: 0,  hy: 0, eyes: "open",   f: [29, 26, 31, 20], b: [13, 27, 16, 22] },
    light:     { dx: 1,  dy: 0, hx: 0,  hy: 0, eyes: "open",   f: [29, 21, 33, 20], b: [13, 26, 16, 21] },
    strong:    { dx: 3,  dy: 0, hx: 1,  hy: 0, eyes: "open",   f: [31, 21, 35, 21], b: [13, 26, 16, 21] },
    hit:       { dx: -2, dy: 0, hx: -1, hy: 0, eyes: "closed", f: [25, 28, 25, 33], b: [14, 28, 14, 33] },
    cheer:     { dx: 0,  dy: 0, hx: 0,  hy: 0, eyes: "open",   f: [30, 13, 31, 7],  b: [10, 13, 9, 7] },
    guardHigh: { dx: 0,  dy: 0, hx: 0,  hy: 0, eyes: "open",   f: [30, 18, 29, 11], b: [13, 26, 16, 21] },
    pre:       { dx: 0,  dy: 0, hx: 0,  hy: 0, eyes: "open",   f: [26, 28, 26, 33], b: [14, 28, 14, 33] },
    final:     { dx: 0,  dy: 0, hx: 0,  hy: 0, eyes: "open",   f: [26, 28, 26, 33], b: [14, 28, 14, 33] }
  };

  function limb(R, x0, y0, x1, y1, col) {
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx - dy, x = x0, y = y0;
    for (;;) { R(x - 1, y - 1, 3, 3, col); if (x === x1 && y === y1) break; const e2 = 2 * e; if (e2 > -dy) { e -= dy; x += sx; } if (e2 < dx) { e += dx; y += sy; } }
  }

  function drawChar(ctx, key, poseName) {
    const c = CH[key], p = POSE[poseName] || POSE.idle0;
    ctx.clearRect(0, 0, SW, SH);
    const R = (x, y, w, h, col, ox, oy) => {
      x += p.dx + (ox || 0); y += p.dy + (oy || 0);
      if (c.flip) x = SW - x - w;
      ctx.fillStyle = col; ctx.fillRect(x, y, w, h);
    };
    const H = (x, y, w, h, col) => R(x, y, w, h, col, p.hx, p.hy);
    const arm = (a, fromX) => { limb(R, fromX, 20, a[0], a[1], SUIT); R(a[2] - 2, a[3] - 2, 4, 4, c.skin); R(a[2] - 2, a[3] + 1, 4, 1, c.skinD); };
    R(8, 46, 24, 2, SHADOW, -p.dx, -p.dy);                       // sombra
    arm(p.b, 14);                                                  // braço de trás
    R(15, 33, 4, 11, PANDS()); R(21, 33, 4, 11, PANDS());          // pernas
    R(14, 44, 6, 2, SHOE); R(20, 44, 6, 2, SHOE);                  // sapatos
    R(13, 18, 14, 15, SUIT); R(16, 19, 1, 9, SUITL); R(24, 19, 1, 9, SUITL); // terno
    R(18, 18, 4, 7, SHIRT); R(19, 19, 2, 10, c.tie); R(20, 20, 1, 8, c.tieD); // camisa e gravata
    H(18, 15, 4, 3, c.skinD);                                      // pescoço
    H(15, 4, 10, 11, c.skin); H(14, 8, 1, 3, c.skinD); H(25, 8, 1, 3, c.skinD); // cabeça e orelhas
    if (key === "lula") { H(14, 3, 12, 3, c.hair); H(14, 6, 2, 4, c.hair); H(24, 6, 2, 3, c.hair); H(16, 5, 8, 1, c.hairD); }
    else { H(14, 2, 12, 4, c.hair); H(15, 6, 7, 1, c.hair); H(14, 6, 1, 3, c.hair); H(25, 6, 1, 2, c.hair); H(17, 2, 5, 1, "#463a36"); }
    if (p.eyes === "open") { H(17, 8, 2, 1, INK); H(22, 8, 2, 1, INK); H(17, 7, 3, 1, c.hairD); H(22, 7, 3, 1, c.hairD); }
    else { H(17, 9, 2, 1, INK); H(22, 9, 2, 1, INK); }
    H(20, 9, 1, 3, c.skinD);                                       // nariz
    if (c.beardOn) { H(16, 11, 8, 4, c.beard); H(17, 11, 6, 1, "#f8f8f5"); H(19, 13, 3, 1, "#6a4a3d"); }
    else H(19, 13, 3, 1, "#8a5a48");
    arm(p.f, 26);                                                  // braço da frente
  }
  function PANDS() { return PANTS; }

  /* Ministro Cristiano Zanin (estilizado): toga preta, gola branca, óculos, segurando a decisão. frame 0/1 = respiração */
  function drawZanin(ctx, frame) {
    ctx.clearRect(0, 0, SW, SH);
    const dy = frame ? 1 : 0;
    const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y + dy, w, h); };
    ctx.fillStyle = SHADOW; ctx.fillRect(8, 46, 24, 2);
    R(8, 20, 5, 17, "#0b0d12"); R(27, 20, 5, 17, "#0b0d12"); R(11, 18, 18, 27, "#0b0d12");
    R(16, 22, 1, 22, "#1b2030"); R(23, 22, 1, 22, "#1b2030"); R(9, 21, 1, 14, "#1b2030"); R(30, 21, 1, 14, "#1b2030");
    R(14, 44, 5, 2, SHOE); R(21, 44, 5, 2, SHOE);
    R(16, 18, 8, 9, SHIRT); R(19, 19, 2, 8, "#c9ccd6"); R(16, 18, 1, 9, "#d9dbe3"); R(23, 18, 1, 9, "#d9dbe3");
    R(18, 15, 4, 3, "#b98a68");
    R(15, 4, 10, 11, "#d9a47e"); R(14, 8, 1, 3, "#b98a68"); R(25, 8, 1, 3, "#b98a68");
    R(14, 2, 12, 3, "#1c1a1d"); R(14, 5, 2, 3, "#1c1a1d"); R(24, 5, 2, 3, "#1c1a1d"); R(14, 6, 1, 2, "#8d8d94"); R(25, 6, 1, 2, "#8d8d94");
    R(16, 7, 4, 3, "#101218"); R(21, 7, 4, 3, "#101218"); R(17, 8, 2, 1, "#cfe3f3"); R(22, 8, 2, 1, "#cfe3f3"); R(20, 8, 1, 1, "#101218");
    R(18, 8, 1, 1, INK); R(23, 8, 1, 1, INK); R(20, 10, 1, 2, "#b98a68"); R(18, 13, 4, 1, "#8a5a48");
    R(14, 31, 12, 8, "#f5f0dc"); R(15, 33, 10, 1, "#b9b49a"); R(15, 35, 10, 1, "#b9b49a"); R(15, 37, 7, 1, "#b9b49a");
    R(12, 32, 3, 3, "#d9a47e"); R(25, 32, 3, 3, "#d9a47e");
  }

  function drawBG(ctx) {
    const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
    const line = (x0, y0, x1, y1, col) => { let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx - dy; for (;;) { R(x0, y0, 1, 1, col); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 > -dy) { e -= dy; x0 += sx; } if (e2 < dx) { e += dx; y0 += sy; } } };
    let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const S = ["#0a1024", "#0f1833", "#152245", "#1f2f5c", "#2e3d76", "#4a4a86", "#7a5a8c", "#b0708a"];
    for (let i = 0; i < S.length; i++) { R(0, i * 6, BW, i === S.length - 1 ? 24 : 6, S[i]); if (i < S.length - 1) for (let x = 0; x < BW; x += 2) R(x + (i & 1), i * 6 + 5, 1, 1, S[i + 1]); }
    for (let i = 0; i < 28; i++) { const x = (rnd() * BW) | 0, y = (rnd() * 30) | 0; R(x, y, 1, 1, rnd() < .3 ? "#ffffff" : "#9fb0d8"); }
    // praça primeiro (nada sobrescreve a fachada nem a rampa)
    R(0, 66, BW, 30, "#262d3f");
    [67, 70, 74, 80, 88].forEach(y => R(0, y, BW, 1, "#343d55"));
    for (let i = 0; i <= 8; i++) line(64, 66, i * 16, 95, "#303850");
    R(40, 84, 48, 2, "#3b4663");
    // Palácio do Planalto: laje longa em balanço, colunas esbeltas com base/topo alargados, vidro iluminado
    R(10, 30, 102, 2, "#f6f9fc"); R(8, 32, 106, 4, "#e9eef4"); R(8, 36, 106, 1, "#7f8da1"); R(10, 37, 102, 1, "#3e4c61");
    R(14, 38, 94, 20, "#17324a");
    for (let x = 14; x < 108; x += 6) { R(x, 38, 1, 20, "#2d5a78"); for (let y = 41; y < 56; y += 6) if (rnd() < .4) R(x + 2, y, 3, 3, "#f5c451"); }
    const n = 17;
    for (let i = 0; i < n; i++) {
      const cx = 15 + Math.round(i * (92 / (n - 1)));
      R(cx - 1, 38, 3, 2, "#f3f6fa"); R(cx - 1, 40, 2, 2, "#f3f6fa");           // capitel
      R(cx, 42, 1, 12, "#f3f6fa");                                              // fuste fino
      R(cx - 1, 54, 2, 2, "#f3f6fa"); R(cx - 1, 56, 3, 2, "#f3f6fa"); R(cx + 1, 56, 1, 2, "#aab6c6"); // base alargada
    }
    R(8, 58, 106, 2, "#d7dee8"); R(8, 60, 106, 1, "#8a97aa"); R(6, 61, 110, 2, "#aeb9c8"); R(4, 63, 114, 3, "#8f9bb0");
    // rampa central característica, subindo da praça até a plataforma, com guarda-corpo e sombra
    for (let x = 26; x <= 66; x++) {
      const y = 82 - (((x - 26) * 18 / 40) | 0);
      R(x, y, 1, 3, "#eef2f7"); R(x, y + 3, 1, 2, "#6f7c92"); R(x, y - 3, 1, 1, "#cdd5e0"); if ((x & 3) === 0) R(x, y - 2, 1, 2, "#cdd5e0");
    }
    // mastro e bandeira (verde, losango amarelo, círculo azul)
    R(116, 14, 1, 52, "#c7cfda"); R(115, 13, 3, 1, "#e6c34d"); R(117, 15, 11, 7, "#1f9d55");
    [1, 3, 5, 7, 5, 3, 1].forEach((w, i) => R(122 - (w >> 1), 15 + i, w, 1, "#f7d117")); R(121, 17, 3, 3, "#2c4a9a");
    // luz vermelha à esquerda e azul à direita (degraus discretos)
    [.22, .16, .10, .05].forEach((a, i) => { R(i * 6, 0, 6, BH, `rgba(230,57,70,${a})`); R(BW - (i + 1) * 6, 0, 6, BH, `rgba(43,140,255,${a})`); });
  }

  /* ---------- controlador ---------- */
  const ctl = { ready: false, phase: "live", winner: null, pause: false, tick: 0, token: 0, timers: [], loop: null, cv: {}, ctx: {} };
  const ov = { lula: null, flavio: null };
  const motionOK = () => !(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  function pose(side) { if (ctl.pause) return "pre"; if (ov[side]) return ov[side]; if (ctl.phase === "pre") return "pre"; if (ctl.phase === "final") { if (side === ctl.winner) return ctl.tick % 2 ? "cheer" : "strong"; return "final"; } return ctl.tick % 2 ? "idle1" : "idle0"; }
  function redraw() { if (!ctl.ready) return; drawChar(ctl.ctx.lula, "lula", pose("lula")); drawChar(ctl.ctx.flavio, "flavio", pose("flavio")); if (ctl.ctx.zanin && ctl.pause) drawZanin(ctl.ctx.zanin, ctl.tick % 2); }
  function clearTimers() { ctl.timers.forEach(clearTimeout); ctl.timers = []; }
  function stopLoop() { if (ctl.loop) { clearInterval(ctl.loop); ctl.loop = null; } }
  function startLoop() {
    stopLoop(); if (!ctl.ready || !motionOK() || !(ctl.pause || ctl.phase === "live" || ctl.phase === "final")) return;
    ctl.loop = setInterval(() => { const d = root.document; if (d && (d.hidden || !ctl.cv.lula.offsetParent)) return; ctl.tick++; redraw(); }, 600);
  }
  function init(doc) {
    doc = doc || root.document; const q = id => doc.getElementById(id);
    try {
      ctl.cv = { bg: q("cvBG"), lula: q("cvLula"), flavio: q("cvFlavio") };
      for (const k in ctl.cv) { if (!ctl.cv[k]) throw new Error("canvas"); ctl.ctx[k] = ctl.cv[k].getContext("2d"); if (!ctl.ctx[k]) throw new Error("ctx"); }
      const zc = q("cvZanin"); if (zc && zc.getContext) ctl.ctx.zanin = zc.getContext("2d"); drawBG(ctl.ctx.bg); ctl.ready = true; redraw(); startLoop();
    } catch (e) { if (root.console) console.warn("Arena16:", e && e.message); ctl.ready = false; const st = q("arenaStage"); if (st) st.classList.add("arena16-off"); }
  }
  function setPhase(ph) { if (ph === ctl.phase) { redraw(); startLoop(); return; } ctl.phase = ph; clearTimers(); ctl.token++; ov.lula = ov.flavio = null; redraw(); startLoop(); }
  function setPause(on) { on = !!on; if (on === ctl.pause) return; ctl.pause = on; clearTimers(); ctl.token++; ov.lula = ov.flavio = null; redraw(); startLoop(); }
  function setWinner(who) { ctl.winner = who === "lula" || who === "flavio" ? who : null; redraw(); startLoop(); }
  /* ev = saída de TSECore.classify: {level:'none|light|strong|flip', who:'lula|flavio|null', milestone:number|null} */
  function play(ev) {
    if (!ctl.ready || ctl.pause || !motionOK() || !ev || ctl.phase !== "live") return;
    const tok = ++ctl.token; clearTimers(); ov.lula = ov.flavio = null;
    const who = ev.who, other = who === "lula" ? "flavio" : "lula";
    const set = (side, p) => { ov[side] = p; redraw(); };
    const at = (ms, fn) => ctl.timers.push(setTimeout(() => { if (tok === ctl.token) fn(); }, ms));
    const end = () => { ov.lula = ov.flavio = null; redraw(); };
    if (who && ev.level === "light") { set(who, "light"); at(120, () => set(other, "hit")); at(750, end); }
    else if (who && ev.level === "strong") { set(who, "strong"); at(120, () => set(other, "hit")); at(950, end); }
    else if (who && ev.level === "flip") { set(who, "strong"); at(120, () => set(other, "hit")); at(700, () => { set(who, "cheer"); set(other, "idle0"); }); at(1900, end); }
    else if (ev.milestone) { set("lula", "guardHigh"); set("flavio", "guardHigh"); at(900, end); }
  }
  return { init, setPhase, setWinner, setPause, play, SW, SH, BW, BH, _drawChar: drawChar, _drawBG: drawBG, _POSES: Object.keys(POSE) };
});
