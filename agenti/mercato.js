// agenti/mercato.js = la pagina "Mercato": uno sguardo d'insieme sulle Borse.
// Qui la pagina mostra soltanto: i dati li prepara GitHub con scripts/aggiorna_mercato.py.
// Tutto ciò che c'è in questa pagina è pubblico: nessun dato personale.
//
// La MAPPA DEL MERCATO (in inglese "heatmap" o "treemap"): un grande rettangolo diviso in settori,
// e ogni settore diviso nelle sue aziende. Più un'azienda vale in Borsa, più grande è il suo riquadro;
// il colore dice quanto è salita (verde) o scesa (rosso) nel periodo scelto.

let mappa = null;               // i dati della mappa (da data/mappa.json), scaricati la prima volta che servono
let caricamentoMappa = null;
let settoreAperto = null;       // il settore ingrandito (null = tutti i settori)

// Le tre scelte della mappa. Le ricordiamo su questo dispositivo: non sono dati personali.
const CHIAVE_SCELTE_MAPPA = "mappa-scelte-v1";
const sceltaMappa = { indice: "sp500", periodo: "oggi", grandezza: "smorzata" };

const INDICI_MAPPA = [["sp500", "S&P 500"], ["eurostoxx50", "Euro Stoxx 50"], ["watchlist", "Watchlist"]];
// Per ogni periodo: la variazione che dà il colore più acceso. Un +3% in un giorno è tanto,
// in un anno è poco: per questo la scala cambia con il periodo.
const PERIODI_MAPPA = [
  ["oggi", "Oggi", 0.03, "all'ultima seduta"],
  ["settimana", "1 sett.", 0.06, "in una settimana"],
  ["mese", "1 mese", 0.10, "in un mese"],
  ["anno", "Da inizio anno", 0.30, "da inizio anno"],
];
const GRANDEZZE_MAPPA = [["smorzata", "Smorzata"], ["pura", "Capitalizzazione"], ["uguali", "Uguali"]];

// Sotto questa larghezza (il telefono) la mappa mostra prima solo i settori: tocchi un settore e si ingrandisce
const MAPPA_STRETTA = 600;

// Scarica data/mappa.json una volta sola, la prima volta che serve
function caricaMappa() {
  if (!caricamentoMappa) {
    caricamentoMappa = fetch("data/mappa.json", { cache: "no-store" })
      .then((risposta) => (risposta.ok ? risposta.json() : null))
      .catch(() => null)
      .then((dati) => { mappa = dati && dati.titoli ? dati : { titoli: {}, elenchi: {} }; });
  }
  return caricamentoMappa;
}

// ---------- I colori: dal rosso al verde, passando per il grigio ----------
// Gli stessi colori nel tema chiaro e in quello scuro: la mappa è come una fotografia,
// e il testo bianco con un'ombra leggera si legge su tutti.
const SCALA_COLORI = [
  [-1, [246, 53, 56]], [-2 / 3, [191, 64, 69]], [-1 / 3, [139, 68, 78]], [0, [65, 69, 84]],
  [1 / 3, [53, 118, 78]], [2 / 3, [47, 158, 79]], [1, [48, 204, 90]],
];
const COLORE_SENZA_DATI = "rgb(48, 52, 62)";

function coloreVariazione(variazione, scala) {
  if (typeof variazione !== "number") return COLORE_SENZA_DATI;
  const t = Math.max(-1, Math.min(1, variazione / scala));
  for (let i = 1; i < SCALA_COLORI.length; i++) {
    const [fine, coloreFine] = SCALA_COLORI[i];
    if (t <= fine) {
      const [inizio, coloreInizio] = SCALA_COLORI[i - 1];
      const quota = (t - inizio) / (fine - inizio);
      const mischia = coloreInizio.map((c, k) => Math.round(c + (coloreFine[k] - c) * quota));
      return `rgb(${mischia.join(", ")})`;
    }
  }
  return `rgb(${SCALA_COLORI[SCALA_COLORI.length - 1][1].join(", ")})`;
}

