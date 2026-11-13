// app.js = il "cervello" della pagina.
// Fa quattro cose:
//   1. legge l'elenco dei titoli e i prezzi (file pubblici nella cartella data/)
//   2. legge le TUE quote, salvate solo nel browser del tuo iPad
//   3. fa i calcoli (valore, guadagno/perdita)
//   4. disegna il totale e una scheda per ogni titolo
//   5. disegna il grafico dell'andamento dal giorno dell'acquisto

// Il nome con cui salviamo i tuoi dati nel browser.
const CHIAVE_SALVATAGGIO = "portafoglio-v1";

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
let posizioni = [];    // le tue posizioni: [{ ticker, quote, investito, dataAcquisto }]
let inModifica = null; // il titolo che stai modificando (null = ne aggiungi uno nuovo)

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

function caricaPosizioni() {
  try {
    const testo = localStorage.getItem(CHIAVE_SALVATAGGIO);
    return testo ? JSON.parse(testo) : [];
  } catch (errore) {
    return [];
  }
}

function salvaPosizioni() {
  try {
    localStorage.setItem(CHIAVE_SALVATAGGIO, JSON.stringify(posizioni));
  } catch (errore) {
    alert("Non riesco a salvare su questo dispositivo (navigazione privata?).");
  }
}

// ---------- Calcoli ----------

// Per una posizione calcola valore attuale e guadagno/perdita
function calcola(posizione) {
  const p = prezzi[posizione.ticker];
  if (!p) return null;                               // prezzo non ancora disponibile
  const valore = posizione.quote * p.prezzo;         // quote × prezzo
  const gp = valore - posizione.investito;           // quanto ho guadagnato (o perso)
  const gpPerc = gp / posizione.investito;           // in proporzione all'investito
  // Variazione di oggi: prezzo attuale rispetto alla chiusura di ieri
  const oggi = p.chiusuraIeri ? p.prezzo / p.chiusuraIeri - 1 : null;
  return { prezzo: p.prezzo, valore, gp, gpPerc, oggi };
}

// ---------- Disegno della pagina ----------

