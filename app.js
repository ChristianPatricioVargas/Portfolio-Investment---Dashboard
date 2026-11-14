// app.js = il "cervello" della pagina.
// Fa cinque cose:
//   1. legge l'elenco dei titoli e i prezzi (file pubblici nella cartella data/)
//   2. legge i TUOI acquisti, salvati solo nel browser del tuo iPad
//   3. fa i calcoli (quote totali, prezzo medio, valore, guadagno/perdita)
//   4. disegna il totale e una scheda per ogni titolo
//   5. disegna il grafico dell'andamento dal primo acquisto

// I nomi con cui salviamo i tuoi dati nel browser.
// v2 = un titolo può avere più acquisti. v1 = la versione vecchia (un acquisto per titolo).
const CHIAVE_SALVATAGGIO = "portafoglio-v2";
const CHIAVE_VECCHIA = "portafoglio-v1";

// I colori dei quadratini con la sigla: [sfondo, testo]
const COLORI_SIGLA = [
  ["#1f2f57", "#8fb0ff"],   // blu
  ["#173a35", "#5fe0c4"],   // verde acqua
  ["#3a2a14", "#ffbe5c"],   // arancio
  ["#33204a", "#c9a2ff"],   // viola
];

// Qui teniamo in memoria i dati mentre la pagina è aperta.
let titoli = [];       // elenco dei titoli disponibili (da data/titoli.json)
let prezzi = {};       // prezzi di ogni titolo (da data/prezzi.json)
let storico = {};      // prezzi di chiusura passati (da data/storico.json)
let controllatiIl = null; // quando GitHub ha controllato i prezzi l'ultima volta
let notizie = {};         // le notizie di ogni titolo (da data/notizie.json)
let notizieAggiornateIl = null;
let notizieServizi = {};  // da quale servizio arrivano le notizie di ogni titolo (Google, Bing, Yahoo)
let notizieTutte = false; // true = mostra tutte le notizie, non solo le prime 5
// Le tue posizioni. Ogni titolo ha la sua lista di acquisti:
// [{ ticker: "SAP.DE", acquisti: [{ data: "2026-10-03", quote: 0.25, investito: 50 }, ...] }]
let posizioni = [];
let inModifica = null;    // l'acquisto che stai modificando: { ticker, indice } (null = nuovo)
// Il lavoro degli agenti (da data/analisi.json): per ogni titolo fondamentali, analisi tecnica, rischi...
let analisi = { titoli: {} };
// Le tue schede tesi, salvate solo nel browser (vedi agenti/fondamentale.js)
let tesi = {};

// Una scorciatoia: $("x") prende l'elemento della pagina con id="x"
const $ = (id) => document.getElementById(id);

// ---------- Formattazione dei numeri all'italiana ----------

// Trasforma 1234.5 in "1.234,50 €"
const formatoEuro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
function euro(numero, conSegno = false) {
  const testo = formatoEuro.format(numero);
  return conSegno && numero > 0 ? "+" + testo : testo;
}

// Trasforma 0.0523 in "+5,23%"
function percentuale(numero) {
  const segno = numero > 0 ? "+" : "";
  return segno + (numero * 100).toFixed(2).replace(".", ",") + "%";
}

// Mostra le quote con tutti i decimali necessari (es. 1,234567)
function quote(numero) {
  return numero.toLocaleString("it-IT", { maximumFractionDigits: 6 });
}

