// ============================================================
// ALLENAMENTO FUNZIONALE
// ============================================================
const FZ_TIPI = ["Pesi + Corsa", "Pesi senza Corsa", "Corpo libero + Corsa", "Corpo libero senza Corsa"];
// ordine e nomi mostrati al cliente (i nomi interni dei tipi restano quelli dei dati)
const FZ_HOME = [
  { tipo: "Pesi senza Corsa", nome: "Pesi", img: "fz-pesi" },
  { tipo: "Pesi + Corsa", nome: "Pesi + Corsa", img: "fz-pesi-corsa" },
  { tipo: "Corpo libero senza Corsa", nome: "Corpo libero", img: "fz-corpo-libero" },
  { tipo: "Corpo libero + Corsa", nome: "Corpo libero + Corsa", img: "fz-corpo-libero-corsa" }
];

let fzDati = [];
let fzCaricato = false;
let fzArchivio = {};   // nome esercizio (normalizzato) -> {nome, img1, img2}
let fzSel = { tipo: "", livello: "", nome: "" };
let fzEx = [];        // tutti i passi dell'allenamento (tutti i round, uno dopo l'altro)
let fzBase = [];      // gli esercizi di un solo round
let fzRounds = 1;
let fzDurata = 0;     // minuti, solo per gli allenamenti AMRAP (0 = allenamento normale)
let fzAmrap = false, fzRoundsFatti = 0, fzDurMs = 0;
let fzCur = 0, fzT0 = 0, fzIv = null, fzWake = null;