// ---------- Il disegno a riquadri ("squarified treemap") ----------
// Divide un rettangolo in riquadri con l'area proporzionale al "peso" di ogni voce,
// cercando di farli il più possibile quadrati (i rettangoli lunghi e stretti si leggono male).
// Le voci arrivano dalla più pesante alla più leggera. Restituisce [{ voce, x, y, w, h }].
function dividiInRiquadri(voci, x, y, w, h) {
  const valide = voci.filter((v) => v.peso > 0);
  const totale = valide.reduce((s, v) => s + v.peso, 0);
  const risultato = [];
  if (!totale || w <= 0 || h <= 0) return risultato;
  const rimaste = valide.map((voce) => ({ voce, area: (voce.peso / totale) * w * h }));

  // Quanto è "brutto" il riquadro più allungato di una riga (1 = tutti quadrati perfetti)
  const peggiore = (riga, lato) => {
    const somma = riga.reduce((s, r) => s + r.area, 0);
    const grande = Math.max(...riga.map((r) => r.area));
    const piccolo = Math.min(...riga.map((r) => r.area));
    return Math.max((lato * lato * grande) / (somma * somma), (somma * somma) / (lato * lato * piccolo));
  };
  // Mette una riga di riquadri lungo il lato corto dello spazio rimasto
  const posa = (riga) => {
    const somma = riga.reduce((s, r) => s + r.area, 0);
    if (w >= h) {
      const larghezza = somma / h;
      let yy = y;
      for (const r of riga) { const alto = r.area / larghezza; risultato.push({ voce: r.voce, x, y: yy, w: larghezza, h: alto }); yy += alto; }
      x += larghezza; w -= larghezza;
    } else {
      const altezza = somma / w;
      let xx = x;
      for (const r of riga) { const largo = r.area / altezza; risultato.push({ voce: r.voce, x: xx, y, w: largo, h: altezza }); xx += largo; }
      y += altezza; h -= altezza;
    }
  };

  let riga = [];
  while (rimaste.length) {
    const lato = Math.min(w, h);
    const prossima = rimaste[0];
    if (!riga.length || peggiore([...riga, prossima], lato) <= peggiore(riga, lato)) {
      riga.push(rimaste.shift());
    } else {
      posa(riga);
      riga = [];
    }
  }
  if (riga.length) posa(riga);
  return risultato;
}

// ---------- Quali aziende e quanto pesano ----------

const siglaCorta = (ticker) => ticker.split(".")[0];

// Le aziende dell'indice scelto, ognuna con il suo peso (la grandezza del riquadro)
function aziendeDellaMappa() {
  const elenco = (mappa.elenchi[sceltaMappa.indice] || {}).sigle || [];
  // Nella watchlist non mostriamo i titoli che hai tolto (con "Togli" nella pagina Occasioni)
  const sigle = elenco.filter((t) => mappa.titoli[t] && !(sceltaMappa.indice === "watchlist" && nascosto(t)));
  // Chi non ha la capitalizzazione (Finnhub non la conosce) prende quella "di mezzo" (la mediana) dell'indice
  const capitali = sigle.map((t) => mappa.titoli[t].cap).filter((c) => c > 0).sort((a, b) => a - b);
  const mediana = capitali.length ? capitali[Math.floor(capitali.length / 2)] : 1;
  return sigle.map((ticker) => {
    const t = mappa.titoli[ticker];
    const cap = t.cap > 0 ? t.cap : mediana;
    // "smorzata" = la radice quadrata: chi vale 100 volte di più ha un riquadro 10 volte più grande, non 100
    const peso = sceltaMappa.grandezza === "uguali" ? 1 : sceltaMappa.grandezza === "pura" ? cap : Math.sqrt(cap);
    return { ticker, t, peso, variazione: t[sceltaMappa.periodo] };
  });
}

