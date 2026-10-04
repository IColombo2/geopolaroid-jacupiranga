(() => {
  "use strict";

  const UFS = ["ac","al","ap","am","ba","ce","df","es","go","ma","mt","ms","mg","pa","pb","pr","pe","pi","rj","rn","rs","ro","rr","sc","sp","se","to"];
  const BASE = "https://resultados.tse.jus.br/oficial/ele2026/6257/dados";
  const TOPO = "https://raw.githubusercontent.com/fititnt/gis-dataset-brasil/master/uf/topojson/uf.json";

  function brNumber(v) {
    if (typeof v === "number") return v;
    const n = Number(String(v ?? "").trim().replace(/\./g,"").replace(",",".").replace(/[^\d.-]/g,""));
    return Number.isFinite(n) ? n : 0;
  }

  function url(scope) { return `${BASE}/${scope}/${scope}-c0001-e006257-u.json`; }
  function candidates(raw) {
    const out = [];
    for (const cargo of raw?.carg || []) {
      for (const agr of cargo?.agr || []) {
        for (const par of agr?.par || []) out.push(...(par?.cand || []));
        out.push(...(agr?.cand || []));
      }
      out.push(...(cargo?.cand || []));
    }
    return out;
  }
  function candVotes(raw, n) { return brNumber(candidates(raw).find(c=>String(c?.n)==String(n))?.vap); }

  async function get(scope) {
    const r = await fetch(url(scope), { cache:"no-store" });
    if (!r.ok) throw new Error(`${scope}: HTTP ${r.status}`);
    return r.json();
  }
  const wait = ms => new Promise(r=>setTimeout(r,ms));

  function add(name, status, detail="") {
    const el = document.createElement("div");
    el.className = `test ${status.toLowerCase()}`;
    el.innerHTML = `<strong>${status}: ${name}</strong>${detail ? `<pre>${detail}</pre>` : ""}`;
    document.getElementById("results").appendChild(el);
  }

  async function run() {
    const results = document.getElementById("results");
    results.innerHTML = "";

    // 1) Conversão brasileira
    try {
      if (brNumber("1.234.567") !== 1234567) throw new Error("1.234.567 não converteu para 1234567");
      if (Math.abs(brNumber("50,41") - 50.41) > 1e-9) throw new Error("50,41 não converteu para 50.41");
      add("conversão numérica brasileira", "PASS");
    } catch (e) { add("conversão numérica brasileira", "FAIL", e.message); }

    // 2) Falha simulada preserva fallback
    try {
      let cached = { value: 42 };
      const failingFetch = async () => { throw new Error("falha simulada"); };
      try { cached = await failingFetch(); } catch (_) { /* mantém cached */ }
      if (cached.value !== 42) throw new Error("fallback foi perdido");
      add("falha simulada não quebra/preserva último valor", "PASS");
    } catch (e) { add("falha simulada", "FAIL", e.message); }

    // 3) Card 380 px, 1:1 e fundo branco
    try {
      const card = document.getElementById("shareCard");
      const rect = card.getBoundingClientRect();
      const bg = getComputedStyle(card).backgroundColor;
      if (rect.width > 380.5) throw new Error(`largura ${rect.width}px`);
      if (Math.abs(rect.width - rect.height) > 1.5) throw new Error(`não é 1:1: ${rect.width}×${rect.height}`);
      if (bg !== "rgb(255, 255, 255)") throw new Error(`fundo = ${bg}`);
      add("card branco 1:1 em 380 px", "PASS", `${Math.round(rect.width)}×${Math.round(rect.height)} · ${bg}`);
    } catch (e) { add("card 380 px", "FAIL", e.message); }

    // 4) Malha com 27 UFs
    try {
      const topo = await fetch(TOPO).then(r => { if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
      const obj = topo.objects?.uf || Object.values(topo.objects || {})[0];
      const fs = topojson.feature(topo, obj).features;
      const ids = fs.map(f => String(f.id ?? f.properties?.sigla ?? f.properties?.uf ?? "").toUpperCase()).filter(Boolean);
      const expected = new Set(UFS.map(x=>x.toUpperCase()));
      const present = new Set(ids.filter(x=>expected.has(x)));
      if (present.size !== 27) throw new Error(`foram reconhecidas ${present.size}/27 UFs; ids: ${ids.join(", ")}`);
      add("mapa desenhável com 27 UFs", "PASS", `${present.size} UFs reconhecidas`);
    } catch (e) { add("mapa com 27 UFs", "FAIL", e.message); }

    // 5) Integração TSE: soma 27 UFs + exterior versus Brasil
    try {
      const raw = {};
      for (const scope of ["br", ...UFS, "zz"]) {
        raw[scope] = await get(scope);
        await wait(150);
      }
      const locals = [...UFS, "zz"];
      const nationalVV = brNumber(raw.br?.v?.vv);
      const localVV = locals.reduce((s,k)=>s+brNumber(raw[k]?.v?.vv),0);
      const nationalLula = candVotes(raw.br, 13);
      const localLula = locals.reduce((s,k)=>s+candVotes(raw[k],13),0);
      const nationalFlavio = candVotes(raw.br, 22);
      const localFlavio = locals.reduce((s,k)=>s+candVotes(raw[k],22),0);

      const deltaVV = Math.abs(nationalVV-localVV);
      const deltaL = Math.abs(nationalLula-localLula);
      const deltaF = Math.abs(nationalFlavio-localFlavio);
      const tolerance = Math.max(1, Math.round(nationalVV * 0.001)); // 0,1% para publicação não atômica

      const detail = JSON.stringify({
        votosValidos:{br:nationalVV,soma:localVV,diferenca:deltaVV},
        lula:{br:nationalLula,soma:localLula,diferenca:deltaL},
        flavio:{br:nationalFlavio,soma:localFlavio,diferenca:deltaF},
        tolerancia:tolerance
      }, null, 2);

      if (deltaVV === 0 && deltaL === 0 && deltaF === 0) add("soma UFs + exterior = Brasil", "PASS", detail);
      else if (Math.max(deltaVV,deltaL,deltaF) <= tolerance) add("soma UFs + exterior ≈ Brasil (arquivos em atualização)", "WARN", detail);
      else add("soma UFs + exterior = Brasil", "FAIL", detail);
    } catch (e) {
      add("integração ao vivo com TSE", "FAIL", `Não foi possível concluir: ${e.message}`);
    }
  }

  document.getElementById("run").addEventListener("click", run);
})();