function disegna() {
  const contenitore = $("schede");
  contenitore.innerHTML = "";   // svuotiamo prima di riempire

  let totInvestito = 0;
  let totValore = 0;
  let prezziMancanti = 0;

  for (const posizione of posizioni) {
    const indice = titoli.findIndex((t) => t.ticker === posizione.ticker);
    const info = titoli[indice] || { nome: posizione.ticker, tipo: "", ticker: posizione.ticker };
    const [coloreSfondo, coloreTesto] = COLORI_SIGLA[Math.max(indice, 0) % COLORI_SIGLA.length];
    const r = calcola(posizione);

    totInvestito += posizione.investito;
    if (r) totValore += r.valore;
    else prezziMancanti++;

    // La riga piccola sotto il nome: quote, prezzo e variazione di oggi
    let dettaglio = quote(posizione.quote) + " quote";
    if (r) dettaglio += " · " + euro(r.prezzo);
    if (r && r.oggi !== null) dettaglio += " · oggi " + percentuale(r.oggi);

    // Creiamo la scheda: è un pulsante, se la tocchi si apre la modifica
    const scheda = document.createElement("button");
    scheda.type = "button";
    scheda.className = "scheda";
    scheda.innerHTML = `
      <div class="sigla"></div>
      <div class="info">
        <div class="nome"><span></span><span class="tag"></span></div>
        <div class="dettaglio"></div>
      </div>
      <div class="cifre">
        <span class="valore">${r ? euro(r.valore) : "–"}</span>
        <span class="chip ${r ? classeColore(r.gp) : ""}">${r ? percentuale(r.gpPerc) : "in attesa"}</span>
      </div>`;
    // I testi li inseriamo come testo semplice, per sicurezza
    const sigla = scheda.querySelector(".sigla");
    sigla.textContent = info.ticker.split(".")[0];   // "VWCE.DE" → "VWCE"
    sigla.style.background = coloreSfondo;
    sigla.style.color = coloreTesto;
    scheda.querySelector(".nome span").textContent = info.nome;
    scheda.querySelector(".tag").textContent = info.tipo;
    scheda.querySelector(".dettaglio").textContent = dettaglio;
    scheda.onclick = () => apriModulo(posizione.ticker);
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

  disegnaGrafico();
}

// ---------- Il modulo: aggiungi, modifica, elimina ----------

function mostraErrore(messaggio) {
  $("errore").textContent = messaggio;
  $("errore").hidden = !messaggio;
}

// Apre la finestra. Se passi un ticker, la riempie per la modifica.
function apriModulo(ticker = null) {
  inModifica = ticker;
  mostraErrore("");
  const p = posizioni.find((x) => x.ticker === ticker);
  $("titolo-modulo").textContent = p ? "Modifica titolo" : "Aggiungi titolo";
  $("campo-titolo").value = p ? p.ticker : titoli[0]?.ticker;
  $("campo-titolo").disabled = Boolean(p);   // in modifica il titolo non si cambia
  $("campo-quote").value = p ? String(p.quote).replace(".", ",") : "";
  $("campo-investito").value = p ? String(p.investito).replace(".", ",") : "";
  $("campo-data").value = p?.dataAcquisto || "";
  $("campo-data").max = new Date().toISOString().slice(0, 10);   // niente date future
  $("elimina").hidden = !p;
  $("finestra").showModal();
}

function quandoSalvi(evento) {
  evento.preventDefault();   // impedisce alla pagina di ricaricarsi
  const ticker = inModifica || $("campo-titolo").value;
  const numQuote = leggiNumero($("campo-quote").value);
  const investito = leggiNumero($("campo-investito").value);
  const dataAcquisto = $("campo-data").value;   // es. "2026-10-03" oppure "" se vuota

  // Controlliamo che i numeri abbiano senso
  if (!(numQuote > 0)) return mostraErrore("Il numero di quote deve essere maggiore di zero.");
  if (!(investito > 0)) return mostraErrore("Il capitale investito deve essere maggiore di zero.");

  // Se il titolo c'è già lo aggiorniamo, altrimenti lo aggiungiamo
  const esistente = posizioni.find((p) => p.ticker === ticker);
  if (esistente) {
    esistente.quote = numQuote;
    esistente.investito = investito;
    esistente.dataAcquisto = dataAcquisto;
  } else {
    posizioni.push({ ticker, quote: numQuote, investito, dataAcquisto });
  }

  salvaPosizioni();
  disegna();
  $("finestra").close();
}

function elimina() {
  if (!confirm("Vuoi davvero eliminare questo titolo?")) return;
  posizioni = posizioni.filter((p) => p.ticker !== inModifica);
  salvaPosizioni();
  disegna();
  $("finestra").close();
}

// ---------- Backup ----------
// Copia i tuoi dati come testo: puoi incollarlo in Note per tenerlo al sicuro.

async function copiaBackup() {
  const testo = JSON.stringify(posizioni);
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
    const valido = Array.isArray(dati) && dati.every((p) => p.ticker && p.quote > 0 && p.investito > 0);
    if (!valido) throw new Error();
    posizioni = dati;
    salvaPosizioni();
    disegna();
  } catch (errore) {
    alert("Il testo incollato non è un backup valido.");
  }
}

// ---------- Grafico dell'andamento ----------
// Idea: per ogni giorno di Borsa dall'acquisto in poi calcoliamo
//   valore    = somma di (quote × prezzo di chiusura di quel giorno)
//   investito = somma del capitale dei titoli già comprati a quella data
// e disegniamo due linee: il valore (blu) e l'investito (grigia tratteggiata).
// Se la linea blu sta sopra quella grigia, sei in guadagno.

const MARGINI = { sinistra: 8, destra: 58, sopra: 14, sotto: 28 };   // spazio per le scritte
const ALTEZZA_GRAFICO = 220;
let datiGrafico = null;   // ricordiamo i punti disegnati, servono al "fumetto"

// "2026-10-03" → oggetto data (senza problemi di fuso orario)
function leggiData(testo) {
  const [anno, mese, giorno] = testo.split("-").map(Number);
  return new Date(anno, mese - 1, giorno);
}

