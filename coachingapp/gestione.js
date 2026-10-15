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
      html += '<button class="fz-card" type="button" data-fg-wo="' + fzEsc(liv) + '|' + fzEsc(n) + '"><span class="txt"><span class="n">' + fzEsc(n) + '</span><span class="s">' + q + ' esercizi</span></span><span class="s" style="font-weight:600;color:#111">&#9998; Modifica</span></button>';
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
const FG_UNITA = { tempo: ["sec", "min"], dist: ["m", "km"], cal: ["cal"] };
function fgSetQ(q, unita) {
  fgQ = q;
  document.querySelectorAll("#fg-segq button").forEach(b => b.classList.toggle("on", b.dataset.q === q));
  const sel = fzEl("fg-ex-qu");
  if (q === "rep") { sel.style.display = "none"; fzEl("fg-ex-qn").placeholder = "Es. 12"; }
  else {
    sel.style.display = "";
    sel.innerHTML = FG_UNITA[q].map(u => '<option>' + u + '</option>').join("");
    if (unita && FG_UNITA[q].includes(unita)) sel.value = unita;
    fzEl("fg-ex-qn").placeholder = q === "tempo" ? "Es. 40" : (q === "cal" ? "Es. 25" : "Es. 500");
  }
}
// "12" -> rep, "40 sec" / "5 min" -> tempo, "500 m" / "2 km" -> distanza
function fgLeggiQ(txt) {
  txt = (txt || "").trim();
  let m = txt.match(/^([\d.,]+)\s*(sec|s|min|m'|')?$/i);
  if (m && !m[2]) return { q: "rep", n: m[1], u: "" };
  m = txt.match(/^([\d.,]+)\s*(sec|s|secondi|min|minuti|')$/i);
  if (m) return { q: "tempo", n: m[1], u: /^m/i.test(m[2]) || m[2] === "'" ? "min" : "sec" };
  m = txt.match(/^([\d.,]+)\s*(kcal|cal|calorie)$/i);
  if (m) return { q: "cal", n: m[1], u: "cal" };
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
  fgAggiornaImg();
}
// ---- immagini dell'esercizio (caricate su Supabase, scritte nel tab Archivio funzionale) ----
let fgImgSlot = 0;
function fgAggiornaImg() {
  const txt = fzNorm(fzEl("fg-ex-nome").value);
  const arc = fzArchivio[txt] || {};
  const st = fzEl("fg-img-stato");
  st.className = "fz-sub";
  st.textContent = txt ? "" : "Scrivi prima il nome dell'esercizio, poi aggiungi le immagini.";
  [1, 2].forEach(n => {
    const box = document.querySelector('.fg-slot[data-slot="' + n + '"]');
    const url = fzImg(arc["img" + n]);
    box.classList.toggle("has", !!url);
    box.querySelector(".fg-slot-btn").innerHTML = url ? '<img src="' + fzEsc(url) + '" alt="">' : '<span class="fg-slot-plus">+ Immagine ' + n + '</span>';
  });
}
// riduce la foto (max 1000 px, JPEG) cosi' si carica e si vede subito
function fgRidimensiona(file) {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, 1000 / Math.max(im.width, im.height));
      const c = document.createElement("canvas");
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? ok(b) : ko(new Error("immagine non valida")), "image/jpeg", 0.85);
    };
    im.onerror = () => { URL.revokeObjectURL(url); ko(new Error("immagine non valida")); };
    im.src = url;
  });
}
// ---- caricamento immagini ----
// Percorso veloce: la foto va direttamente su Supabase e il link viene registrato con una funzione
// protetta dal codice trainer. Il foglio Google si aggiorna da solo subito dopo (script, ogni minuto).
// Se in Supabase non e' ancora stato fatto il setup, ripiega sul vecchio percorso (script di Google).
function fgSlug(nome) {
  return String(nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "esercizio";
}
function fgSbBase() { return SUPABASE_URL.replace(/\/+$/, ""); }
function fgSbHdr(extra) { return Object.assign({ apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY }, extra || {}); }

// registra (o svuota, con url "") l'immagine di un esercizio. Restituisce false se la funzione non esiste ancora.
async function fgImpostaImmagine(nome, slot, url, dest) {
  const r = await fetch(fgSbBase() + "/rest/v1/rpc/gm_imposta_immagine", {
    method: "POST", headers: fgSbHdr({ "Content-Type": "application/json" }),
    body: JSON.stringify({ p_codice: fgCodice(), p_dest: dest, p_nome: nome, p_slot: slot, p_url: url }) });
  if (r.status === 404) return false;
  if (!r.ok) throw new Error("Supabase " + r.status);
  if ((await r.json()) !== true) throw new Error("codice trainer non valido (controlla gm_config su Supabase)");
  return true;
}

async function fgUploadScript(nome, slot, blob, dest) {
  const r1 = await fgPost({ azione: "urlImmagine", esercizio: nome, slot, dest });
  if (!r1.ok) throw new Error(r1.errore || "errore");
  const fd = new FormData(); fd.append("cacheControl", "31536000"); fd.append("", blob);
  const up = await fetch(fgSbBase() + "/storage/v1/object/upload/sign/esercizi/" + r1.path + "?token=" + encodeURIComponent(r1.token), {
    method: "PUT", headers: { apikey: SUPABASE_ANON_KEY, "x-upsert": "true" }, body: fd });
  if (!up.ok) throw new Error("caricamento non riuscito (" + up.status + ")");
  const r2 = await fgPost({ azione: "salvaImmagine", esercizio: nome, slot, path: r1.path, dest });
  if (!r2.ok) throw new Error(r2.errore || "errore");
  return r2.url;
}

// carica una foto. dest: "funzionale" | "palestra"
async function fgUpload(nome, slot, file, dest) {
  if (!supabaseAttivo()) throw new Error("Supabase non e' ancora collegato (config.js)");
  const blob = await fgRidimensiona(file);
  const path = (dest === "palestra" ? "palestra-" : "") + fgSlug(nome) + "-" + slot + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + ".jpg";
  const up = await fetch(fgSbBase() + "/storage/v1/object/esercizi/" + path, {
    method: "POST", headers: fgSbHdr({ "Content-Type": "image/jpeg", "x-upsert": "false", "cache-control": "max-age=31536000" }), body: blob });
  if (up.ok) {
    const url = fgSbBase() + "/storage/v1/object/public/esercizi/" + path;
    if (await fgImpostaImmagine(nome, slot, url, dest)) return url;
  }
  return fgUploadScript(nome, slot, blob, dest); // setup Supabase non ancora fatto
}

// toglie l'immagine (subito su Supabase; il foglio si aggiorna dopo)
async function fgRimuoviSb(nome, slot, dest) {
  if (supabaseAttivo() && await fgImpostaImmagine(nome, slot, "", dest)) return;
  const r = await fgPost({ azione: "rimuoviImmagine", esercizio: nome, slot, dest });
  if (!r.ok) throw new Error(r.errore || "errore");
}

async function fgCaricaImg(file) {
  const nome = fzEl("fg-ex-nome").value.trim();
  const n = fgImgSlot;
  const st = fzEl("fg-img-stato"), box = document.querySelector('.fg-slot[data-slot="' + n + '"]');
  if (!nome || !box) { st.textContent = "Scrivi prima il nome dell'esercizio."; return; }
  box.classList.add("busy"); st.className = "fz-sub"; st.textContent = "Carico l'immagine...";
  try {
    const url = await fgUpload(nome, n, file, "funzionale");
    const k = fzNorm(nome);
    fzArchivio[k] = Object.assign({ nome, img1: "", img2: "" }, fzArchivio[k], { nome });
    fzArchivio[k]["img" + n] = url;
    fgAggiornaImg();
    st.className = "fz-sub fg-ok"; st.textContent = "Immagine salvata.";
  } catch (e) {
    st.className = "fz-sub"; st.textContent = "Non riesco a caricare l'immagine: " + e.message;
  }
  box.classList.remove("busy");
}
async function fgRimuoviImg(n) {
  const nome = fzEl("fg-ex-nome").value.trim();
  if (!nome) return;
  const st = fzEl("fg-img-stato");
  const a = fzArchivio[fzNorm(nome)];
  const prima = a ? a["img" + n] : "";
  if (a) a["img" + n] = "";
  fgAggiornaImg();
  try {
    await fgRimuoviSb(nome, n, "funzionale");
  } catch (e) {
    if (a) a["img" + n] = prima;
    fgAggiornaImg();
    st.className = "fz-sub"; st.textContent = "Non riesco a rimuovere: " + e.message;
  }
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
  if ((x = t.closest("[data-fg-imgdel]"))) { fgRimuoviImg(+x.dataset.fgImgdel); return; }
  if ((x = t.closest("[data-fg-img]"))) { fgImgSlot = +x.dataset.fgImg; if (!fzEl("fg-ex-nome").value.trim()) { fzEl("fg-img-stato").textContent = "Scrivi prima il nome dell'esercizio."; return; } fzEl("fg-file").value = ""; fzEl("fg-file").click(); return; }
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
  fzEl("fg-file").addEventListener("change", ev => { const f = ev.target.files && ev.target.files[0]; if (f) fgCaricaImg(f); });
  fzEl("fg-edit-back").addEventListener("click", () => { showScreen("screen-fg-lista"); fgRenderLista(); });
  fzEl("fg-nome").addEventListener("input", () => { fgWo.nome = fzEl("fg-nome").value; });
  fzEl("fg-tipo").addEventListener("change", () => { fgWo.tipo = fzEl("fg-tipo").value; });
  fzEl("fg-salva").addEventListener("click", fgSalva);
  fzEl("fg-elimina").addEventListener("click", fgElimina);
});


