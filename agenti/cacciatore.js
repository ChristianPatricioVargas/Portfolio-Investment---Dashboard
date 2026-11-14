// agenti/cacciatore.js = la parte della pagina del CACCIATORE (le occasioni).
//   - la pagina "Occasioni": la classifica dei titoli della watchlist che rispettano i criteri,
//     quelli che ci vanno vicino, e tutta la watchlist (con "togli" e "aggiungi")
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

// Le sigle in classifica (o "quasi"), senza quelle che hai tolto
function occasioni(lista = "classifica") {
  return (analisi[lista] || []).filter((t) => analisi.titoli[t] && !nascosto(t));
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
  info.querySelector(".tag").textContent = s.area || "";
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
  const cifre = document.createElement("div");
  cifre.className = "cifre";
  cifre.innerHTML = `<span class="valore"></span><span class="chip"></span>`;
  cifre.querySelector(".valore").textContent = c.punteggio + " punti";
  const f = s.fondamentali || {};
  cifre.querySelector(".chip").textContent = f.potenziale !== null && f.potenziale !== undefined ? "target " + percUno(f.potenziale, true) : "";
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
    `Criteri: almeno −${p100(criteri.caloMinimo)} dal massimo a 52 settimane · utili in crescita · ` +
    `in utile e con debito sostenibile · target medio di almeno ${criteri.analistiMinimi} analisti a +${p100(criteri.potenzialeMinimo)} o più.`;

  // La classifica e i "quasi"
  for (const [lista, contenitore, vuoto] of [["classifica", "elenco-classifica", "vuoto-classifica"], ["quasi", "elenco-quasi", "vuoto-quasi"]]) {
    const sigle = occasioni(lista);
    $(contenitore).innerHTML = "";
    sigle.forEach((ticker, i) => $(contenitore).appendChild(creaSchedaOccasione(ticker, lista === "classifica" ? i + 1 : null)));
    $(vuoto).hidden = sigle.length > 0;
  }

  // Tutta la watchlist: prima chi rispetta più criteri
  const tutti = Object.entries(analisi.titoli).filter(([, s]) => s.gruppo === "watchlist");
  const visibili = tutti.filter(([t]) => !nascosto(t)).sort(([ta, a], [tb, b]) =>
    ((b.cacciatore || {}).rispettati || 0) - ((a.cacciatore || {}).rispettati || 0) || a.nome.localeCompare(b.nome));
  $("titolo-watchlist").textContent = `👀 La watchlist (${visibili.length} titoli)`;
  const elenco = $("elenco-watchlist");
  elenco.innerHTML = "";
  for (const [ticker, s] of visibili) {
    const riga = document.createElement("div");
    riga.className = "riga-watchlist";
    riga.innerHTML = `<button type="button" class="apri"><span class="nome-w"></span><span class="numeri-w"></span></button>
      <button type="button" class="link togli">Togli</button>`;
    riga.querySelector(".nome-w").textContent = `${s.nome} · ${s.area}`;
    const t = s.tecnica, f = s.fondamentali, c = s.cacciatore;
    riga.querySelector(".numeri-w").textContent = [
      t ? percUno(t.dalMassimo, true) + " dal massimo" : null,
      f && f.potenziale !== null && f.potenziale !== undefined ? "target " + percUno(f.potenziale, true) : null,
      c ? `${c.rispettati} criteri su 4` : "dati non ancora disponibili",
    ].filter(Boolean).join(" · ");
    riga.querySelector(".apri").onclick = () => vaiAlTitolo(ticker);
    riga.querySelector(".togli").onclick = () => {
      watchlistLocale.nascosti.push(ticker);
      salvaWatchlist();
      disegnaOccasioni();
    };
    elenco.appendChild(riga);
  }

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
    ? `Fonte: Yahoo Finance · analisi del ${momento(analisi.aggiornato)}` : "";
  const errori = (analisi.errori || []).length;
  $("errori-occasioni").hidden = errori === 0;
  $("errori-occasioni").textContent = `⚠️ All'ultimo giro ${errori} ${errori === 1 ? "dato non è arrivato" : "dati non sono arrivati"} da Yahoo Finance: per quei titoli vedi i dati del giorno prima.`;
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
  const posto = occasioni().indexOf(tickerAperto);
  $("frase-cacciatore").textContent = s.gruppo !== "watchlist"
    ? `È un titolo del tuo elenco: oggi rispetterebbe ${c.rispettati} criteri su 4 del cacciatore.`
    : posto >= 0 ? `In classifica al ${posto + 1}º posto: rispetta tutti e 4 i criteri (${c.punteggio} punti su 100).`
    : c.rispettati === 3 ? "Ci va vicino: rispetta 3 criteri su 4."
    : `Non è in classifica: rispetta ${c.rispettati} ${c.rispettati === 1 ? "criterio" : "criteri"} su 4.`;
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
  const prezzo = p ? p.prezzo : t ? t.prezzo : f ? f.prezzo : null;
  const valuta = p ? "EUR" : (t && t.valuta) || (f && f.valuta) || "";
  $("valore-titolo").textContent = prezzo === null ? "–" : prezzoIn(prezzo, valuta);
  const chip = $("gp-titolo");
  chip.textContent = t ? `${percUno(t.dalMassimo, true)} dal massimo dell'anno` : "";
  chip.className = "chip";
  $("fonte-prezzi-titolo").textContent = (p ? testoFonte([tickerAperto]) : t ? `Prezzo di chiusura del ${dataBreve(t.data)}` : "") +
    " · non hai questo titolo in portafoglio";

  const griglia = $("numeri-titolo");
  griglia.innerHTML = "";
  const numeri = [
    ["Area", s.area || "–"],
    ["Settore", (f && f.settore) || "–"],
    ["Valuta", valuta || "–"],
  ];
  for (const dato of numeri) aggiungiDato(griglia, ...dato);
}

// Collega i pulsanti della pagina Occasioni (lo chiama app.js all'avvio)
function collegaCacciatore() {
  $("modulo-watchlist").addEventListener("submit", preparaRigaWatchlist);
  $("copia-riga").onclick = copiaRigaWatchlist;
}
