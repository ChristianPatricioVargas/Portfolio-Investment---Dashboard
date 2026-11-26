// agenti/cacciatore.js = la parte della pagina del CACCIATORE (le occasioni).
//   - la pagina "Occasioni": le prime 20 della classifica, i filtri per area e settore,
//     quelle che ci vanno vicino, e tutta la watchlist (con "togli" e, nel pannello "Avanzate", "aggiungi")
//   - nella pagina di un titolo: il riquadro con i quattro criteri, uno per uno
//   - la pagina di un titolo che NON hai in portafoglio (stesse analisi, senza la parte personale)
// I criteri li controlla ogni sera scripts/agenti/cacciatore.py: qui li mostriamo soltanto.
// Il cacciatore segnala e spiega: non dice mai "compra".

// I titoli che hai tolto dalla watchlist: salvati solo nel browser (e nel backup)
const CHIAVE_WATCHLIST = "watchlist-v1";
let watchlistLocale = { nascosti: [] };

function pulisciWatchlist(dati) {
  const nascosti = dati && Array.isArray(dati.nascosti) ? dati.nascosti.filter((t) => typeof t === "string") : [];
  return { nascosti: [...new Set(nascosti)] };
}

function caricaWatchlist() {
  try {
    return pulisciWatchlist(JSON.parse(localStorage.getItem(CHIAVE_WATCHLIST) || "{}"));
  } catch (errore) {
    return { nascosti: [] };
  }
}

function salvaWatchlist() {
  try { localStorage.setItem(CHIAVE_WATCHLIST, JSON.stringify(watchlistLocale)); } catch (errore) { /* pazienza */ }
}

const nascosto = (ticker) => watchlistLocale.nascosti.includes(ticker);

// Quanti segnali (criteri rispettati) ha un titolo: da 0 a 4
function segnali(ticker) {
  return ((analisi.titoli[ticker] || {}).cacciatore || {}).rispettati || 0;
}

// Le sigle della watchlist con almeno "minimo" segnali (e al massimo "massimo"), senza quelle che hai tolto.
// Prima chi ha più segnali; a parità, chi ha il punteggio più alto.
function occasioni(minimo = 3, massimo = 4) {
  return Object.keys(analisi.titoli)
    .filter((t) => analisi.titoli[t].gruppo === "watchlist" && !nascosto(t) && segnali(t) >= minimo && segnali(t) <= massimo)
    .sort((a, b) => segnali(b) - segnali(a) ||
      analisi.titoli[b].cacciatore.punteggio - analisi.titoli[a].cacciatore.punteggio || a.localeCompare(b));
}

// "✓" rispettato, "✗" non rispettato, "?" dato mancante: un simbolo, non solo un colore
function simboloCriterio(c) {
  if (c.ok === true) return ["✓", "positivo", "rispettato"];
  if (c.ok === false) return ["✗", "negativo", "non rispettato"];
  return ["?", "", "dato mancante"];
}

// Il quadratino con la sigla ("ASML.AS" → "ASML")
function creaSigla(ticker) {
  const info = infoTitolo(ticker);
  const sigla = document.createElement("div");
  sigla.className = "sigla";
  sigla.textContent = ticker.split(".")[0].slice(0, 6);
  sigla.style.background = info.colori[0];
  sigla.style.color = info.colori[1];
  return sigla;
}

const QUANTE_SPICCANO = 5;          // quante occasioni mostra la pagina Oggi
const QUANTE_IN_CLASSIFICA = 20;    // quante schede grandi mostra la pagina Occasioni

// I filtri della pagina Occasioni ("" = tutti). Li ricordiamo su questo dispositivo: non sono dati personali.
const CHIAVE_FILTRI = "occasioni-filtri-v1";
const filtroOccasioni = { area: "", settore: "" };
const AREE = ["Europa", "USA", "Asia"];

