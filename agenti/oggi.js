// agenti/oggi.js = la pagina "OGGI": il riepilogo di tutta la squadra di agenti.
// È la prima pagina che vedi. Mette insieme, senza calcoli nuovi, il lavoro degli altri:
//   1. come va il portafoglio
//   2. cosa è successo ai tuoi titoli (prezzi, notizie, campanelli, trimestrali vicine)
//   3. lo stato delle tue tesi (vicino al target? condizioni di uscita verificate?)
//   4. le migliori occasioni del cacciatore, con il loro rischio principale
// E prepara il testo di "Copia per l'analisi", da incollare in una chat con Claude.

const OCCASIONI_IN_EVIDENZA = 3;     // quante occasioni mostrare nella pagina Oggi
const OCCASIONI_NEL_TESTO = 5;       // quante metterne nel testo da copiare
const GIORNI_AVVISO_TRIMESTRALE = 30;

// La strategia, scritta in cima al testo da copiare: così chi lo legge sa come ragioni
const STRATEGIA = [
  "ETF (FTSE All-World, MSCI World Small Cap): lungo termine, non li vendo per i cali.",
  "Azioni: medio termine. Compro grandi aziende scese molto ma con fondamentali solidi, vendo vicino al target price degli analisti a 12 mesi, poi passo a un'altra azienda simile.",
  "Esco se cambiano i fondamentali (trimestrale debole, utili sotto le attese, problemi gravi), non solo per un calo di prezzo.",
  "Tasse: 26% sulle plusvalenze, 1 € di commissione per operazione.",
];

// I numeri di tutto il portafoglio. "completo" è false se manca il prezzo di qualche titolo.
function riepilogoPortafoglio() {
  let investito = 0, valore = 0, variazioneOggi = 0, valoreIeri = 0, completo = true;
  for (const posizione of posizioni) {
    const t = totali(posizione);
    const p = prezzi[posizione.ticker];
    investito += t.investito;
    if (!p) { completo = false; continue; }
    valore += t.quote * p.prezzo;
    if (p.chiusuraIeri) {
      variazioneOggi += t.quote * (p.prezzo - p.chiusuraIeri);
      valoreIeri += t.quote * p.chiusuraIeri;
    }
  }
  return { investito, valore, gp: valore - investito, variazioneOggi, valoreIeri, completo };
}

// Lo stato della tesi di un titolo: { livello: "bene" | "attenzione" | "neutro", testo }
function statoTesi(ticker) {
  const t = tesi[ticker];
  if (!t) return { livello: "neutro", testo: "Nessuna tesi scritta: apri il titolo e scrivi perché sei entrato e quando usciresti." };
  const scattate = t.uscita.filter((u) => u.scattata);
  if (scattate.length) {
    return { livello: "attenzione", testo: `Condizione di uscita verificata: «${scattate.map((u) => u.testo).join("», «")}». Rileggi la tesi.` };
  }
  const a = avanzamentoTesi(ticker);
  if (a && (a.raggiunto || a.vicino)) return { livello: "bene", testo: testoAvanzamento(a) };
  // I campanelli gravi dell'avvocato potrebbero riguardare le tue condizioni di uscita: te li ricordiamo
  const gravi = campanelliDi(ticker).filter((c) => c.livello === "alto");
  if (gravi.length && t.uscita.length) {
    return { livello: "attenzione", testo: `L'avvocato del diavolo segnala: ${gravi.map((c) => c.titolo.toLowerCase()).join(", ")}. Controlla se tocca una tua condizione di uscita.` };
  }
  if (a) return { livello: "neutro", testo: testoAvanzamento(a) };
  return { livello: "neutro", testo: t.target ? "In attesa del prezzo." : "Tesi scritta, senza target." };
}

const SIMBOLI_STATO = { bene: "✓", attenzione: "⚠", neutro: "•" };

