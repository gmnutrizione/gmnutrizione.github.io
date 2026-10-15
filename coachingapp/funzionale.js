// ============================================================
// ALLENAMENTO FUNZIONALE
// ============================================================
const FZ_TIPI = ["Pesi + Corsa", "Pesi senza Corsa", "Corpo libero + Corsa", "Corpo libero senza Corsa"];
const FZ_LIVELLI = ["Standard", "Facile", "Intermedio", "Difficile"];
const FZ_CLASSE = { Standard: "fz-s", Facile: "fz-f", Intermedio: "fz-i", Difficile: "fz-d" };

let fzDati = [];
let fzCaricato = false;
let fzArchivio = {};   // nome esercizio (normalizzato) -> {nome, img1, img2}
let fzSel = { tipo: "", livello: "", nome: "" };
let fzEx = [];
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
}

// ---- apertura sezione ----
async function fzApri() {
  showScreen("screen-fz-tipo");
  const box = fzEl("fz-tipi");
  box.innerHTML = FZ_TIPI.map(t =>
    '<button class="fz-card" type="button" data-fz-tipo="' + fzEsc(t) + '"><span class="txt"><span class="n">' + fzEsc(t) + '</span></span><span class="ar">&#8250;</span></button>'
  ).join("");
  if (typeof FUNZIONALE_CSV_URL === "undefined" || FUNZIONALE_CSV_URL.includes("INSERISCI")) {
    fzEl("fz-tipi-msg").textContent = "Elenco allenamenti non ancora collegato.";
    return;
  }
  fzEl("fz-tipi-msg").textContent = fzCaricato ? "" : "Carico gli allenamenti...";
  try {
    await fzCarica();
    fzEl("fz-tipi-msg").textContent = "";
    fzSincronizza();
  } catch (e) {
    console.error(e);
    fzEl("fz-tipi-msg").textContent = "Non riesco a caricare gli allenamenti. Riprova.";
  }
}

