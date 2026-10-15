// ============================================================
// GESTIONE ALLENAMENTI FUNZIONALI (solo trainer)
// Crea, modifica ed elimina gli allenamenti nel foglio Google.
// Le immagini non si inseriscono qui: stanno nel tab "Archivio funzionale".
// ============================================================
let fgTab = FZ_TIPI[0];
let fgWo = null;   // {orig:{tipo,livello,nome}|null, nome, tipo, liv, ex:[{n,q,k,m,f}]}
let fgIdx = -1;    // indice dell'esercizio in modifica (-1 = nuovo)
let fgK = "peso";

function fgCodice() { try { return localStorage.getItem("gm_fz_codice") || ""; } catch (e) { return ""; } }

// Usa una richiesta GET (e' quella che Google Apps Script lascia leggere in modo affidabile dal browser).
// Se i dati sono troppi per l'indirizzo, ripiega su POST.
async function fgPost(payload) {
  payload.codice = fgCodice();
  const json = JSON.stringify(payload);
  const url = APPS_SCRIPT_URL + "?d=" + encodeURIComponent(json);
  let r;
  if (url.length < 7000) r = await fetch(url, { redirect: "follow" });
  else r = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: json });
  const testo = await r.text();
  try { return JSON.parse(testo); }
  catch (e) { throw new Error("risposta non valida dallo script: " + testo.slice(0, 60).replace(/\s+/g, " ")); }
}

// ---- ingresso ----
async function fgApri() {
  if (!fgCodice()) {
    fzEl("fg-code-input").value = "";
    fzEl("fg-code-err").textContent = "";
    showScreen("screen-fg-code");
    return;
  }
  await fgMostraLista();
}
async function fgConfermaCodice() {
  const v = fzEl("fg-code-input").value.trim();
  if (!v) return;
  fzEl("fg-code-ok").textContent = "ATTENDERE...";
  try { localStorage.setItem("gm_fz_codice", v); } catch (e) {}
  try {
    const r = await fgPost({ azione: "verifica" });
    if (r && r.ok) { await fgMostraLista(); }
    else { try { localStorage.removeItem("gm_fz_codice"); } catch (e) {} fzEl("fg-code-err").textContent = "Codice non corretto."; }
  } catch (e) {
    try { localStorage.removeItem("gm_fz_codice"); } catch (e2) {}
    fzEl("fg-code-err").textContent = "Non riesco a contattare lo script (" + (e && e.message ? e.message : "errore") + "). Controlla che il deployment sia aggiornato.";
  }
  fzEl("fg-code-ok").textContent = "CONFERMA";
}
async function fgMostraLista() {
  showScreen("screen-fg-lista");
  fzEl("fg-msg").textContent = fzCaricato ? "" : "Carico gli allenamenti...";
  try { await fzCarica(); fzEl("fg-msg").textContent = ""; }
  catch (e) { fzEl("fg-msg").textContent = "Non riesco a leggere il foglio. Riprova."; }
  fgRenderLista();
}

// ---- elenco ----
function fgRenderLista() {
  fzEl("fg-tabs").innerHTML = FZ_TIPI.map(t => '<button type="button" data-fg-tab="' + fzEsc(t) + '" class="' + (t === fgTab ? "on" : "") + '">' + fzEsc(t) + '</button>').join("");
  const righe = fzDati.filter(r => fzNorm(r.Tipo) === fzNorm(fgTab));
  let html = "";
  FZ_LIVELLI.forEach(liv => {
    const rl = righe.filter(r => fzNorm(r.Livello) === fzNorm(liv));
    const nomi = [];
    rl.forEach(r => { const n = (r.Allenamento || "").trim(); if (n && !nomi.includes(n)) nomi.push(n); });
    if (!nomi.length) return;
    html += '<div class="fz-group"><h3>' + liv + ' <span class="fz-tag ' + FZ_CLASSE[liv] + '">' + nomi.length + (nomi.length === 1 ? " allenamento" : " allenamenti") + '</span></h3>';
    nomi.forEach(n => {
      const q = rl.filter(r => (r.Allenamento || "").trim() === n).length;
      html += '<button class="fz-card" type="button" data-fg-wo="' + fzEsc(liv) + '|' + fzEsc(n) + '"><span class="txt"><span class="n">' + fzEsc(n) + '</span><span class="s">' + q + ' esercizi</span></span><span class="ar">&#8250;</span></button>';
    });
    html += "</div>";
  });
  fzEl("fg-lista").innerHTML = html || '<p class="fz-empty">Nessun allenamento per questo tipo. Creane uno con il tasto in basso.</p>';
}