// Una riga della pagina Oggi: titolo a sinistra, numero a destra, dettagli sotto. Toccandola si apre il titolo.
function creaRigaOggi(ticker, destra, classeDestra, dettagli) {
  const riga = document.createElement("button");
  riga.type = "button";
  riga.className = "riga-oggi";
  riga.innerHTML = `<div class="testa-riga"><b></b><span class="numero"></span></div>`;
  riga.querySelector("b").textContent = infoTitolo(ticker).nome;
  const numero = riga.querySelector(".numero");
  numero.textContent = destra;
  if (classeDestra) numero.classList.add(classeDestra);
  for (const testo of dettagli.filter(Boolean)) {
    const p = document.createElement("span");
    p.className = "dettaglio-oggi";
    p.textContent = testo;
    riga.appendChild(p);
  }
  riga.onclick = () => vaiAlTitolo(ticker);
  return riga;
}

// ---------- Piccoli mattoni per costruire tabelle e mini-grafici ----------

// Crea un elemento con una classe e un testo (sempre testo semplice, per sicurezza)
function crea(tipo, classe = "", testo = "") {
  const elemento = document.createElement(tipo);
  if (classe) elemento.className = classe;
  if (testo) elemento.textContent = testo;
  return elemento;
}

// L'intestazione di una tabella: colonne = [["Titolo", ""], ["Prezzo", "destra"], ...]
function intestaTabella(tabella, colonne) {
  tabella.innerHTML = "";
  const riga = tabella.createTHead().insertRow();
  for (const [nome, classe] of colonne) {
    const cella = crea("th", classe, nome);
    cella.scope = "col";
    riga.appendChild(cella);
  }
  return tabella.createTBody();
}

// Il mini-grafico dell'ultimo mese di un titolo (dai prezzi di chiusura salvati)
function creaMiniGrafico(ticker) {
  const valori = Object.values(storico[ticker] || {}).slice(-22);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 72 24");
  svg.setAttribute("class", "mini-grafico");
  svg.setAttribute("aria-hidden", "true");
  if (valori.length < 2) return svg;
  const minimo = Math.min(...valori), massimo = Math.max(...valori);
  const d = valori.map((v, i) => `${i ? "L" : "M"}${((i / (valori.length - 1)) * 72).toFixed(1)},${(22 - ((v - minimo) / (massimo - minimo || 1)) * 20).toFixed(1)}`).join(" ");
  svg.innerHTML = `<path class="${valori[valori.length - 1] >= valori[0] ? "su" : "giu"}" d="${d}"/>`;
  return svg;
}

// ▲ +0,82%  oppure  ▼ −1,14%: la freccia dice la direzione anche senza il colore
function testoVariazione(numero) {
  return (numero > 0 ? "▲ " : numero < 0 ? "▼ " : "") + percentuale(numero);
}

// ---------- La striscia dei prezzi in alto ----------

function disegnaStriscia() {
  const striscia = $("striscia");
  striscia.innerHTML = "";
  const voce = (nome, valore, variazione, alClic) => {
    const elemento = crea(alClic ? "button" : "span", "voce-striscia");
    if (alClic) { elemento.type = "button"; elemento.onclick = alClic; }
    elemento.append(crea("span", "nome-striscia", nome), crea("span", "", valore));
    if (variazione !== null) elemento.append(crea("span", classeColore(variazione), testoVariazione(variazione)));
    striscia.appendChild(elemento);
  };
  // Prima i tuoi titoli (o tutti quelli dell'elenco, se non ne hai ancora), poi gli indici di mercato
  const sigle = posizioni.length ? posizioni.map((p) => p.ticker) : titoli.map((t) => t.ticker);
  for (const ticker of sigle) {
    const p = prezzi[ticker];
    if (p) voce(ticker.split(".")[0], numeroIt(p.prezzo, 2), p.chiusuraIeri ? p.prezzo / p.chiusuraIeri - 1 : null, () => vaiAlTitolo(ticker));
  }
  for (const m of mercati) voce(m.nome, numeroIt(m.valore, m.cifre), m.ieri ? m.valore / m.ieri - 1 : null);
  if (controllatiIl) striscia.appendChild(crea("span", "ora-striscia", "aggiornato " + momento(controllatiIl)));
}

// ---------- Il grafico a candele della pagina Oggi ----------

let tickerGraficoOggi = null;     // il titolo mostrato nel grafico della pagina Oggi