function fzNorm(s) { return (s || "").toString().trim().toLowerCase().replace(/\s+/g, " "); }
function fzEsc(s) { return (s || "").toString().replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function fzEl(id) { return document.getElementById(id); }

function fzSesso() {
  const r = clientiList.find(x => fzNorm(x.Cliente) === fzNorm(clienteNome));
  const s = fzNorm(r && r.Sesso);
  return (s.startsWith("f") || s.startsWith("d")) ? "F" : "M";
}

function fzImg(url) {
  url = (url || "").trim();
  if (!url) return "";
  const m = url.match(/\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/);
  if (url.includes("drive.google.com") && m) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w1600";
  return url;
}

function fzKg(v) {
  v = (v || "").toString().trim().replace(/\s*kg\s*$/i, "");
  return v;
}

function fzRep(r) {
  r = (r || "").toString().trim();
  return /^\d+$/.test(r) ? "Rep. " + r : r;
}

// ---- caricamento dati dal foglio (allenamenti + archivio immagini) ----
async function fzCarica() {
  const imgP = leggiImmaginiSb("funzionale");
  fzDati = (await fetchCsv(FUNZIONALE_CSV_URL)).filter(r => r.Esercizio && r.Esercizio.trim() !== "");
  fzCaricato = true;
  try {
    if (typeof FUNZIONALE_ARCHIVIO_URL !== "undefined" && FUNZIONALE_ARCHIVIO_URL) {
      const rows = await fetchCsv(FUNZIONALE_ARCHIVIO_URL);
      fzArchivio = {};
      rows.forEach(r => {
        const n = fzNorm(r.Esercizio);
        if (n) fzArchivio[n] = { nome: (r.Esercizio || "").trim(), img1: (r["Immagine 1"] || "").trim(), img2: (r["Immagine 2"] || "").trim() };
      });
    }
  } catch (e) { console.error(e); }
  try {
    (await imgP).forEach(o => {
      const k = fzNorm(o.nome); if (!k) return;
      const a = fzArchivio[k] = Object.assign({ nome: (o.nome || "").trim(), img1: "", img2: "" }, fzArchivio[k]);
      if (o.img1 !== null && o.img1 !== undefined) a.img1 = o.img1;
      if (o.img2 !== null && o.img2 !== undefined) a.img2 = o.img2;
    });
  } catch (e) { console.error(e); }
}

// ---- apertura sezione ----
async function fzApri() {
  showScreen("screen-fz-tipo");
  const box = fzEl("fz-tipi");
  box.className = "fz-grid";
  box.innerHTML = FZ_HOME.map((t, i) =>
    '<button class="fz-tile fz-t' + (i % 2 ? "b" : "a") + '" type="button" data-fz-tipo="' + fzEsc(t.tipo) + '" style="background-image:url(img/' + t.img + '.jpg),radial-gradient(120% 120% at ' + (i % 2 ? "100%" : "0%") + ' 110%,#7a1015 0%,#1a0b0c 55%,#0e0e0e 100%)"><span class="fz-cnt" data-cnt="' + fzEsc(t.tipo) + '"></span><span class="fz-tn">' + fzEsc(t.nome) + '</span></button>'
  ).join("");
  const adatta = () => {  // la scritta sta su una riga e ha la stessa grandezza in tutti e 4 i quadrati
    const els = Array.from(box.querySelectorAll(".fz-tn"));
    let min = 22;
    els.forEach(el => {
      let f = 22; el.style.fontSize = f + "px";
      while (el.scrollWidth > el.clientWidth && f > 11) { f -= 1; el.style.fontSize = f + "px"; }
      if (f < min) min = f;
    });
    els.forEach(el => { el.style.fontSize = min + "px"; });
  };
  adatta();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(adatta);
  const conta = () => box.querySelectorAll(".fz-cnt").forEach(el => { el.textContent = fzNumAllenamenti(el.dataset.cnt) || ""; });
  if (fzCaricato) conta();
  if (typeof FUNZIONALE_CSV_URL === "undefined" || FUNZIONALE_CSV_URL.includes("INSERISCI")) {
    fzEl("fz-tipi-msg").textContent = "Elenco allenamenti non ancora collegato.";
    return;
  }
  fzEl("fz-tipi-msg").textContent = fzCaricato ? "" : "Carico gli allenamenti...";
  try {
    await fzCarica();
    fzEl("fz-tipi-msg").textContent = "";
    conta();
    fzSincronizza();
  } catch (e) {
    console.error(e);
    fzEl("fz-tipi-msg").textContent = "Non riesco a caricare gli allenamenti. Riprova.";
  }
}

// ---- elenco allenamenti per tipo ----
// allenamenti distinti di un tipo (il livello resta nei dati per i tempi gia' salvati, ma non si mostra)
function fzAllenamentiTipo(tipo) {
  const out = [];
  fzDati.filter(r => fzNorm(r.Tipo) === fzNorm(tipo)).forEach(r => {
    const n = (r.Allenamento || "").trim(), liv = (r.Livello || "").trim();
    if (n && !out.some(o => o.nome === n && fzNorm(o.liv) === fzNorm(liv))) out.push({ nome: n, liv: liv });
  });
  return out;
}
function fzNumAllenamenti(tipo) { return fzAllenamentiTipo(tipo).length; }

function fzApriTipo(tipo) {
  fzSel.tipo = tipo;
  const voce = FZ_HOME.find(x => x.tipo === tipo);
  fzEl("fz-liv-title").textContent = voce ? voce.nome : tipo;
  const box = fzEl("fz-livelli");
  const lista = fzAllenamentiTipo(tipo);
  if (!lista.length) {
    box.innerHTML = '<p class="fz-empty">Nessun allenamento disponibile per ora.</p>';
    showScreen("screen-fz-liv");
    return;
  }
  box.innerHTML = '<div class="fz-list">' + lista.map(o => {
    const q = fzDati.filter(r => fzNorm(r.Tipo) === fzNorm(tipo) && (r.Allenamento || "").trim() === o.nome && fzNorm(r.Livello) === fzNorm(o.liv)).length;
    return '<button class="fz-card" type="button" data-fz-liv="' + fzEsc(o.liv) + '" data-fz-nome="' + fzEsc(o.nome) + '"><span class="txt"><span class="n">' + fzEsc(o.nome) + '</span><span class="s">' + q + (q === 1 ? ' esercizio' : ' esercizi') + '</span></span><span class="ar">&#8250;</span></button>';
  }).join("") + '</div>';
  showScreen("screen-fz-liv");
}

// ---- tempi salvati ----
function fzChiaveTempi() {
  return storageKey("fz_tempi_" + fzNorm(fzSel.tipo) + "|" + fzNorm(fzSel.livello) + "|" + fzNorm(fzSel.nome));
}
let fzRemote = [];
let fzSyncP = null;
function fzTempiLocali() {
  try { return JSON.parse(localStorage.getItem(fzChiaveTempi()) || "[]"); } catch (e) { return []; }
}
function fzTempi() {
  const k = [fzNorm(fzSel.tipo), fzNorm(fzSel.livello), fzNorm(fzSel.nome)];
  const rem = fzRemote.filter(x => x.tipo === k[0] && x.liv === k[1] && x.nome === k[2]).map(x => ({ ms: x.ms, d: x.d, rounds: x.rounds }));
  const visti = {}, tutti = [];
  fzTempiLocali().concat(rem).forEach(x => { if (!visti[x.d]) { visti[x.d] = 1; tutti.push(x); } });
  tutti.sort((a, b) => new Date(b.d) - new Date(a.d));
  return tutti;
}
// I 3 tempi migliori (i piu' bassi)
function fzMigliori(arr) {
  if (fzAmrap) return arr.slice().sort((a, b) => (b.rounds || 0) - (a.rounds || 0)).slice(0, 3);
  return arr.slice().sort((a, b) => a.ms - b.ms).slice(0, 3);
}
// Legge dal foglio i risultati del cliente (anche di un telefono precedente)
function fzSincronizza() {
  if (typeof FUNZIONALE_RISULTATI_URL === "undefined" || !FUNZIONALE_RISULTATI_URL) return Promise.resolve();
  fzSyncP = fetchCsv(FUNZIONALE_RISULTATI_URL).then(rows => {
    fzRemote = rows.filter(r => fzNorm(r.Cliente) === fzNorm(clienteNome)).map(r => ({
      tipo: fzNorm(r.Tipo), liv: fzNorm(r.Livello), nome: fzNorm(r.Allenamento),
      ms: (parseFloat(String(r.Secondi).replace(",", ".")) || 0) * 1000, d: (r.ISO || "").trim(),
      rounds: /round/i.test(r.Tempo || "") ? (parseInt(r.Tempo, 10) || 0) : undefined
    })).filter(x => x.ms > 0 && x.d);
    fzReinvia();
  }).catch(e => console.error(e));
  return fzSyncP;
}
// Se un tempo salvato sul telefono non e' arrivato al foglio (es. senza rete), lo rimanda
function fzReinvia() {
  const prefisso = storageKey("fz_tempi_");
  const presenti = {};
  fzRemote.forEach(x => { presenti[x.d] = 1; });
  for (let i = 0; i < localStorage.length; i++) {
    const chiave = localStorage.key(i);
    if (!chiave || chiave.indexOf(prefisso) !== 0) continue;
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(chiave) || "[]"); } catch (e) {}
    arr.forEach(x => {
      if (!x.t || presenti[x.d]) return;
      if (Date.now() - new Date(x.d).getTime() < 10 * 60 * 1000) return;
      fzInvia(x);
    });
  }
}
function fzInvia(x) {
  inviaEvento({ tipo: "Funzionale", tipoAllenamento: x.t, livello: x.l, allenamento: x.n, tempo: x.rounds !== undefined ? x.rounds + " round" : fzFmt(x.ms), secondi: Math.round(x.ms / 1000), iso: x.d });
}
function fzFmt(ms) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), r = s % 60;
  return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
}
function fzData(iso) {
  const d = new Date(iso);
  return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear();
}
function fzListaTempi(arr) {
  if (!arr.length) return '<div class="fz-r"><span>' + (fzAmrap ? "Nessun risultato ancora" : "Nessun tempo ancora") + '</span></div>';
  return arr.map((x, i) => '<div class="fz-r' + (i === 0 ? ' top' : '') + '"><span>' + fzData(x.d) + '</span><div class="fz-tm"><i>' + ["🥇","🥈","🥉"][i] + '</i><b>' + (fzAmrap ? (x.rounds || 0) + ' round' : fzFmt(x.ms)) + '</b></div></div>').join("");
}

