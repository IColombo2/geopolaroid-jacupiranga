/* prorrogacao.js — estado especial "votação prorrogada" da Arena.
   Só é ativado por ./prorrogacao.json, editado manualmente depois de confirmação oficial.
   Nenhuma informação é inferida: sem arquivo, 404, JSON inválido ou "ativo": false => nada muda. */
(function () {
  "use strict";
  const URL_CFG = "./prorrogacao.json", POLL_MS = 60000, POLL_DONE_MS = 300000, BANNER_MS = 8000, LATE_MS = 5 * 60000;
  const $ = id => document.getElementById(id);
  const S = { cfg: null, skew: 0, on: false, resumedFor: 0, bannerTimer: 0, pollTimer: 0 };
  const now = () => Date.now() + S.skew;

  function parse(j) {
    if (!j || j.ativo !== true) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j.data) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(j.ate)) return null;
    const t = Date.parse(j.data + "T" + j.ate + ":00-03:00");   // horário de Brasília
    if (!Number.isFinite(t) || Math.abs(Date.now() - t) > 36 * 3600e3) return null;
    return { ate: j.ate, deadline: t, fonte: typeof j.fonte === "string" ? j.fonte.trim().slice(0, 160) : "" };
  }
  const hLabel = ate => { const [h, m] = ate.split(":"); return m === "00" ? Number(h) + "H" : Number(h) + "H" + m; };

  async function load() {
    if (document.hidden) return;
    try {
      const r = await fetch(URL_CFG, { cache: "no-cache" });
      if (r.status === 404) S.cfg = null;
      else if (r.ok) {
        const d = Date.parse(r.headers.get("Date") || "");
        if (Number.isFinite(d) && Math.abs(d - Date.now()) < 12 * 3600e3) S.skew = d - Date.now();
        S.cfg = parse(await r.json());
      }
    } catch (e) { /* falha de rede: mantém o último estado válido */ }
    evaluate();
  }
  function schedule() {
    clearTimeout(S.pollTimer);
    const done = S.cfg && now() >= S.cfg.deadline + LATE_MS;
    S.pollTimer = setTimeout(async () => { await load(); schedule(); }, (done ? POLL_DONE_MS : POLL_MS) * (.9 + Math.random() * .2));
  }

  function show(id, on) { const e = $(id); if (e) e.hidden = !on; }
  function say(m) { const a = $("srAnnounce"); if (a) a.textContent = m; }
  function banner() {
    show("extResume", true); say("Votação encerrada — apuração retomada.");
    const ev = $("combatEvent"); if (ev) ev.textContent = "Votação encerrada — apuração retomada.";
    clearTimeout(S.bannerTimer); S.bannerTimer = setTimeout(() => show("extResume", false), BANNER_MS);
  }
  function enter() {
    S.on = true; const c = S.cfg, sh = $("arenaShell");
    if (sh) sh.dataset.ext = "on";
    const pl = $("extPlaque"); if (pl) pl.textContent = "VOTAÇÃO PRORROGADA ATÉ " + hLabel(c.ate);
    const at = $("extAt"); if (at) at.textContent = c.ate;
    const fs = $("extSrc"); if (fs) { fs.textContent = c.fonte ? "Fonte: " + c.fonte : ""; fs.hidden = !c.fonte; }
    show("extResume", false); show("extPlaque", true); show("extZanin", true); show("extBox", true);
    if (window.Arena16) Arena16.setPause(true);
    const m = "Votação prorrogada até " + hLabel(c.ate) + ". Luta pausada; retomada às " + c.ate + ".";
    const ev = $("combatEvent"); if (ev) ev.textContent = m; say(m);
  }
  function leave(byDeadline) {
    S.on = false; const sh = $("arenaShell"); if (sh) sh.dataset.ext = "off";
    show("extPlaque", false); show("extZanin", false); show("extBox", false);
    if (window.Arena16) Arena16.setPause(false);
    if (byDeadline) { S.resumedFor = S.cfg.deadline; banner(); }
  }
  function evaluate() {
    const sh = $("arenaShell"), c = S.cfg, final = sh && sh.dataset.phase === "final";
    const active = !!c && !final && now() < c.deadline;
    if (active && !S.on) enter();
    else if (!active && S.on) leave(!!c && !final && now() >= c.deadline);
    else if (!S.on && c && !final && now() >= c.deadline && now() < c.deadline + LATE_MS && S.resumedFor !== c.deadline) { S.resumedFor = c.deadline; banner(); }
    else if (S.on && c && $("extAt") && $("extAt").textContent !== c.ate) enter();   // arquivo corrigido durante a prorrogação
  }

  window.Prorrogacao = { active: () => S.on, at: () => (S.cfg ? S.cfg.ate : ""), evaluate };
  function start() { load().then(schedule); setInterval(evaluate, 1000); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