function disegnaGraficoOggi() {
  const sigle = posizioni.map((p) => p.ticker);
  $("oggi-grafico").hidden = sigle.length === 0;
  if (sigle.length === 0) return;
  // Di partenza: la prima azione che possiedi (le azioni sono quelle da seguire più da vicino)
  if (!sigle.includes(tickerGraficoOggi)) {
    tickerGraficoOggi = sigle.find((t) => infoTitolo(t).tipo !== "ETF") || sigle[0];
  }
  const scelta = $("oggi-scelta-titolo");
  scelta.innerHTML = "";
  for (const ticker of sigle) {
    const pulsante = crea("button", ticker === tickerGraficoOggi ? "attivo" : "", ticker.split(".")[0]);
    pulsante.type = "button";
    pulsante.title = infoTitolo(ticker).nome;
    pulsante.onclick = () => { tickerGraficoOggi = ticker; disegnaGraficoOggi(); };
    scelta.appendChild(pulsante);
  }
  const t = (analisi.titoli[tickerGraficoOggi] || {}).tecnica;
  const p = prezzi[tickerGraficoOggi];
  const riga = $("oggi-riga-grafico");
  riga.innerHTML = "";
  riga.append(crea("b", "", infoTitolo(tickerGraficoOggi).nome));
  if (p) riga.append(crea("span", "numero", euro(p.prezzo)));
  if (p && p.chiusuraIeri) riga.append(crea("span", "numero " + classeColore(p.prezzo / p.chiusuraIeri - 1), testoVariazione(p.prezzo / p.chiusuraIeri - 1)));
  if (t) riga.append(crea("span", "tenue", `RSI ${numeroIt(t.rsi ?? 0, 0)} · ${percUno(t.dalMassimo, true)} dal massimo dell'anno`));
  $("oggi-grafico-vuoto").hidden = Boolean(t);
  const ticker = tickerGraficoOggi;
  caricaSerie().then(() => {
    if (ticker === tickerGraficoOggi && vistaAperta === "oggi") disegnaGraficoPrezzo($("grafico-oggi"), ticker);
  });
}

// ---------- La pagina Oggi ----------