// Le aziende raggruppate per settore, dal settore più pesante al più leggero
function settoriDellaMappa(aziende) {
  const gruppi = new Map();
  for (const a of aziende) {
    const nome = a.t.settore || "Altro";
    if (!gruppi.has(nome)) gruppi.set(nome, []);
    gruppi.get(nome).push(a);
  }
  return [...gruppi.entries()].map(([nome, voci]) => {
    voci.sort((a, b) => b.peso - a.peso);
    const peso = voci.reduce((s, v) => s + v.peso, 0);
    // La variazione del settore: la media delle sue aziende, pesata come i riquadri
    const conDato = voci.filter((v) => typeof v.variazione === "number");
    const pesoDato = conDato.reduce((s, v) => s + v.peso, 0);
    const variazione = pesoDato ? conDato.reduce((s, v) => s + v.variazione * v.peso, 0) / pesoDato : null;
    return { nome, voci, peso, variazione };
  }).sort((a, b) => b.peso - a.peso);
}

// ---------- Il disegno della mappa ----------

const scalaPeriodo = () => (PERIODI_MAPPA.find((p) => p[0] === sceltaMappa.periodo) || PERIODI_MAPPA[0])[2];
const testoPeriodo = () => (PERIODI_MAPPA.find((p) => p[0] === sceltaMappa.periodo) || PERIODI_MAPPA[0])[3];
const percMappa = (v) => (typeof v === "number" ? (v > 0 ? "+" : "") + (v * 100).toFixed(Math.abs(v) >= 0.1 ? 1 : 2).replace(".", ",") + "%" : "–");

function capitalizzazione(miliardi) {
  if (!(miliardi > 0)) return "";
  return miliardi >= 1000 ? numeroIt(miliardi / 1000, 2) + " mila miliardi $" : numeroIt(miliardi, miliardi >= 100 ? 0 : 1) + " miliardi $";
}

// Il cerchio con l'iniziale: quando manca il logo (o non si carica)
function creaIniziale(nome, lato) {
  const cerchio = crea("span", "iniziale-mappa", (nome || "?").trim().charAt(0).toUpperCase());
  cerchio.style.width = cerchio.style.height = lato + "px";
  cerchio.style.fontSize = Math.round(lato * 0.5) + "px";
  return cerchio;
}

function creaLogo(t, lato) {
  // Solo indirizzi sicuri (https://): il logo arriva da Finnhub
  if (typeof t.logo !== "string" || !t.logo.startsWith("https://")) return creaIniziale(t.nome, lato);
  const cornice = crea("span", "logo-mappa");
  cornice.style.width = cornice.style.height = lato + "px";
  const immagine = document.createElement("img");
  immagine.src = t.logo;
  immagine.alt = "";
  immagine.loading = "lazy";
  immagine.referrerPolicy = "no-referrer";
  immagine.onerror = () => cornice.replaceWith(creaIniziale(t.nome, lato));
  cornice.appendChild(immagine);
  return cornice;
}

// Mette un riquadro nella mappa, nella posizione calcolata (con 1 pixel di spazio tra i riquadri)
function posiziona(elemento, r) {
  const x = Math.round(r.x), y = Math.round(r.y);
  elemento.style.left = x + "px";
  elemento.style.top = y + "px";
  elemento.style.width = Math.max(Math.round(r.x + r.w) - x - 1, 0) + "px";
  elemento.style.height = Math.max(Math.round(r.y + r.h) - y - 1, 0) + "px";
}