// ---- elenco allenamenti per tipo ----
function fzApriTipo(tipo) {
  fzSel.tipo = tipo;
  fzEl("fz-liv-title").textContent = tipo;
  const righe = fzDati.filter(r => fzNorm(r.Tipo) === fzNorm(tipo));
  const box = fzEl("fz-livelli");
  if (!righe.length) {
    box.innerHTML = '<p class="fz-empty">Nessun allenamento disponibile per ora.</p>';
    showScreen("screen-fz-liv");
    return;
  }
  let html = "";
  FZ_LIVELLI.forEach(liv => {
    const rl = righe.filter(r => fzNorm(r.Livello) === fzNorm(liv));
    const nomi = [];
    rl.forEach(r => { const n = (r.Allenamento || "").trim(); if (n && !nomi.includes(n)) nomi.push(n); });
    if (!nomi.length) return;
    html += '<div class="fz-group"><h3>' + liv + ' <span class="fz-tag ' + FZ_CLASSE[liv] + '">' + nomi.length + (nomi.length === 1 ? ' allenamento' : ' allenamenti') + '</span></h3>';
    nomi.forEach(n => {
      const q = rl.filter(r => (r.Allenamento || "").trim() === n).length;
      html += '<button class="fz-card" type="button" data-fz-liv="' + fzEsc(liv) + '" data-fz-nome="' + fzEsc(n) + '"><span class="txt"><span class="n">' + fzEsc(n) + '</span><span class="s">' + q + ' esercizi</span></span><span class="ar">&#8250;</span></button>';
    });
    html += '</div>';
  });
  box.innerHTML = html || '<p class="fz-empty">Nessun allenamento disponibile per ora.</p>';
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
  const rem = fzRemote.filter(x => x.tipo === k[0] && x.liv === k[1] && x.nome === k[2]).map(x => ({ ms: x.ms, d: x.d }));
  const visti = {}, tutti = [];
  fzTempiLocali().concat(rem).forEach(x => { if (!visti[x.d]) { visti[x.d] = 1; tutti.push(x); } });
  tutti.sort((a, b) => new Date(b.d) - new Date(a.d));
  return tutti;
}
// I 3 tempi migliori (i piu' bassi)
function fzMigliori(arr) {
  return arr.slice().sort((a, b) => a.ms - b.ms).slice(0, 3);
}
// Legge dal foglio i risultati del cliente (anche di un telefono precedente)
function fzSincronizza() {
  if (typeof FUNZIONALE_RISULTATI_URL === "undefined" || !FUNZIONALE_RISULTATI_URL) return Promise.resolve();
  fzSyncP = fetchCsv(FUNZIONALE_RISULTATI_URL).then(rows => {
    fzRemote = rows.filter(r => fzNorm(r.Cliente) === fzNorm(clienteNome)).map(r => ({
      tipo: fzNorm(r.Tipo), liv: fzNorm(r.Livello), nome: fzNorm(r.Allenamento),
      ms: (parseFloat(String(r.Secondi).replace(",", ".")) || 0) * 1000, d: (r.ISO || "").trim()
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
  inviaEvento({ tipo: "Funzionale", tipoAllenamento: x.t, livello: x.l, allenamento: x.n, tempo: fzFmt(x.ms), secondi: Math.round(x.ms / 1000), iso: x.d });
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
  if (!arr.length) return '<div class="fz-r"><span>Nessun tempo ancora</span></div>';
  return arr.map((x, i) => '<div class="fz-r' + (i === 0 ? ' top' : '') + '"><span>' + fzData(x.d) + '</span><b>' + fzFmt(x.ms) + '</b></div>').join("");
}

// ---- dettaglio allenamento ----
function fzCostruisciEx() {
  const sesso = fzSesso();
  const righe = fzDati.filter(r =>
    fzNorm(r.Tipo) === fzNorm(fzSel.tipo) && fzNorm(r.Livello) === fzNorm(fzSel.livello) && (r.Allenamento || "").trim() === fzSel.nome);
  righe.sort((a, b) => (parseFloat(a.Ordine) || 0) - (parseFloat(b.Ordine) || 0));
  fzEx = righe.map(r => {
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
  const haPesi = fzEx.some(e => e.kg);
  fzEl("fz-det-meta").innerHTML =
    '<span class="fz-tag ' + FZ_CLASSE[liv] + '">' + liv + '</span><span class="fz-pill">' + fzEx.length + ' esercizi</span>' +
    (haPesi ? '<span class="fz-pill">Pesi per ' + (sesso === "F" ? "donna" : "uomo") + '</span>' : '');
  fzEl("fz-det-tempi").innerHTML = fzListaTempi(fzMigliori(fzTempi()));
  if (fzSyncP) fzSyncP.then(() => {
    if (fzEl("screen-fz-det").classList.contains("active")) fzEl("fz-det-tempi").innerHTML = fzListaTempi(fzMigliori(fzTempi()));
  });
  fzEl("fz-det-ex").innerHTML = fzEx.map((e, i) =>
    '<div class="fz-row"><span class="i">' + (i + 1) + '</span><div class="nm">' + fzEsc(e.nome) + '<div class="dt">' + fzEsc(e.rep) + '</div></div><span class="kg">' + fzEsc(fzDestra(e)) + '</span></div>'
  ).join("");
  showScreen("screen-fz-det");
}

// ---- allenamento in corso ----
async function fzAvvia() {
  if (!fzEx.length) return;
  fzCur = 0; fzT0 = Date.now();
  showScreen("screen-fz-run");
  fzRender();
  fzEl("fz-clock").textContent = "00:00";
  if (fzIv) clearInterval(fzIv);
  fzIv = setInterval(() => { fzEl("fz-clock").textContent = fzFmt(Date.now() - fzT0); }, 500);
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
function fzRender() {
  const ultimo = fzCur >= fzEx.length;
  fzEl("fz-count").className = "fz-lbl";
  fzEl("fz-count").textContent = ultimo ? "Ultimo passo" : "Esercizio " + (fzCur + 1) + " di " + fzEx.length;
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
  fzEl("fz-exit").addEventListener("click", ev => {
    ev.stopPropagation();
    if (confirm("Vuoi uscire dall'allenamento? Il tempo non verrà salvato.")) { fzStop(); fzApriDettaglio(fzSel.livello, fzSel.nome); }
  });
  fzEl("screen-fz-run").addEventListener("click", ev => {
    if (ev.target.closest("#fz-prev, #fz-exit")) return;
    if (fzCur < fzEx.length) { fzCur++; fzRender(); }
    else fzConcludi();
  });
});