function disegnaOggi() {
  $("data-oggi").textContent = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const haTitoli = posizioni.length > 0;
  $("oggi-vuoto").hidden = haTitoli;
  for (const id of ["oggi-portafoglio", "oggi-titoli", "oggi-campanelli", "oggi-notizie", "oggi-composizione"]) $(id).hidden = !haTitoli;
  const r = riepilogoPortafoglio();

  // ---- 1. I quattro numeri chiave ----
  if (haTitoli) {
    const numero = (id, testo, valore = 0) => { $(id).textContent = testo; $(id).className = classeColore(valore); };
    numero("oggi-valore", r.completo ? euro(r.valore) : "–");
    $("oggi-investito").textContent = "investito " + euro(r.investito);
    numero("oggi-gp", r.completo ? euro(r.gp, true) : "–", r.completo ? r.gp : 0);
    numero("oggi-gp-perc", r.completo ? testoVariazione(r.gp / r.investito) + " dall'inizio" : "in attesa dei prezzi", r.completo ? r.gp : 0);
    const oggiNoto = r.completo && r.valoreIeri > 0;
    numero("oggi-variazione", oggiNoto ? euro(r.variazioneOggi, true) : "–", oggiNoto ? r.variazioneOggi : 0);
    numero("oggi-variazione-perc", oggiNoto ? testoVariazione(r.variazioneOggi / r.valoreIeri) : "in attesa dei prezzi", oggiNoto ? r.variazioneOggi : 0);
    // Se vendessi tutto: la somma del netto di ogni posizione (ognuna paga tasse e commissione per conto suo)
    const netto = posizioni.reduce((somma, p) => somma + (prezzi[p.ticker] ? calcolaVendita(p, prezzi[p.ticker].prezzo).netto : 0), 0);
    numero("oggi-netto", r.completo ? euro(netto) : "–");
    $("oggi-fonte").textContent = Object.keys(prezzi).length ? testoFonte(posizioni.map((p) => p.ticker)) : "";
  }

  // ---- 2. Il grafico ----
  disegnaGraficoOggi();

  // ---- 3. Le occasioni: una tabella con le 5 che spiccano ----
  const migliori = occasioni(3).slice(0, QUANTE_SPICCANO);
  const corpoOccasioni = intestaTabella($("tabella-occasioni"), [["#", ""], ["Azienda", ""], ["Calo", "destra"], ["Segnali", "destra"], ["Direzione", "destra"]]);
  migliori.forEach((ticker, i) => {
    const s = analisi.titoli[ticker];
    const riga = corpoOccasioni.insertRow();
    riga.className = "si-tocca";
    riga.onclick = () => vaiAlTitolo(ticker);
    riga.append(crea("td", "tenue", String(i + 1)), crea("td", "nome-cella", s.nome),
      crea("td", "destra numero", s.tecnica ? percUno(s.tecnica.dalMassimo, true) : "–"),
      crea("td", "destra numero" + (s.cacciatore.rispettati === 4 ? " in-evidenza" : ""), `${s.cacciatore.rispettati}/4`));
    // La direzione recente del prezzo: una freccia e una parola, non solo un colore
    const sale = s.tecnica && s.tecnica.sopraMm50;
    riga.append(crea("td", "destra " + (s.tecnica ? (sale ? "positivo" : "negativo") : ""), s.tecnica ? (sale ? "↗ risale" : "↘ scende") : "–"));
  });
  $("tabella-occasioni").hidden = migliori.length === 0;
  $("oggi-occasioni-vuoto").hidden = migliori.length > 0;
  $("oggi-occasioni-vuoto").textContent = fonteFondamentaliChiusa()
    ? "Le occasioni non sono disponibili: mancano i fondamentali (vedi la nota in fondo alla pagina)."
    : analisi.classifica
    ? "Oggi nessuna azienda della watchlist ha almeno 3 segnali su 4."
    : "Le occasioni arriveranno con il prossimo giro degli agenti.";

  // ---- 4. La tabella delle posizioni ----
  const corpo = intestaTabella($("tabella-posizioni"), [["Titolo", ""], ["Prezzo", "destra"], ["Oggi", "destra"], ["Valore", "destra"],
    ["Guad.", "destra"], ["RSI", "destra"], ["1 mese", ""], ["Target", ""], ["Rischi", "destra"]]);
  for (const posizione of posizioni) {
    const ticker = posizione.ticker;
    const info = infoTitolo(ticker);
    const c = calcola(posizione);
    const t = (analisi.titoli[ticker] || {}).tecnica;
    const riga = corpo.insertRow();
    riga.className = "si-tocca";
    riga.onclick = () => vaiAlTitolo(ticker);
    const nome = crea("td", "nome-cella");
    nome.append(crea("b", "", info.nome), crea("span", "tenue", " " + info.tipo));
    riga.append(nome,
      crea("td", "destra numero", c ? numeroIt(c.prezzo, 2) : "–"),
      crea("td", "destra numero " + (c && c.oggi !== null ? classeColore(c.oggi) : ""), c && c.oggi !== null ? percentuale(c.oggi) : "–"),
      crea("td", "destra numero", c ? numeroIt(c.valore, 2) : "–"),
      crea("td", "destra numero " + (c ? classeColore(c.gp) : ""), c ? percentuale(c.gpPerc) : "–"),
      crea("td", "destra numero", t && t.rsi !== null ? numeroIt(t.rsi, 0) : "–"));
    const mini = crea("td");
    mini.appendChild(creaMiniGrafico(ticker));
    // L'avanzamento verso il TUO target (quello della scheda tesi)
    const cellaTarget = crea("td", "cella-target");
    const a = avanzamentoTesi(ticker);
    if (a) {
      const quota = a.strada === null ? (a.raggiunto ? 1 : 0) : Math.max(0, Math.min(1, a.strada));
      const barra = crea("span", "barra-mini");
      barra.innerHTML = `<span style="width:${(quota * 100).toFixed(0)}%"></span>`;
      cellaTarget.append(barra, crea("span", "tenue", `${Math.round(quota * 100)}% · ${euroTondo.format(a.target)}`));
    } else {
      cellaTarget.appendChild(crea("span", "tenue", info.tipo === "ETF" ? "lungo termine" : "nessun target"));
    }
    const quanti = campanelliDi(ticker).length;
    riga.append(mini, cellaTarget, crea("td", "destra numero" + (campanelliDi(ticker).some((x) => x.livello === "alto") ? " negativo" : ""), quanti ? String(quanti) : "–"));
  }

  // ---- 5. I campanelli d'allarme dei tuoi titoli: prima i più gravi ----
  const tutti = posizioni.flatMap((p) => campanelliDi(p.ticker).map((c) => ({ ...c, ticker: p.ticker })))
    .sort((a, b) => (a.livello !== "alto") - (b.livello !== "alto"));
  const elencoCampanelli = $("elenco-oggi-campanelli");
  elencoCampanelli.innerHTML = "";
  for (const c of tutti.slice(0, 7)) {
    const voce = crea("li");
    const apri = crea("button", "si-tocca");
    apri.type = "button";
    apri.onclick = () => vaiAlTitolo(c.ticker);
    apri.append(crea("span", "livello-breve " + c.livello, c.livello === "alto" ? "ALTO" : "MEDIO"), crea("b", "", infoTitolo(c.ticker).nome), crea("span", "", " · " + c.titolo.toLowerCase()));
    voce.appendChild(apri);
    elencoCampanelli.appendChild(voce);
  }
  if (tutti.length > 7) elencoCampanelli.appendChild(crea("li", "tenue", `e altri ${tutti.length - 7}: apri i titoli per vederli`));
  $("oggi-campanelli-vuoto").hidden = tutti.length > 0;

  // ---- 6. Cosa è successo ai miei titoli: notizia principale e fatti del giorno ----
  const elencoTitoli = $("elenco-oggi-titoli");
  elencoTitoli.innerHTML = "";
  for (const posizione of posizioni) {
    const ticker = posizione.ticker;
    const c = calcola(posizione);
    const notizia = (notizie[ticker] || []).find((n) => typeof n.link === "string" && n.link.startsWith("https://"));
    elencoTitoli.appendChild(creaRigaOggi(
      ticker,
      c && c.oggi !== null ? "oggi " + percentuale(c.oggi) : "–",
      c && c.oggi !== null ? classeColore(c.oggi) : "",
      [
        notizia ? `${notizia.titolo} (${[notizia.fonte, tempoFa(notizia.data)].filter(Boolean).join(", ")})` : "Nessuna notizia recente.",
        rischioPrincipale(ticker) ? "Rischio principale: " + rischioPrincipale(ticker) : null,
      ]));
  }

  // ---- 7. Composizione (grafico ad anello) e prossime trimestrali ----
  disegnaComposizione(r);
  const elencoTrimestrali = $("elenco-trimestrali");
  elencoTrimestrali.innerHTML = "";
  const date = posizioni
    .map((p) => ({ ticker: p.ticker, f: (analisi.titoli[p.ticker] || {}).fondamentali }))
    .filter((x) => x.f && x.f.prossimaTrimestrale && giorniA(x.f.prossimaTrimestrale) >= 0)
    .sort((a, b) => a.f.prossimaTrimestrale.localeCompare(b.f.prossimaTrimestrale));
  for (const { ticker, f } of date) {
    const giorni = giorniA(f.prossimaTrimestrale);
    const riga = crea("div");
    riga.append(crea("span", "", infoTitolo(ticker).nome),
      crea("span", "numero " + (giorni <= 14 ? "attenzione" : "tenue"), `${dataBreve(f.prossimaTrimestrale).replace(/ \d{4}$/, "")} · ${giorni} g`));
    elencoTrimestrali.appendChild(riga);
  }
  if (date.length === 0) elencoTrimestrali.appendChild(crea("div", "tenue", "Nessuna data disponibile."));

  // ---- 8. Le mie tesi (solo azioni: gli ETF sono di lungo termine) ----
  const azioni = posizioni.filter((p) => infoTitolo(p.ticker).tipo !== "ETF");
  $("oggi-tesi").hidden = azioni.length === 0;
  const elencoTesi = $("elenco-oggi-tesi");
  elencoTesi.innerHTML = "";
  for (const posizione of azioni) {
    const stato = statoTesi(posizione.ticker);
    const a = avanzamentoTesi(posizione.ticker);
    elencoTesi.appendChild(creaRigaOggi(posizione.ticker, a ? `target ${euro(a.target)}` : "", "",
      [`${SIMBOLI_STATO[stato.livello]} ${stato.testo}`]));
  }

  $("oggi-aggiornamento").textContent = analisi.aggiornato
    ? `Gli agenti hanno lavorato l'ultima volta ${momento(analisi.aggiornato)} (due volte al giorno: verso le 13 e la sera).` +
      (fonteFondamentaliChiusa() ? ` ⚠ ${fonteFondamentaliChiusa()}: fondamentali, classifica e campanelli sui conti non sono aggiornati.` : "")
    : "Gli agenti non hanno ancora lavorato: lavorano due volte al giorno, verso le 13 e la sera.";
}

