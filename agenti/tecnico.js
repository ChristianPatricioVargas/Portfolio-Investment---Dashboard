// agenti/tecnico.js = la parte della pagina dell'ANALISTA TECNICO (il "quando").
// Nella pagina di un titolo mostra:
//   - una frase che riassume l'andamento
//   - il grafico del prezzo con le medie mobili a 50 e 200 giorni, i supporti e le resistenze
//     (lo disegna agenti/grafico.js)
//   - i numeri: RSI, distanza da massimo e minimo dell'anno...
// I calcoli li fa ogni sera scripts/agenti/tecnico.py: qui li disegniamo soltanto.
//
// IMPORTANTE: l'analisi tecnica descrive il passato, non prevede il futuro.

let serieTecniche = null;      // le linee dei grafici (da data/serie.json), caricate solo quando servono
let caricamentoSerie = null;

// Scarica data/serie.json una volta sola, la prima volta che apri la pagina di un titolo
function caricaSerie() {
  if (!caricamentoSerie) {
    caricamentoSerie = fetch("data/serie.json", { cache: "no-store" })
      .then((risposta) => (risposta.ok ? risposta.json() : {}))
      .catch(() => ({}))
      .then((dati) => { serieTecniche = dati; });
  }
  return caricamentoSerie;
}

function testoRsi(valore) {
  if (valore < 30) return "basso: sceso in fretta";
  if (valore > 70) return "alto: salito in fretta";
  return "nella norma (tra 30 e 70)";
}

// I numeri della scheda tecnica. Serve sia alla pagina sia a "Copia per l'analisi".
function datiTecnici(t) {
  const c = t.valuta;
  const livelli = (lista) => lista.map((l) => prezzoIn(l.prezzo, c)).join(" · ");
  return [
    ["Media a 50 giorni", prezzoIn(t.mm50, c), "", t.sopraMm50 ? "il prezzo è sopra" : "il prezzo è sotto"],
    t.mm200 !== null ? ["Media a 200 giorni", prezzoIn(t.mm200, c), "", t.sopraMm200 ? "il prezzo è sopra" : "il prezzo è sotto"] : null,
    t.rsi !== null ? ["RSI a 14 giorni", numeroIt(t.rsi, 0), "", testoRsi(t.rsi)] : null,
    ["Dal massimo dell'anno", percUno(t.dalMassimo, true), "", "massimo " + prezzoIn(t.massimo52, c)],
    ["Dal minimo dell'anno", percUno(t.dalMinimo, true), "", "minimo " + prezzoIn(t.minimo52, c)],
    t.supporti.length ? ["Supporti", livelli(t.supporti), "", "prezzi dove in passato ha smesso di scendere"] : null,
    t.resistenze.length ? ["Resistenze", livelli(t.resistenze), "", "prezzi dove in passato ha smesso di salire"] : null,
  ].filter(Boolean);
}

function disegnaTecnico() {
  const t = (analisi.titoli[tickerAperto] || {}).tecnica;
  $("corpo-tecnico").hidden = !t;
  $("attesa-tecnico").hidden = Boolean(t);
  if (!t) return;

  $("frase-tecnico").textContent = t.frase;
  const griglia = $("numeri-tecnico");
  griglia.innerHTML = "";
  for (const dato of datiTecnici(t)) aggiungiDato(griglia, ...dato);
  $("fonte-tecnico").textContent = `Calcolato sui prezzi di chiusura fino al ${dataBreve(t.data)} (Yahoo Finance)` +
    (t.valuta && t.valuta !== "EUR" ? ` · prezzi in ${t.valuta}` : "");

  // Il grafico arriva appena le linee sono state scaricate
  const ticker = tickerAperto;
  caricaSerie().then(() => { if (ticker === tickerAperto) disegnaGraficoTecnico(); });
}

// Il grafico del prezzo (candele o linea, zoom, medie...) ora è in agenti/grafico.js

// Collega l'analista tecnico (lo chiama app.js all'avvio)
function collegaTecnico() {
  collegaGrafici();
}