// ---- modifica allenamento ----
const FG_CAT = { peso: "Pesi", free: "Corpo libero", corsa: "Corsa", macchinario: "Macchinario" };
function fgKDaCategoria(cat, n, m, f) {
  const c = fzNorm(cat);
  if (c.indexOf("macchin") === 0) return "macchinario";
  if (c.indexOf("corsa") === 0) return "corsa";
  if (c.indexOf("corpo") === 0) return "free";
  if (c.indexOf("pes") === 0) return "peso";
  return (m || f) ? "peso" : (/corsa/i.test(n) ? "corsa" : "free");
}
function fgDaRighe(tipo, liv, nome) {
  const righe = fzDati.filter(r => fzNorm(r.Tipo) === fzNorm(tipo) && fzNorm(r.Livello) === fzNorm(liv) && (r.Allenamento || "").trim() === nome);
  righe.sort((a, b) => (parseFloat(a.Ordine) || 0) - (parseFloat(b.Ordine) || 0));
  return righe.map(r => {
    const n = (r.Esercizio || "").trim(), m = fzKg(r["Kg uomo"]), f = fzKg(r["Kg donna"]);
    return { n, q: (r.Rep || "").trim(), m, f, k: fgKDaCategoria(r.Categoria, n, m, f) };
  });
}
function fgApriWo(liv, nome) {
  const tipo = fgTab;
  fgWo = { orig: { tipo, livello: liv, nome }, nome, tipo, liv, ex: fgDaRighe(tipo, liv, nome) };
  fgRenderEdit();
  showScreen("screen-fg-edit");
}
function fgNuovo() {
  fgWo = { orig: null, nome: "", tipo: fgTab, liv: "Facile", ex: [] };
  fgRenderEdit();
  showScreen("screen-fg-edit");
}
function fgRenderEdit() {
  fzEl("fg-edit-ttl").textContent = fgWo.orig ? "Modifica allenamento" : "Nuovo allenamento";
  fzEl("fg-nome").value = fgWo.nome;
  fzEl("fg-tipo").innerHTML = FZ_TIPI.map(t => '<option' + (t === fgWo.tipo ? " selected" : "") + '>' + fzEsc(t) + '</option>').join("");
  fzEl("fg-liv").innerHTML = FZ_LIVELLI.map(l => '<button type="button" data-fg-liv="' + l + '" class="' + (fgWo.liv === l ? "on" : "") + '">' + l + '</button>').join("");
  fzEl("fg-elimina").style.display = fgWo.orig ? "block" : "none";
  fzEl("fg-edit-err").textContent = "";
  fgRenderEx();
}
function fgRiga(e) {
  const d = [e.q || "—"];
  if (e.k === "peso") d.push("<b>" + fzEsc(e.m || "?") + " kg uomo · " + fzEsc(e.f || "?") + " kg donna</b>");
  else d.push("<b>" + ({ corsa: "Corsa", macchinario: "Macchinario" }[e.k] || "Corpo libero") + "</b>");
  return d.join(" · ");
}
function fgRenderEx() {
  fzEl("fg-ex").innerHTML = fgWo.ex.length ? fgWo.ex.map((e, i) =>
    '<div class="fg-ex"><span class="i">' + (i + 1) + '</span><div class="body" data-fg-ex="' + i + '"><div class="nm">' + fzEsc(e.n || "Senza nome") + '</div><div class="dt">' + fgRiga(e) + '</div></div>' +
    '<button type="button" class="fg-cp" data-fg-cp="' + i + '" aria-label="Duplica esercizio" title="Duplica">&#10697;</button>' +
    '<div class="fg-mv"><button type="button" data-fg-up="' + i + '" aria-label="Su">&#9650;</button><button type="button" data-fg-dn="' + i + '" aria-label="Giu">&#9660;</button></div></div>'
  ).join("") : '<p class="fz-empty">Nessun esercizio ancora. Aggiungine uno.</p>';
}