// Vero se un titolo passa i filtri scelti
function passaFiltri(ticker) {
  const s = analisi.titoli[ticker] || {};
  return (!filtroOccasioni.area || s.area === filtroOccasioni.area) &&
    (!filtroOccasioni.settore || (s.settore || "") === filtroOccasioni.settore);
}

function salvaFiltri() {
  try { localStorage.setItem(CHIAVE_FILTRI, JSON.stringify(filtroOccasioni)); } catch (errore) { /* pazienza */ }
}

// Dove sta andando il prezzo adesso (dall'analisi tecnica). Non è una previsione: descrive le ultime settimane.
function testoDirezione(ticker) {
  const t = (analisi.titoli[ticker] || {}).tecnica;
  if (!t) return "";
  if (t.sopraMm50 && t.sopraMm200) return "↗ Il prezzo è sopra le medie a 50 e 200 giorni: la tendenza è già positiva.";
  if (t.sopraMm50) return "↗ Il prezzo è tornato sopra la media a 50 giorni: sta provando a risalire.";
  return "↘ Il prezzo è ancora sotto la media a 50 giorni: per ora non sta risalendo.";
}

// La scheda di un'occasione: nome, perché compare, i criteri. Toccandola si apre il dettaglio.
// "extra" è una riga in più in fondo (la usa la pagina Oggi per il rischio principale).
function creaSchedaOccasione(ticker, posto = null, extra = "") {
  const s = analisi.titoli[ticker];
  const c = s.cacciatore;
  const scheda = document.createElement("button");
  scheda.type = "button";
  scheda.className = "scheda scheda-occasione";
  scheda.appendChild(creaSigla(ticker));
  const info = document.createElement("div");
  info.className = "info";
  info.innerHTML = `<div class="nome"><span></span><span class="tag"></span></div>
    <div class="dettaglio motivo"></div><div class="criteri-brevi"></div><div class="dettaglio extra"></div>`;
  info.querySelector(".nome span").textContent = (posto ? posto + ". " : "") + s.nome;
  scheda.classList.toggle("tutti-i-segnali", c.rispettati === 4);
  info.querySelector(".tag").textContent = [s.area, s.settore, `${c.rispettati} su 4`].filter(Boolean).join(" · ");
  info.querySelector(".motivo").textContent = c.motivo;
  const brevi = info.querySelector(".criteri-brevi");
  // Se li rispetta tutti lo dice già la frase: l'elenco serve solo quando ne manca qualcuno
  for (const criterio of c.rispettati === 4 ? [] : c.criteri) {
    const [simbolo, classe, stato] = simboloCriterio(criterio);
    const voce = document.createElement("span");
    voce.className = "criterio-breve " + classe;
    voce.textContent = `${simbolo} ${criterio.nome}`;
    voce.title = `${stato}: ${criterio.testo}`;
    brevi.appendChild(voce);
  }
  info.querySelector(".extra").textContent = extra;
  scheda.appendChild(info);
  // A destra ciò che distingue un'occasione dall'altra: quanto è scesa dal massimo e il punteggio
  const cifre = document.createElement("div");
  cifre.className = "cifre cifre-occasione";
  const dalMassimo = s.tecnica ? s.tecnica.dalMassimo : null;
  cifre.innerHTML = `<span class="valore"></span><small>dal massimo</small>
    <span class="punteggio"><b></b> punti</span><span class="barra-punti" aria-hidden="true"><span></span></span>`;
  cifre.querySelector(".valore").textContent = typeof dalMassimo === "number" ? percUno(dalMassimo, true) : "–";
  cifre.querySelector(".valore").classList.toggle("negativo", typeof dalMassimo === "number" && dalMassimo < 0);
  cifre.querySelector(".punteggio b").textContent = c.punteggio;
  cifre.querySelector(".barra-punti span").style.width = Math.max(0, Math.min(100, c.punteggio)) + "%";
  cifre.title = `${c.rispettati} segnali su 4, ${c.punteggio} punti su 100`;
  scheda.appendChild(cifre);
  scheda.onclick = () => vaiAlTitolo(ticker);
  return scheda;
}