const euroTondo = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function calcolaSerie() {
  // Nel grafico entrano solo i titoli con data di acquisto e con lo storico dei prezzi
  const conData = posizioni.filter((p) => p.dataAcquisto && storico[p.ticker]);
  const esclusi = posizioni.length - conData.length;
  if (conData.length === 0) return { punti: [], esclusi };

  const inizio = conData.map((p) => p.dataAcquisto).sort()[0];

  // Tutti i giorni di Borsa dall'acquisto più vecchio in poi
  const giorni = new Set();
  for (const p of conData) {
    for (const giorno of Object.keys(storico[p.ticker])) {
      if (giorno >= inizio) giorni.add(giorno);
    }
  }

  const ultimoPrezzo = {};   // l'ultimo prezzo conosciuto di ogni titolo
  const punti = [];
  for (const giorno of [...giorni].sort()) {
    for (const p of conData) {
      const chiusura = storico[p.ticker][giorno];
      if (chiusura !== undefined) ultimoPrezzo[p.ticker] = chiusura;
    }
    let valore = 0, investito = 0, completo = true;
    for (const p of conData) {
      if (p.dataAcquisto > giorno) continue;          // non ancora comprato quel giorno
      const prezzo = ultimoPrezzo[p.ticker];
      if (prezzo === undefined) { completo = false; break; }
      valore += p.quote * prezzo;
      investito += p.investito;
    }
    if (completo && investito > 0) punti.push({ giorno, valore, investito });
  }

  // Ultimo punto: il prezzo di adesso, se è più recente dell'ultima chiusura
  const oggi = new Date().toISOString().slice(0, 10);
  const ultimoGiorno = punti.length ? punti[punti.length - 1].giorno : "";
  if (oggi > ultimoGiorno && conData.every((p) => prezzi[p.ticker])) {
    let valore = 0, investito = 0;
    for (const p of conData) {
      if (p.dataAcquisto > oggi) continue;
      valore += p.quote * prezzi[p.ticker].prezzo;
      investito += p.investito;
    }
    if (investito > 0) punti.push({ giorno: oggi, valore, investito });
  }

  return { punti, esclusi };
}