// ---- modifica esercizio ----
let fgQ = "rep";
const FG_UNITA = { tempo: ["sec", "min"], dist: ["m", "km"] };
function fgSetQ(q, unita) {
  fgQ = q;
  document.querySelectorAll("#fg-segq button").forEach(b => b.classList.toggle("on", b.dataset.q === q));
  const sel = fzEl("fg-ex-qu");
  if (q === "rep") { sel.style.display = "none"; fzEl("fg-ex-qn").placeholder = "Es. 12"; }
  else {
    sel.style.display = "";
    sel.innerHTML = FG_UNITA[q].map(u => '<option>' + u + '</option>').join("");
    if (unita && FG_UNITA[q].includes(unita)) sel.value = unita;
    fzEl("fg-ex-qn").placeholder = q === "tempo" ? "Es. 40" : "Es. 500";
  }
}
// "12" -> rep, "40 sec" / "5 min" -> tempo, "500 m" / "2 km" -> distanza
function fgLeggiQ(txt) {
  txt = (txt || "").trim();
  let m = txt.match(/^([\d.,]+)\s*(sec|s|min|m'|')?$/i);
  if (m && !m[2]) return { q: "rep", n: m[1], u: "" };
  m = txt.match(/^([\d.,]+)\s*(sec|s|secondi|min|minuti|')$/i);
  if (m) return { q: "tempo", n: m[1], u: /^m/i.test(m[2]) || m[2] === "'" ? "min" : "sec" };
  m = txt.match(/^([\d.,]+)\s*(km|m|metri)$/i);
  if (m) return { q: "dist", n: m[1], u: /^k/i.test(m[2]) ? "km" : "m" };
  return { q: "rep", n: txt, u: "" };
}
function fgSetK(k) {
  fgK = k;
  document.querySelectorAll("#fg-seg button").forEach(b => b.classList.toggle("on", b.dataset.k === k));
  fzEl("fg-pesi").style.display = k === "peso" ? "grid" : "none";
}
function fgApriEx(i) {
  fgIdx = i;
  const e = i >= 0 ? fgWo.ex[i] : { n: "", q: "", k: "peso", m: "", f: "" };
  fzEl("fg-sheet-ttl").textContent = i >= 0 ? "Esercizio " + (i + 1) : "Nuovo esercizio";
  fzEl("fg-ex-nome").value = e.n;
  const lq = fgLeggiQ(e.q);
  fgSetQ(i < 0 && e.k === "corsa" ? "dist" : lq.q, lq.u);
  fzEl("fg-ex-qn").value = lq.n;
  fzEl("fg-ex-m").value = e.m || "";
  fzEl("fg-ex-f").value = e.f || "";
  fzEl("fg-sheet-err").textContent = "";
  fzEl("fg-ex-del").style.display = i >= 0 ? "block" : "none";
  fgSetK(e.k);
  fgSuggerimenti();
  fzEl("fg-sheet").classList.add("on");
}
function fgNomiNoti() {
  const nomi = [], visti = {};
  const aggiungi = n => { const k = fzNorm(n); if (k && !visti[k]) { visti[k] = 1; nomi.push(n); } };
  fzDati.forEach(r => aggiungi((r.Esercizio || "").trim()));
  Object.keys(fzArchivio).forEach(k => aggiungi(fzArchivio[k].nome));
  return nomi.filter(n => !/^corsa/i.test(n));
}
function fgSuggerimenti() {
  const txt = fzNorm(fzEl("fg-ex-nome").value);
  const f = fgNomiNoti().filter(n => !txt || fzNorm(n).includes(txt)).slice(0, 5);
  fzEl("fg-sug").innerHTML = f.length ? f.map(n => '<button type="button" class="sug" data-fg-sug="' + fzEsc(n) + '">' + fzEsc(n) + '</button>').join("") : "";
  const arc = fzArchivio[txt];
  const st = fzEl("fg-img-stato");
  if (!txt) { st.textContent = ""; st.className = "fz-sub"; }
  else if (arc && (arc.img1 || arc.img2)) { st.textContent = "Immagini trovate nell'archivio."; st.className = "fz-sub fg-ok"; }
  else { st.textContent = "Nessuna immagine per questo esercizio: aggiungila una volta sola nel tab Archivio funzionale del foglio."; st.className = "fz-sub"; }
}
function fgScegliSuggerito(nome) {
  fzEl("fg-ex-nome").value = nome;
  const src = fzDati.find(r => fzNorm(r.Esercizio) === fzNorm(nome));
  if (src) {
    const m = fzKg(src["Kg uomo"]), f = fzKg(src["Kg donna"]);
    fzEl("fg-ex-m").value = m; fzEl("fg-ex-f").value = f;
    fgSetK(fgKDaCategoria(src.Categoria, src.Esercizio, m, f));
    if (!fzEl("fg-ex-qn").value) { const lq = fgLeggiQ(src.Rep); fgSetQ(lq.q, lq.u); fzEl("fg-ex-qn").value = lq.n; }
  }
  fgSuggerimenti();
}
function fgConfermaEx() {
  let n = fzEl("fg-ex-nome").value.trim();
  const num = fzEl("fg-ex-qn").value.trim();
  if (!n && fgK === "corsa") n = "Corsa";
  if (!n) { fzEl("fg-sheet-err").textContent = "Scrivi il nome dell'esercizio."; return; }
  if (!num) { fzEl("fg-sheet-err").textContent = "Scrivi quante ripetizioni, quanto tempo o quanti metri."; return; }
  const q = fgQ === "rep" ? num : num + " " + fzEl("fg-ex-qu").value;
  const e = { n, q, k: fgK, m: "", f: "" };
  if (fgK === "peso") {
    e.m = fzEl("fg-ex-m").value.trim().replace(/\s*kg$/i, "");
    e.f = fzEl("fg-ex-f").value.trim().replace(/\s*kg$/i, "");
    if (!e.m && !e.f) { fzEl("fg-sheet-err").textContent = "Inserisci almeno un peso, oppure scegli Corpo libero."; return; }
  }
  if (fgIdx >= 0) fgWo.ex[fgIdx] = e; else fgWo.ex.push(e);
  fzEl("fg-sheet").classList.remove("on");
  fgRenderEx();
}

// ---- salvataggio ed eliminazione ----
async function fgSalva() {
  const err = fzEl("fg-edit-err");
  fgWo.nome = fzEl("fg-nome").value.trim();
  fgWo.tipo = fzEl("fg-tipo").value;
  if (!fgWo.nome) { err.textContent = "Scrivi il nome dell'allenamento."; return; }
  if (!fgWo.ex.length) { err.textContent = "Aggiungi almeno un esercizio."; return; }
  const o = fgWo.orig;
  const stessa = o && fzNorm(o.tipo) === fzNorm(fgWo.tipo) && fzNorm(o.livello) === fzNorm(fgWo.liv) && fzNorm(o.nome) === fzNorm(fgWo.nome);
  const esiste = fzDati.some(r => fzNorm(r.Tipo) === fzNorm(fgWo.tipo) && fzNorm(r.Livello) === fzNorm(fgWo.liv) && fzNorm(r.Allenamento) === fzNorm(fgWo.nome));
  if (esiste && !stessa) { err.textContent = "Esiste gia un allenamento con questo nome, tipo e livello."; return; }
  const btn = fzEl("fg-salva");
  btn.textContent = "SALVO..."; btn.disabled = true; err.textContent = "";
  try {
    const r = await fgPost({
      azione: "salvaFunzionale", orig: fgWo.orig ? { tipo: o.tipo, livello: o.livello, nome: o.nome } : null,
      tipo: fgWo.tipo, livello: fgWo.liv, nome: fgWo.nome,
      esercizi: fgWo.ex.map(e => ({ nome: e.n, rep: e.q, categoria: FG_CAT[e.k] || "Corpo libero", kgUomo: e.k === "peso" ? e.m : "", kgDonna: e.k === "peso" ? e.f : "" }))
    });
    if (!r || !r.ok) throw new Error((r && r.errore) || "errore");
    fgAggiornaLocale(o, fgWo);
    fgTab = fgWo.tipo;
    showScreen("screen-fg-lista"); fgRenderLista();
    fzEl("fg-msg").textContent = "Salvato nel foglio Google.";
  } catch (e) {
    console.error(e);
    err.textContent = (e.message === "codice") ? "Codice trainer non valido." : "Non sono riuscito a salvare (" + (e && e.message ? e.message : "errore") + "). Riprova.";
    if (e.message === "codice") { try { localStorage.removeItem("gm_fz_codice"); } catch (e2) {} }
  }
  btn.textContent = "SALVA NEL FOGLIO"; btn.disabled = false;
}
// Aggiorna subito i dati in memoria, senza aspettare il foglio
function fgAggiornaLocale(o, w) {
  const immagini = {};
  if (o) {
    fzDati = fzDati.filter(r => {
      const mio = fzNorm(r.Tipo) === fzNorm(o.tipo) && fzNorm(r.Livello) === fzNorm(o.livello) && (r.Allenamento || "").trim() === o.nome;
      if (mio && (r["Immagine 1"] || r["Immagine 2"])) immagini[fzNorm(r.Esercizio)] = [r["Immagine 1"] || "", r["Immagine 2"] || ""];
      return !mio;
    });
  }
  w.ex.forEach((e, i) => {
    const im = immagini[fzNorm(e.n)] || ["", ""];
    fzDati.push({ Tipo: w.tipo, Livello: w.liv, Allenamento: w.nome, Ordine: String(i + 1), Esercizio: e.n, Rep: e.q, Categoria: FG_CAT[e.k] || "Corpo libero", "Kg uomo": e.k === "peso" ? e.m : "", "Kg donna": e.k === "peso" ? e.f : "", "Immagine 1": im[0], "Immagine 2": im[1] });
  });
}
let fgSicuro = false;
async function fgElimina() {
  const b = fzEl("fg-elimina");
  if (!fgSicuro) {
    fgSicuro = true; b.textContent = "TOCCA ANCORA PER CONFERMARE";
    setTimeout(() => { fgSicuro = false; b.textContent = "ELIMINA ALLENAMENTO"; }, 3000);
    return;
  }
  fgSicuro = false; b.textContent = "ELIMINO...";
  const o = fgWo.orig;
  try {
    const r = await fgPost({ azione: "eliminaFunzionale", tipo: o.tipo, livello: o.livello, nome: o.nome });
    if (!r || !r.ok) throw new Error((r && r.errore) || "errore");
    fzDati = fzDati.filter(x => !(fzNorm(x.Tipo) === fzNorm(o.tipo) && fzNorm(x.Livello) === fzNorm(o.livello) && (x.Allenamento || "").trim() === o.nome));
    showScreen("screen-fg-lista"); fgRenderLista();
    fzEl("fg-msg").textContent = "Allenamento eliminato.";
  } catch (e) {
    fzEl("fg-edit-err").textContent = "Non sono riuscito a eliminare. Riprova.";
  }
  b.textContent = "ELIMINA ALLENAMENTO";
}

// ---- eventi ----
document.addEventListener("click", e => {
  const t = e.target;
  let x;
  if ((x = t.closest("[data-fg-apri]"))) { fgApri(); return; }
  if ((x = t.closest("[data-fg-tab]"))) { fgTab = x.dataset.fgTab; fgRenderLista(); return; }
  if ((x = t.closest("[data-fg-wo]"))) { const p = x.dataset.fgWo.split("|"); fgApriWo(p[0], p.slice(1).join("|")); return; }
  if ((x = t.closest("[data-fg-liv]"))) { fgWo.liv = x.dataset.fgLiv; fgRenderEdit(); return; }
  if ((x = t.closest("[data-fg-ex]"))) { fgApriEx(+x.dataset.fgEx); return; }
  if ((x = t.closest("[data-fg-cp]"))) { const i = +x.dataset.fgCp; fgWo.ex.splice(i + 1, 0, JSON.parse(JSON.stringify(fgWo.ex[i]))); fgRenderEx(); return; }
  if ((x = t.closest("[data-fg-up]"))) { const i = +x.dataset.fgUp; if (i > 0) { const a = fgWo.ex; [a[i - 1], a[i]] = [a[i], a[i - 1]]; fgRenderEx(); } return; }
  if ((x = t.closest("[data-fg-dn]"))) { const i = +x.dataset.fgDn; const a = fgWo.ex; if (i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; fgRenderEx(); } return; }
  if ((x = t.closest("[data-fg-sug]"))) { fgScegliSuggerito(x.dataset.fgSug); return; }
  if ((x = t.closest("#fg-seg button"))) { fgSetK(x.dataset.k); if (x.dataset.k === "corsa" && !fzEl("fg-ex-qn").value.trim()) fgSetQ("dist"); return; }
  if ((x = t.closest("#fg-segq button"))) { fgSetQ(x.dataset.q); return; }
});
document.addEventListener("DOMContentLoaded", () => {
  fzEl("fg-code-ok").addEventListener("click", fgConfermaCodice);
  fzEl("fg-nuovo").addEventListener("click", fgNuovo);
  fzEl("fg-add").addEventListener("click", () => fgApriEx(-1));
  fzEl("fg-ex-ok").addEventListener("click", fgConfermaEx);
  fzEl("fg-ex-del").addEventListener("click", () => { fgWo.ex.splice(fgIdx, 1); fzEl("fg-sheet").classList.remove("on"); fgRenderEx(); });
  fzEl("fg-sheet-close").addEventListener("click", () => fzEl("fg-sheet").classList.remove("on"));
  fzEl("fg-ex-nome").addEventListener("input", fgSuggerimenti);
  fzEl("fg-edit-back").addEventListener("click", () => { showScreen("screen-fg-lista"); fgRenderLista(); });
  fzEl("fg-nome").addEventListener("input", () => { fgWo.nome = fzEl("fg-nome").value; });
  fzEl("fg-tipo").addEventListener("change", () => { fgWo.tipo = fzEl("fg-tipo").value; });
  fzEl("fg-salva").addEventListener("click", fgSalva);
  fzEl("fg-elimina").addEventListener("click", fgElimina);
});
