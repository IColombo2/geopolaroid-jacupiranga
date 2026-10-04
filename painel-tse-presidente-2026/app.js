(() => {
  "use strict";

  const CONFIG = {
    yearPath: "ele2026",
    electionId: "6257",
    office: "0001",
    baseOrigin: "https://resultados.tse.jus.br/oficial",
    topoUrl: "https://raw.githubusercontent.com/fititnt/gis-dataset-brasil/master/uf/topojson/uf.json",
    refreshMs: 60_000,
    requestGapMs: 150,
    fetchTimeoutMs: 12_000,
    historyKey: "tse2026_presidente_history_v1",
    themeKey: "tse2026_theme",
    cachePrefix: "tse2026_presidente_cache_",
    candidates: {
      lula: { number: "13", fallbackName: "Lula", party: "PT", color: "#A32D2D" },
      flavio: { number: "22", fallbackName: "Flávio Bolsonaro", party: "PL", color: "#185FA5" }
    }
  };

  const UFS = ["ac","al","ap","am","ba","ce","df","es","go","ma","mt","ms","mg","pa","pb","pr","pe","pi","rj","rn","rs","ro","rr","sc","sp","se","to"];
  const SCOPES = ["br", ...UFS, "zz"];

  const REGIONS = {
    "Norte": ["AC","AP","AM","PA","RO","RR","TO"],
    "Nordeste": ["AL","BA","CE","MA","PB","PE","PI","RN","SE"],
    "Centro-Oeste": ["DF","GO","MT","MS"],
    "Sudeste": ["ES","MG","RJ","SP"],
    "Sul": ["PR","RS","SC"]
  };

  const state = {
    data: new Map(),
    failed: new Set(),
    topology: null,
    mapLayer: "leader",
    lastNationalFetchAt: 0,
    refreshInProgress: false,
    timer: null
  };

  function brNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const normalized = String(value)
      .trim()
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatInt(value) {
    return Math.round(brNumber(value)).toLocaleString("pt-BR");
  }

  function formatPct(value, digits = 2) {
    return `${brNumber(value).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function electionCode() {
    return String(CONFIG.electionId).padStart(6, "0");
  }

  function dataUrl(scope) {
    return `${CONFIG.baseOrigin}/${CONFIG.yearPath}/${CONFIG.electionId}/dados/${scope}/${scope}-c${CONFIG.office}-e${electionCode()}-u.json`;
  }

  async function fetchJsonWithTimeout(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.fetchTimeoutMs);
    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function allCandidateNodes(raw) {
    const out = [];
    const cargos = Array.isArray(raw?.carg) ? raw.carg : [];
    for (const cargo of cargos) {
      const ags = Array.isArray(cargo?.agr) ? cargo.agr : [];
      for (const agr of ags) {
        const parties = Array.isArray(agr?.par) ? agr.par : [];
        for (const party of parties) {
          const candidates = Array.isArray(party?.cand) ? party.cand : [];
          out.push(...candidates);
        }
        if (Array.isArray(agr?.cand)) out.push(...agr.cand);
      }
      if (Array.isArray(cargo?.cand)) out.push(...cargo.cand);
    }
    return out;
  }

  function candidateFrom(raw, key) {
    const cfg = CONFIG.candidates[key];
    const node = allCandidateNodes(raw).find(c => String(c?.n ?? "").trim() === cfg.number);
    return {
      number: cfg.number,
      party: cfg.party,
      name: node?.nmu || cfg.fallbackName,
      votes: brNumber(node?.vap),
      pct: brNumber(node?.pvap)
    };
  }

  function normalize(raw, scope) {
    const section = raw?.s || {};
    const votes = raw?.v || {};
    return {
      scope: scope.toUpperCase(),
      dg: raw?.dg || "",
      hg: raw?.hg || "",
      sectionsTotal: brNumber(section?.ts),
      sectionsDone: brNumber(section?.st),
      sectionsPct: brNumber(section?.pst),
      validVotes: brNumber(votes?.vv),
      blankVotes: brNumber(votes?.vb),
      nullVotes: brNumber(votes?.tvn),
      lula: candidateFrom(raw, "lula"),
      flavio: candidateFrom(raw, "flavio"),
      raw
    };
  }

  function cacheKey(scope) {
    return `${CONFIG.cachePrefix}${scope}`;
  }

  function saveSnapshot(scope, normalized) {
    try {
      localStorage.setItem(cacheKey(scope), JSON.stringify({
        savedAt: Date.now(),
        value: normalized
      }));
    } catch (_) {}
  }

  function loadCachedSnapshots() {
    for (const scope of SCOPES) {
      try {
        const parsed = JSON.parse(localStorage.getItem(cacheKey(scope)));
        if (parsed?.value) {
          state.data.set(scope, parsed.value);
          state.failed.add(scope);
        }
      } catch (_) {}
    }
  }

  async function fetchScope(scope) {
    try {
      const raw = await fetchJsonWithTimeout(dataUrl(scope));
      const normalized = normalize(raw, scope);
      state.data.set(scope, normalized);
      state.failed.delete(scope);
      saveSnapshot(scope, normalized);
      if (scope === "br") state.lastNationalFetchAt = Date.now();
      return { ok: true, scope, value: normalized };
    } catch (error) {
      state.failed.add(scope);
      console.warn(`[TSE] ${scope.toUpperCase()} não atualizado:`, error);
      return { ok: false, scope, error };
    }
  }

  function updateStatus() {
    const dot = document.getElementById("statusDot");
    const text = document.getElementById("statusText");
    const warning = document.getElementById("warningBox");
    const national = state.data.get("br");

    if (national) {
      dot.className = "status-dot live";
      text.textContent = state.refreshInProgress ? "Atualizando dados oficiais…" : "Dados oficiais carregados";
      document.getElementById("tseGenerated").textContent = `TSE: ${national.dg || "—"} ${national.hg || "—"}`.trim();
    } else {
      dot.className = "status-dot error";
      text.textContent = "Sem dado nacional válido";
      document.getElementById("tseGenerated").textContent = "TSE: —";
    }

    const failed = [...state.failed];
    if (failed.length) {
      const names = failed.map(x => x.toUpperCase()).join(", ");
      warning.textContent = `${failed.length === 1 ? "Dado" : "Dados"} não atualizado${failed.length === 1 ? "" : "s"} nesta rodada: ${names}. O último valor válido, quando existente, foi mantido.`;
      warning.classList.remove("hidden");
    } else {
      warning.classList.add("hidden");
    }
  }

  function updateAgo() {
    const el = document.getElementById("updatedAgo");
    if (!state.lastNationalFetchAt) {
      el.textContent = "atualizado há —";
      return;
    }
    const sec = Math.max(0, Math.floor((Date.now() - state.lastNationalFetchAt) / 1000));
    el.textContent = sec < 60 ? `atualizado há ${sec}s` : `atualizado há ${Math.floor(sec / 60)}min`;
  }

  function majorityText(pct) {
    const p = brNumber(pct);
    const diff = Math.abs(p - 50);
    if (Math.abs(p - 50) < 0.005) return "na linha de 50%";
    return `${diff.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p.p. ${p > 50 ? "acima" : "abaixo"} de 50%`;
  }

  function renderNational() {
    const d = state.data.get("br");
    if (!d) return;

    document.getElementById("lulaName").textContent = d.lula.name;
    document.getElementById("flavioName").textContent = d.flavio.name;
    document.getElementById("lulaPct").textContent = formatPct(d.lula.pct);
    document.getElementById("flavioPct").textContent = formatPct(d.flavio.pct);
    document.getElementById("lulaVotes").textContent = `${formatInt(d.lula.votes)} votos`;
    document.getElementById("flavioVotes").textContent = `${formatInt(d.flavio.votes)} votos`;
    document.getElementById("lulaMajority").textContent = majorityText(d.lula.pct);
    document.getElementById("flavioMajority").textContent = majorityText(d.flavio.pct);
    document.getElementById("nationalPst").textContent = `${formatPct(d.sectionsPct)} totalizadas`;

    const other = Math.max(0, 100 - d.lula.pct - d.flavio.pct);
    document.getElementById("barLula").style.width = `${Math.max(0, d.lula.pct)}%`;
    document.getElementById("barOthers").style.width = `${other}%`;
    document.getElementById("barFlavio").style.width = `${Math.max(0, d.flavio.pct)}%`;

    const signed = d.lula.pct - d.flavio.pct;
    const voteDiff = Math.abs(d.lula.votes - d.flavio.votes);
    let leader = "Empate";
    if (signed > 0) leader = d.lula.name;
    if (signed < 0) leader = d.flavio.name;
    document.getElementById("leadSummary").textContent =
      signed === 0
        ? `Empate entre os dois candidatos · diferença de ${formatInt(voteDiff)} votos`
        : `Liderança: ${leader} · ${formatInt(voteDiff)} votos · ${Math.abs(signed).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p.p.`;
  }

  function signedMargin(d) {
    return d ? brNumber(d.lula.pct) - brNumber(d.flavio.pct) : 0;
  }

  function stateColor(uf, layer = state.mapLayer) {
    const d = state.data.get(uf.toLowerCase());
    if (!d) return cssVar("--map-empty", "#e8ebef");

    const margin = signedMargin(d);
    if (layer === "counted") {
      return d3.interpolateRgb("#eef1f4", "#173f70")(Math.max(0, Math.min(1, d.sectionsPct / 100)));
    }

    const intensity = Math.max(.15, Math.min(1, Math.abs(margin) / 30));
    if (margin > 0) return d3.interpolateRgb("#f5e9e9", CONFIG.candidates.lula.color)(intensity);
    if (margin < 0) return d3.interpolateRgb("#e7eef7", CONFIG.candidates.flavio.color)(intensity);
    return "#d9dde2";
  }

  function cssVar(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  function featureUF(feature) {
    const p = feature?.properties || {};
    return String(feature?.id ?? p.sigla ?? p.SIGLA ?? p.uf ?? p.UF ?? "").toUpperCase();
  }

  function topologyFeatures() {
    if (!state.topology) return [];
    const obj = state.topology.objects?.uf || Object.values(state.topology.objects || {})[0];
    if (!obj) return [];
    return topojson.feature(state.topology, obj).features;
  }

  function drawMap() {
    if (!state.topology || typeof d3 === "undefined" || typeof topojson === "undefined") return;
    const features = topologyFeatures();
    const svg = d3.select("#brazilMap");
    const width = 560, height = 540;
    const projection = d3.geoMercator().fitSize([width - 20, height - 20], { type: "FeatureCollection", features });
    const path = d3.geoPath(projection);

    svg.selectAll("path.uf")
      .data(features, d => featureUF(d))
      .join("path")
      .attr("class", "uf")
      .attr("tabindex", 0)
      .attr("d", path)
      .attr("fill", d => stateColor(featureUF(d)))
      .attr("aria-label", d => featureUF(d))
      .on("click keydown", (event, d) => {
        if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
        renderStateDetail(featureUF(d));
      })
      .on("pointermove", (event, d) => showTooltip(event, featureUF(d)))
      .on("pointerleave", hideTooltip);

    renderMapLegend();
    drawShareMap();
  }

  function drawShareMap() {
    if (!state.topology || typeof d3 === "undefined" || typeof topojson === "undefined") return;
    const features = topologyFeatures();
    const svg = d3.select("#shareMap");
    const width = 560, height = 540;
    const projection = d3.geoMercator().fitSize([width - 30, height - 28], { type: "FeatureCollection", features });
    const path = d3.geoPath(projection);
    svg.selectAll("path.uf")
      .data(features, d => featureUF(d))
      .join("path")
      .attr("class", "uf")
      .attr("d", path)
      .attr("fill", d => stateColor(featureUF(d), "leader"));
  }

  function renderMapLegend() {
    const el = document.getElementById("mapLegend");
    if (state.mapLayer === "counted") {
      el.innerHTML = `
        <span><i class="legend-swatch" style="background:#eef1f4"></i>0%</span>
        <span><i class="legend-swatch" style="background:#7f9bbb"></i>50%</span>
        <span><i class="legend-swatch" style="background:#173f70"></i>100%</span>`;
      return;
    }
    el.innerHTML = `
      <span><i class="legend-swatch" style="background:${CONFIG.candidates.lula.color}"></i>Lula</span>
      <span>intensidade = margem</span>
      <span><i class="legend-swatch" style="background:${CONFIG.candidates.flavio.color}"></i>Flávio</span>`;
  }

  function showTooltip(event, uf) {
    const d = state.data.get(uf.toLowerCase());
    const el = document.getElementById("tooltip");
    if (!d) return;
    const m = signedMargin(d);
    el.innerHTML = `<strong>${uf}</strong><br>Lula ${formatPct(d.lula.pct)} · Flávio ${formatPct(d.flavio.pct)}<br>Margem ${Math.abs(m).toFixed(2).replace(".", ",")} p.p. · Urnas ${formatPct(d.sectionsPct)}`;
    el.style.left = `${Math.min(window.innerWidth - 240, event.clientX + 12)}px`;
    el.style.top = `${Math.max(8, event.clientY - 20)}px`;
    el.classList.remove("hidden");
  }

  function hideTooltip() {
    document.getElementById("tooltip").classList.add("hidden");
  }

  function renderStateDetail(uf) {
    const d = state.data.get(uf.toLowerCase());
    const el = document.getElementById("stateDetail");
    if (!d) {
      el.innerHTML = `<strong>${uf}</strong><span>Sem dado válido disponível.</span>`;
      return;
    }
    const stale = state.failed.has(uf.toLowerCase()) ? " · ⚠ dado deste estado não atualizado" : "";
    const margin = signedMargin(d);
    const lead = margin === 0 ? "Empate" : (margin > 0 ? d.lula.name : d.flavio.name);
    el.innerHTML = `
      <strong>${uf} · ${lead}</strong>
      <span>Lula: ${formatPct(d.lula.pct)} · ${formatInt(d.lula.votes)} votos</span>
      <span>Flávio: ${formatPct(d.flavio.pct)} · ${formatInt(d.flavio.votes)} votos</span>
      <span>Margem: ${Math.abs(margin).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})} p.p. · Seções: ${formatInt(d.sectionsDone)}/${formatInt(d.sectionsTotal)} (${formatPct(d.sectionsPct)})</span>
      <span>TSE: ${d.dg || "—"} ${d.hg || "—"}${stale}</span>`;
  }

  function getHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CONFIG.historyKey));
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveHistory(history) {
    try {
      localStorage.setItem(CONFIG.historyKey, JSON.stringify(history.slice(-1200)));
    } catch (_) {}
  }

  function appendHistory() {
    const d = state.data.get("br");
    if (!d) return;
    const history = getHistory();
    const point = {
      key: `${d.dg}|${d.hg}|${d.sectionsPct}`,
      dg: d.dg,
      hg: d.hg,
      x: d.sectionsPct,
      lula: d.lula.pct,
      flavio: d.flavio.pct
    };
    if (history.at(-1)?.key !== point.key) {
      history.push(point);
      saveHistory(history);
    }
  }

  function drawHistoryChart() {
    if (typeof d3 === "undefined") return;
    const data = getHistory().filter(d => Number.isFinite(+d.x));
    const svg = d3.select("#historyChart");
    svg.selectAll("*").remove();
    const W = 760, H = 340;
    const m = { top: 20, right: 20, bottom: 45, left: 48 };
    const x = d3.scaleLinear().domain([0,100]).range([m.left, W-m.right]);

    const values = data.flatMap(d => [+d.lula || 0, +d.flavio || 0]);
    const maxY = Math.max(55, Math.min(100, Math.ceil((d3.max(values) || 50) / 5) * 5 + 5));
    const y = d3.scaleLinear().domain([0,maxY]).nice().range([H-m.bottom, m.top]);

    svg.append("g").attr("class","grid")
      .attr("transform", `translate(0,${H-m.bottom})`)
      .call(d3.axisBottom(x).ticks(5).tickSize(-(H-m.top-m.bottom)).tickFormat(""));
    svg.append("g").attr("class","grid")
      .attr("transform", `translate(${m.left},0)`)
      .call(d3.axisLeft(y).ticks(5).tickSize(-(W-m.left-m.right)).tickFormat(""));

    svg.append("g").attr("class","axis")
      .attr("transform", `translate(0,${H-m.bottom})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => `${d}%`));
    svg.append("g").attr("class","axis")
      .attr("transform", `translate(${m.left},0)`)
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d}%`));

    svg.append("text").attr("x", W/2).attr("y", H-7).attr("text-anchor","middle")
      .attr("fill","currentColor").attr("font-size",10).text("% das seções totalizadas");

    if (!data.length) {
      svg.append("text").attr("x",W/2).attr("y",H/2).attr("text-anchor","middle")
        .attr("fill","currentColor").attr("opacity",.6).attr("font-size",13)
        .text("O primeiro ponto será salvo quando o dado nacional carregar.");
      return;
    }

    const lineL = d3.line().x(d => x(+d.x)).y(d => y(+d.lula)).curve(d3.curveMonotoneX);
    const lineF = d3.line().x(d => x(+d.x)).y(d => y(+d.flavio)).curve(d3.curveMonotoneX);

    svg.append("path").datum(data).attr("fill","none").attr("stroke",CONFIG.candidates.lula.color)
      .attr("stroke-width",3).attr("d",lineL);
    svg.append("path").datum(data).attr("fill","none").attr("stroke",CONFIG.candidates.flavio.color)
      .attr("stroke-width",3).attr("d",lineF);

    svg.selectAll(".dot-lula").data(data).join("circle")
      .attr("cx",d=>x(+d.x)).attr("cy",d=>y(+d.lula)).attr("r",2.4).attr("fill",CONFIG.candidates.lula.color);
    svg.selectAll(".dot-flavio").data(data).join("circle")
      .attr("cx",d=>x(+d.x)).attr("cy",d=>y(+d.flavio)).attr("r",2.4).attr("fill",CONFIG.candidates.flavio.color);

    const legend = svg.append("g").attr("transform",`translate(${m.left+8},${m.top+8})`);
    legend.append("circle").attr("r",5).attr("fill",CONFIG.candidates.lula.color);
    legend.append("text").attr("x",10).attr("y",4).attr("fill","currentColor").attr("font-size",10).text("Lula");
    legend.append("circle").attr("cx",60).attr("r",5).attr("fill",CONFIG.candidates.flavio.color);
    legend.append("text").attr("x",70).attr("y",4).attr("fill","currentColor").attr("font-size",10).text("Flávio");
  }

  function renderStateBars() {
    const rows = UFS
      .map(uf => ({ uf: uf.toUpperCase(), d: state.data.get(uf) }))
      .filter(x => x.d)
      .sort((a,b) => signedMargin(b.d) - signedMargin(a.d));

    const el = document.getElementById("stateBars");
    el.innerHTML = rows.map(({uf,d}) => {
      const m = signedMargin(d);
      const leader = m > 0 ? "Lula" : m < 0 ? "Flávio" : "Empate";
      const stale = state.failed.has(uf.toLowerCase()) ? " ⚠" : "";
      return `
        <div class="state-row">
          <div class="state-code">${uf}${stale}</div>
          <div class="dual-track" title="${uf}: Lula ${formatPct(d.lula.pct)}; Flávio ${formatPct(d.flavio.pct)}">
            <div class="track"><div class="fill lula-fill" style="width:${Math.max(0,Math.min(100,d.lula.pct))}%"></div></div>
            <div class="track"><div class="fill flavio-fill" style="width:${Math.max(0,Math.min(100,d.flavio.pct))}%"></div></div>
          </div>
          <div class="margin-label"><strong>${leader}</strong>${Math.abs(m).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})} p.p.</div>
        </div>`;
    }).join("") || `<p class="fine-print">Aguardando dados estaduais.</p>`;
  }

  function renderRegions() {
    const el = document.getElementById("regionsGrid");
    el.innerHTML = Object.entries(REGIONS).map(([region, ufs]) => {
      const items = ufs.map(uf => ({ uf, d: state.data.get(uf.toLowerCase()) }));
      const totalSections = items.reduce((a,x) => a + (x.d?.sectionsTotal || 0), 0);
      const doneSections = items.reduce((a,x) => a + (x.d?.sectionsDone || 0), 0);
      const pct = totalSections ? (doneSections / totalSections * 100) : 0;
      return `
        <article class="region-card">
          <div class="region-head"><strong>${region}</strong><strong>${formatPct(pct)}</strong></div>
          <div class="region-states">
            ${items.map(({uf,d}) => `<div class="region-state"><span>${uf}${state.failed.has(uf.toLowerCase()) ? " ⚠" : ""}</span><strong>${d ? formatPct(d.sectionsPct) : "—"}</strong></div>`).join("")}
          </div>
        </article>`;
    }).join("");
  }

  function renderExterior() {
    const d = state.data.get("zz");
    if (!d) return;
    document.getElementById("exteriorPst").textContent = `${formatPct(d.sectionsPct)} das seções`;
    document.getElementById("exteriorLula").textContent = `${formatPct(d.lula.pct)} · ${formatInt(d.lula.votes)}`;
    document.getElementById("exteriorFlavio").textContent = `${formatPct(d.flavio.pct)} · ${formatInt(d.flavio.votes)}`;
    document.getElementById("exteriorTime").textContent = `TSE: ${d.dg || "—"} ${d.hg || "—"}${state.failed.has("zz") ? " · ⚠ não atualizado nesta rodada" : ""}`;
  }

  function renderShareAndCaptions() {
    const d = state.data.get("br");
    if (!d) return;
    document.getElementById("sharePst").textContent = `${formatPct(d.sectionsPct)} urnas`;
    document.getElementById("shareLula").textContent = formatPct(d.lula.pct);
    document.getElementById("shareFlavio").textContent = formatPct(d.flavio.pct);
    document.getElementById("shareTime").textContent = `TSE ${d.hg || "—"}`;

    const lead = signedMargin(d);
    const diffVotes = Math.abs(d.lula.votes - d.flavio.votes);
    const leadLine = lead === 0
      ? "Empate entre os dois candidatos."
      : `${lead > 0 ? d.lula.name : d.flavio.name} lidera por ${formatInt(diffVotes)} votos (${Math.abs(lead).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})} p.p.).`;

    document.getElementById("instagramCaption").value =
`Apuração oficial para Presidente — Eleições 2026
Lula (PT): ${formatPct(d.lula.pct)} — ${formatInt(d.lula.votes)} votos
Flávio Bolsonaro (PL): ${formatPct(d.flavio.pct)} — ${formatInt(d.flavio.votes)} votos
${leadLine}
Seções totalizadas: ${formatPct(d.sectionsPct)}
Atualização TSE: ${d.dg || ""} ${d.hg || ""}
Fonte: TSE