// ============================================================
// IMMAGINI ESERCIZI PALESTRA (partenza e arrivo, una volta sola per esercizio)
// Salvate nel tab "Archivio esercizi" (colonne Immagine 1 e Immagine 2)
// ============================================================
let fgPalTarget = null; // {nome, slot}

function fgPalChiave(nome) {
  const n = fzNorm(nome);
  return Object.keys(archivio).find(k => fzNorm(k) === n) || "";
}
function fgPalNomi() {
  const q = fzNorm(fzEl("fg-pal-q").value);
  return Object.keys(archivio).sort((a, b) => a.localeCompare(b, "it")).filter(n => !q || fzNorm(n).includes(q));
}
function fgPalRender() {
  const q = fzEl("fg-pal-q").value.trim();
  const nomi = fgPalNomi();
  const slot = (nome, n) => {
    const url = fzImg((archivio[nome] || {})["img" + n]);
    return '<div class="fg-slot' + (url ? " has" : "") + '"><button type="button" class="fg-slot-btn" data-pal-img="' + n + '" data-pal-nome="' + fzEsc(nome) + '">' +
      (url ? '<img src="' + fzEsc(url) + '" alt="">' : '<span class="fg-slot-plus">+ ' + (n === 1 ? "Partenza" : "Arrivo") + '</span>') +
      '</button><button type="button" class="fg-slot-x" data-pal-del="' + n + '" data-pal-nome="' + fzEsc(nome) + '" aria-label="Rimuovi">&#10005;</button></div>';
  };
  let h = nomi.map(n => '<div class="fg-pal-row"><div class="fg-pal-nm">' + fzEsc(n) + '</div><div class="fg-imgs">' + slot(n, 1) + slot(n, 2) + '</div></div>').join("");
  if (q && !fgPalChiave(q)) h += '<button type="button" class="fz-btn fg-ghost" data-pal-new="' + fzEsc(q) + '" style="margin:10px 0 0">+ AGGIUNGI &laquo;' + fzEsc(q) + '&raquo;</button>';
  if (!h) h = '<p class="fz-sub">Nessun esercizio nell\'archivio.</p>';
  fzEl("fg-pal-lista").innerHTML = h;
}
function fgPalApri() {
  fzEl("fg-pal-q").value = ""; fzEl("fg-pal-msg").textContent = "";
  showScreen("screen-fg-pal"); fgPalRender();
}
async function fgPalCarica(file) {
  const t = fgPalTarget; if (!t) return;
  const msg = fzEl("fg-pal-msg");
  msg.className = "fz-sub"; msg.textContent = "Carico l'immagine di " + t.nome + "...";
  try {
    const url = await fgUpload(t.nome, t.slot, file, "palestra");
    const k = fgPalChiave(t.nome) || t.nome;
    archivio[k] = Object.assign({ video: "", descrizione: "", alternative: [], img1: "", img2: "" }, archivio[k]);
    archivio[k]["img" + t.slot] = url;
    msg.className = "fz-sub fg-ok"; msg.textContent = "Immagine salvata.";
    fgPalRender();
  } catch (e) { msg.className = "fz-sub"; msg.textContent = "Non riesco a caricare: " + e.message; }
}
// elimina subito dallo schermo; la richiesta allo script parte in sottofondo (se fallisce, rimette l'immagine)
async function fgPalRimuovi(nome, slot) {
  const msg = fzEl("fg-pal-msg");
  const k = fgPalChiave(nome);
  const prima = k ? archivio[k]["img" + slot] : "";
  if (k) archivio[k]["img" + slot] = "";
  fgPalRender();
  try {
    await fgRimuoviSb(nome, slot, "palestra");
  } catch (e) {
    if (k) archivio[k]["img" + slot] = prima;
    fgPalRender();
    msg.className = "fz-sub"; msg.textContent = "Non sono riuscito a rimuovere l'immagine di " + nome + ": " + e.message;
  }
}
document.addEventListener("click", ev => {
  const t = ev.target; let x;
  if ((x = t.closest("[data-pal-del]"))) { fgPalRimuovi(x.dataset.palNome, +x.dataset.palDel); return; }
  if ((x = t.closest("[data-pal-img]"))) { fgPalTarget = { nome: x.dataset.palNome, slot: +x.dataset.palImg }; fzEl("fg-pal-file").value = ""; fzEl("fg-pal-file").click(); return; }
  if ((x = t.closest("[data-pal-new]"))) { const n = x.dataset.palNew.trim(); if (n && !fgPalChiave(n)) archivio[n] = { video: "", descrizione: "", alternative: [], img1: "", img2: "" }; fzEl("fg-pal-q").value = n; fgPalRender(); return; }
});
document.addEventListener("DOMContentLoaded", () => {
  fzEl("fg-pal-open").addEventListener("click", fgPalApri);
  fzEl("fg-pal-q").addEventListener("input", fgPalRender);
  fzEl("fg-pal-file").addEventListener("change", ev => { const f = ev.target.files && ev.target.files[0]; if (f) fgPalCarica(f); });
});