// Il grafico ad anello: una fetta per ogni titolo, grande quanto il suo peso nel portafoglio
function disegnaComposizione(r) {
  const anello = $("anello");
  const legenda = $("legenda-anello");
  anello.innerHTML = "";
  legenda.innerHTML = "";
  if (!r.completo || r.valore <= 0) return;
  const fette = posizioni.map((p) => ({ ticker: p.ticker, valore: calcola(p).valore }))
    .sort((a, b) => b.valore - a.valore);
  const giro = 2 * Math.PI * 44;
  let partenza = 0, disegno = "";
  fette.forEach((f, i) => {
    const quota = f.valore / r.valore;
    // Tra una fetta e l'altra resta un piccolo spazio, così si distinguono anche senza il colore
    disegno += `<circle class="fetta fetta-${(i % 6) + 1}" cx="60" cy="60" r="44" stroke-dasharray="${Math.max(quota * giro - 3, 1).toFixed(1)} ${giro.toFixed(1)}" stroke-dashoffset="${(-partenza * giro).toFixed(1)}" transform="rotate(-90 60 60)"/>`;
    partenza += quota;
    const voce = crea("div");
    voce.append(crea("i", `fetta-${(i % 6) + 1}`), crea("span", "", infoTitolo(f.ticker).nome), crea("span", "numero", percUno(quota).replace(",0%", "%")));
    legenda.appendChild(voce);
  });
  const inEtf = fette.filter((f) => infoTitolo(f.ticker).tipo === "ETF").reduce((somma, f) => somma + f.valore, 0) / r.valore;
  anello.innerHTML = disegno + `<text class="centro-anello" x="60" y="58" text-anchor="middle">${Math.round(inEtf * 100)}%</text>
    <text class="sotto-anello" x="60" y="73" text-anchor="middle">in ETF</text>`;
  anello.setAttribute("aria-label", "Composizione del portafoglio: " + fette.map((f) => `${infoTitolo(f.ticker).nome} ${Math.round((f.valore / r.valore) * 100)}%`).join(", "));
}