#Eleições2026 #Apuração #TSE`;

    document.getElementById("whatsappCaption").value =
`*Apuração oficial para Presidente — Eleições 2026*
*Lula (PT):* ${formatPct(d.lula.pct)} — ${formatInt(d.lula.votes)} votos
*Flávio Bolsonaro (PL):* ${formatPct(d.flavio.pct)} — ${formatInt(d.flavio.votes)} votos
*Diferença:* ${leadLine}
*Seções totalizadas:* ${formatPct(d.sectionsPct)}
*Atualização TSE:* ${d.dg || ""} ${d.hg || ""}
Fonte: TSE`;
  }

  function renderAll() {
    updateStatus();
    renderNational();
    drawMap();
    drawHistoryChart();
    renderStateBars();
    renderRegions();
    renderExterior();
    renderShareAndCaptions();
    updateAgo();
  }

  async function loadTopology() {
    try {
      state.topology = await fetchJsonWithTimeout(CONFIG.topoUrl);
      drawMap();
    } catch (error) {
      console.error("Falha ao carregar malha do mapa:", error);
      document.getElementById("mapWrap").innerHTML = `<div class="warning">A malha do mapa não pôde ser carregada. Os dados eleitorais continuam funcionando.</div>`;
    }
  }

  async function refreshAll() {
    if (state.refreshInProgress) return;
    state.refreshInProgress = true;
    const started = Date.now();
    updateStatus();

    for (let i = 0; i < SCOPES.length; i++) {
      await fetchScope(SCOPES[i]);
      if (i < SCOPES.length - 1) await sleep(CONFIG.requestGapMs);
      if (SCOPES[i] === "br") renderNational();
    }

    appendHistory();
    state.refreshInProgress = false;
    renderAll();

    const elapsed = Date.now() - started;
    clearTimeout(state.timer);
    state.timer = setTimeout(refreshAll, Math.max(1_000, CONFIG.refreshMs - elapsed));
  }

  async function copyText(id, button) {
    const el = document.getElementById(id);
    try {
      await navigator.clipboard.writeText(el.value);
    } catch (_) {
      el.focus();
      el.select();
      document.execCommand("copy");
    }
    const old = button.textContent;
    button.textContent = "Copiado";
    setTimeout(() => button.textContent = old, 1200);
  }

  function setupEvents() {
    document.querySelectorAll("[data-layer]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.mapLayer = btn.dataset.layer;
        document.querySelectorAll("[data-layer]").forEach(b => b.classList.toggle("active", b === btn));
        drawMap();
      });
    });

    document.querySelectorAll("[data-copy]").forEach(btn => {
      btn.addEventListener("click", () => copyText(btn.dataset.copy, btn));
    });

    document.getElementById("clearHistory").addEventListener("click", () => {
      try { localStorage.removeItem(CONFIG.historyKey); } catch (_) {}
      drawHistoryChart();
    });

    document.getElementById("themeToggle").addEventListener("click", () => {
      const current = document.documentElement.dataset.theme || "light";
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(CONFIG.themeKey, next); } catch (_) {}
      drawMap();
      drawHistoryChart();
    });
  }

  function setupTheme() {
    let saved = "light";
    try {
      saved = localStorage.getItem(CONFIG.themeKey) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } catch (_) {}
    document.documentElement.dataset.theme = saved;
  }

  function diagnostics() {
    const br = state.data.get("br");
    if (!br) return null;
    const locals = [...UFS, "zz"].map(x => state.data.get(x)).filter(Boolean);
    const sum = key => locals.reduce((a,d) => a + (d?.[key] || 0), 0);
    return {
      scopesLoaded: state.data.size,
      failed: [...state.failed],
      validVotes: { national: br.validVotes, sumLocal: sum("validVotes") },
      lulaVotes: { national: br.lula.votes, sumLocal: locals.reduce((a,d)=>a+d.lula.votes,0) },
      flavioVotes: { national: br.flavio.votes, sumLocal: locals.reduce((a,d)=>a+d.flavio.votes,0) }
    };
  }

  // Exposto somente para diagnóstico/testes locais; não altera a interface.
  window.TSE2026 = {
    CONFIG,
    UFS,
    SCOPES,
    REGIONS,
    state,
    brNumber,
    normalize,
    dataUrl,
    fetchScope,
    diagnostics,
    topologyFeatures
  };

  setupTheme();
  setupEvents();
  loadCachedSnapshots();
  renderAll();
  loadTopology();
  refreshAll();
  setInterval(updateAgo, 1_000);
})();