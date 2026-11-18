// agenti/grafico.js = il GRAFICO DEL PREZZO di un titolo (pagina del titolo e pagina Oggi).
//
// Lo disegna Lightweight Charts di TradingView: una libreria gratuita e open source
// (licenza Apache 2.0), salvata nella cartella librerie/ insieme alla sua licenza.
// Con questa libreria il grafico si può:
//   - ingrandire e rimpicciolire con due dita (o con la rotellina del mouse)
//   - trascinare avanti e indietro nel tempo con un dito
//   - toccare: sopra il grafico compaiono i numeri del giorno toccato
//   - vedere i tuoi acquisti: un pallino blu sotto la candela del giorno in cui hai comprato
//   - confrontare due titoli in percentuale (menu "Confronta con…")
//
// I dati arrivano dagli agenti (scripts/agenti/tecnico.py): qui li disegniamo soltanto.
// Il grafico del rendimento del portafoglio NON passa di qui: resta quello di app.js, a linea.

// Le parti di Lightweight Charts che usiamo (la libreria crea l'oggetto "LightweightCharts")
const LWC = window.LightweightCharts;

let modoGrafico = "candele";   // "candele" oppure "linea": vale per tutti i grafici del prezzo
let periodoPrezzo = "3m";      // il periodo mostrato all'apertura (poi puoi zoomare come vuoi)

// Le medie mobili accese (si accendono e spengono con un tocco; la scelta resta salvata)
let medieAccese = { mm50: true, mm200: true };

// I pulsanti dei periodi: [chiave, scritta, mesi]
const PERIODI_PREZZO = [["1m", "1M", 1], ["3m", "3M", 3], ["6m", "6M", 6], ["1a", "1A", 12], ["2a", "2A", 24], ["5a", "5A", 60]];

// Ogni grafico disegnato, per id del contenitore: così non lo ricreiamo a ogni ridisegno
// (ricrearlo farebbe perdere lo zoom che hai scelto con le dita)
const graficiPrezzo = {};

// ---------- I colori: li prendiamo dal tema (chiaro o scuro) definito in style.css ----------

function coloriGrafico() {
  const stile = getComputedStyle(document.documentElement);
  const v = (nome) => stile.getPropertyValue(nome).trim();
  return {
    sfondo: v("--carta"), testo: v("--testo-tenue"), griglia: v("--bordo"), bordo: v("--bordo"),
    verde: v("--verde"), rosso: v("--rosso"), linea: v("--linea-valore"),
    mm50: v("--linea-mm50"), mm200: v("--linea-mm200"), accento: v("--accento"), confronto: v("--ambra"),
  };
}