// ---- dettaglio allenamento ----
function fzCostruisciEx() {
  const sesso = fzSesso();
  const righe = fzDati.filter(r =>
    fzNorm(r.Tipo) === fzNorm(fzSel.tipo) && fzNorm(r.Livello) === fzNorm(fzSel.livello) && (r.Allenamento || "").trim() === fzSel.nome);
  righe.sort((a, b) => (parseFloat(a.Ordine) || 0) - (parseFloat(b.Ordine) || 0));
  fzRounds = Math.min(20, Math.max(1, Math.max.apply(null, [1].concat(righe.map(r => parseInt(r.Round, 10) || 1)))));
  fzDurata = Math.min(180, Math.max(0, Math.max.apply(null, [0].concat(righe.map(r => parseFloat(String(r.Durata || "").replace(",", ".")) || 0)))));
  fzAmrap = fzDurata > 0;
  if (fzAmrap) fzRounds = 1;
  fzBase = righe.map(r => {
    const kg = fzKg(sesso === "F" ? r["Kg donna"] : r["Kg uomo"]);
    const nome = (r.Esercizio || "").trim();
    const arc = fzArchivio[fzNorm(nome)] || {};
    return {
      nome,
      rep: fzRep(r.Rep),
      kg,
      etichetta: kg ? "" : fzEtichetta(r.Categoria, nome),
      img1: fzImg(r["Immagine 1"] || arc.img1),
      img2: fzImg(r["Immagine 2"] || arc.img2)
    };
  });
  fzEx = [];
  for (let k = 0; k < fzRounds; k++) fzEx = fzEx.concat(fzBase);
}
function fzEtichetta(cat, nome) {
  const c = fzNorm(cat);
  if (c.indexOf("macchin") === 0) return "MACCHINARIO";
  if (c.indexOf("corsa") === 0) return "CORSA";
  if (c.indexOf("corpo") === 0) return "CORPO LIBERO";
  return /corsa/i.test(nome) ? "CORSA" : "CORPO LIBERO";
}
function fzDestra(e) { return e.kg ? e.kg + " KG" : e.etichetta; }

