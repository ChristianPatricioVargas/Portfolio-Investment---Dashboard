// agenti/tecnico.js = la parte della pagina dell'ANALISTA TECNICO (il "quando").
// Nella pagina di un titolo mostra:
//   - una frase che riassume l'andamento
//   - il grafico del prezzo dell'ultimo anno con le medie mobili a 50 e 200 giorni,
//     i supporti e le resistenze
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

// Le tre linee del grafico: sempre nello stesso ordine e con lo stesso colore
const LINEE_TECNICHE = [
  { campo: "prezzo", classe: "linea-prezzo", nome: "Prezzo" },
  { campo: "mm50", classe: "linea-mm50", nome: "Media 50 giorni" },
  { campo: "mm200", classe: "linea-mm200", nome: "Media 200 giorni" },
];

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

  scriviLegenda($("legenda-tecnico"), LINEE_TECNICHE.filter((l) => l.campo !== "mm200" || t.mm200 !== null));
  // Il grafico arriva appena le linee sono state scaricate
  const ticker = tickerAperto;
  caricaSerie().then(() => { if (ticker === tickerAperto) disegnaGraficoTecnico(); });
}

function disegnaGraficoTecnico() {
  const svg = $("grafico-tecnico");
  const area = $("area-grafico-tecnico");
  const t = (analisi.titoli[tickerAperto] || {}).tecnica;
  const serie = serieTecniche && serieTecniche[tickerAperto];
  nascondiFumetto(svg);
  area.hidden = !serie || !t;
  if (!serie || !t) return;

  // ---- Le misure: da "prezzi e giorni" a "pixel sullo schermo" ----
  const n = serie.giorni.length;
  const larghezza = area.clientWidth;
  const altezza = ALTEZZA_GRAFICO + 40;
  const livelli = [...t.supporti.map((l) => ({ ...l, sigla: "Supporto" })), ...t.resistenze.map((l) => ({ ...l, sigla: "Resistenza" }))];
  const valori = [...LINEE_TECNICHE.flatMap((l) => serie[l.campo]), ...livelli.map((l) => l.prezzo)].filter((v) => v !== null);
  let minimo = Math.min(...valori), massimo = Math.max(...valori);
  const margine = (massimo - minimo) * 0.08 || massimo * 0.02;
  minimo -= margine;
  massimo += margine;
  const larghezzaUtile = larghezza - MARGINI.sinistra - MARGINI.destra;
  const altezzaUtile = altezza - MARGINI.sopra - MARGINI.sotto;
  const x = (i) => MARGINI.sinistra + (i / (n - 1)) * larghezzaUtile;
  const y = (v) => MARGINI.sopra + (1 - (v - minimo) / (massimo - minimo)) * altezzaUtile;
  const destra = larghezza - MARGINI.destra;

  const tracciato = (campo) => serie[campo]
    .map((v, i) => [v, i]).filter(([v]) => v !== null)
    .map(([v, i], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  // Tre righe orizzontali di riferimento, con il prezzo a destra
  const cifre = massimo >= 1000 ? 0 : massimo >= 100 ? 0 : 1;
  let griglia = "";
  for (let k = 0; k <= 2; k++) {
    const v = minimo + ((massimo - minimo) * (k + 0.5)) / 3;
    griglia += `<line class="griglia" x1="${MARGINI.sinistra}" x2="${destra}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="asse" x="${destra + 8}" y="${y(v) + 4}">${numeroIt(v, cifre)}</text>`;
  }

  // Supporti e resistenze: righe tratteggiate con il nome scritto sopra, a sinistra
  let righeLivelli = "";
  let ultimaScritta = -100;
  for (const l of livelli.sort((a, b) => b.prezzo - a.prezzo)) {
    righeLivelli += `<line class="livello" x1="${MARGINI.sinistra}" x2="${destra}" y1="${y(l.prezzo)}" y2="${y(l.prezzo)}"/>`;
    if (y(l.prezzo) - ultimaScritta < 13) continue;   // troppo vicina alla scritta precedente: la saltiamo
    ultimaScritta = y(l.prezzo);
    righeLivelli += `<text class="asse etichetta-livello" x="${MARGINI.sinistra + 2}" y="${y(l.prezzo) - 4}">${l.sigla} ${numeroIt(l.prezzo, 2)}</text>`;
  }

  let date = "";
  for (const [i, allineamento] of [[0, "start"], [Math.floor((n - 1) / 2), "middle"], [n - 1, "end"]]) {
    date += `<text class="asse" x="${x(i)}" y="${altezza - 8}" text-anchor="${allineamento}">${etichettaBreve(serie.giorni[i])}</text>`;
  }

  // Le medie sotto, il prezzo sopra a tutto
  const tracciati = LINEE_TECNICHE.slice().reverse()
    .map((l) => `<path class="${l.classe}" d="${tracciato(l.campo)}"/>`).join("");

  svg.setAttribute("viewBox", `0 0 ${larghezza} ${altezza}`);
  svg.setAttribute("width", larghezza);
  svg.setAttribute("height", altezza);
  svg.setAttribute("aria-label", `Prezzo dell'ultimo anno con medie mobili. ${t.frase}`);
  svg.innerHTML = `${griglia}${righeLivelli}${tracciati}${date}
    <line class="mirino" y1="${MARGINI.sopra}" y2="${altezza - MARGINI.sotto}" visibility="hidden"/>
    <circle class="punto" r="5" visibility="hidden"/>`;
  svg._tecnico = { serie, x, y, larghezzaUtile, valuta: t.valuta };
}

// Il "fumetto" del grafico tecnico: prezzo e medie del giorno che tocchi
function mostraFumettoTecnico(evento) {
  const svg = evento.currentTarget;
  if (!svg._tecnico) return;
  const { serie, x, y, larghezzaUtile, valuta } = svg._tecnico;
  const n = serie.giorni.length;
  const rettangolo = svg.getBoundingClientRect();
  const posizione = evento.clientX - rettangolo.left - MARGINI.sinistra;
  const i = Math.max(0, Math.min(n - 1, Math.round((posizione / larghezzaUtile) * (n - 1))));

  const mirino = svg.querySelector(".mirino");
  mirino.setAttribute("x1", x(i));
  mirino.setAttribute("x2", x(i));
  mirino.setAttribute("visibility", "visible");
  const punto = svg.querySelector(".punto");
  punto.setAttribute("cx", x(i));
  punto.setAttribute("cy", y(serie.prezzo[i]));
  punto.setAttribute("visibility", "visible");

  const fumetto = svg.parentElement.querySelector(".fumetto");
  const visibili = LINEE_TECNICHE.filter((l) => serie[l.campo][i] !== null);
  fumetto.innerHTML = `<div class="fumetto-data"></div>` +
    visibili.map((l) => `<div><i class="${l.classe}"></i>${l.nome} <b></b></div>`).join("");
  fumetto.querySelector(".fumetto-data").textContent = etichettaLunga(serie.giorni[i]);
  // I valori li scriviamo come testo semplice, per sicurezza
  fumetto.querySelectorAll("b").forEach((b, k) => (b.textContent = prezzoIn(serie[visibili[k].campo][i], valuta)));
  fumetto.hidden = false;
  const larghezzaFumetto = fumetto.offsetWidth;
  fumetto.style.left = Math.max(0, Math.min(x(i) - larghezzaFumetto / 2, rettangolo.width - larghezzaFumetto)) + "px";
}

// Collega il grafico tecnico ai tocchi (lo chiama app.js all'avvio)
function collegaTecnico() {
  const svg = $("grafico-tecnico");
  svg.addEventListener("pointermove", mostraFumettoTecnico);
  svg.addEventListener("pointerdown", mostraFumettoTecnico);
  svg.addEventListener("pointerleave", nascondiFumetto);
}
