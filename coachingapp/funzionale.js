// ============================================================
// ALLENAMENTO FUNZIONALE
// ============================================================
const FZ_TIPI = ["Pesi + Corsa", "Pesi senza Corsa", "Corpo libero + Corsa", "Corpo libero senza Corsa"];
const FZ_LIVELLI = ["Facile", "Intermedio", "Difficile"];
const FZ_CLASSE = { Facile: "fz-f", Intermedio: "fz-i", Difficile: "fz-d" };

let fzDati = [];
let fzCaricato = false;
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
    fzDati = (await fetchCsv(FUNZIONALE_CSV_URL)).filter(r => r.Esercizio && r.Esercizio.trim() !== "");
    fzCaricato = true;
    fzEl("fz-tipi-msg").textContent = "";
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
function fzTempi() {
  try { return JSON.parse(localStorage.getItem(fzChiaveTempi()) || "[]"); } catch (e) { return []; }
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
    return {
      nome,
      rep: fzRep(r.Rep),
      kg,
      etichetta: kg ? "" : (/corsa/i.test(nome) ? "CORSA" : "CORPO LIBERO"),
      img1: fzImg(r["Immagine 1"]),
      img2: fzImg(r["Immagine 2"])
    };
  });
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
  fzEl("fz-det-tempi").innerHTML = fzListaTempi(fzTempi().slice(0, 3));
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
  const nuovi = [{ ms, d: new Date().toISOString() }].concat(prima).slice(0, 3);
  try { localStorage.setItem(fzChiaveTempi(), JSON.stringify(nuovi)); } catch (e) {}
  fzEl("fz-end-time").textContent = fzFmt(ms);
  let cmp = "Primo tempo registrato per questo allenamento.";
  if (prima.length) {
    const diff = Math.round((ms - prima[0].ms) / 1000);
    cmp = diff < 0 ? "Hai fatto meglio dell'ultima volta di " + fzFmt(-diff * 1000) + "!" :
          diff > 0 ? "Hai impiegato " + fzFmt(diff * 1000) + " in più dell'ultima volta." : "Stesso tempo dell'ultima volta.";
  }
  fzEl("fz-end-cmp").textContent = cmp;
  fzEl("fz-end-list").innerHTML = fzListaTempi(nuovi);
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