// Il riquadro di un'azienda: logo, sigla e variazione, se c'è posto
function creaRiquadroAzienda(a, r, scala) {
  const riquadro = crea("button", "riquadro-mappa");
  riquadro.type = "button";
  riquadro.style.background = coloreVariazione(a.variazione, scala);
  posiziona(riquadro, r);
  const testo = `${a.t.nome} (${a.ticker}): ${percMappa(a.variazione)} ${testoPeriodo()}`;
  riquadro.title = [testo, capitalizzazione(a.t.cap)].filter(Boolean).join(" · ");
  riquadro.setAttribute("aria-label", testo);
  riquadro.onclick = () => vaiAlTitolo(a.ticker);

  const { w, h } = r;
  if (w >= 30 && h >= 18) {
    // Il carattere cresce con il riquadro, entro certi limiti
    const carattere = Math.max(9, Math.min(24, Math.sqrt(w * h) / 5.5, w / 4.2));
    riquadro.style.fontSize = carattere.toFixed(1) + "px";
    const latoLogo = Math.min(40, Math.round(Math.min(w, h) / 3));
    if (w >= 60 && h >= carattere * 2.6 + latoLogo + 8 && latoLogo >= 16) riquadro.appendChild(creaLogo(a.t, latoLogo));
    riquadro.appendChild(crea("span", "sigla-mappa", siglaCorta(a.ticker)));
    if (h >= carattere * 2.4) riquadro.appendChild(crea("span", "variazione-mappa", percMappa(a.variazione)));
  }
  return riquadro;
}

// Il riquadro di un settore intero (sul telefono, prima di ingrandire)
function creaRiquadroSettore(s, r, scala) {
  const riquadro = crea("button", "riquadro-mappa riquadro-settore");
  riquadro.type = "button";
  riquadro.style.background = coloreVariazione(s.variazione, scala);
  posiziona(riquadro, r);
  const testo = `${s.nome}: ${percMappa(s.variazione)} ${testoPeriodo()}, ${s.voci.length} aziende. Tocca per ingrandire.`;
  riquadro.title = testo;
  riquadro.setAttribute("aria-label", testo);
  riquadro.onclick = () => apriSettore(s.nome);
  if (r.w >= 40 && r.h >= 26) {
    const carattere = Math.max(10, Math.min(18, Math.sqrt(r.w * r.h) / 7, r.w / 7));
    riquadro.style.fontSize = carattere.toFixed(1) + "px";
    riquadro.appendChild(crea("span", "nome-settore-mappa", s.nome));
    if (r.h >= carattere * 2.6) riquadro.appendChild(crea("span", "variazione-mappa", percMappa(s.variazione)));
    if (r.h >= carattere * 4) riquadro.appendChild(crea("span", "conta-mappa", `${s.voci.length} aziende`));
  }
  return riquadro;
}

function apriSettore(nome) {
  settoreAperto = nome;
  disegnaMappa();
  $("sezione-mappa").scrollIntoView({ block: "start", behavior: "smooth" });
}