// "2026-10-03" → "3 ott 2026"
function dataBreve(testo) {
  if (!testo) return "senza data";
  const [anno, mese, giorno] = testo.split("-").map(Number);
  return new Date(anno, mese - 1, giorno).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

// Il colore: verde se si guadagna, rosso se si perde
function classeColore(numero) {
  if (numero > 0) return "positivo";
  if (numero < 0) return "negativo";
  return "";
}

// Legge un numero scritto all'italiana ("1.234,56" oppure "250,00")
function leggiNumero(testo) {
  let pulito = testo.trim().replace(/\s/g, "");
  if (pulito.includes(",")) {
    pulito = pulito.replace(/\./g, "").replace(",", ".");
  }
  return Number(pulito);
}

// ---------- Salvataggio sul dispositivo ----------
// localStorage è un piccolo "cassetto" del browser: ciò che ci metti
// resta su questo iPad, anche se chiudi Safari.

// Accetta sia il formato nuovo (con "acquisti") sia quello vecchio
// ({ ticker, quote, investito, dataAcquisto }) e restituisce sempre quello nuovo.
// Se i dati non hanno senso, dà errore.
function normalizza(dati) {
  if (!Array.isArray(dati)) throw new Error("non è una lista");
  return dati.map((p) => {
    const acquisti = Array.isArray(p.acquisti)
      ? p.acquisti
      : [{ data: p.dataAcquisto || "", quote: p.quote, investito: p.investito }];
    const validi = acquisti.every((a) => a.quote > 0 && a.investito > 0);
    if (!p.ticker || acquisti.length === 0 || !validi) throw new Error("dati non validi");
    return {
      ticker: p.ticker,
      acquisti: acquisti.map((a) => ({ data: a.data || "", quote: Number(a.quote), investito: Number(a.investito) })),
    };
  });
}

function caricaPosizioni() {
  try {
    const nuovo = localStorage.getItem(CHIAVE_SALVATAGGIO);
    if (nuovo) return normalizza(JSON.parse(nuovo));
    // Prima volta con la versione nuova: convertiamo i dati vecchi (che restano anche lì, per sicurezza)
    const vecchio = localStorage.getItem(CHIAVE_VECCHIA);
    if (vecchio) {
      posizioni = normalizza(JSON.parse(vecchio));
      salvaPosizioni();
      return posizioni;
    }
  } catch (errore) {
    // dati illeggibili: si parte da vuoto
  }
  return [];
}

function salvaPosizioni() {
  try {
    localStorage.setItem(CHIAVE_SALVATAGGIO, JSON.stringify(posizioni));
  } catch (errore) {
    alert("Non riesco a salvare su questo dispositivo (navigazione privata?).");
  }
}

// ---------- Calcoli ----------

// Somma tutti gli acquisti di un titolo
function totali(posizione) {
  let numQuote = 0, investito = 0;
  for (const a of posizione.acquisti) {
    numQuote += a.quote;
    investito += a.investito;
  }
  return { quote: numQuote, investito, prezzoMedio: investito / numQuote };
}

// Per una posizione calcola valore attuale e guadagno/perdita
function calcola(posizione) {
  const p = prezzi[posizione.ticker];
  if (!p) return null;                               // prezzo non ancora disponibile
  const t = totali(posizione);
  const valore = t.quote * p.prezzo;                 // quote totali × prezzo di adesso
  const gp = valore - t.investito;                   // quanto ho guadagnato (o perso)
  const gpPerc = gp / t.investito;                   // in proporzione all'investito
  // Variazione di oggi: prezzo attuale rispetto alla chiusura di ieri
  const oggi = p.chiusuraIeri ? p.prezzo / p.chiusuraIeri - 1 : null;
  return { prezzo: p.prezzo, valore, gp, gpPerc, oggi };
}

function infoTitolo(ticker) {
  const indice = titoli.findIndex((t) => t.ticker === ticker);
  // Se non è tra i titoli del portafoglio, può essere uno della watchlist (lo conoscono gli agenti)
  const scheda = analisi.titoli[ticker];
  const info = titoli[indice] || { nome: scheda ? scheda.nome : ticker, tipo: scheda ? scheda.tipo : "", ticker };
  return { ...info, colori: COLORI_SIGLA[Math.max(indice, 0) % COLORI_SIGLA.length] };
}

// ---------- Da dove vengono i prezzi ----------
// Esempio: "Prezzi Xetra · ultimo scambio ven 14 nov, 17:35 · controllati alle 21:51"

const NOMI_BORSE = { XETRA: "Xetra", Frankfurt: "Francoforte", Stuttgart: "Stoccarda", GER: "Xetra" };

// "2026-11-14T16:35:00Z" → "ven 14 nov, 17:35" (nell'ora del tuo iPad)
function momento(testoISO) {
  return new Date(testoISO).toLocaleString("it-IT", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function testoFonte(tickers) {
  const dati = tickers.map((t) => prezzi[t]).filter(Boolean);
  const borse = [...new Set(dati.map((p) => NOMI_BORSE[p.borsa] || p.borsa).filter(Boolean))];
  const orari = dati.map((p) => p.orario).filter(Boolean).sort();
  const parti = [borse.length ? "Prezzi " + borse.join(" e ") : "Prezzi Xetra (Yahoo Finance)"];
  // L'ultimo scambio più recente tra i tuoi titoli
  if (orari.length) parti.push("ultimo scambio " + momento(orari[orari.length - 1]));
  if (controllatiIl) {
    // Se il controllo è dello stesso giorno dell'ultimo scambio basta l'ora, altrimenti anche il giorno
    const stessoGiorno = orari.length &&
      new Date(controllatiIl).toDateString() === new Date(orari[orari.length - 1]).toDateString();
    const ora = new Date(controllatiIl).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    parti.push(stessoGiorno ? "controllati alle " + ora : "controllati " + momento(controllatiIl));
  }
  return parti.join(" · ");
}

// ---------- Disegno della pagina ----------

function disegna() {
  const contenitore = $("schede");
  contenitore.innerHTML = "";   // svuotiamo prima di riempire

  let totInvestito = 0;
  let totValore = 0;
  let prezziMancanti = 0;

  for (const posizione of posizioni) {
    const info = infoTitolo(posizione.ticker);
    const t = totali(posizione);
    const r = calcola(posizione);

    totInvestito += t.investito;
    if (r) totValore += r.valore;
    else prezziMancanti++;

    // Due righe piccole sotto il nome
    const numAcquisti = posizione.acquisti.length;
    const riga1 = `${quote(t.quote)} quote · prezzo medio ${euro(t.prezzoMedio)}`;
    let riga2 = numAcquisti === 1 ? "1 acquisto" : `${numAcquisti} acquisti`;
    if (r) riga2 += " · ora " + euro(r.prezzo);
    if (r && r.oggi !== null) riga2 += " · oggi " + percentuale(r.oggi);
    if (testoCampanelli(posizione.ticker)) riga2 += " · " + testoCampanelli(posizione.ticker);

    // Creiamo la scheda: è un pulsante, se la tocchi si apre la pagina del titolo
    const scheda = document.createElement("button");
    scheda.type = "button";
    scheda.className = "scheda";
    scheda.innerHTML = `
      <div class="sigla"></div>
      <div class="info">
        <div class="nome"><span></span><span class="tag"></span></div>
        <div class="dettaglio riga1"></div>
        <div class="dettaglio riga2"></div>
      </div>
      <div class="cifre">
        <span class="valore">${r ? euro(r.valore) : "–"}</span>
        <span class="chip ${r ? classeColore(r.gp) : ""}">${r ? percentuale(r.gpPerc) : "in attesa"}</span>
      </div>`;
    // I testi li inseriamo come testo semplice, per sicurezza
    const sigla = scheda.querySelector(".sigla");
    sigla.textContent = info.ticker.split(".")[0];   // "VWCE.DE" → "VWCE"
    sigla.style.background = info.colori[0];
    sigla.style.color = info.colori[1];
    scheda.querySelector(".nome span").textContent = info.nome;
    scheda.querySelector(".tag").textContent = info.tipo;
    scheda.querySelector(".riga1").textContent = riga1;
    scheda.querySelector(".riga2").textContent = riga2;
    scheda.onclick = () => vaiAlTitolo(posizione.ticker);
    contenitore.appendChild(scheda);
  }

  $("vuoto").hidden = posizioni.length > 0;

  // ---- Il totale in alto ----
  const chip = $("tot-gp");
  if (posizioni.length === 0) {
    $("tot-valore").textContent = euro(0);
    chip.textContent = "";
    $("tot-investito").textContent = "";
  } else if (prezziMancanti > 0) {
    // Senza tutti i prezzi il totale sarebbe sbagliato: meglio non mostrarlo
    $("tot-valore").textContent = "–";
    $("tot-valore").classList.add("vuota");
    chip.textContent = "";
    $("tot-investito").textContent = "Investito " + euro(totInvestito);
  } else {
    const totGp = totValore - totInvestito;
    $("tot-valore").textContent = euro(totValore);
    $("tot-valore").classList.remove("vuota");
    chip.textContent = (totGp >= 0 ? "▲ " : "▼ ") + euro(totGp, true) + " · " + percentuale(totGp / totInvestito);
    chip.className = "chip " + classeColore(totGp);
    $("tot-investito").textContent = "Investito " + euro(totInvestito);
  }

  // Sotto il totale: da dove vengono i prezzi dei TUOI titoli (o di tutti, se non ne hai)
  const tuoi = posizioni.length ? posizioni.map((p) => p.ticker) : titoli.map((t) => t.ticker);
  $("fonte-prezzi").textContent = Object.keys(prezzi).length ? testoFonte(tuoi) : "";

  // Disegniamo il resto della vista che stai guardando
  disegnaVista();
}

// ---------- Le pagine e la pagina di un titolo ----------
// L'indirizzo della pagina dice cosa stai guardando:
//   .../  oppure #oggi    la pagina Oggi: il riepilogo (è la pagina iniziale)
//   .../#portafoglio      la panoramica del portafoglio
//   .../#occasioni        la classifica del cacciatore
//   .../#titolo=SAP.DE    la pagina di un titolo (tuo, oppure della watchlist)
// Così il gesto "indietro" dell'iPad funziona come in un'app.

let tickerAperto = null;          // il titolo di cui stai guardando la pagina (null = nessuno)
let vistaAperta = "oggi";         // la pagina che stai guardando: "oggi", "portafoglio", "occasioni" o "titolo"
let arrivatoDaDentro = false;     // true = sei arrivato al titolo toccandolo in un'altra pagina

function vaiAlTitolo(ticker) {
  arrivatoDaDentro = true;
  location.hash = "titolo=" + encodeURIComponent(ticker);
}

function tornaAllaPanoramica() {
  // Se sei arrivato da un'altra pagina, "indietro" ti riporta lì; altrimenti andiamo al portafoglio
  if (arrivatoDaDentro) history.back();
  else location.hash = "portafoglio";
}

// Disegna la pagina che stai guardando
function disegnaVista() {
  if (vistaAperta === "titolo") disegnaTitolo();
  else if (vistaAperta === "occasioni") disegnaOccasioni();
  else if (vistaAperta === "oggi") disegnaOggi();
  else disegnaGrafico();
}

// Guarda l'indirizzo e mostra la vista giusta
function mostraVista() {
  const indirizzo = location.hash.slice(1);
  const trovato = indirizzo.match(/^titolo=(.+)$/);
  const ticker = trovato ? decodeURIComponent(trovato[1]) : null;
  // Un titolo si può aprire se lo possiedi, se è nell'elenco o se lo seguono gli agenti
  const esiste = Boolean(ticker) && (posizioni.some((p) => p.ticker === ticker) ||
    titoli.some((t) => t.ticker === ticker) || Boolean(analisi.titoli[ticker]));
  if (!esiste) arrivatoDaDentro = false;
  tickerAperto = esiste ? ticker : null;
  vistaAperta = tickerAperto ? "titolo" : ["portafoglio", "occasioni"].includes(indirizzo) ? indirizzo : "oggi";

  chiudiModulo();
  $("modulo-tesi").hidden = true;
  notizieTutte = false;
  $("vista-oggi").hidden = vistaAperta !== "oggi";
  $("vista-panoramica").hidden = vistaAperta !== "portafoglio";
  $("vista-occasioni").hidden = vistaAperta !== "occasioni";
  $("vista-titolo").hidden = vistaAperta !== "titolo";
  $("navigazione").hidden = vistaAperta === "titolo";
  if (vistaAperta !== "titolo") document.body.classList.remove("dettaglio");   // pagina di nuovo stretta
  document.querySelectorAll("#navigazione a").forEach((a) => a.classList.toggle("attivo", a.dataset.vista === vistaAperta));
  disegnaVista();
  window.scrollTo(0, 0);
}

function disegnaTitolo() {
  if (!tickerAperto) return;
  const posizione = posizioni.find((p) => p.ticker === tickerAperto);
  const info = infoTitolo(tickerAperto);

  // ---- In alto: sigla e nome ----
  const sigla = $("sigla-titolo");
  sigla.textContent = info.ticker.split(".")[0].slice(0, 6);
  sigla.style.background = info.colori[0];
  sigla.style.color = info.colori[1];
  $("nome-titolo").textContent = info.nome;
  $("tipo-titolo").textContent = info.tipo;

  // ---- Le parti personali (valore, acquisti, rendimento, tesi) ci sono solo se hai il titolo ----
  $("sezione-rendimento").hidden = !posizione;
  $("colonna-personale").hidden = !posizione;
  // Pagina larga a due colonne solo se c'è la colonna degli acquisti
  document.body.classList.toggle("dettaglio", Boolean(posizione));
  document.querySelector(".colonne").classList.toggle("una-colonna", !posizione);
  if (posizione) disegnaPosizione(posizione);
  else disegnaTitoloOsservato();

  disegnaNotizie();
  // Le parti degli agenti (vedi la cartella agenti/)
  disegnaSeVendo();
  disegnaTecnico();
  disegnaFondamentali();
  disegnaCacciatore();
  disegnaAvvocato();
  disegnaTesi();
}

// La parte della pagina del titolo che riguarda la TUA posizione
function disegnaPosizione(posizione) {
  const t = totali(posizione);
  const r = calcola(posizione);

  // ---- Valore e guadagno ----
  $("valore-titolo").textContent = r ? euro(r.valore) : "–";
  const chip = $("gp-titolo");
  chip.textContent = r ? `${r.gp >= 0 ? "▲" : "▼"} ${euro(r.gp, true)} · ${percentuale(r.gpPerc)}` : "";
  chip.className = "chip " + (r ? classeColore(r.gp) : "");
  $("fonte-prezzi-titolo").textContent = r ? testoFonte([tickerAperto]) : "";

  // ---- La griglia di numeri ----
  const numeri = [
    ["Quote", quote(t.quote)],
    ["Investito", euro(t.investito)],
    ["Prezzo medio", euro(t.prezzoMedio)],
    ["Prezzo attuale", r ? euro(r.prezzo) : "–"],
    ["Oggi", r && r.oggi !== null ? percentuale(r.oggi) : "–"],
    ["Acquisti", String(posizione.acquisti.length)],
  ];
  const griglia = $("numeri-titolo");
  griglia.innerHTML = "";
  for (const [etichetta, valore] of numeri) {
    const blocco = document.createElement("div");
    blocco.innerHTML = "<dt></dt><dd></dd>";
    blocco.querySelector("dt").textContent = etichetta;
    blocco.querySelector("dd").textContent = valore;
    if (etichetta === "Oggi" && r && r.oggi !== null) blocco.querySelector("dd").className = classeColore(r.oggi);
    griglia.appendChild(blocco);
  }

  // ---- La colonna di destra: un pulsante per ogni acquisto ----
  const elenco = $("elenco-acquisti");
  elenco.innerHTML = "";
  posizione.acquisti
    .map((a, indice) => ({ ...a, indice }))
    .sort((a, b) => (a.data || "").localeCompare(b.data || ""))
    .forEach((a) => {
      const riga = document.createElement("button");
      riga.type = "button";
      riga.className = "riga-acquisto";
      if (inModifica && inModifica.ticker === tickerAperto && inModifica.indice === a.indice) riga.classList.add("selezionata");
      riga.innerHTML = `<span class="data-acquisto"></span><span class="numeri-acquisto"></span>`;
      riga.querySelector(".data-acquisto").textContent = dataBreve(a.data);
      riga.querySelector(".numeri-acquisto").textContent =
        `${quote(a.quote)} quote · ${euro(a.investito)} · a ${euro(a.investito / a.quote)}`;
      riga.onclick = () => apriModulo(tickerAperto, a.indice);
      elenco.appendChild(riga);
    });

  disegnaGraficoTitolo();
}

// ---------- Le notizie del titolo ----------

const NOTIZIE_VISIBILI = 5;   // quante se ne vedono prima di "Mostra altre"

// "2026-11-14T08:30:00Z" → "2 ore fa", "ieri", "3 giorni fa"
function tempoFa(testoISO) {
  const minuti = Math.round((Date.now() - new Date(testoISO)) / 60000);
  if (minuti < 60) return minuti <= 1 ? "adesso" : `${minuti} minuti fa`;
  const ore = Math.round(minuti / 60);
  if (ore < 24) return ore === 1 ? "1 ora fa" : `${ore} ore fa`;
  const giorni = Math.round(ore / 24);
  return giorni === 1 ? "ieri" : `${giorni} giorni fa`;
}

function disegnaNotizie() {
  const info = infoTitolo(tickerAperto);
  // Per sicurezza teniamo solo le notizie con un link sicuro (https://)
  const elenco = (notizie[tickerAperto] || []).filter((n) => typeof n.link === "string" && n.link.startsWith("https://"));
  // Per gli ETF cerchiamo notizie sull'indice che seguono: lo diciamo nel titolo
  $("titolo-notizie").textContent = info.tipo === "ETF" ? "📰 Notizie sui mercati" : `📰 Notizie su ${info.nome}`;

  const lista = $("elenco-notizie");
  lista.innerHTML = "";
  const visibili = notizieTutte ? elenco : elenco.slice(0, NOTIZIE_VISIBILI);
  for (const n of visibili) {
    const voce = document.createElement("li");
    voce.innerHTML = `<a target="_blank" rel="noopener noreferrer"><span class="titolo-notizia"></span><span class="dettagli-notizia"></span></a>`;
    const link = voce.querySelector("a");
    link.href = n.link;   // si apre in una nuova scheda di Safari
    voce.querySelector(".titolo-notizia").textContent = n.titolo;
    voce.querySelector(".dettagli-notizia").textContent = [n.fonte, tempoFa(n.data)].filter(Boolean).join(" · ");
    lista.appendChild(voce);
  }

  const vuoto = $("nessuna-notizia");
  vuoto.hidden = elenco.length > 0;
  const soloOsservato = (analisi.titoli[tickerAperto] || {}).gruppo === "watchlist" && notizie[tickerAperto] === undefined;
  vuoto.textContent = soloOsservato
    ? "Le notizie vengono scaricate solo per i titoli del portafoglio e per quelli in classifica."
    : notizieAggiornateIl
      ? "Nessuna notizia negli ultimi 7 giorni."
      : "⏳ Le notizie arriveranno con il prossimo aggiornamento automatico.";

  const altre = $("altre-notizie");
  altre.hidden = elenco.length <= NOTIZIE_VISIBILI;
  altre.textContent = notizieTutte ? "Mostra meno" : `Mostra altre (${elenco.length - NOTIZIE_VISIBILI})`;

  // Da quale servizio arrivano (Yahoo Finance le dà in inglese: lo diciamo)
  const servizio = notizieServizi[tickerAperto] || "Google News";
  const lingua = servizio === "Yahoo Finance" ? " (in inglese)" : "";
  $("fonte-notizie").textContent = notizieAggiornateIl && elenco.length
    ? `Fonte: ${servizio}${lingua} · ultimi 7 giorni · controllate ${momento(notizieAggiornateIl)}`
    : "";
}

// ---------- Il modulo di un acquisto: aggiungi, modifica, elimina ----------

function mostraErrore(messaggio) {
  $("errore").textContent = messaggio;
  $("errore").hidden = !messaggio;
}

const oggiISO = () => new Date().toISOString().slice(0, 10);

// Apre il modulo.
//   apriModulo()               → nuovo acquisto, scegli tu il titolo
//   apriModulo("SAP.DE")       → nuovo acquisto di SAP
//   apriModulo("SAP.DE", 2)    → modifica il terzo acquisto di SAP
function apriModulo(ticker = null, indice = null) {
  inModifica = indice === null ? null : { ticker, indice };
  mostraErrore("");
  const a = indice === null ? null : posizioni.find((p) => p.ticker === ticker).acquisti[indice];

  $("titolo-modulo").textContent = a ? "Modifica acquisto" : "Nuovo acquisto";
  $("campo-titolo").value = ticker || titoli[0]?.ticker;
  $("campo-titolo").disabled = Boolean(ticker);   // titolo già scelto: non si cambia
  $("campo-data").value = a ? a.data : oggiISO();
  $("campo-data").max = oggiISO();                 // niente date future
  $("campo-quote").value = a ? String(a.quote).replace(".", ",") : "";
  $("campo-investito").value = a ? String(a.investito).replace(".", ",") : "";
  $("elimina").hidden = !a;

  const modulo = $("modulo");
  if (tickerAperto) {
    // Nella pagina del titolo il modulo sta nella colonna di destra, sotto gli acquisti
    $("posto-modulo").appendChild(modulo);
    $("posto-modulo").hidden = false;
    disegnaTitolo();   // evidenzia l'acquisto selezionato
    modulo.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } else {
    // Nella panoramica il modulo si apre come finestra
    $("finestra").appendChild(modulo);
    $("finestra").showModal();
  }
}

function chiudiModulo() {
  inModifica = null;
  if ($("finestra").open) $("finestra").close();
  $("posto-modulo").hidden = true;
  if (tickerAperto) disegnaTitolo();
}

function quandoSalvi(evento) {
  evento.preventDefault();   // impedisce alla pagina di ricaricarsi
  const ticker = $("campo-titolo").value;
  const data = $("campo-data").value;           // es. "2026-10-03"
  const numQuote = leggiNumero($("campo-quote").value);
  const investito = leggiNumero($("campo-investito").value);

  // Controlliamo che i dati abbiano senso
  if (!data) return mostraErrore("Inserisci la data dell'acquisto.");
  if (data > oggiISO()) return mostraErrore("La data non può essere nel futuro.");
  if (!(numQuote > 0)) return mostraErrore("Il numero di quote deve essere maggiore di zero.");
  if (!(investito > 0)) return mostraErrore("L'importo pagato deve essere maggiore di zero.");

  const acquisto = { data, quote: numQuote, investito };
  const posizione = posizioni.find((p) => p.ticker === ticker);
  if (inModifica) {
    posizione.acquisti[inModifica.indice] = acquisto;     // sostituiamo quello vecchio
  } else if (posizione) {
    posizione.acquisti.push(acquisto);                    // un acquisto in più su un titolo che hai già
  } else {
    posizioni.push({ ticker, acquisti: [acquisto] });     // titolo nuovo
  }

  salvaPosizioni();
  chiudiModulo();
  disegna();
}

function elimina() {
  if (!confirm("Vuoi davvero eliminare questo acquisto?")) return;
  const { ticker, indice } = inModifica;
  const posizione = posizioni.find((p) => p.ticker === ticker);
  posizione.acquisti.splice(indice, 1);
  // Se non resta nessun acquisto, il titolo sparisce e torniamo alla panoramica
  const ultimo = posizione.acquisti.length === 0;
  if (ultimo) posizioni = posizioni.filter((p) => p !== posizione);
  salvaPosizioni();
  chiudiModulo();
  disegna();
  if (ultimo && tickerAperto) tornaAllaPanoramica();
}

// ---------- Backup ----------
// Copia i tuoi dati come testo: puoi incollarlo in Note per tenerlo al sicuro.
// Dentro ci sono TUTTI i dati personali: acquisti, tesi e titoli tolti dalla watchlist.

function datiPersonali() {
  return { versione: 3, posizioni, tesi, watchlist: watchlistLocale };
}

async function copiaBackup() {
  const testo = JSON.stringify(datiPersonali());
  try {
    await navigator.clipboard.writeText(testo);
    alert("Backup copiato! Incollalo in Note per conservarlo.");
  } catch (errore) {
    prompt("Copia questo testo e conservalo:", testo);
  }
}

function ripristinaBackup() {
  const testo = prompt("Incolla qui il testo del backup:");
  if (!testo) return;
  try {
    const dati = JSON.parse(testo);
    // I backup vecchi erano solo la lista degli acquisti: vanno ancora bene
    const vecchioFormato = Array.isArray(dati);
    posizioni = normalizza(vecchioFormato ? dati : dati.posizioni);
    salvaPosizioni();
    if (!vecchioFormato) {
      tesi = pulisciTesi(dati.tesi);
      salvaTesi();
      watchlistLocale = pulisciWatchlist(dati.watchlist);
      salvaWatchlist();
    }
    disegna();
    mostraVista();
  } catch (errore) {
    alert("Il testo incollato non è un backup valido.");
  }
}

// ---------- I grafici ----------
// Per ogni giorno di Borsa (o ogni 5 minuti, per "1 giorno") calcoliamo:
//   valore    = somma di (quote × prezzo di quel momento)
//   investito = somma degli importi degli acquisti già fatti a quel momento
//
// Poi scegliamo un PERIODO (1 giorno, 1 settimana, 1 mese, anno, tutto) e calcoliamo
// il rendimento DEL PERIODO:
//   guadagno nel periodo = (valore − investito) adesso − (valore − investito) all'inizio del periodo
//   base                 = valore all'inizio del periodo + soldi investiti dopo
//   rendimento           = guadagno nel periodo ÷ base
// Così un nuovo acquisto non conta come "guadagno": aumenta solo la base.
// Con "Tutto" la base è il totale investito: è il guadagno/perdita dall'inizio.

const MARGINI = { sinistra: 8, destra: 58, sopra: 14, sotto: 28 };   // spazio per le scritte
const ALTEZZA_GRAFICO = 220;
let unitaGrafico = "perc";   // "perc" = rendimento %, "euro" = valore in €
let periodo = "tutto";       // "1g", "1s", "1m", "anno", "tutto"
let intraday = {};           // prezzi ogni 5 minuti dell'ultimo giorno di Borsa (da data/intraday.json)

const PERIODI = [
  ["1g", "1G", "Oggi"],
  ["1s", "1S", "Ultima settimana"],
  ["1m", "1M", "Ultimo mese"],
  ["anno", "Anno", "Da inizio anno"],
  ["tutto", "Tutto", "Dal primo acquisto"],
];

// "2026-10-03" → oggetto data (senza problemi di fuso orario)
function leggiData(testo) {
  const [anno, mese, giorno] = testo.slice(0, 10).split("-").map(Number);
  return new Date(anno, mese - 1, giorno);
}

// Le etichette dei momenti: "13 nov" per i giorni, "10:35" per le ore
const conOra = (chiave) => chiave.includes("T");
function etichettaBreve(chiave) {
  return conOra(chiave) ? chiave.slice(11, 16) : leggiData(chiave).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}
function etichettaLunga(chiave) {
  const giorno = leggiData(chiave).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  return conOra(chiave) ? `${giorno}, ${chiave.slice(11, 16)}` : giorno;
}

const euroTondo = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const percTonda = (n) => (n > 0 ? "+" : "") + (n * 100).toFixed(1).replace(".", ",") + "%";

// Tutti gli acquisti (di un titolo, o di tutti) in un'unica lista
function lotti(ticker = null) {
  return posizioni
    .filter((p) => !ticker || p.ticker === ticker)
    .flatMap((p) => p.acquisti.map((a) => ({ ticker: p.ticker, data: a.data, quote: a.quote, investito: a.investito })));
}

// Calcola valore e investito in ogni momento per cui abbiamo i prezzi.
// fonte = storico (un prezzo al giorno) oppure intraday (un prezzo ogni 5 minuti)
function calcolaSerie(acquisti, fonte) {
  // Entrano solo gli acquisti con la data e con i prezzi
  const validi = acquisti.filter((a) => a.data && fonte[a.ticker]);
  const esclusi = acquisti.length - validi.length;
  if (validi.length === 0) return { punti: [], esclusi };

  const inizio = validi.map((a) => a.data).sort()[0];
  const momenti = new Set();
  for (const a of validi) {
    for (const momento of Object.keys(fonte[a.ticker])) {
      if (momento >= inizio) momenti.add(momento);
    }
  }

  const ultimoPrezzo = {};   // l'ultimo prezzo conosciuto di ogni titolo
  const punti = [];
  for (const momento of [...momenti].sort()) {
    for (const a of validi) {
      const prezzo = fonte[a.ticker][momento];
      if (prezzo !== undefined) ultimoPrezzo[a.ticker] = prezzo;
    }
    let valore = 0, investito = 0, completo = true;
    // "2026-10-03" > "2026-10-03T10:00" è falso: un acquisto di oggi conta già da stamattina
    for (const a of validi) {
      if (a.data > momento) continue;                // non ancora comprato in quel momento
      const prezzo = ultimoPrezzo[a.ticker];
      if (prezzo === undefined) { completo = false; break; }
      valore += a.quote * prezzo;
      investito += a.investito;
    }
    if (completo && investito > 0) punti.push({ giorno: momento, valore, investito });
  }

  // Per i giorni: l'ultimo punto usa il prezzo di ADESSO (come il totale in alto),
  // non la chiusura salvata, che durante la giornata può essere vecchia
  const oggi = oggiISO();
  if (fonte === storico && validi.every((a) => prezzi[a.ticker])) {
    let valore = 0, investito = 0;
    for (const a of validi) {
      if (a.data > oggi) continue;
      valore += a.quote * prezzi[a.ticker].prezzo;
      investito += a.investito;
    }
    if (punti.length && punti[punti.length - 1].giorno >= oggi) punti.pop();   // sostituiamo il punto di oggi
    punti.push({ giorno: oggi, valore, investito });
  }
  return { punti, esclusi };
}

// Il primo giorno del periodo scelto (null = da sempre)
function inizioPeriodo() {
  const d = new Date();
  if (periodo === "1s") d.setDate(d.getDate() - 7);
  else if (periodo === "1m") d.setMonth(d.getMonth() - 1);
  else if (periodo === "anno") return `${d.getFullYear()}-01-01`;
  else return null;
  return d.toISOString().slice(0, 10);
}

// Prepara i punti del periodo scelto, con il rendimento del periodo (campo "rendP")
function serieDelPeriodo(acquisti) {
  let punti, esclusi, base = null;

  if (periodo === "1g") {
    ({ punti, esclusi } = calcolaSerie(acquisti, intraday));
    if (punti.length) {
      // La base è la chiusura del giorno prima, per ciò che avevi già prima di quel giorno
      const giorno = punti[0].giorno.slice(0, 10);
      const prima = acquisti.filter((a) => a.data && a.data < giorno && prezzi[a.ticker]);
      base = {
        giorno: null,
        valore: prima.reduce((s, a) => s + a.quote * prezzi[a.ticker].chiusuraIeri, 0),
        investito: prima.reduce((s, a) => s + a.investito, 0),
      };
    }
  } else {
    ({ punti, esclusi } = calcolaSerie(acquisti, storico));
    const inizio = inizioPeriodo();
    if (inizio) {
      const precedenti = punti.filter((p) => p.giorno < inizio);
      base = precedenti.length ? precedenti[precedenti.length - 1] : null;   // l'ultimo prima del periodo
      punti = punti.filter((p) => p.giorno >= inizio);
      if (base) punti.unshift(base);   // il grafico parte dallo zero, all'inizio del periodo
    }
  }

  const b = base || { valore: 0, investito: 0 };
  const gpBase = b.valore - b.investito;
  punti = punti.map((p) => {
    const gpP = p.valore - p.investito - gpBase;                 // guadagno nel periodo
    const denominatore = b.valore + (p.investito - b.investito); // valore iniziale + soldi aggiunti dopo
    return { ...p, gpP, rendP: denominatore > 0 ? gpP / denominatore : 0 };
  });
  return { punti, esclusi };
}

// Spiega perché il grafico manca, o quali acquisti non ci sono
function scriviNota(nota, area, punti, esclusi, acquisti) {
  if (punti.length < 2) {
    area.hidden = true;
    nota.hidden = false;
    if (!acquisti.some((a) => a.data)) nota.textContent = "📅 Inserisci la data dei tuoi acquisti: così il grafico parte da quel giorno.";
    else if (periodo === "1g") nota.textContent = "⏳ Il grafico di oggi comparirà dopo l'apertura della Borsa e il prossimo aggiornamento dei prezzi.";
    else nota.textContent = "⏳ Il grafico comparirà dopo il prossimo aggiornamento automatico dei prezzi.";
    return false;
  }
  area.hidden = false;
  nota.hidden = esclusi === 0;
  nota.textContent = esclusi === 1
    ? "1 acquisto senza data (o senza prezzi) non è nel grafico."
    : `${esclusi} acquisti senza data (o senza prezzi) non sono nel grafico.`;
  return true;
}

// La riga sopra il grafico: "Ultimo mese: +12,30 € · +1,62%"
function scriviRiepilogo(elemento, punti) {
  const nome = PERIODI.find(([chiave]) => chiave === periodo)[2];
  if (punti.length < 2) { elemento.textContent = nome; elemento.className = "riepilogo-periodo"; return; }
  const ultimo = punti[punti.length - 1];
  elemento.textContent = `${nome}: ${euro(ultimo.gpP, true)} · ${percentuale(ultimo.rendP)}`;
  elemento.className = "riepilogo-periodo " + classeColore(ultimo.gpP);
}

// Scrive la legenda: una lineetta e un nome per ogni linea
function scriviLegenda(contenitore, linee) {
  contenitore.innerHTML = "";
  for (const l of linee) {
    const voce = document.createElement("span");
    voce.innerHTML = `<i class="${l.classe}"></i>`;
    voce.append(l.nome);
    contenitore.appendChild(voce);
  }
}

// ---- Il grafico della panoramica ----
function disegnaGrafico() {
  const svg = $("grafico");
  nascondiFumetto(svg);
  $("sezione-grafico").hidden = posizioni.length === 0;
  if (posizioni.length === 0) return;

  const acquisti = lotti();
  const { punti, esclusi } = serieDelPeriodo(acquisti);
  scriviRiepilogo($("riepilogo-periodo"), punti);
  if (!scriviNota($("nota-grafico"), $("area-grafico"), punti, esclusi, acquisti)) return;

  const linee = unitaGrafico === "perc"
    ? [{ campo: "rendP", classe: "linea-valore", nome: "Rendimento" }]
    : [{ campo: "valore", classe: "linea-valore", nome: "Valore" },
       { campo: "investito", classe: "linea-investito", nome: "Investito" }];
  $("titolo-grafico").textContent = unitaGrafico === "perc" ? "Rendimento del portafoglio" : "Valore del portafoglio";
  scriviLegenda($("legenda-grafico"), linee);
  disegnaLinee(svg, $("area-grafico"), punti, linee, unitaGrafico);
}

// ---- Il grafico della pagina di un titolo: il titolo contro tutto il portafoglio ----
function disegnaGraficoTitolo() {
  const svg = $("grafico-titolo");
  nascondiFumetto(svg);
  const acquisti = lotti(tickerAperto);
  const { punti, esclusi } = serieDelPeriodo(acquisti);
  scriviRiepilogo($("riepilogo-periodo-titolo"), punti);
  if (!scriviNota($("nota-grafico-titolo"), $("area-grafico-titolo"), punti, esclusi, acquisti)) return;

  // Il rendimento di tutto il portafoglio negli stessi momenti, per fare il confronto
  const portafoglio = {};
  for (const p of serieDelPeriodo(lotti()).punti) portafoglio[p.giorno] = p.rendP;
  let ultimo = null;
  for (const p of punti) {
    if (portafoglio[p.giorno] !== undefined) ultimo = portafoglio[p.giorno];
    p.rendPortafoglio = ultimo;
  }

  const linee = [{ campo: "rendP", classe: "linea-valore", nome: infoTitolo(tickerAperto).nome }];
  if (posizioni.length > 1) linee.push({ campo: "rendPortafoglio", classe: "linea-investito", nome: "Tutto il portafoglio" });
  scriviLegenda($("legenda-titolo"), linee);
  disegnaLinee(svg, $("area-grafico-titolo"), punti, linee, "perc");
}

// ---- Il disegno vero e proprio, uguale per tutti i grafici ----
// linee: [{ campo, classe, nome }]   unita: "perc" oppure "euro"
function disegnaLinee(svg, area, punti, linee, unita) {
  const formatoAsse = unita === "perc" ? percTonda : (n) => euroTondo.format(n);

  // ---- Le misure: da "euro (o %) e momenti" a "pixel sullo schermo" ----
  const larghezza = area.clientWidth;
  const altezza = ALTEZZA_GRAFICO;
  const tuttiIValori = punti.flatMap((p) => linee.map((l) => p[l.campo])).filter((v) => v !== null && v !== undefined);
  if (unita === "perc") tuttiIValori.push(0);   // lo zero (né guadagno né perdita) si vede sempre
  let minimo = Math.min(...tuttiIValori);
  let massimo = Math.max(...tuttiIValori);
  const margine = (massimo - minimo) * 0.15 || Math.abs(massimo) * 0.02 || 0.01;
  minimo -= margine;
  massimo += margine;

  const larghezzaUtile = larghezza - MARGINI.sinistra - MARGINI.destra;
  const altezzaUtile = altezza - MARGINI.sopra - MARGINI.sotto;
  const x = (i) => MARGINI.sinistra + (i / (punti.length - 1)) * larghezzaUtile;
  const y = (v) => MARGINI.sopra + (1 - (v - minimo) / (massimo - minimo)) * altezzaUtile;
  const fondo = altezza - MARGINI.sotto;

  // Una "linea" SVG è una serie di comandi: M = vai a, L = traccia fino a
  const linea = (campo) => punti
    .map((p, i) => [p[campo], i])
    .filter(([v]) => v !== null && v !== undefined)
    .map(([v, i], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");

  // La sfumatura sotto la linea principale: fino allo zero per le %, fino in fondo per gli €
  const base = unita === "perc" ? y(0) : fondo;
  const areaSotto = `${linea(linee[0].campo)} L${x(punti.length - 1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`;

  // Tre righe orizzontali di riferimento, con il valore a destra
  let griglia = "";
  for (let k = 0; k <= 2; k++) {
    const v = minimo + ((massimo - minimo) * (k + 0.5)) / 3;
    // Se la riga è troppo vicina a quella dello zero, la saltiamo: le scritte si sovrapporrebbero
    if (unita === "perc" && Math.abs(y(v) - y(0)) < 16) continue;
    griglia += `<line class="griglia" x1="${MARGINI.sinistra}" x2="${larghezza - MARGINI.destra}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="asse" x="${larghezza - MARGINI.destra + 8}" y="${y(v) + 4}">${formatoAsse(v)}</text>`;
  }
  // Per le %: la riga dello zero, più marcata
  if (unita === "perc") {
    griglia += `<line class="zero" x1="${MARGINI.sinistra}" x2="${larghezza - MARGINI.destra}" y1="${y(0)}" y2="${y(0)}"/>
      <text class="asse" x="${larghezza - MARGINI.destra + 8}" y="${y(0) + 4}">0%</text>`;
  }

  // Tre etichette in basso: inizio, metà, fine
  let date = "";
  for (const [i, allineamento] of [[0, "start"], [Math.floor((punti.length - 1) / 2), "middle"], [punti.length - 1, "end"]]) {
    date += `<text class="asse" x="${x(i)}" y="${altezza - 8}" text-anchor="${allineamento}">${etichettaBreve(punti[i].giorno)}</text>`;
  }

  // Le linee: la prima (principale) disegnata per ultima, così sta sopra
  const tracciati = linee.slice().reverse()
    .map((l) => `<path class="${l.classe}" d="${linea(l.campo)}"/>`).join("");

  svg.setAttribute("viewBox", `0 0 ${larghezza} ${altezza}`);
  svg.setAttribute("width", larghezza);
  svg.setAttribute("height", altezza);
  const ultimo = punti[punti.length - 1];
  svg.setAttribute("aria-label", linee.map((l) => `${l.nome}: ${unita === "perc" ? percentuale(ultimo[l.campo] ?? 0) : euro(ultimo[l.campo])}`).join(", "));
  svg.innerHTML = `
    <defs>
      <linearGradient id="sfumatura-${svg.id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--linea-valore)" stop-opacity="0.28"/>
        <stop offset="1" stop-color="var(--linea-valore)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${griglia}
    <path d="${areaSotto}" fill="url(#sfumatura-${svg.id})"/>
    ${tracciati}
    ${date}
    <line class="mirino" y1="${MARGINI.sopra}" y2="${fondo}" visibility="hidden"/>
    <circle class="punto" r="5" visibility="hidden"/>`;

  // Ricordiamo tutto ciò che serve al "fumetto"
  svg._dati = { punti, linee, unita, x, y, larghezzaUtile };
}

// Il "fumetto": quando tocchi il grafico mostra i numeri di quel momento
function mostraFumetto(evento) {
  const svg = evento.currentTarget;
  if (!svg._dati) return;
  const { punti, linee, unita, x, y, larghezzaUtile } = svg._dati;
  const rettangolo = svg.getBoundingClientRect();
  const posizione = evento.clientX - rettangolo.left - MARGINI.sinistra;
  const i = Math.max(0, Math.min(punti.length - 1, Math.round((posizione / larghezzaUtile) * (punti.length - 1))));
  const p = punti[i];

  const mirino = svg.querySelector(".mirino");
  mirino.setAttribute("x1", x(i));
  mirino.setAttribute("x2", x(i));
  mirino.setAttribute("visibility", "visible");
  const punto = svg.querySelector(".punto");
  punto.setAttribute("cx", x(i));
  punto.setAttribute("cy", y(p[linee[0].campo]));
  punto.setAttribute("visibility", "visible");

  const fumetto = svg.parentElement.querySelector(".fumetto");
  let righe = linee.map((l) => {
    const v = p[l.campo];
    const testo = v === null || v === undefined ? "–" : unita === "perc" ? percentuale(v) : euro(v);
    return `<div><i class="${l.classe}"></i><span class="nome-linea"></span> <b>${testo}</b></div>`;
  }).join("");
  righe += `<div class="fumetto-data">Nel periodo ${euro(p.gpP, true)} · valore ${euro(p.valore)}</div>`;
  fumetto.innerHTML = `<div class="fumetto-data">${p.giorno ? etichettaLunga(p.giorno) : ""}</div>${righe}`;
  fumetto.querySelectorAll(".nome-linea").forEach((el, k) => (el.textContent = linee[k].nome));
  fumetto.hidden = false;
  // Il fumetto sta vicino al dito, ma senza uscire dal grafico
  const larghezzaFumetto = fumetto.offsetWidth;
  const sinistra = Math.max(0, Math.min(x(i) - larghezzaFumetto / 2, rettangolo.width - larghezzaFumetto));
  fumetto.style.left = sinistra + "px";
}

function nascondiFumetto(svgOEvento) {
  const svg = svgOEvento instanceof Event ? svgOEvento.currentTarget : svgOEvento;
  const fumetto = svg.parentElement.querySelector(".fumetto");
  if (fumetto) fumetto.hidden = true;
  svg.querySelector(".mirino")?.setAttribute("visibility", "hidden");
  svg.querySelector(".punto")?.setAttribute("visibility", "hidden");
}

// Ridisegna il grafico della vista che stai guardando
function ridisegnaGrafici() {
  if (tickerAperto) {
    if (posizioni.some((p) => p.ticker === tickerAperto)) disegnaGraficoTitolo();
    disegnaGraficoTecnico();
  } else if (vistaAperta === "portafoglio") disegnaGrafico();
}

// Il selettore "%" / "€" del grafico della panoramica
function scegliUnita(unita) {
  unitaGrafico = unita;
  $("mostra-perc").classList.toggle("attivo", unita === "perc");
  $("mostra-euro").classList.toggle("attivo", unita === "euro");
  try { localStorage.setItem("unita-grafico", unita); } catch (errore) { /* non importa */ }
  disegnaGrafico();
}

// I pulsanti dei periodi: uguali nella panoramica e nella pagina del titolo
function creaPulsantiPeriodo() {
  for (const contenitore of document.querySelectorAll(".periodi")) {
    for (const [chiave, etichetta, descrizione] of PERIODI) {
      const pulsante = document.createElement("button");
      pulsante.type = "button";
      pulsante.textContent = etichetta;
      pulsante.title = descrizione;
      pulsante.dataset.periodo = chiave;
      pulsante.onclick = () => scegliPeriodo(chiave);
      contenitore.appendChild(pulsante);
    }
  }
}

function scegliPeriodo(chiave) {
  periodo = chiave;
  document.querySelectorAll(".periodi button").forEach((b) => b.classList.toggle("attivo", b.dataset.periodo === chiave));
  try { localStorage.setItem("periodo-grafico", chiave); } catch (errore) { /* non importa */ }
  ridisegnaGrafici();
}

// ---------- Avvio ----------

async function avvia() {
  posizioni = caricaPosizioni();
  tesi = caricaTesi();
  watchlistLocale = caricaWatchlist();

  try {
    // fetch = "vai a prendere" un file. await = "aspetta che arrivi".
    const [rispostaTitoli, rispostaPrezzi] = await Promise.all([
      fetch("data/titoli.json"),
      fetch("data/prezzi.json", { cache: "no-store" }),  // sempre la versione più recente
    ]);
    titoli = await rispostaTitoli.json();
    const datiPrezzi = await rispostaPrezzi.json();
    prezzi = datiPrezzi.prezzi || {};

    if (datiPrezzi.aggiornato) {
      controllatiIl = datiPrezzi.aggiornato;
      const data = new Date(datiPrezzi.aggiornato);
      $("aggiornamento").textContent = "Fonte: Yahoo Finance. GitHub ha controllato i prezzi il " +
        data.toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short" }) +
        ". I prezzi sono quelli dell'ultimo scambio sulla borsa indicata sotto il totale.";
    } else {
      $("avviso").textContent = "⏳ I prezzi non sono ancora arrivati: compariranno dopo il primo aggiornamento automatico.";
      $("avviso").hidden = false;
    }
  } catch (errore) {
    $("avviso").textContent = "⚠️ Non riesco a caricare i dati. Controlla la connessione e riprova.";
    $("avviso").hidden = false;
  }

  // Storico, prezzi di oggi e notizie non sono indispensabili: se mancano, la pagina funziona lo stesso
  try {
    const [rispostaStorico, rispostaIntraday, rispostaNotizie, rispostaAnalisi, rispostaAi] = await Promise.all([
      fetch("data/storico.json", { cache: "no-store" }),
      fetch("data/intraday.json", { cache: "no-store" }),
      fetch("data/notizie.json", { cache: "no-store" }),
      fetch("data/analisi.json", { cache: "no-store" }),
      fetch("data/ai.json", { cache: "no-store" }),
    ]);
    if (rispostaStorico.ok) storico = await rispostaStorico.json();
    if (rispostaIntraday.ok) intraday = await rispostaIntraday.json();
    if (rispostaNotizie.ok) {
      const datiNotizie = await rispostaNotizie.json();
      notizie = datiNotizie.notizie || {};
      notizieAggiornateIl = datiNotizie.aggiornato || null;
      notizieServizi = datiNotizie.servizi || {};
    }
    if (rispostaAnalisi.ok) {
      const datiAnalisi = await rispostaAnalisi.json();
      if (datiAnalisi && datiAnalisi.titoli) analisi = datiAnalisi;
    }
    if (rispostaAi.ok) {
      const datiAi = await rispostaAi.json();
      if (datiAi && datiAi.analisi) ai = datiAi;
    }
  } catch (errore) {
    /* niente grafici, pazienza */
  }

  // Riempiamo il menu a tendina con i titoli disponibili
  for (const t of titoli) {
    const opzione = document.createElement("option");
    opzione.value = t.ticker;
    opzione.textContent = `${t.nome} (${t.tipo})`;
    $("campo-titolo").appendChild(opzione);
  }

  // Colleghiamo i pulsanti alle loro azioni
  $("apri-modulo").onclick = () => apriModulo();
  $("annulla").onclick = chiudiModulo;
  $("finestra").addEventListener("close", () => { inModifica = null; });
  $("aggiungi-acquisto").onclick = () => apriModulo(tickerAperto);
  $("indietro").onclick = tornaAllaPanoramica;
  $("altre-notizie").onclick = () => { notizieTutte = !notizieTutte; disegnaNotizie(); };
  $("mostra-perc").onclick = () => scegliUnita("perc");
  $("mostra-euro").onclick = () => scegliUnita("euro");
  try { if (localStorage.getItem("unita-grafico") === "euro") unitaGrafico = "euro"; } catch (errore) { /* non importa */ }
  $("mostra-perc").classList.toggle("attivo", unitaGrafico === "perc");
  $("mostra-euro").classList.toggle("attivo", unitaGrafico === "euro");
  creaPulsantiPeriodo();
  try { periodo = localStorage.getItem("periodo-grafico") || "tutto"; } catch (errore) { /* non importa */ }
  if (!PERIODI.some(([chiave]) => chiave === periodo)) periodo = "tutto";
  document.querySelectorAll(".periodi button").forEach((b) => b.classList.toggle("attivo", b.dataset.periodo === periodo));
  $("elimina").onclick = elimina;
  $("modulo").addEventListener("submit", quandoSalvi);
  collegaFondamentale();
  collegaTecnico();
  collegaCacciatore();
  collegaOggi();
  $("backup").onclick = copiaBackup;
  $("ripristina").onclick = ripristinaBackup;

  // Se giri l'iPad, ridisegniamo i grafici con la nuova larghezza
  window.addEventListener("resize", ridisegnaGrafici);
  // Tocchi e movimenti sui grafici mostrano il "fumetto" con i valori
  for (const id of ["grafico", "grafico-titolo"]) {
    $(id).addEventListener("pointermove", mostraFumetto);
    $(id).addEventListener("pointerdown", mostraFumetto);
    $(id).addEventListener("pointerleave", nascondiFumetto);
  }
  // Quando cambia l'indirizzo (tocchi un titolo, o "indietro") cambiamo vista
  window.addEventListener("hashchange", mostraVista);

  disegna();
  mostraVista();
}

avvia();