// ---------- La pagina "Occasioni" ----------

function disegnaOccasioni() {
  const criteri = analisi.criteri;
  const pronta = Boolean(criteri && analisi.classifica);
  $("attesa-occasioni").hidden = pronta;
  $("corpo-occasioni").hidden = !pronta;
  if (!pronta) return;

  const p100 = (n) => Math.round(n * 100) + "%";
  $("criteri-occasioni").textContent =
    `I 4 segnali: almeno −${p100(criteri.caloMinimo)} dal massimo a 52 settimane · utili in crescita · ` +
    `in utile e con debito sostenibile · almeno il ${p100(criteri.quotaPositiviMinima || 0.6)} degli analisti positivo (con almeno ${criteri.analistiMinimi} analisti).`;

  // Una riga compatta: il titolo (si tocca) e "Togli"
  const creaRiga = (ticker) => {
    const s = analisi.titoli[ticker];
    const riga = document.createElement("div");
    riga.className = "riga-watchlist";
    riga.innerHTML = `<button type="button" class="apri"><span class="nome-w"></span><span class="numeri-w"></span></button>
      <button type="button" class="link togli">Togli</button>`;
    riga.querySelector(".nome-w").textContent = `${s.nome} · ${s.area}`;
    const c = s.cacciatore;
    const rispettati = c ? c.criteri.filter((x) => x.ok).map((x) => x.testo) : [];
    riga.querySelector(".numeri-w").textContent = rispettati.length
      ? `${rispettati.length} su 4: ${rispettati.join(", ")}`
      : [s.tecnica ? percUno(s.tecnica.dalMassimo, true) + " dal massimo" : null,
         c ? "nessun segnale" : "dati non ancora disponibili"].filter(Boolean).join(" · ");
    riga.querySelector(".apri").onclick = () => vaiAlTitolo(ticker);
    riga.querySelector(".togli").onclick = () => {
      watchlistLocale.nascosti.push(ticker);
      salvaWatchlist();
      disegnaOccasioni();
    };
    return riga;
  };

  // 0. I filtri (area e settore): valgono per tutti gli elenchi qui sotto
  disegnaFiltriOccasioni();
  const filtriAttivi = Boolean(filtroOccasioni.area || filtroOccasioni.settore);

  // 1. Le prime 20: le prime per numero di segnali e punteggio (schede grandi)
  const forti = occasioni(3).filter(passaFiltri);
  const spiccano = forti.slice(0, QUANTE_IN_CLASSIFICA);
  $("titolo-classifica").textContent = spiccano.length === QUANTE_IN_CLASSIFICA ? `Le prime ${QUANTE_IN_CLASSIFICA} oggi`
    : spiccano.length > 1 ? `Le ${spiccano.length} che spiccano oggi` : "Le occasioni di oggi";
  $("elenco-classifica").innerHTML = "";
  spiccano.forEach((ticker, i) => $("elenco-classifica").appendChild(creaSchedaOccasione(ticker, i + 1,
    [testoDirezione(ticker), rischioPrincipale(ticker) ? "⚠ Rischio principale: " + rischioPrincipale(ticker) : ""]
      .filter(Boolean).join("\n"))));
  $("vuoto-classifica").hidden = spiccano.length > 0;
  $("vuoto-classifica").textContent = filtriAttivi
    ? "Con questi filtri nessuna azienda della watchlist ha almeno 3 segnali. Prova a togliere un filtro."
    : "Oggi nessuna azienda della watchlist ha almeno 3 segnali. Succede: le vere occasioni sono rare.";

  // 2. Le altre con 3 o 4 segnali, e quelle con 1 o 2: elenchi chiusi, righe compatte
  const altreForti = forti.slice(QUANTE_IN_CLASSIFICA);
  $("titolo-altre-forti").textContent = `Altre ${altreForti.length} con 3 o 4 segnali`;
  $("elenco-altre-forti").innerHTML = "";
  for (const ticker of altreForti) $("elenco-altre-forti").appendChild(creaRiga(ticker));
  $("sezione-altre-forti").hidden = altreForti.length === 0;

  const conSegnali = occasioni(1, 2).filter(passaFiltri);
  $("titolo-quasi").textContent = `${conSegnali.length} con 1 o 2 segnali`;
  $("elenco-quasi").innerHTML = "";
  for (const ticker of conSegnali) $("elenco-quasi").appendChild(creaRiga(ticker));
  $("sezione-quasi").hidden = conSegnali.length === 0;

  // 3. Tutte le altre: nessun segnale. Stanno in un elenco chiuso, da aprire solo se serve.
  const tutti = Object.entries(analisi.titoli).filter(([, s]) => s.gruppo === "watchlist");
  const senza = tutti.filter(([t]) => !nascosto(t) && segnali(t) === 0 && passaFiltri(t)).sort(([, a], [, b]) => a.nome.localeCompare(b.nome));
  $("titolo-watchlist").textContent = `${senza.length} senza segnali`;
  const elenco = $("elenco-watchlist");
  elenco.innerHTML = "";
  for (const [ticker] of senza) elenco.appendChild(creaRiga(ticker));
  $("sezione-senza-segnali").hidden = senza.length === 0;

  // I titoli che hai tolto: si possono rimettere
  const tolti = tutti.filter(([t]) => nascosto(t));
  $("sezione-tolti").hidden = tolti.length === 0;
  $("titolo-tolti").textContent = `Titoli che hai tolto (${tolti.length})`;
  const elencoTolti = $("elenco-tolti");
  elencoTolti.innerHTML = "";
  for (const [ticker, s] of tolti) {
    const riga = document.createElement("div");
    riga.className = "riga-watchlist";
    riga.innerHTML = `<span class="nome-w"></span><button type="button" class="link">Rimetti</button>`;
    riga.querySelector(".nome-w").textContent = `${s.nome} · ${s.area}`;
    riga.querySelector("button").onclick = () => {
      watchlistLocale.nascosti = watchlistLocale.nascosti.filter((t) => t !== ticker);
      salvaWatchlist();
      disegnaOccasioni();
    };
    elencoTolti.appendChild(riga);
  }

  $("fonte-occasioni").textContent = analisi.aggiornato
    ? `Fonti: Finnhub (conti e analisti), Yahoo Finance (prezzi) · analisi del ${momento(analisi.aggiornato)}` : "";
  // Gli avvisi: fonte chiusa per tutti, oppure qualche azienda senza dati
  const errori = analisi.errori || [];
  const senzaConti = tutti.filter(([, s]) => !s.fondamentali).map(([, s]) => s.nome);
  const avviso = $("errori-occasioni");
  avviso.hidden = !fonteFondamentaliChiusa() && senzaConti.length === 0 && errori.length === 0;
  avviso.textContent = fonteFondamentaliChiusa()
    ? `⚠ ${fonteFondamentaliChiusa()}: senza i conti delle aziende resta solo il segnale del calo dai massimi.`
    : senzaConti.length
      ? `Senza fondamentali (la fonte gratuita non le copre): ${senzaConti.join(", ")}. Per loro vale solo il segnale del calo dai massimi.`
      : `⚠ All'ultimo giro ${errori.length} ${errori.length === 1 ? "dato non è arrivato" : "dati non sono arrivati"}: per quei titoli vedi i dati di prima.`;
}