// ---------- "Copia per l'analisi" ----------
// Mette in un testo semplice tutti i dati utili, pronti da incollare in una chat con Claude.
// ATTENZIONE: questo testo contiene i TUOI dati (importi, tesi). Esce dal dispositivo solo se lo incolli tu.

// Trasforma i gruppi di numeri di una scheda in righe di testo: "  P/E: 20,0 (prezzo ÷ utili...)"
function righeDaDati(dati) {
  return dati.filter(Boolean).map(([etichetta, valore, , nota]) => `  ${etichetta}: ${valore}${nota ? ` (${nota})` : ""}`);
}

// Le analisi degli agenti su un titolo, come righe di testo (uguali per i tuoi titoli e per le occasioni)
function righeAgenti(ticker, quanteNotizie) {
  const scheda = analisi.titoli[ticker] || {};
  const righe = [];
  const f = scheda.fondamentali;
  if (f) {
    righe.push(`Fondamentali (${f.settore || "settore non disponibile"}; fonte ${f.fonte || "?"}; dati del ${f.aggiornato || "?"}):`);
    for (const [, dati] of gruppiFondamentali(f)) righe.push(...righeDaDati(dati));
    if (testoTrimestrale(f)) righe.push(`  Prossima trimestrale: ${testoTrimestrale(f)}`);
    if (testoSorprese(f)) righe.push(`  Ultime trimestrali: ${testoSorprese(f)}`);
    if (f.revisioneStime !== null && f.revisioneStime !== undefined) righe.push(`  Stime sugli utili dell'anno, ultimi 90 giorni: ${percUno(f.revisioneStime, true)}`);
  }
  const t = scheda.tecnica;
  if (t) {
    righe.push(`Analisi tecnica (chiusura del ${t.data}): ${t.frase}`);
    righe.push(...righeDaDati(datiTecnici(t)));
  }
  const c = scheda.cacciatore;
  if (c) righe.push(`Criteri del cacciatore (${c.rispettati} su 4): ` + c.criteri.map((x) => `${simboloCriterio(x)[2]} – ${x.testo}`).join("; "));
  const campanelli = campanelliDi(ticker);
  righe.push(campanelli.length ? "Campanelli d'allarme:" : "Campanelli d'allarme: nessuno dalle regole automatiche.");
  for (const x of campanelli) righe.push(`  [${x.livello}] ${x.titolo}: ${x.testo}`);
  const elenco = (notizie[ticker] || []).slice(0, quanteNotizie);
  if (elenco.length) {
    righe.push("Notizie recenti (solo i titoli):");
    for (const n of elenco) righe.push(`  ${n.data.slice(0, 10)} – ${n.titolo}${n.fonte ? ` (${n.fonte})` : ""}`);
  }
  return righe;
}

