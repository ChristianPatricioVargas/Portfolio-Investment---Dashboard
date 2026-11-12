// app.js = il "cervello" della pagina.
// Fa quattro cose:
//   1. legge l'elenco dei titoli e i prezzi (file pubblici nella cartella data/)
//   2. legge le TUE quote, salvate solo nel browser del tuo iPad
//   3. fa i calcoli (valore, guadagno/perdita)
//   4. disegna il totale e una scheda per ogni titolo

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
let posizioni = [];    // le tue posizioni: [{ ticker, quote, investito }]
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
  $("elimina").hidden = !p;
  $("finestra").showModal();
}

function quandoSalvi(evento) {
  evento.preventDefault();   // impedisce alla pagina di ricaricarsi
  const ticker = inModifica || $("campo-titolo").value;
  const numQuote = leggiNumero($("campo-quote").value);
  const investito = leggiNumero($("campo-investito").value);

  // Controlliamo che i numeri abbiano senso
  if (!(numQuote > 0)) return mostraErrore("Il numero di quote deve essere maggiore di zero.");
  if (!(investito > 0)) return mostraErrore("Il capitale investito deve essere maggiore di zero.");

  // Se il titolo c'è già lo aggiorniamo, altrimenti lo aggiungiamo
  const esistente = posizioni.find((p) => p.ticker === ticker);
  if (esistente) {
    esistente.quote = numQuote;
    esistente.investito = investito;
  } else {
    posizioni.push({ ticker, quote: numQuote, investito });
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

  disegna();
}

avvia();