function disegnaMappa() {
  const area = $("mappa");
  area.innerHTML = "";
  const larghezza = area.clientWidth;
  if (!larghezza) return;
  const stretta = larghezza < MAPPA_STRETTA;
  const scala = scalaPeriodo();
  const aziende = aziendeDellaMappa();
  const settori = settoriDellaMappa(aziende);
  // Se il settore ingrandito non c'è nell'indice scelto, torniamo a tutti i settori
  if (settoreAperto && !settori.some((s) => s.nome === settoreAperto)) settoreAperto = null;

  // L'altezza: un rettangolo largo sull'iPad, più alto che largo sul telefono
  const altezza = stretta ? Math.round(Math.min(Math.max(larghezza * 1.25, 380), 620))
    : Math.round(Math.min(Math.max(larghezza * 0.6, 420), 780));
  area.style.height = altezza + "px";

  $("percorso-mappa").hidden = !settoreAperto;
  $("aiuto-mappa").textContent = settoreAperto
    ? "Tocca un'azienda per aprire la sua pagina."
    : stretta ? "Tocca un settore per ingrandirlo, poi un'azienda per aprire la sua pagina."
      : "Tocca un'azienda per aprire la sua pagina, o il nome di un settore per ingrandirlo.";

  if (!aziende.length) {
    area.appendChild(crea("p", "vuoto vuoto-mappa", sceltaMappa.indice === "watchlist"
      ? "La watchlist è vuota (o i suoi prezzi non sono ancora arrivati)." : "I dati di questo indice non sono ancora arrivati."));
    $("riassunto-mappa").textContent = "";
    return;
  }

  if (settoreAperto) {
    // Un settore solo, a tutto schermo
    const s = settori.find((x) => x.nome === settoreAperto);
    $("nome-settore").textContent = `${s.nome} · ${percMappa(s.variazione)} · ${s.voci.length} aziende`;
    for (const r of dividiInRiquadri(s.voci, 0, 0, larghezza, altezza)) area.appendChild(creaRiquadroAzienda(r.voce, r, scala));
  } else if (stretta) {
    // Telefono: prima solo i settori
    for (const r of dividiInRiquadri(settori, 0, 0, larghezza, altezza)) area.appendChild(creaRiquadroSettore(r.voce, r, scala));
  } else {
    // iPad e computer: i settori, e dentro ogni settore le sue aziende
    const ALTEZZA_NOME = 18;
    for (const rs of dividiInRiquadri(settori, 0, 0, larghezza, altezza)) {
      const s = rs.voce;
      const conNome = rs.w >= 70 && rs.h >= 60;
      if (conNome) {
        const nome = crea("button", "testa-settore-mappa");
        nome.type = "button";
        posiziona(nome, { x: rs.x, y: rs.y, w: rs.w, h: ALTEZZA_NOME });
        nome.append(crea("span", "", s.nome), crea("span", classeColore(s.variazione || 0), percMappa(s.variazione)));
        nome.title = `${s.nome}: ${s.voci.length} aziende. Tocca per ingrandire.`;
        nome.onclick = () => apriSettore(s.nome);
        area.appendChild(nome);
      }
      const sopra = conNome ? ALTEZZA_NOME : 0;
      for (const r of dividiInRiquadri(s.voci, rs.x, rs.y + sopra, rs.w - 2, rs.h - sopra - 2)) {
        area.appendChild(creaRiquadroAzienda(r.voce, r, scala));
      }
    }
  }

  // In una riga: quante salite e quante scese, e la media (semplice) dell'indice
  const conDato = aziende.filter((a) => typeof a.variazione === "number");
  const salite = conDato.filter((a) => a.variazione > 0).length;
  const scese = conDato.filter((a) => a.variazione < 0).length;
  const media = conDato.length ? conDato.reduce((s, a) => s + a.variazione, 0) / conDato.length : null;
  const riassunto = $("riassunto-mappa");
  riassunto.innerHTML = "";
  riassunto.append(crea("span", "positivo", `▲ ${salite} salite`), crea("span", "negativo", `▼ ${scese} scese`));
  if (media !== null) riassunto.append(crea("span", "", `media ${percMappa(media)} ${testoPeriodo()}`));
}

// La legenda dei colori: dal −3% al +3% (o la scala del periodo scelto)
function disegnaLegendaMappa() {
  const legenda = $("legenda-mappa");
  legenda.innerHTML = "";
  const scala = scalaPeriodo();
  for (const quota of [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1]) {
    // Numeri tondi: −3%, −2%, −1%, 0%, +1%... (una cifra decimale solo se serve, es. 3,3%)
    const valore = Math.round(quota * scala * 1000) / 10;
    const testo = (valore > 0 ? "+" : valore < 0 ? "−" : "") + String(Math.abs(valore)).replace(".", ",") + "%";
    const passo = crea("span", "passo-legenda", testo);
    passo.style.background = coloreVariazione(quota * scala, scala);
    legenda.appendChild(passo);
  }
}

// I tre selettori in alto (indice, periodo, grandezza)
function disegnaSelettoriMappa() {
  const riempi = (id, scelte, chiave) => {
    const gruppo = $(id);
    gruppo.innerHTML = "";
    for (const [valore, nome] of scelte) {
      const pulsante = crea("button", sceltaMappa[chiave] === valore ? "attivo" : "", nome);
      pulsante.type = "button";
      pulsante.setAttribute("aria-pressed", String(sceltaMappa[chiave] === valore));
      pulsante.onclick = () => {
        sceltaMappa[chiave] = valore;
        if (chiave === "indice") settoreAperto = null;
        try { localStorage.setItem(CHIAVE_SCELTE_MAPPA, JSON.stringify(sceltaMappa)); } catch (errore) { /* pazienza */ }
        disegnaMercato();
      };
      gruppo.appendChild(pulsante);
    }
  };
  riempi("indice-mappa", INDICI_MAPPA, "indice");
  riempi("periodo-mappa", PERIODI_MAPPA, "periodo");
  riempi("grandezza-mappa", GRANDEZZE_MAPPA, "grandezza");
}