// I filtri in cima alla pagina: l'area con tre pulsanti, il settore con un menu
function disegnaFiltriOccasioni() {
  const watchlist = Object.entries(analisi.titoli).filter(([t, s]) => s.gruppo === "watchlist" && !nascosto(t));
  // Un filtro su un settore che non c'è più (o un'area sparita) si toglie da solo
  const settori = [...new Set(watchlist.map(([, s]) => s.settore).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (filtroOccasioni.settore && !settori.includes(filtroOccasioni.settore)) filtroOccasioni.settore = "";

  const aree = $("filtro-area");
  aree.innerHTML = "";
  for (const area of ["", ...AREE]) {
    const pulsante = crea("button", filtroOccasioni.area === area ? "attivo" : "", area || "Tutte");
    pulsante.type = "button";
    pulsante.setAttribute("aria-pressed", String(filtroOccasioni.area === area));
    pulsante.onclick = () => { filtroOccasioni.area = area; salvaFiltri(); disegnaOccasioni(); };
    aree.appendChild(pulsante);
  }

  // Il menu dei settori: c'è solo quando gli agenti hanno già scritto il settore delle aziende
  const menu = $("filtro-settore");
  menu.innerHTML = "";
  menu.add(new Option("Tutti", ""));
  for (const settore of settori) {
    const quanti = watchlist.filter(([, s]) => s.settore === settore).length;
    menu.add(new Option(`${settore} (${quanti})`, settore));
  }
  menu.value = filtroOccasioni.settore;
  menu.closest("label").hidden = settori.length === 0;

  const attivi = Boolean(filtroOccasioni.area || filtroOccasioni.settore);
  const passano = watchlist.filter(([t]) => passaFiltri(t)).length;
  $("conta-filtri").textContent = attivi ? `${passano} aziende su ${watchlist.length}` : "";
  $("togli-filtri").hidden = !attivi;
}

// ---------- Aggiungere un titolo alla watchlist ----------
// La watchlist vive nel file data/watchlist.json del repository, perché è GitHub
// (non il tuo iPad) che ogni sera scarica i dati. La pagina ti prepara la riga da incollare.

function indirizzoWatchlistSuGitHub() {
  // Il sito è "nome.github.io/repository": da qui ricaviamo l'indirizzo del file su GitHub
  const utente = location.hostname.match(/^(.+)\.github\.io$/);
  const repository = location.pathname.split("/").filter(Boolean)[0];
  return utente && repository
    ? `https://github.com/${utente[1]}/${repository}/edit/main/data/watchlist.json` : null;
}

function preparaRigaWatchlist(evento) {
  evento.preventDefault();
  const riga = JSON.stringify({
    ticker: $("nuovo-ticker").value.trim().toUpperCase(),
    nome: $("nuovo-nome").value.trim(),
    area: $("nuova-area").value,
    ...($("nuova-usa").value.trim() ? { usa: $("nuova-usa").value.trim().toUpperCase() } : {}),
  }).replace(/":/g, '": ').replace(/,"/g, ', "');
  $("riga-watchlist").value = "  " + riga + ",";
  $("istruzioni-aggiungi").hidden = false;
  const indirizzo = indirizzoWatchlistSuGitHub();
  $("apri-watchlist").hidden = !indirizzo;
  if (indirizzo) $("apri-watchlist").href = indirizzo;
}

async function copiaRigaWatchlist() {
  try {
    await navigator.clipboard.writeText($("riga-watchlist").value);
    $("copia-riga").textContent = "Copiata ✓";
  } catch (errore) {
    $("riga-watchlist").select();
  }
}

// ---------- Nella pagina di un titolo: i criteri del cacciatore ----------

function disegnaCacciatore() {
  const s = analisi.titoli[tickerAperto] || {};
  const c = s.cacciatore;
  $("sezione-cacciatore").hidden = !c;
  if (!c) return;
  const quanti = `${c.rispettati} ${c.rispettati === 1 ? "segnale" : "segnali"} su 4`;
  const posto = occasioni(3).indexOf(tickerAperto);
  $("frase-cacciatore").textContent = s.gruppo !== "watchlist"
    ? `È un titolo del tuo elenco: oggi avrebbe ${quanti} del cacciatore.`
    : posto >= 0 && posto < QUANTE_IN_CLASSIFICA ? `Tra le prime ${QUANTE_IN_CLASSIFICA} delle occasioni (${posto + 1}º posto): ha ${quanti}, ${c.punteggio} punti su 100.`
    : c.rispettati >= 3 ? `Ha ${quanti} (${c.punteggio} punti su 100), ma non è tra le prime ${QUANTE_IN_CLASSIFICA}.`
    : c.rispettati > 0 ? `Da tenere d'occhio: ha ${quanti}.`
    : "Oggi non ha nessun segnale del cacciatore.";
  const elenco = $("elenco-criteri");
  elenco.innerHTML = "";
  for (const criterio of c.criteri) {
    const [simbolo, classe, stato] = simboloCriterio(criterio);
    const voce = document.createElement("li");
    voce.innerHTML = `<span class="simbolo ${classe}"></span><div><b></b><span></span></div>`;
    voce.querySelector(".simbolo").textContent = simbolo;
    voce.querySelector(".simbolo").title = stato;
    voce.querySelector("b").textContent = criterio.nome;
    voce.querySelector("div span").textContent = criterio.testo;
    elenco.appendChild(voce);
  }
}

// ---------- La pagina di un titolo che NON hai in portafoglio ----------
// In alto, al posto del valore della tua posizione, mostriamo il prezzo e qualche dato generale.

function disegnaTitoloOsservato() {
  const s = analisi.titoli[tickerAperto] || {};
  const t = s.tecnica, f = s.fondamentali;
  const p = prezzi[tickerAperto];
  const m = datiMappa(tickerAperto);    // i numeri della mappa del mercato, se è un'azienda della mappa
  const prezzo = p ? p.prezzo : t ? t.prezzo : f ? f.prezzo : m && m.prezzo ? m.prezzo : null;
  const valuta = p ? "EUR" : (t && t.valuta) || (f && f.valuta) || (m ? valutaDaSigla(tickerAperto) : "");
  $("valore-titolo").textContent = prezzo === null ? "–" : prezzoIn(prezzo, valuta);
  const chip = $("gp-titolo");
  const oggiMappa = !t && m && typeof m.oggi === "number" ? m.oggi : null;
  chip.textContent = t ? `${percUno(t.dalMassimo, true)} dal massimo dell'anno` : oggiMappa !== null ? `${testoVariazione(oggiMappa)} all'ultima seduta` : "";
  chip.className = "chip " + (oggiMappa !== null ? classeColore(oggiMappa) : "");
  $("fonte-prezzi-titolo").textContent = (p ? testoFonte([tickerAperto]) : t ? `Prezzo di chiusura del ${dataBreve(t.data)}`
    : m && m.giorno ? `Prezzo di chiusura del ${dataBreve(m.giorno)}` : "") + " · non hai questo titolo in portafoglio";

  const griglia = $("numeri-titolo");
  griglia.innerHTML = "";
  const numeri = [
    ["Area", s.area || (m ? areaDaSigla(tickerAperto) : "") || "–"],
    ["Settore", (f && f.settore) || (m && m.settore) || "–"],
    ["Valuta", valuta || "–"],
  ];
  for (const dato of numeri) aggiungiDato(griglia, ...dato);
}

// Collega i pulsanti della pagina Occasioni (lo chiama app.js all'avvio)
function collegaCacciatore() {
  try {
    const salvati = JSON.parse(localStorage.getItem(CHIAVE_FILTRI) || "{}");
    if (AREE.includes(salvati.area)) filtroOccasioni.area = salvati.area;
    if (typeof salvati.settore === "string") filtroOccasioni.settore = salvati.settore;
  } catch (errore) { /* si parte senza filtri */ }
  $("filtro-settore").onchange = () => { filtroOccasioni.settore = $("filtro-settore").value; salvaFiltri(); disegnaOccasioni(); };
  $("togli-filtri").onclick = () => { filtroOccasioni.area = filtroOccasioni.settore = ""; salvaFiltri(); disegnaOccasioni(); };
  $("modulo-watchlist").addEventListener("submit", preparaRigaWatchlist);
  $("copia-riga").onclick = copiaRigaWatchlist;
}
