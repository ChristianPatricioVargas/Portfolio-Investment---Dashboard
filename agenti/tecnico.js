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

  // Il grafico arriva appena le linee sono state scaricate
  const ticker = tickerAperto;
  caricaSerie().then(() => { if (ticker === tickerAperto) disegnaGraficoTecnico(); });
}

// ---------- Il grafico del prezzo: a candele (3 mesi) oppure a linea (1 anno) ----------
// Lo stesso grafico serve nella pagina di un titolo e nella pagina Oggi: per questo
// riceve l'elemento <svg> dove disegnare e la sigla del titolo.

let modoGrafico = "candele";            // "candele" = ultimi 3 mesi, "linea" = ultimo anno
const ALTEZZA_VOLUMI = 44;              // la striscia dei volumi sotto le candele

function disegnaGraficoTecnico() {
  disegnaGraficoPrezzo($("grafico-tecnico"), tickerAperto);
}

function disegnaGraficoPrezzo(svg, ticker) {
  const area = svg.parentElement;
  const t = (analisi.titoli[ticker] || {}).tecnica;
  const serie = serieTecniche && serieTecniche[ticker];
  nascondiFumetto(svg);
  area.hidden = !serie || !t;
  if (!serie || !t) return;

  // Le candele ci sono solo per gli ultimi mesi (e per qualche titolo mancano): altrimenti linea
  const candele = modoGrafico === "candele" ? serie.candele : null;
  const da = candele ? candele.da : 0;
  const giorni = serie.giorni.slice(da);
  const n = giorni.length;
  const linee = LINEE_TECNICHE.filter((l) => !(candele && l.campo === "prezzo"))
    .map((l) => ({ ...l, valori: serie[l.campo].slice(da) }));

  // ---- Le misure: da "prezzi e giorni" a "pixel sullo schermo" ----
  const larghezza = area.clientWidth;
  const altezza = ALTEZZA_GRAFICO + 60;
  const livelli = [...t.supporti.map((l) => ({ ...l, sigla: "Supporto" })), ...t.resistenze.map((l) => ({ ...l, sigla: "Resistenza" }))];
  let valori = linee.flatMap((l) => l.valori).filter((v) => v !== null);
  if (candele) {
    // Con le candele comandano i prezzi: una media lontana (capita con quella a 200 giorni) entra nel
    // grafico solo se è vicina, altrimenti schiaccerebbe le candele. La parte fuori viene tagliata.
    const basso = Math.min(...candele.minimo), alto = Math.max(...candele.massimo);
    const tolleranza = (alto - basso) * 0.35;
    valori = [basso, alto, ...valori.filter((v) => v > basso - tolleranza && v < alto + tolleranza)];
  }
  let minimo = Math.min(...valori), massimo = Math.max(...valori);
  // I livelli entrano nel grafico solo se sono vicini ai prezzi mostrati (altrimenti schiaccerebbero le candele)
  const visibili = livelli.filter((l) => l.prezzo > minimo * 0.97 && l.prezzo < massimo * 1.03);
  minimo = Math.min(minimo, ...visibili.map((l) => l.prezzo));
  massimo = Math.max(massimo, ...visibili.map((l) => l.prezzo));
  const margine = (massimo - minimo) * 0.06 || massimo * 0.02;
  minimo -= margine;
  massimo += margine;
  const fondoPrezzi = altezza - MARGINI.sotto - (candele ? ALTEZZA_VOLUMI + 8 : 0);
  const larghezzaUtile = larghezza - MARGINI.sinistra - MARGINI.destra;
  const passo = larghezzaUtile / (candele ? n : n - 1);          // lo spazio di un giorno
  const x = (i) => MARGINI.sinistra + (candele ? (i + 0.5) * passo : i * passo);
  const y = (v) => MARGINI.sopra + (1 - (v - minimo) / (massimo - minimo)) * (fondoPrezzi - MARGINI.sopra);
  const destra = larghezza - MARGINI.destra;

  // Righe orizzontali di riferimento, con il prezzo a destra
  const cifre = massimo >= 100 ? 0 : 1;
  let griglia = "";
  for (let k = 0; k <= 2; k++) {
    const v = minimo + ((massimo - minimo) * (k + 0.5)) / 3;
    griglia += `<line class="griglia" x1="${MARGINI.sinistra}" x2="${destra}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="asse" x="${destra + 8}" y="${y(v) + 4}">${numeroIt(v, cifre)}</text>`;
  }

  // Supporti e resistenze: righe tratteggiate con il nome scritto sopra, a sinistra
  let righeLivelli = "";
  let ultimaScritta = -100;
  for (const l of visibili.sort((a, b) => b.prezzo - a.prezzo)) {
    righeLivelli += `<line class="livello" x1="${MARGINI.sinistra}" x2="${destra}" y1="${y(l.prezzo)}" y2="${y(l.prezzo)}"/>`;
    if (y(l.prezzo) - ultimaScritta < 13) continue;   // troppo vicina alla scritta precedente: la saltiamo
    ultimaScritta = y(l.prezzo);
    righeLivelli += `<text class="asse etichetta-livello" x="${MARGINI.sinistra + 2}" y="${y(l.prezzo) - 4}">${l.sigla} ${numeroIt(l.prezzo, 2)}</text>`;
  }

  // Le candele: un rettangolo tra apertura e chiusura, una lineetta tra minimo e massimo.
  // Verde se il giorno ha chiuso in rialzo, rosso se in ribasso. Sotto, i volumi scambiati.
  let disegnoCandele = "";
  if (candele) {
    const spessore = Math.max(1.5, Math.min(11, passo * 0.64));
    const volumeMassimo = Math.max(...candele.volume, 1);
    const fondoVolumi = altezza - MARGINI.sotto;
    for (let i = 0; i < n; i++) {
      const [apre, chiude] = [candele.apertura[i], candele.chiusura[i]];
      const classe = chiude >= apre ? "su" : "giu";
      const alto = y(Math.max(apre, chiude)), basso = y(Math.min(apre, chiude));
      const volume = (candele.volume[i] / volumeMassimo) * ALTEZZA_VOLUMI;
      disegnoCandele += `<line class="stoppino ${classe}" x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${y(candele.massimo[i]).toFixed(1)}" y2="${y(candele.minimo[i]).toFixed(1)}"/>
        <rect class="corpo ${classe}" x="${(x(i) - spessore / 2).toFixed(1)}" y="${alto.toFixed(1)}" width="${spessore.toFixed(1)}" height="${Math.max(basso - alto, 1).toFixed(1)}"/>
        <rect class="volume ${classe}" x="${(x(i) - spessore / 2).toFixed(1)}" y="${(fondoVolumi - volume).toFixed(1)}" width="${spessore.toFixed(1)}" height="${volume.toFixed(1)}"/>`;
    }
    disegnoCandele += `<text class="asse" x="${destra + 8}" y="${fondoVolumi - 2}">Vol.</text>`;
  }

  let date = "";
  for (const [i, allineamento] of [[0, "start"], [Math.floor((n - 1) / 2), "middle"], [n - 1, "end"]]) {
    const dove = allineamento === "start" ? MARGINI.sinistra : allineamento === "end" ? destra : x(i);
    date += `<text class="asse" x="${dove}" y="${altezza - 8}" text-anchor="${allineamento}">${etichettaBreve(giorni[i])}</text>`;
  }

  const tracciato = (valoriLinea) => valoriLinea
    .map((v, i) => [v, i]).filter(([v]) => v !== null)
    .map(([v, i], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  // Le medie sotto, il prezzo sopra a tutto
  const tracciati = `<g clip-path="url(#taglio-${svg.id})">` +
    linee.slice().reverse().map((l) => `<path class="${l.classe}" d="${tracciato(l.valori)}"/>`).join("") + "</g>";

  // L'etichetta con l'ultimo prezzo, sul bordo destro
  const ultimo = candele ? candele.chiusura[n - 1] : serie.prezzo[serie.prezzo.length - 1];
  const etichetta = `<rect class="ultimo-prezzo" x="${destra + 4}" y="${y(ultimo) - 9}" width="${MARGINI.destra - 6}" height="18" rx="3"/>
    <text class="ultimo-prezzo-testo" x="${destra + 4 + (MARGINI.destra - 6) / 2}" y="${y(ultimo) + 4}" text-anchor="middle">${numeroIt(ultimo, ultimo >= 1000 ? 0 : 2)}</text>`;

  svg.setAttribute("viewBox", `0 0 ${larghezza} ${altezza}`);
  svg.setAttribute("width", larghezza);
  svg.setAttribute("height", altezza);
  svg.setAttribute("aria-label", `${candele ? "Candele degli ultimi mesi" : "Prezzo dell'ultimo anno"} di ${infoTitolo(ticker).nome}, con medie mobili. ${t.frase}`);
  svg.innerHTML = `<defs><clipPath id="taglio-${svg.id}"><rect x="${MARGINI.sinistra}" y="${MARGINI.sopra}" width="${larghezzaUtile}" height="${fondoPrezzi - MARGINI.sopra}"/></clipPath></defs>
    ${griglia}${righeLivelli}${disegnoCandele}${tracciati}${date}${etichetta}
    <line class="mirino" y1="${MARGINI.sopra}" y2="${altezza - MARGINI.sotto}" visibility="hidden"/>
    <circle class="punto" r="5" visibility="hidden"/>`;
  svg._tecnico = { giorni, linee, candele, x, y, passo, valuta: t.valuta };

  // La legenda sopra il grafico e i pulsanti del modo, se questo grafico li ha
  const riquadro = svg.closest(".riquadro, .pannello");
  const legenda = riquadro && riquadro.querySelector(".legenda");
  if (legenda) {
    scriviLegenda(legenda, [...(candele ? [{ classe: "linea-candele", nome: "Candele (verde = giorno in rialzo)" }] : []),
      ...linee.filter((l) => l.valori.some((v) => v !== null))]);
  }
  document.querySelectorAll(".modo-grafico button").forEach((b) => b.classList.toggle("attivo", b.dataset.modo === modoGrafico));
}

// Il "fumetto" del grafico del prezzo: i numeri del giorno che tocchi
function mostraFumettoPrezzo(evento) {
  const svg = evento.currentTarget;
  if (!svg._tecnico) return;
  const { giorni, linee, candele, x, y, passo, valuta } = svg._tecnico;
  const n = giorni.length;
  const rettangolo = svg.getBoundingClientRect();
  const posizione = evento.clientX - rettangolo.left - MARGINI.sinistra;
  const i = Math.max(0, Math.min(n - 1, candele ? Math.floor(posizione / passo) : Math.round(posizione / passo)));

  const mirino = svg.querySelector(".mirino");
  mirino.setAttribute("x1", x(i));
  mirino.setAttribute("x2", x(i));
  mirino.setAttribute("visibility", "visible");
  const principale = candele ? candele.chiusura[i] : linee[0].valori[i];
  const punto = svg.querySelector(".punto");
  punto.setAttribute("cx", x(i));
  punto.setAttribute("cy", y(principale));
  punto.setAttribute("visibility", candele ? "hidden" : "visible");

  // Le righe del fumetto: [classe della lineetta, etichetta, valore]
  const righe = [];
  if (candele) {
    righe.push(["", "Apertura", prezzoIn(candele.apertura[i], valuta)], ["", "Massimo", prezzoIn(candele.massimo[i], valuta)],
      ["", "Minimo", prezzoIn(candele.minimo[i], valuta)], ["", "Chiusura", prezzoIn(candele.chiusura[i], valuta)]);
    if (candele.volume[i]) righe.push(["", "Volume", candele.volume[i].toLocaleString("it-IT")]);
  }
  for (const l of linee) if (l.valori[i] !== null) righe.push([l.classe, l.nome, prezzoIn(l.valori[i], valuta)]);

  const fumetto = svg.parentElement.querySelector(".fumetto");
  fumetto.innerHTML = `<div class="fumetto-data"></div>` +
    righe.map(([classe]) => `<div>${classe ? `<i class="${classe}"></i>` : ""}<span></span> <b></b></div>`).join("");
  fumetto.querySelector(".fumetto-data").textContent = etichettaLunga(giorni[i]);
  // I testi li scriviamo come testo semplice, per sicurezza
  fumetto.querySelectorAll("span").forEach((el, k) => (el.textContent = righe[k][1]));
  fumetto.querySelectorAll("b").forEach((el, k) => (el.textContent = righe[k][2]));
  fumetto.hidden = false;
  const larghezzaFumetto = fumetto.offsetWidth;
  fumetto.style.left = Math.max(0, Math.min(x(i) - larghezzaFumetto / 2, rettangolo.width - larghezzaFumetto)) + "px";
}

// Collega un grafico del prezzo ai tocchi
function collegaGraficoPrezzo(svg) {
  svg.addEventListener("pointermove", mostraFumettoPrezzo);
  svg.addEventListener("pointerdown", mostraFumettoPrezzo);
  svg.addEventListener("pointerleave", nascondiFumetto);
}

// Il selettore "Candele 3M" / "Linea 1A": vale per tutti i grafici del prezzo
function scegliModoGrafico(modo) {
  modoGrafico = modo;
  try { localStorage.setItem("modo-grafico", modo); } catch (errore) { /* non importa */ }
  if (tickerAperto) disegnaGraficoTecnico();
  else if (typeof disegnaGraficoOggi === "function") disegnaGraficoOggi();
}

// Collega il grafico tecnico e i pulsanti del modo (lo chiama app.js all'avvio)
function collegaTecnico() {
  try { if (localStorage.getItem("modo-grafico") === "linea") modoGrafico = "linea"; } catch (errore) { /* non importa */ }
  collegaGraficoPrezzo($("grafico-tecnico"));
  document.querySelectorAll(".modo-grafico button").forEach((b) => (b.onclick = () => scegliModoGrafico(b.dataset.modo)));
}