// La riga piccola in fondo: da dove arrivano i dati e quanto sono freschi
function disegnaFonteMappa() {
  const elenco = mappa.elenchi[sceltaMappa.indice] || {};
  const sigle = elenco.sigle || [];
  const conCap = sigle.filter((t) => (mappa.titoli[t] || {}).cap > 0).length;
  const parti = [mappa.fonte || "Yahoo Finance (prezzi), Finnhub (logo e capitalizzazione)"];
  if (mappa.aggiornato) parti.push("aggiornata " + momento(mappa.aggiornato));
  if (elenco.aggiornato) parti.push(`elenco ${elenco.nome} del ${dataBreve(elenco.aggiornato)} (${elenco.fonte})`);
  $("fonte-mappa").textContent = parti.join(" · ");
  // Le capitalizzazioni arrivano da Finnhub poco per volta: finché mancano, i riquadri hanno la grandezza media
  const nota = $("nota-mappa");
  const mancano = sigle.length - conCap;
  nota.hidden = sceltaMappa.grandezza === "uguali" || mancano === 0;
  nota.textContent = conCap === 0
    ? "Le capitalizzazioni non sono ancora arrivate da Finnhub: per ora i riquadri sono tutti della stessa grandezza."
    : `${mancano} aziende su ${sigle.length} non hanno ancora la capitalizzazione: hanno un riquadro di grandezza media.`;
}

// ---------- La pagina "Mercato" ----------

function disegnaMercato() {
  $("data-mercato").textContent = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  if (mappa === null) {
    caricaMappa().then(() => { if (vistaAperta === "mercato") disegnaMercato(); });
    return;
  }
  const pronta = Object.keys(mappa.titoli).length > 0;
  $("attesa-mercato").hidden = pronta;
  $("sezione-mappa").hidden = !pronta;
  if (!pronta) return;
  disegnaSelettoriMappa();
  disegnaLegendaMappa();
  disegnaFonteMappa();
  disegnaMappa();
}

// ---------- La pagina di un'azienda che c'è solo nella mappa ----------
// Toccando un riquadro si apre la pagina del titolo. Se gli agenti non seguono quell'azienda
// (non è nella watchlist), mostriamo i numeri della mappa al posto delle loro analisi.

// La valuta dalla Borsa (la parte della sigla dopo il punto): AAPL → USD, SAP.DE → EUR
const VALUTE_BORSE = {
  "": "USD", DE: "EUR", F: "EUR", PA: "EUR", AS: "EUR", MI: "EUR", MC: "EUR", BR: "EUR", HE: "EUR", VI: "EUR",
  LS: "EUR", IR: "EUR", L: "GBp", SW: "CHF", T: "JPY", KS: "KRW", HK: "HKD", TW: "TWD", CO: "DKK", ST: "SEK", OL: "NOK",
};
const valutaDaSigla = (ticker) => VALUTE_BORSE[ticker.includes(".") ? ticker.split(".").pop() : ""] || "";
// L'area dalla valuta: USD → USA, euro e altre valute europee → Europa, yen, won... → Asia
function areaDaSigla(ticker) {
  const valuta = valutaDaSigla(ticker);
  if (valuta === "USD") return "USA";
  if (["JPY", "KRW", "HKD", "TWD"].includes(valuta)) return "Asia";
  return valuta ? "Europa" : "";
}

// La scheda della mappa di un titolo (null se la mappa non lo conosce o non è ancora scaricata)
const datiMappa = (ticker) => (mappa && mappa.titoli[ticker]) || null;