function fzApriDettaglio(liv, nome) {
  fzSel.livello = liv; fzSel.nome = nome;
  fzCostruisciEx();
  fzEl("fz-det-title").textContent = nome;
  const sesso = fzSesso();
  const haPesi = fzBase.some(e => e.kg);
  fzEl("fz-det-meta").innerHTML =
    '<span class="fz-pill">' + fzBase.length + ' esercizi</span>' +
    (haPesi ? '<span class="fz-pill">Pesi per ' + (sesso === "F" ? "donna" : "uomo") + '</span>' : '');
  fzEl("fz-det-tempi").innerHTML = fzListaTempi(fzMigliori(fzTempi()));
  if (fzSyncP) fzSyncP.then(() => {
    if (fzEl("screen-fz-det").classList.contains("active")) fzEl("fz-det-tempi").innerHTML = fzListaTempi(fzMigliori(fzTempi()));
  });
  fzEl("fz-det-ex").innerHTML = fzBase.map((e, i) =>
    '<div class="fz-row"><span class="i">' + (i + 1) + '</span><div class="nm">' + fzEsc(e.nome) + '<div class="dt">' + fzEsc(e.rep) + '</div></div><span class="kg">' + fzEsc(fzDestra(e)) + '</span></div>'
  ).join("");
  fzEl("fz-det-best-lbl").textContent = fzAmrap ? "I tuoi 3 migliori risultati" : "I tuoi 3 migliori tempi";
  fzEl("fz-det-tempi").innerHTML = fzListaTempi(fzMigliori(fzTempi()));
  fzEl("fz-det-round").innerHTML = fzAmrap
    ? '<div class="fz-rounds"><span class="n">AMRAP ' + fzDurata + ' MIN</span><span class="t">Ripeti gli esercizi qui sopra pi&ugrave; volte che puoi. Ogni giro completo &egrave; un round: toccalo a fine round.</span></div>'
    : fzRounds > 1
    ? '<div class="fz-rounds"><span class="n">' + fzRounds + ' ROUND</span><span class="t">Ripeti tutti gli esercizi qui sopra</span></div>' : "";
  showScreen("screen-fz-det");
}