// Un colore con trasparenza: "#3fb68b" + 0.35 → "rgba(63, 182, 139, 0.35)"
function trasparente(colore, opacita) {
  const esa = colore.replace("#", "");
  if (esa.length !== 6) return colore;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(esa.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${opacita})`;
}

// Le opzioni del grafico che dipendono dal tema
function opzioniTema(c) {
  return {
    layout: { background: { type: "solid", color: c.sfondo }, textColor: c.testo,
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--carattere-numeri").trim() || "monospace",
      fontSize: 11 },
    grid: { vertLines: { color: trasparente(c.griglia, 0.5) }, horzLines: { color: trasparente(c.griglia, 0.5) } },
    rightPriceScale: { borderColor: c.bordo },
    timeScale: { borderColor: c.bordo },
  };
}

// ---------- I dati del grafico ----------
// Restituisce, per un titolo, le liste giorno per giorno:
//   giorni, chiusura (sempre), apertura/massimo/minimo/volume (null se mancano),
//   mm50 e mm200 (le medie mobili), valuta
// Da dove arrivano:
//   1. data/grafici/<sigla>.json: le candele giornaliere degli ultimi 5 anni (le prepara
//      l'analista tecnico). Si scarica solo quando apri quel titolo.
//   2. se quel file non c'è ancora: data/serie.json (un anno a linea, candele solo degli ultimi mesi)

const storie = {};        // i file dei grafici già scaricati, per titolo (null = non disponibile)
const cacheDati = {};     // i dati già preparati, per titolo: rifarli a ogni tocco sarebbe lento

// "SAP.DE" → "data/grafici/SAP.DE.json" (stessa regola di scripts/aggiorna_analisi.py)
function indirizzoGrafico(ticker) {
  return "data/grafici/" + encodeURIComponent(ticker.replace(/[^A-Za-z0-9.\-]/g, "_")) + ".json";
}

// Scarica il file del grafico di un titolo (una volta sola)
function caricaGrafico(ticker) {
  if (!(ticker in storie)) {
    storie[ticker] = fetch(indirizzoGrafico(ticker), { cache: "no-cache" })
      .then((risposta) => (risposta.ok ? risposta.json() : null))
      .catch(() => null)
      .then((dati) => (storie[ticker] = dati && Array.isArray(dati.giorni) && dati.giorni.length ? dati : null));
  }
  return Promise.resolve(storie[ticker]);
}

// La media degli ultimi N valori, giorno per giorno (null finché non ci sono N giorni)
function mediaMobile(valori, giorni) {
  const risultato = [];
  let somma = 0;
  for (let i = 0; i < valori.length; i++) {
    somma += valori[i];
    if (i >= giorni) somma -= valori[i - giorni];
    risultato.push(i >= giorni - 1 ? Math.round((somma / giorni) * 10000) / 10000 : null);
  }
  return risultato;
}

function datiPrezzo(ticker) {
  const storia = storie[ticker];
  if (storia && !(storia instanceof Promise)) {
    if (cacheDati[ticker] && cacheDati[ticker].fonte === storia) return cacheDati[ticker];
    const dati = { fonte: storia, giorni: storia.giorni, chiusura: storia.chiusura, apertura: storia.apertura,
      massimo: storia.massimo, minimo: storia.minimo, volume: storia.volume, valuta: storia.valuta || "",
      mm50: mediaMobile(storia.chiusura, 50), mm200: mediaMobile(storia.chiusura, 200), completa: true };
    return (cacheDati[ticker] = dati);
  }
  // Riserva: data/serie.json
  const serie = serieTecniche && serieTecniche[ticker];
  const t = (analisi.titoli[ticker] || {}).tecnica;
  if (!serie || !serie.giorni || !serie.giorni.length) return null;
  if (cacheDati[ticker] && cacheDati[ticker].fonte === serie) return cacheDati[ticker];
  const n = serie.giorni.length;
  const vuota = () => new Array(n).fill(null);
  const dati = { fonte: serie, giorni: serie.giorni, chiusura: serie.prezzo.slice(), apertura: vuota(), massimo: vuota(), minimo: vuota(),
    volume: vuota(), mm50: serie.mm50 || vuota(), mm200: serie.mm200 || vuota(), valuta: (t && t.valuta) || "" };
  const c = serie.candele;
  if (c) {
    for (let k = 0; k < c.chiusura.length; k++) {
      const i = c.da + k;
      dati.apertura[i] = c.apertura[k];
      dati.massimo[i] = c.massimo[k];
      dati.minimo[i] = c.minimo[k];
      dati.chiusura[i] = c.chiusura[k] ?? dati.chiusura[i];
      dati.volume[i] = c.volume[k];
    }
  }
  return (cacheDati[ticker] = dati);
}

// Quante cifre dopo la virgola: 2 per i prezzi normali, 0 sopra 1000, 3 sotto 10 euro
function cifrePrezzo(valore) {
  if (valore >= 1000) return 0;
  if (valore < 10) return 3;
  return 2;
}

// "2026-11-14" (o l'oggetto giorno della libreria) → "ven 14 nov 2026"
function testoGiorno(tempo) {
  const chiave = typeof tempo === "string" ? tempo
    : `${tempo.year}-${String(tempo.month).padStart(2, "0")}-${String(tempo.day).padStart(2, "0")}`;
  return etichettaLunga(chiave);
}

// ---------- Creare un grafico ----------

function creaGraficoPrezzo(contenitore) {
  const c = coloriGrafico();
  const grafico = LWC.createChart(contenitore, {
    autoSize: true,                     // si adatta da solo alla larghezza (anche se giri l'iPad)
    ...opzioniTema(c),
    localization: {
      locale: "it-IT",
      priceFormatter: (v) => numeroIt(v, cifrePrezzo(Math.abs(v))),
      timeFormatter: testoGiorno,
    },
    rightPriceScale: { borderColor: c.bordo, scaleMargins: { top: 0.08, bottom: 0.22 } },
    timeScale: { borderColor: c.bordo, rightOffset: 2, minBarSpacing: 0.1 },   // 0.1 = 5 anni entrano anche sul telefono
    crosshair: { mode: LWC.CrosshairMode.Normal },
    // Sul telefono lo scorrimento in verticale deve muovere la PAGINA, non il grafico:
    // il grafico si trascina in orizzontale e si ingrandisce con due dita
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: true },
  });
  const stato = { grafico, contenitore, ticker: null, modo: null, serie: [], livelli: [], confronto: null };
  // Quando muovi il dito (o il mouse) sul grafico, la riga in alto mostra i numeri di quel giorno
  grafico.subscribeCrosshairMove((parametri) => scriviRigaGrafico(stato, parametri.time));
  return stato;
}

// Toglie tutte le serie (prezzo, medie, volumi) per ridisegnarle
function svuotaGrafico(stato) {
  for (const s of stato.serie) stato.grafico.removeSeries(s);
  if (stato.serieConfronto) stato.grafico.removeSeries(stato.serieConfronto);
  stato.serieConfronto = null;
  stato.serie = [];
  stato.livelli = [];
  stato.principale = stato.mm50 = stato.mm200 = stato.volumi = null;
}

// Disegna (o aggiorna) il grafico del prezzo di un titolo dentro un contenitore <div>.
// Prima scarica (se serve) il file del grafico del titolo, poi disegna.
function disegnaGraficoPrezzo(contenitore, ticker) {
  contenitore.dataset.ticker = ticker;
  Promise.all([caricaSerie(), caricaGrafico(ticker)]).then(() => {
    if (contenitore.dataset.ticker === ticker) disegnaOra(contenitore, ticker);   // nel frattempo hai cambiato titolo?
  });
}

function disegnaOra(contenitore, ticker) {
  const area = contenitore.closest(".area-grafico");
  const t = (analisi.titoli[ticker] || {}).tecnica;
  const dati = t ? datiPrezzo(ticker) : null;
  area.hidden = !dati;
  if (!dati || !LWC) return;

  let stato = graficiPrezzo[contenitore.id];
  if (!stato) stato = graficiPrezzo[contenitore.id] = creaGraficoPrezzo(contenitore);
  // Stesso titolo, stesso modo, stessi dati: il grafico è già giusto (così non perdi lo zoom).
  // Aggiorniamo solo i pallini, nel caso tu abbia aggiunto o cambiato un acquisto.
  if (stato.ticker === ticker && stato.modo === modoGrafico && stato.dati === dati) {
    mettiPallini(stato);
    return;
  }

  const nuovoTitolo = stato.ticker !== ticker;
  if (nuovoTitolo || stato.confronto === ticker) stato.confronto = null;   // cambi titolo: il confronto riparte da zero
  // Il periodo che stai guardando: lo teniamo uguale anche passando da candele a linea
  const intervallo = nuovoTitolo ? null : stato.grafico.timeScale().getVisibleRange();
  svuotaGrafico(stato);
  stato.ticker = ticker;
  stato.modo = modoGrafico;
  stato.dati = dati;
  riempiGrafico(stato, t);
  stato.pallini = null;
  stato.firmaPallini = null;
  mettiPallini(stato);
  applicaConfronto(stato);
  riempiMenuConfronto(stato);

  if (intervallo) stato.grafico.timeScale().setVisibleRange(intervallo);
  else mostraPeriodo(stato, periodoPrezzo);
  scriviRigaGrafico(stato, null);
  aggiornaPulsantiGrafico();
}

// Mostra gli ultimi mesi del periodo scelto (es. "3m" = ultimi 3 mesi)
function mostraPeriodo(stato, chiave) {
  const mesi = (PERIODI_PREZZO.find(([k]) => k === chiave) || PERIODI_PREZZO[1])[2];
  const giorni = stato.dati.giorni;
  const fine = leggiData(giorni[giorni.length - 1]);
  const inizio = new Date(fine.getFullYear(), fine.getMonth() - mesi, fine.getDate());
  const da = giorni.findIndex((g) => leggiData(g) >= inizio);
  // Spazio a destra: un paio di giorni vuoti dopo l'ultimo prezzo
  stato.grafico.timeScale().setVisibleLogicalRange({ from: Math.max(0, da) - 0.5, to: giorni.length - 0.5 + 2 });
}

// Accende il pulsante giusto (modo, periodo, medie) in tutti i grafici
function aggiornaPulsantiGrafico() {
  document.querySelectorAll(".medie-prezzo button").forEach((b) => {
    b.classList.toggle("attivo", medieAccese[b.dataset.media]);
    b.setAttribute("aria-pressed", medieAccese[b.dataset.media] ? "true" : "false");
  });
  document.querySelectorAll(".modo-grafico button").forEach((b) => b.classList.toggle("attivo", b.dataset.modo === modoGrafico));
  document.querySelectorAll(".periodi-prezzo button").forEach((b) => b.classList.toggle("attivo", b.dataset.periodo === periodoPrezzo));
}

// Mette nel grafico le serie: prezzo (candele o linea), medie mobili, volumi, supporti e resistenze
function riempiGrafico(stato, t) {
  const { grafico, dati } = stato;
  const c = coloriGrafico();
  const formato = { type: "price", precision: cifrePrezzo(t.prezzo), minMove: 1 / 10 ** cifrePrezzo(t.prezzo) };
  const conCandele = modoGrafico === "candele" && dati.apertura.some((v) => v !== null);

  // 1. Il prezzo
  if (conCandele) {
    stato.principale = grafico.addSeries(LWC.CandlestickSeries, {
      upColor: c.verde, downColor: c.rosso, borderVisible: false, wickUpColor: c.verde, wickDownColor: c.rosso,
      priceFormat: formato,
    });
    // Con il file completo, ogni giorno ha la sua candela; se Yahoo ha dato solo la chiusura
    // la candela è "piatta" (apertura = massimo = minimo = chiusura)
    stato.principale.setData(dati.giorni.map((g, i) => {
      const chiude = dati.chiusura[i];
      if (dati.apertura[i] === null && !dati.completa) return { time: g };      // riserva: solo gli ultimi mesi
      if (dati.apertura[i] === null) return { time: g, open: chiude, high: chiude, low: chiude, close: chiude };
      return { time: g, open: dati.apertura[i], high: dati.massimo[i], low: dati.minimo[i], close: chiude };
    }));
  } else {
    stato.principale = grafico.addSeries(LWC.LineSeries, { color: c.linea, lineWidth: 2, priceFormat: formato });
    stato.principale.setData(punti(dati.giorni, dati.chiusura));
  }
  stato.serie.push(stato.principale);

  // 2. Le medie mobili a 50 e 200 giorni
  const media = (valori, colore, accesa) => {
    const s = grafico.addSeries(LWC.LineSeries, { color: colore, lineWidth: 1.5, priceLineVisible: false,
      lastValueVisible: false, crosshairMarkerVisible: false, priceFormat: formato, visible: accesa && !stato.confronto });
    s.setData(punti(dati.giorni, valori));
    stato.serie.push(s);
    return s;
  };
  stato.mm50 = media(dati.mm50, c.mm50, medieAccese.mm50);
  stato.mm200 = media(dati.mm200, c.mm200, medieAccese.mm200);

  // 3. I volumi: barre in basso, sulla loro scala (non si vede, serve solo a tenerle piccole)
  if (dati.volume.some((v) => v)) {
    stato.volumi = grafico.addSeries(LWC.HistogramSeries, { priceScaleId: "volumi", priceFormat: { type: "volume" },
      priceLineVisible: false, lastValueVisible: false });
    grafico.priceScale("volumi").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    stato.volumi.setData(dati.giorni.map((g, i) => (!dati.volume[i] ? { time: g } : {
      time: g, value: dati.volume[i],
      color: trasparente(dati.chiusura[i] >= (dati.apertura[i] ?? dati.chiusura[i]) ? c.verde : c.rosso, 0.35),
    })));
    stato.serie.push(stato.volumi);
  }

  // 4. Supporti e resistenze: righe tratteggiate che restano al loro prezzo
  const livello = (prezzo, nome) => stato.livelli.push(stato.principale.createPriceLine({ price: prezzo, color: c.testo,
    lineWidth: 1, lineStyle: LWC.LineStyle.Dashed, axisLabelVisible: false, title: nome }));
  for (const l of t.supporti || []) livello(l.prezzo, "Supporto");
  for (const l of t.resistenze || []) livello(l.prezzo, "Resistenza");
}

// ---------- I pallini dei tuoi acquisti ----------
// Leggono gli acquisti salvati su questo dispositivo (gli stessi della pagina Portafoglio):
// niente esce dal browser. La dashboard per ora registra solo gli acquisti, non le vendite:
// quando registrerà anche le vendite, compariranno qui con un pallino rosso.

// Gli acquisti di un titolo, raggruppati per giorno di Borsa del grafico:
// { "2026-03-10": { quote, investito, quanti }, ... }
function acquistiSulGrafico(ticker, giorni) {
  const posizione = posizioni.find((p) => p.ticker === ticker);
  const perGiorno = {};
  if (!posizione || !giorni.length) return perGiorno;
  for (const a of posizione.acquisti) {
    if (!a.data || a.data < giorni[0]) continue;            // più vecchio del grafico: non si vede
    // Comprato di sabato, di domenica o in un giorno di festa: il pallino va sul primo giorno di Borsa dopo
    const giorno = giorni.find((g) => g >= a.data) || giorni[giorni.length - 1];
    const voce = perGiorno[giorno] || (perGiorno[giorno] = { quote: 0, investito: 0, quanti: 0 });
    voce.quote += a.quote;
    voce.investito += a.investito;
    voce.quanti += 1;
  }
  return perGiorno;
}

// Mette (o aggiorna) i pallini blu degli acquisti sotto il prezzo
function mettiPallini(stato) {
  stato.acquisti = acquistiSulGrafico(stato.ticker, stato.dati.giorni);
  const firma = JSON.stringify(stato.acquisti);
  if (firma === stato.firmaPallini) return;                  // niente di nuovo
  stato.firmaPallini = firma;
  const segni = Object.keys(stato.acquisti).sort().map((giorno) => ({
    time: giorno, position: "belowBar", shape: "circle", color: coloriGrafico().accento, size: 1,
  }));
  if (stato.pallini) stato.pallini.setMarkers(segni);
  else stato.pallini = LWC.createSeriesMarkers(stato.principale, segni);
}

// ---------- Il confronto tra due titoli, in percentuale ----------
// Scegli un secondo titolo dal menu "Confronta con…": compare come linea arancione e la scala
// a destra passa in percentuale. Entrambe le linee partono da 0% nel primo giorno che vedi
// a sinistra: così si vede chi è andato meglio NEL PERIODO MOSTRATO (zoomando, la partenza cambia).
// Durante il confronto medie mobili, volumi, supporti e resistenze si nascondono.

// Riempie il menu con i titoli che hanno un grafico: prima i tuoi, poi la watchlist
function riempiMenuConfronto(stato) {
  const menu = stato.contenitore.closest("section").querySelector(".confronto-prezzo");
  if (!menu) return;
  const miei = new Set(posizioni.map((p) => p.ticker));
  const nome = (t) => (analisi.titoli[t] || {}).nome || infoTitolo(t).nome || t;
  const tutti = Object.keys(analisi.titoli).filter((t) => t !== stato.ticker && analisi.titoli[t].tecnica)
    .sort((a, b) => nome(a).localeCompare(nome(b), "it"));
  const opzione = (valore, testo) => {
    const o = document.createElement("option");
    o.value = valore;
    o.textContent = testo;
    return o;
  };
  const gruppo = (titolo, sigle) => {
    const g = document.createElement("optgroup");
    g.label = titolo;
    g.append(...sigle.map((t) => opzione(t, `${nome(t)} (${t})`)));
    return g;
  };
  menu.replaceChildren(opzione("", "Confronta con…"),
    gruppo("I miei titoli", tutti.filter((t) => miei.has(t))),
    gruppo("Watchlist", tutti.filter((t) => !miei.has(t))));
  menu.value = stato.confronto || "";
  menu.onchange = () => scegliConfronto(stato, menu.value || null);
}

function scegliConfronto(stato, ticker) {
  stato.confronto = ticker;
  if (!ticker) return applicaConfronto(stato);
  caricaGrafico(ticker).then(() => { if (stato.confronto === ticker) applicaConfronto(stato); });
}

// Accende o spegne il confronto nel grafico
function applicaConfronto(stato) {
  const { grafico } = stato;
  if (stato.serieConfronto) grafico.removeSeries(stato.serieConfronto);
  stato.serieConfronto = null;
  stato.datiConfronto = stato.confronto ? datiPrezzo(stato.confronto) : null;
  const attivo = Boolean(stato.datiConfronto);
  const nota = stato.contenitore.closest("section").querySelector(".nota-confronto");

  if (attivo) {
    stato.serieConfronto = grafico.addSeries(LWC.LineSeries, { color: coloriGrafico().confronto, lineWidth: 2,
      priceLineVisible: false, crosshairMarkerVisible: true });
    stato.serieConfronto.setData(punti(stato.datiConfronto.giorni, stato.datiConfronto.chiusura));
  }
  // La scala a destra: in percentuale durante il confronto, in prezzo altrimenti
  grafico.priceScale("right").applyOptions({ mode: attivo ? LWC.PriceScaleMode.Percentage : LWC.PriceScaleMode.Normal });
  // Medie, volumi e livelli in percentuale non avrebbero senso: li nascondiamo
  if (stato.mm50) stato.mm50.applyOptions({ visible: !attivo && medieAccese.mm50 });
  if (stato.mm200) stato.mm200.applyOptions({ visible: !attivo && medieAccese.mm200 });
  if (stato.volumi) stato.volumi.applyOptions({ visible: !attivo });
  for (const l of stato.livelli) l.applyOptions({ lineVisible: !attivo });
  if (nota) {
    nota.hidden = !stato.confronto;
    nota.textContent = !stato.confronto ? ""
      : attivo ? `Linea arancione: ${nomeBreve(stato.confronto)}. Le due linee partono da 0% nel primo giorno a sinistra.`
      : `Il grafico di ${nomeBreve(stato.confronto)} non è ancora disponibile.`;
  }
  // Mentre tocchi o zoomi, la riga dei numeri ricalcola le percentuali dal primo giorno visibile
  if (!stato.ascoltaZoom) {
    stato.ascoltaZoom = true;
    grafico.timeScale().subscribeVisibleLogicalRangeChange(() => { if (stato.datiConfronto) scriviRigaGrafico(stato, null); });
  }
  scriviRigaGrafico(stato, null);
}

function nomeBreve(ticker) {
  return (analisi.titoli[ticker] || {}).nome || ticker;
}

// Le percentuali del confronto per un giorno: dal primo giorno visibile a quel giorno
function righeConfronto(stato, chiave) {
  const intervallo = stato.grafico.timeScale().getVisibleLogicalRange();
  const giorni = stato.dati.giorni;
  // Il primo giorno visibile, anche se si vede solo in parte: è quello che usa la scala in percentuale
  const primo = giorni[Math.min(giorni.length - 1, Math.max(0, Math.floor(intervallo ? intervallo.from : 0)))];
  const variazione = (d) => {
    const base = d.giorni.findIndex((g) => g >= primo);
    let fine = -1;
    for (let i = d.giorni.length - 1; i >= 0; i--) if (d.giorni[i] <= chiave) { fine = i; break; }
    if (base < 0 || fine < base) return "–";
    return testoVariazione(d.chiusura[fine] / d.chiusura[base] - 1);
  };
  return [["", "dal " + dataBreve(primo)],
    [nomeBreve(stato.ticker), variazione(stato.dati), "confronto-principale"],
    [nomeBreve(stato.confronto), variazione(stato.datiConfronto), "confronto-secondo"]];
}

// Da due liste (giorni e valori) ai punti che vuole la libreria; i valori vuoti restano "buchi"
function punti(giorni, valori) {
  return giorni.map((g, i) => (valori[i] === null || valori[i] === undefined ? { time: g } : { time: g, value: valori[i] }));
}

// ---------- La riga dei numeri sopra il grafico ----------
// Senza dito sul grafico mostra l'ultimo giorno; con il dito, il giorno toccato.

function scriviRigaGrafico(stato, tempo) {
  const riga = stato.contenitore.closest(".area-grafico").querySelector(".riga-numeri");
  if (!riga || !stato.dati) return;
  const d = stato.dati;
  const chiave = tempo ? (typeof tempo === "string" ? tempo : testoChiave(tempo)) : d.giorni[d.giorni.length - 1];
  const i = d.giorni.indexOf(chiave);
  if (i < 0) return;
  const p = (v) => (v === null || v === undefined ? "–" : numeroIt(v, cifrePrezzo(v)));
  const pezzi = [["", testoGiorno(chiave)]];
  if (stato.datiConfronto) {
    scriviRiga(riga, [...pezzi, ...righeConfronto(stato, chiave)]);
    return;
  }
  if (stato.modo === "candele" && d.apertura[i] !== null) {
    pezzi.push(["A", p(d.apertura[i])], ["Max", p(d.massimo[i])], ["Min", p(d.minimo[i])], ["C", p(d.chiusura[i])]);
  } else {
    pezzi.push(["Prezzo", p(d.chiusura[i])]);
  }
  if (i > 0 && d.chiusura[i - 1]) pezzi.push(["", testoVariazione(d.chiusura[i] / d.chiusura[i - 1] - 1)]);
  if (medieAccese.mm50 && d.mm50[i] !== null) pezzi.push(["MM50", p(d.mm50[i])]);
  if (medieAccese.mm200 && d.mm200[i] !== null) pezzi.push(["MM200", p(d.mm200[i])]);
  // Il giorno di un tuo acquisto (pallino blu): quante quote e a che prezzo medio
  const acquisto = stato.acquisti && stato.acquisti[chiave];
  if (acquisto) {
    pezzi.push(["● Acquist" + (acquisto.quanti > 1 ? "i" : "o"),
      `${quote(acquisto.quote)} quote a ${euro(acquisto.investito / acquisto.quote)}`]);
  }
  scriviRiga(riga, pezzi);
}

// Scrive i pezzi [etichetta, valore, classe] nella riga: come testo semplice, per sicurezza
function scriviRiga(riga, pezzi) {
  riga.replaceChildren(...pezzi.map(([etichetta, valore, classe]) => {
    const pezzo = document.createElement("span");
    if (etichetta) {
      const e = document.createElement("i");
      e.textContent = etichetta + " ";
      if (etichetta.startsWith("MM")) e.className = etichetta.toLowerCase();   // il colore della sua linea
      if (etichetta.startsWith("●")) e.className = "acquisto";
      if (classe) e.className = classe;
      pezzo.append(e);
    }
    pezzo.append(valore);
    return pezzo;
  }));
}

// L'oggetto giorno della libreria ({ year, month, day }) → "2026-11-14"
function testoChiave(tempo) {
  return `${tempo.year}-${String(tempo.month).padStart(2, "0")}-${String(tempo.day).padStart(2, "0")}`;
}

// ---------- Tema, modo e collegamenti ----------

// Quando cambi tema (chiaro/scuro) i grafici prendono i colori nuovi
function aggiornaTemaGrafici() {
  for (const stato of Object.values(graficiPrezzo)) {
    stato.grafico.applyOptions(opzioniTema(coloriGrafico()));
    stato.ticker = null;               // costringe a ridisegnare le serie con i colori nuovi
  }
  if (Object.keys(graficiPrezzo).length && typeof ridisegnaGrafici === "function") ridisegnaGrafici();
}

// Il selettore "Candele" / "Linea": vale per tutti i grafici del prezzo
function scegliModoGrafico(modo) {
  modoGrafico = modo;
  try { localStorage.setItem("modo-grafico", modo); } catch (errore) { /* non importa */ }
  if (tickerAperto) disegnaGraficoTecnico();
  else if (typeof disegnaGraficoOggi === "function") disegnaGraficoOggi();
}

// I pulsanti 1M, 3M, 6M, 1A, 2A, 5A: mostrano quel periodo in tutti i grafici del prezzo
function scegliPeriodoPrezzo(chiave) {
  periodoPrezzo = chiave;
  try { localStorage.setItem("periodo-prezzo", chiave); } catch (errore) { /* non importa */ }
  for (const stato of Object.values(graficiPrezzo)) if (stato.dati) mostraPeriodo(stato, chiave);
  aggiornaPulsantiGrafico();
}

// Accende o spegne una media mobile ("mm50" o "mm200") in tutti i grafici del prezzo
function cambiaMedia(quale) {
  medieAccese[quale] = !medieAccese[quale];
  try { localStorage.setItem("medie-prezzo", JSON.stringify(medieAccese)); } catch (errore) { /* non importa */ }
  for (const stato of Object.values(graficiPrezzo)) {
    if (stato[quale]) stato[quale].applyOptions({ visible: medieAccese[quale] && !stato.datiConfronto });
    scriviRigaGrafico(stato, null);
  }
  aggiornaPulsantiGrafico();
}

function disegnaGraficoTecnico() {
  disegnaGraficoPrezzo($("grafico-tecnico"), tickerAperto);
}

// Collega i pulsanti dei grafici del prezzo (lo chiama app.js all'avvio)
function collegaGrafici() {
  try {
    if (localStorage.getItem("modo-grafico") === "linea") modoGrafico = "linea";
    const salvato = localStorage.getItem("periodo-prezzo");
    if (PERIODI_PREZZO.some(([k]) => k === salvato)) periodoPrezzo = salvato;
    const medie = JSON.parse(localStorage.getItem("medie-prezzo") || "null");
    if (medie) medieAccese = { mm50: medie.mm50 !== false, mm200: medie.mm200 !== false };
  } catch (errore) { /* non importa */ }
  document.querySelectorAll(".modo-grafico button").forEach((b) => (b.onclick = () => scegliModoGrafico(b.dataset.modo)));
  // I pulsanti dei periodi, uguali in ogni grafico del prezzo
  for (const contenitore of document.querySelectorAll(".periodi-prezzo")) {
    for (const [chiave, scritta, mesi] of PERIODI_PREZZO) {
      const pulsante = document.createElement("button");
      pulsante.type = "button";
      pulsante.textContent = scritta;
      pulsante.title = mesi < 12 ? `Ultim${mesi === 1 ? "o mese" : "i " + mesi + " mesi"}` : `Ultim${mesi === 12 ? "o anno" : "i " + mesi / 12 + " anni"}`;
      pulsante.dataset.periodo = chiave;
      pulsante.onclick = () => scegliPeriodoPrezzo(chiave);
      contenitore.appendChild(pulsante);
    }
  }
  // I pulsanti delle medie mobili: un tocco accende, un altro spegne
  for (const contenitore of document.querySelectorAll(".medie-prezzo")) {
    for (const [quale, scritta, descrizione] of [["mm50", "MM50", "Media mobile a 50 giorni"], ["mm200", "MM200", "Media mobile a 200 giorni"]]) {
      const pulsante = document.createElement("button");
      pulsante.type = "button";
      pulsante.dataset.media = quale;
      pulsante.title = descrizione + ": tocca per accenderla o spegnerla";
      const segno = document.createElement("i");
      segno.className = "linea-" + quale;          // la lineetta del suo colore
      pulsante.append(segno, scritta);
      pulsante.onclick = () => cambiaMedia(quale);
      contenitore.appendChild(pulsante);
    }
  }
  aggiornaPulsantiGrafico();
  if (!LWC) {
    // Se la libreria non si è caricata, lo diciamo invece di lasciare un buco
    document.querySelectorAll(".grafico-prezzo").forEach((el) => (el.textContent = "Il grafico non si è caricato: riprova più tardi."));
  }
}