// Vero se di questo titolo sappiamo solo ciò che dice la mappa (nessun agente lo segue)
function soloNellaMappa(ticker) {
  return Boolean(datiMappa(ticker)) && !analisi.titoli[ticker] &&
    !titoli.some((t) => t.ticker === ticker) && !posizioni.some((p) => p.ticker === ticker);
}

// La piccola linea dell'ultimo mese
function disegnaLineaMappa(svg, linea) {
  svg.innerHTML = "";
  const valori = (linea || []).filter((v) => typeof v === "number");
  if (valori.length < 2) { svg.hidden = true; return; }
  svg.hidden = false;
  const minimo = Math.min(...valori), massimo = Math.max(...valori);
  const punti = valori.map((v, i) => `${(i / (valori.length - 1)) * 100},${massimo === minimo ? 20 : 38 - ((v - minimo) / (massimo - minimo)) * 36}`);
  const tratto = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  tratto.setAttribute("points", punti.join(" "));
  tratto.setAttribute("class", valori[valori.length - 1] >= valori[0] ? "sale" : "scende");
  svg.appendChild(tratto);
}

function disegnaDallaMappa() {
  const t = soloNellaMappa(tickerAperto) ? datiMappa(tickerAperto) : null;
  $("sezione-dalla-mappa").hidden = !t;
  // Le parti degli agenti non hanno niente da dire su un'azienda che non seguono: le nascondiamo
  for (const id of ["sezione-tecnico", "sezione-fondamentali", "sezione-avvocato", "sezione-notizie-titolo"]) $(id).hidden = Boolean(t);
  if (!t) return;
  const griglia = $("numeri-dalla-mappa");
  griglia.innerHTML = "";
  for (const [chiave, nome] of PERIODI_MAPPA) {
    const v = t[chiave];
    aggiungiDato(griglia, nome === "1 sett." ? "1 settimana" : nome, percMappa(v), typeof v === "number" ? classeColore(v) : "");
  }
  if (t.cap) aggiungiDato(griglia, "Capitalizzazione", capitalizzazione(t.cap));
  const indici = INDICI_MAPPA.filter(([k]) => ((mappa.elenchi[k] || {}).sigle || []).includes(tickerAperto)).map(([, n]) => n);
  if (indici.length) aggiungiDato(griglia, "Nella mappa", indici.join(", "));
  disegnaLineaMappa($("linea-dalla-mappa"), t.linea);
  $("fonte-dalla-mappa").textContent = `Prezzi di chiusura Yahoo Finance fino al ${dataBreve(t.giorno)}` +
    (mappa.aggiornato ? ` · mappa aggiornata ${momento(mappa.aggiornato)}` : "");
  $("yahoo-dalla-mappa").href = "https://finance.yahoo.com/quote/" + encodeURIComponent(tickerAperto);
}

// Collega i pulsanti della pagina Mercato (lo chiama app.js all'avvio)
function collegaMercato() {
  try {
    const salvate = JSON.parse(localStorage.getItem(CHIAVE_SCELTE_MAPPA) || "{}");
    if (INDICI_MAPPA.some(([k]) => k === salvate.indice)) sceltaMappa.indice = salvate.indice;
    if (PERIODI_MAPPA.some(([k]) => k === salvate.periodo)) sceltaMappa.periodo = salvate.periodo;
    if (GRANDEZZE_MAPPA.some(([k]) => k === salvate.grandezza)) sceltaMappa.grandezza = salvate.grandezza;
  } catch (errore) { /* si parte dalle scelte predefinite */ }
  $("esci-settore").onclick = () => { settoreAperto = null; disegnaMappa(); };
  // Se giri l'iPad (o allarghi la finestra), la mappa si ridisegna con la nuova larghezza
  let inAttesa = false;
  window.addEventListener("resize", () => {
    if (vistaAperta !== "mercato" || inAttesa || !mappa) return;
    inAttesa = true;
    requestAnimationFrame(() => { inAttesa = false; disegnaMappa(); });
  });
}