// ---- allenamento in corso ----
async function fzAvvia() {
  if (!fzEx.length) return;
  fzCur = 0; fzT0 = Date.now();
  fzRoundsFatti = 0; fzDurMs = fzDurata * 60000;
  fzEx.forEach(e => [e.img1, e.img2].forEach(u => { if (u) { const im = new Image(); im.src = u; } }));
  showScreen("screen-fz-run");
  fzRender();
  fzEl("fz-clock").textContent = fzAmrap ? fzFmt(fzDurMs) : "00:00";
  if (fzIv) clearInterval(fzIv);
  fzIv = setInterval(() => {
    if (!fzAmrap) { fzEl("fz-clock").textContent = fzFmt(Date.now() - fzT0); return; }
    const resto = fzDurMs - (Date.now() - fzT0);
    if (resto <= 0) { fzConcludiAmrap(); return; }
    fzEl("fz-clock").textContent = fzFmt(Math.ceil(resto / 1000) * 1000);
    const f = document.getElementById("fz-tbar-f"); if (f) f.style.width = Math.min(100, (1 - resto / fzDurMs) * 100) + "%";
  }, 250);
  try { if (navigator.wakeLock) fzWake = await navigator.wakeLock.request("screen"); } catch (e) {}
}
function fzStop() {
  if (fzIv) { clearInterval(fzIv); fzIv = null; }
  try { if (fzWake) { fzWake.release(); fzWake = null; } } catch (e) {}
}
function fzMedia(e) {
  const imgs = [e.img1, e.img2].filter(Boolean);
  if (!imgs.length) return '<div class="fz-media"></div>';
  return '<div class="fz-media' + (imgs.length === 1 ? ' uno' : '') + '">' + imgs.map(u => '<div><img src="' + fzEsc(u) + '" alt=""></div>').join("") + '</div>';
}
function fzRenderAmrap() {
  fzEl("fz-count").className = "fz-lbl";
  fzEl("fz-count").textContent = "AMRAP · " + fzDurata + " min";
  fzEl("fz-prev").style.visibility = "hidden";
  fzEl("fz-prog").innerHTML = '<div class="fz-tbar"><div id="fz-tbar-f"></div></div>';
  fzEl("fz-body").innerHTML =
    '<div class="fz-am"><span class="k">Round completati</span><div class="fz-am-n">' + fzRoundsFatti + '</div>' +
    '<div class="fz-am-list">' + fzBase.map(e => '<div class="fz-am-r"><b>' + fzEsc(e.rep.replace(/^Rep\.\s*/, "")) + '</b><span>' + fzEsc(e.nome) + '</span></div>').join("") + '</div></div>' +
    '<button type="button" class="fz-finish" id="fz-round-btn"><span class="big">ROUND<br>COMPLETATO</span><span class="t">Tocca a fine di ogni giro</span></button>' +
    '<button type="button" class="fz-am-undo" id="fz-round-undo"' + (fzRoundsFatti ? "" : " disabled") + '>Annulla ultimo round</button>';
}
function fzConcludiAmrap() {
  fzStop();
  try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (e) {}
  const ms = fzDurMs;
  const prima = fzTempi();
  const nuovo = { ms, rounds: fzRoundsFatti, d: new Date().toISOString(), t: fzSel.tipo, l: fzSel.livello, n: fzSel.nome };
  const nuovi = [nuovo].concat(prima).slice(0, 60);
  fzInvia(nuovo);
  try { localStorage.setItem(fzChiaveTempi(), JSON.stringify(nuovi)); } catch (e) {}
  fzEl("fz-end-time").textContent = fzRoundsFatti + " ROUND";
  fzEl("fz-end-best-lbl").textContent = "I tuoi 3 migliori risultati";
  let cmp = "Primo risultato registrato per questo allenamento.";
  if (prima.length) {
    const record = Math.max.apply(null, prima.map(x => x.rounds || 0));
    cmp = fzRoundsFatti > record ? "Nuovo record! Hai migliorato il tuo miglior risultato di " + (fzRoundsFatti - record) + (fzRoundsFatti - record === 1 ? " round." : " round.") :
          fzRoundsFatti < record ? "A " + (record - fzRoundsFatti) + (record - fzRoundsFatti === 1 ? " round" : " round") + " dal tuo miglior risultato." : "Hai eguagliato il tuo miglior risultato.";
  }
  fzEl("fz-end-cmp").textContent = cmp;
  fzEl("fz-end-list").innerHTML = fzListaTempi(fzMigliori(nuovi));
  showScreen("screen-fz-end");
}
function fzRender() {
  if (fzAmrap) { fzRenderAmrap(); return; }
  fzEl("fz-prev").style.visibility = "";
  const ultimo = fzCur >= fzEx.length;
  fzEl("fz-count").className = "fz-lbl";
  const nb = fzBase.length || 1;
  fzEl("fz-count").textContent = ultimo ? "Ultimo passo" :
    (fzRounds > 1 ? "Round " + (Math.floor(fzCur / nb) + 1) + " di " + fzRounds + " · " : "") + "Esercizio " + (fzCur % nb + 1) + " di " + nb;
  fzEl("fz-prev").disabled = (fzCur === 0);
  fzEl("fz-prog").innerHTML = fzEx.map((e, i) => '<i class="' + (i < fzCur ? 'd' : (i === fzCur ? 'c' : '')) + '"></i>').join("");
  const b = fzEl("fz-body");
  if (ultimo) {
    b.innerHTML = '<button class="fz-finish" type="button" id="fz-finish"><span class="big">CONCLUDI<br>ALLENAMENTO</span><span class="t">Tocca ovunque sullo schermo</span></button>';
    return;
  }
  const e = fzEx[fzCur], nx = fzEx[fzCur + 1];
  b.innerHTML =
    '<div class="fz-cur"><span class="k">Adesso</span><div class="fz-name">' + fzEsc(e.nome) + '</div>' +
    '<div class="fz-rq"><span class="fz-qty">' + fzEsc(e.rep) + '</span><span class="fz-wt">' + fzEsc(fzDestra(e)) + '</span></div></div>' +
    fzMedia(e) +
    '<div class="fz-next"><span class="k">Dopo</span><div class="nm">' + (nx ? fzEsc(nx.nome) : "Fine allenamento") + '</div><div class="dt">' +
    (nx ? fzEsc([nx.rep, nx.kg ? nx.kg + " KG" : ""].filter(Boolean).join(" · ")) : "Poi tocca per concludere") + '</div></div>';
}
function fzConcludi() {
  const ms = Math.max(1000, Date.now() - fzT0);
  fzStop();
  const prima = fzTempi();
  const nuovo = { ms, d: new Date().toISOString(), t: fzSel.tipo, l: fzSel.livello, n: fzSel.nome };
  const nuovi = [nuovo].concat(prima).slice(0, 60);
  fzInvia(nuovo);
  try { localStorage.setItem(fzChiaveTempi(), JSON.stringify(nuovi)); } catch (e) {}
  fzEl("fz-end-time").textContent = fzFmt(ms);
  fzEl("fz-end-best-lbl").textContent = "I tuoi 3 migliori tempi";
  let cmp = "Primo tempo registrato per questo allenamento.";
  if (prima.length) {
    const record = Math.min.apply(null, prima.map(x => x.ms));
    const diff = Math.round((ms - record) / 1000);
    cmp = diff < 0 ? "Nuovo record! Hai migliorato il tuo miglior tempo di " + fzFmt(-diff * 1000) + "." :
          diff > 0 ? "A " + fzFmt(diff * 1000) + " dal tuo miglior tempo." : "Hai eguagliato il tuo miglior tempo.";
  }
  fzEl("fz-end-cmp").textContent = cmp;
  fzEl("fz-end-list").innerHTML = fzListaTempi(fzMigliori(nuovi));
  showScreen("screen-fz-end");
}