function testoPerAnalisi() {
  const righe = [];
  const titolo = (testo) => righe.push("", "=== " + testo.toUpperCase() + " ===");
  const r = riepilogoPortafoglio();

  righe.push(`DATI DEL MIO PORTAFOGLIO – ${new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}`);
  righe.push("Ti chiedo un'analisi critica di questi dati. Non voglio un ordine \"compra\" o \"vendi\": voglio pro, contro, rischi che non vedo e domande da farmi. La decisione finale resta mia.");

  titolo("La mia strategia");
  for (const riga of STRATEGIA) righe.push("- " + riga);

  titolo("Portafoglio");
  if (posizioni.length === 0) righe.push("Nessun titolo inserito.");
  else if (r.completo) {
    righe.push(`Valore ${euro(r.valore)} · investito ${euro(r.investito)} · guadagno/perdita ${euro(r.gp, true)} (${percentuale(r.gp / r.investito)})`);
    if (r.valoreIeri > 0) righe.push(`Oggi: ${euro(r.variazioneOggi, true)} (${percentuale(r.variazioneOggi / r.valoreIeri)})`);
  } else righe.push(`Investito ${euro(r.investito)} (manca il prezzo di qualche titolo)`);

  for (const posizione of posizioni) {
    const ticker = posizione.ticker;
    const info = infoTitolo(ticker);
    const t = totali(posizione);
    const c = calcola(posizione);
    titolo(`${info.nome} (${ticker}, ${info.tipo})`);
    righe.push(`Posizione: ${quote(t.quote)} quote · prezzo medio ${euro(t.prezzoMedio)} · investito ${euro(t.investito)}` +
      (c ? ` · prezzo ${euro(c.prezzo)} · valore ${euro(c.valore)} · guadagno/perdita ${euro(c.gp, true)} (${percentuale(c.gpPerc)})` +
        (r.completo && r.valore > 0 ? ` · peso ${percUno(c.valore / r.valore)} del portafoglio` : "") : ""));
    righe.push("Acquisti: " + posizione.acquisti.map((a) => `${a.data || "senza data"} ${quote(a.quote)} quote a ${euro(a.investito / a.quote)}`).join("; "));
    if (c) {
      const v = calcolaVendita(posizione, c.prezzo);
      righe.push(`Se vendo oggi: netto in tasca ${euro(v.netto)}, tasse ${euro(v.tasse)}, guadagno netto ${euro(v.guadagnoNetto, true)} (${percentuale(v.guadagnoNetto / v.investito)})`);
    }
    const mia = tesi[ticker];
    if (mia) {
      righe.push(`La mia tesi (scritta il ${mia.aggiornata || "?"}):`);
      if (mia.motivo) righe.push(`  Perché sono entrato: ${mia.motivo.replace(/\s*\n\s*/g, " ")}`);
      if (mia.target) righe.push(`  Il mio target: ${euro(mia.target)}`);
      const a = avanzamentoTesi(ticker);
      if (a) righe.push(`  Avanzamento: ${testoAvanzamento(a)}`);
      for (const u of mia.uscita) righe.push(`  Esco se: ${u.testo} → ${u.scattata ? "VERIFICATA (segnata da me)" : "non verificata"}`);
    } else if (info.tipo !== "ETF") {
      righe.push("La mia tesi: non l'ho ancora scritta.");
    }
    righe.push(...righeAgenti(ticker, 5));
  }

  titolo("Occasioni del cacciatore");
  const migliori = occasioni(3).slice(0, OCCASIONI_NEL_TESTO);
  if (analisi.criteri) {
    righe.push(`Watchlist di grandi aziende (Europa, USA, grandi nomi asiatici). I 4 segnali: almeno −${Math.round(analisi.criteri.caloMinimo * 100)}% dal massimo a 52 settimane, utili in crescita, conti solidi, maggioranza degli analisti positiva.`);
  }
  if (migliori.length === 0) righe.push("Nessun titolo ha oggi almeno 3 segnali su 4.");
  migliori.forEach((ticker, i) => {
    const s = analisi.titoli[ticker];
    righe.push("", `--- ${i + 1}. ${s.nome} (${ticker}, ${s.area}) – ${s.cacciatore.rispettati} segnali su 4, ${s.cacciatore.punteggio} punti su 100 ---`);
    righe.push(`Perché compare: ${s.cacciatore.motivo}`);
    righe.push(...righeAgenti(ticker, 3));
  });
  const altre = occasioni(1, 2).slice(0, 12).map((t) => `${analisi.titoli[t].nome} (${segnali(t)})`);
  if (altre.length) righe.push("", `Con 1 o 2 segnali: ${altre.join(", ")}.`);

  titolo("Note sui dati");
  righe.push(`Prezzi e analisi tecnica: Yahoo Finance. Conti delle aziende e giudizi degli analisti: Finnhub (quotazione americana). Calcolati ${analisi.aggiornato ? "il " + momento(analisi.aggiornato) : "non ancora"}.`);
  righe.push("Il target price medio degli analisti NON è in questi dati (la fonte gratuita non lo dà): se serve, cercalo tu e dimmi da dove viene.");
  if (fonteFondamentaliChiusa()) righe.push(`ATTENZIONE: ${fonteFondamentaliChiusa()}. Fondamentali, classifica e campanelli sui conti mancano o sono vecchi.`);
  righe.push("I dati possono essere incompleti o in ritardo. Campanelli e criteri sono regole meccaniche. Se un dato ti sembra strano, dimmelo.");
  return righe.join("\n");
}

async function copiaPerAnalisi() {
  const testo = testoPerAnalisi();
  const esito = $("esito-copia");
  try {
    await navigator.clipboard.writeText(testo);
    esito.textContent = `✓ Copiato (${testo.length.toLocaleString("it-IT")} caratteri). Incollalo in una chat con Claude.`;
    $("testo-analisi").hidden = true;
  } catch (errore) {
    // Se il browser non permette di copiare da solo, mostriamo il testo: lo selezioni e lo copi tu
    esito.textContent = "Non riesco a copiare da solo: tieni premuto sul testo qui sotto, scegli \"Seleziona tutto\" e poi \"Copia\".";
    $("testo-analisi").value = testo;
    $("testo-analisi").hidden = false;
    $("testo-analisi").select();
  }
  esito.hidden = false;
}

// Collega i pulsanti della pagina Oggi (lo chiama app.js all'avvio)
function collegaOggi() {
  collegaGraficoPrezzo($("grafico-oggi"));
  $("copia-analisi").onclick = copiaPerAnalisi;
}