function disegnaGrafico() {
  const svg = $("grafico");
  const nota = $("nota-grafico");
  const area = $("area-grafico");
  nascondiFumetto();

  // Senza titoli il grafico non serve
  document.querySelector(".grafico").hidden = posizioni.length === 0;
  if (posizioni.length === 0) return;

  const { punti, esclusi } = calcolaSerie();

  if (punti.length < 2) {
    area.hidden = true;
    datiGrafico = null;
    nota.hidden = false;
    nota.textContent = posizioni.some((p) => p.dataAcquisto)
      ? "⏳ Il grafico comparirà dopo il prossimo aggiornamento automatico dei prezzi."
      : "📅 Tocca una scheda e inserisci la data di acquisto: così il grafico parte da quel giorno.";
    return;
  }

  area.hidden = false;
  nota.hidden = esclusi === 0;
  nota.textContent = esclusi === 1
    ? "1 titolo senza data di acquisto non è nel grafico."
    : `${esclusi} titoli senza data di acquisto non sono nel grafico.`;

  // ---- Le misure: da "euro e giorni" a "pixel sullo schermo" ----
  const larghezza = area.clientWidth;
  const altezza = ALTEZZA_GRAFICO;
  const tuttiIValori = punti.flatMap((p) => [p.valore, p.investito]);
  let minimo = Math.min(...tuttiIValori);
  let massimo = Math.max(...tuttiIValori);
  const margine = (massimo - minimo) * 0.15 || massimo * 0.02;
  minimo -= margine;
  massimo += margine;

  const larghezzaUtile = larghezza - MARGINI.sinistra - MARGINI.destra;
  const altezzaUtile = altezza - MARGINI.sopra - MARGINI.sotto;
  const x = (i) => MARGINI.sinistra + (i / (punti.length - 1)) * larghezzaUtile;
  const y = (euro) => MARGINI.sopra + (1 - (euro - minimo) / (massimo - minimo)) * altezzaUtile;

  // Una "linea" SVG è una serie di comandi: M = vai a, L = traccia fino a
  const linea = (campo) => punti.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[campo]).toFixed(1)}`).join(" ");
  const fondo = altezza - MARGINI.sotto;
  const areaSotto = `${linea("valore")} L${x(punti.length - 1).toFixed(1)},${fondo} L${x(0).toFixed(1)},${fondo} Z`;

  // Tre righe orizzontali di riferimento, con l'importo a destra
  let griglia = "";
  for (let k = 0; k <= 2; k++) {
    const euro = minimo + ((massimo - minimo) * (k + 0.5)) / 3;
    griglia += `<line class="griglia" x1="${MARGINI.sinistra}" x2="${larghezza - MARGINI.destra}" y1="${y(euro)}" y2="${y(euro)}"/>
      <text class="asse" x="${larghezza - MARGINI.destra + 8}" y="${y(euro) + 4}">${euroTondo.format(euro)}</text>`;
  }

  // Tre date in basso: inizio, metà, fine
  const formatoGiorno = { day: "numeric", month: "short" };
  let date = "";
  for (const [i, allineamento] of [[0, "start"], [Math.floor((punti.length - 1) / 2), "middle"], [punti.length - 1, "end"]]) {
    const testo = leggiData(punti[i].giorno).toLocaleDateString("it-IT", formatoGiorno);
    date += `<text class="asse" x="${x(i)}" y="${altezza - 8}" text-anchor="${allineamento}">${testo}</text>`;
  }

  svg.setAttribute("viewBox", `0 0 ${larghezza} ${altezza}`);
  svg.setAttribute("width", larghezza);
  svg.setAttribute("height", altezza);
  const ultimo = punti[punti.length - 1];
  svg.setAttribute("aria-label",
    `Valore da ${euro(punti[0].valore)} a ${euro(ultimo.valore)}, investito ${euro(ultimo.investito)}`);
  svg.innerHTML = `
    <defs>
      <linearGradient id="sfumatura" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--linea-valore)" stop-opacity="0.28"/>
        <stop offset="1" stop-color="var(--linea-valore)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${griglia}
    <path d="${areaSotto}" fill="url(#sfumatura)"/>
    <path class="linea-investito" d="${linea("investito")}"/>
    <path class="linea-valore" d="${linea("valore")}"/>
    ${date}
    <line class="mirino" id="mirino" y1="${MARGINI.sopra}" y2="${fondo}" visibility="hidden"/>
    <circle class="punto" id="punto" r="5" visibility="hidden"/>`;

  datiGrafico = { punti, x, y, larghezzaUtile };
}

// Il "fumetto": quando tocchi il grafico mostra i numeri di quel giorno
function mostraFumetto(evento) {
  if (!datiGrafico) return;
  const { punti, x, y, larghezzaUtile } = datiGrafico;
  const rettangolo = $("grafico").getBoundingClientRect();
  const posizione = evento.clientX - rettangolo.left - MARGINI.sinistra;
  const i = Math.max(0, Math.min(punti.length - 1, Math.round((posizione / larghezzaUtile) * (punti.length - 1))));
  const p = punti[i];
  const gp = p.valore - p.investito;

  const mirino = $("mirino");
  mirino.setAttribute("x1", x(i));
  mirino.setAttribute("x2", x(i));
  mirino.setAttribute("visibility", "visible");
  const punto = $("punto");
  punto.setAttribute("cx", x(i));
  punto.setAttribute("cy", y(p.valore));
  punto.setAttribute("visibility", "visible");

  const fumetto = $("fumetto");
  fumetto.innerHTML = `
    <div class="fumetto-data">${leggiData(p.giorno).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}</div>
    <div><i class="linea-valore"></i>Valore <b>${euro(p.valore)}</b></div>
    <div><i class="linea-investito"></i>Investito <b>${euro(p.investito)}</b></div>
    <div class="${classeColore(gp)}">${euro(gp, true)} · ${percentuale(gp / p.investito)}</div>`;
  fumetto.hidden = false;
  // Il fumetto sta vicino al dito, ma senza uscire dal grafico
  const larghezzaFumetto = fumetto.offsetWidth;
  const sinistra = Math.max(0, Math.min(x(i) - larghezzaFumetto / 2, rettangolo.width - larghezzaFumetto));
  fumetto.style.left = sinistra + "px";
}

function nascondiFumetto() {
  $("fumetto").hidden = true;
  $("mirino")?.setAttribute("visibility", "hidden");
  $("punto")?.setAttribute("visibility", "hidden");
}

// ---------- Avvio ----------

async function avvia() {
  posizioni = caricaPosizioni();

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
      const data = new Date(datiPrezzi.aggiornato);
      $("aggiornamento").textContent = "Prezzi Yahoo Finance (Xetra), aggiornati il " +
        data.toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short" }) + ".";
    } else {
      $("avviso").textContent = "⏳ I prezzi non sono ancora arrivati: compariranno dopo il primo aggiornamento automatico.";
      $("avviso").hidden = false;
    }
  } catch (errore) {
    $("avviso").textContent = "⚠️ Non riesco a caricare i dati. Controlla la connessione e riprova.";
    $("avviso").hidden = false;
  }

  // Lo storico serve solo per il grafico: se manca, la pagina funziona lo stesso
  try {
    const rispostaStorico = await fetch("data/storico.json", { cache: "no-store" });
    if (rispostaStorico.ok) storico = await rispostaStorico.json();
  } catch (errore) {
    storico = {};
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
  $("annulla").onclick = () => $("finestra").close();
  $("elimina").onclick = elimina;
  $("modulo").addEventListener("submit", quandoSalvi);
  $("backup").onclick = copiaBackup;
  $("ripristina").onclick = ripristinaBackup;

  // Se giri l'iPad, ridisegniamo il grafico con la nuova larghezza
  window.addEventListener("resize", disegnaGrafico);
  // Tocchi e movimenti sul grafico mostrano il "fumetto" con i valori
  $("grafico").addEventListener("pointermove", mostraFumetto);
  $("grafico").addEventListener("pointerdown", mostraFumetto);
  $("grafico").addEventListener("pointerleave", nascondiFumetto);

  disegna();
}

avvia();