// ---- eventi ----
document.addEventListener("click", e => {
  const t = e.target.closest("[data-fz-tipo]");
  if (t) { fzApriTipo(t.dataset.fzTipo); return; }
  const l = e.target.closest("[data-fz-liv]");
  if (l) { fzApriDettaglio(l.dataset.fzLiv, l.dataset.fzNome); return; }
});
document.addEventListener("DOMContentLoaded", () => {
  fzEl("fz-start").addEventListener("click", fzAvvia);
  fzEl("fz-end-back").addEventListener("click", () => fzApriTipo(fzSel.tipo));
  fzEl("fz-prev").addEventListener("click", ev => { ev.stopPropagation(); if (fzCur > 0) { fzCur--; fzRender(); } });
  fzEl("screen-fz-run").addEventListener("click", ev => {
    if (!fzAmrap) return;
    if (ev.target.closest("#fz-round-btn")) { fzRoundsFatti++; fzRenderAmrap(); try { if (navigator.vibrate) navigator.vibrate(40); } catch (e) {} }
    else if (ev.target.closest("#fz-round-undo") && fzRoundsFatti > 0) { fzRoundsFatti--; fzRenderAmrap(); }
  });
  fzEl("fz-exit").addEventListener("click", ev => {
    ev.stopPropagation();
    if (confirm(fzAmrap ? "Vuoi uscire dall'allenamento? Il risultato non verrà salvato." : "Vuoi uscire dall'allenamento? Il tempo non verrà salvato.")) { fzStop(); fzApriDettaglio(fzSel.livello, fzSel.nome); }
  });
  fzEl("screen-fz-run").addEventListener("click", ev => {
    if (fzAmrap || ev.target.closest("#fz-prev, #fz-exit")) return;
    if (fzCur < fzEx.length) { fzCur++; fzRender(); }
    else fzConcludi();
  });
});
