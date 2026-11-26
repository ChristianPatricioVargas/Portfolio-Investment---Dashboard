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
  riquadro.setAttribute("aria-label", testo);

  // Il carattere più grande che ci sta: cresce con il riquadro, ma la sigla deve entrare in larghezza
  // (una lettera è larga circa 0,65 volte il carattere) e, se c'è posto, anche la variazione sotto.
  const { w, h } = r;
  const sigla = siglaCorta(a.ticker);
  const variazione = percMappa(a.variazione);
  const perLarghezza = (w - 4) / (Math.max(sigla.length, 3) * 0.65);
  // Nei riquadri piccoli si parte da 9 pixel e si scende solo se la sigla non ci sta (fino a 7, poi niente testo)
  const carattere = Math.min(24, Math.max(Math.sqrt(w * h) / 5.5, 9), perLarghezza, (h - 2) / 1.15);
  let completo = false;
  if (carattere >= 7) {
    riquadro.style.fontSize = carattere.toFixed(1) + "px";
    const latoLogo = Math.min(40, Math.round(Math.min(w, h) / 3));
    if (w >= 60 && h >= carattere * 2.6 + latoLogo + 8 && latoLogo >= 16) riquadro.appendChild(creaLogo(a.t, latoLogo));
    riquadro.appendChild(crea("span", "sigla-mappa", sigla));
    // La variazione si scrive un po' più piccola (0,85): deve stare sotto la sigla e in larghezza
    if (h >= carattere * 2.3 && w - 4 >= variazione.length * carattere * 0.85 * 0.6) {
      riquadro.appendChild(crea("span", "variazione-mappa", variazione));
      completo = true;
    }
  }
  // Sui riquadri dove non si legge tutto, il primo tocco mostra il fumetto con i numeri; il secondo apre la pagina
  riquadro.onclick = () => {
    if (!completo && ultimoPuntatore !== "mouse" && fumettoAperto !== a.ticker) mostraFumettoMappa(a, riquadro, false);
    else vaiAlTitolo(a.ticker);
  };
  // Con il mouse il fumetto compare passandoci sopra
  riquadro.addEventListener("pointerenter", (evento) => { if (evento.pointerType === "mouse") mostraFumettoMappa(a, riquadro, true); });
  return riquadro;
}

// ---------- Il fumetto della mappa: i numeri di un'azienda, anche quando il riquadro è troppo piccolo ----------

let fumettoAperto = null;       // la sigla dell'azienda nel fumetto (null = chiuso)
let ultimoPuntatore = "";       // "mouse", "touch" o "pen": come hai toccato la mappa l'ultima volta

function chiudiFumettoMappa() {
  fumettoAperto = null;
  const fumetto = $("fumetto-mappa");
  if (fumetto) fumetto.hidden = true;
}

// conMouse = true: compare passando con il mouse (niente pulsante: basta un clic sul riquadro per aprire)
function mostraFumettoMappa(a, riquadro, conMouse) {
  const area = $("mappa");
  let fumetto = $("fumetto-mappa");
  if (!fumetto) {
    fumetto = crea("div", "fumetto-mappa");
    fumetto.id = "fumetto-mappa";
    fumetto.setAttribute("role", "status");
  }
  area.appendChild(fumetto);      // la mappa si ridisegna spesso: il fumetto torna sempre in cima
  fumetto.innerHTML = "";
  fumettoAperto = a.ticker;

  const testa = crea("div", "testa-fumetto");
  testa.append(crea("b", "", a.t.nome), crea("span", "tag", siglaCorta(a.ticker)));
  fumetto.appendChild(testa);
  fumetto.appendChild(crea("div", "tenue", [a.t.settore, capitalizzazione(a.t.cap)].filter(Boolean).join(" · ")));
  const righe = crea("dl", "periodi-fumetto");
  for (const [chiave, nome] of PERIODI_MAPPA) {
    const blocco = crea("div", chiave === sceltaMappa.periodo ? "scelto" : "");
    const v = a.t[chiave];
    blocco.append(crea("dt", "", nome), crea("dd", typeof v === "number" ? classeColore(v) : "", percMappa(v)));
    righe.appendChild(blocco);
  }
  fumetto.appendChild(righe);
  if (!conMouse) {
    const apri = crea("button", "pulsante apri-fumetto", "Apri la pagina ›");
    apri.type = "button";
    apri.onclick = () => vaiAlTitolo(a.ticker);
    fumetto.appendChild(apri);
  }
  // Con il mouse il fumetto non deve "rubare" il puntatore ai riquadri sotto
  fumetto.style.pointerEvents = conMouse ? "none" : "auto";
  fumetto.hidden = false;

  // Il fumetto sta sopra il riquadro (o sotto, se sopra non c'è posto), sempre dentro la mappa
  const larghezza = area.clientWidth, altezza = area.clientHeight;
  const x = riquadro.offsetLeft + riquadro.offsetWidth / 2, y = riquadro.offsetTop;
  const lf = fumetto.offsetWidth, hf = fumetto.offsetHeight;
  fumetto.style.left = Math.max(4, Math.min(larghezza - lf - 4, x - lf / 2)) + "px";
  const sopra = y - hf - 6;
  fumetto.style.top = (sopra >= 4 ? sopra : Math.min(altezza - hf - 4, y + riquadro.offsetHeight + 6)) + "px";
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
  fumettoAperto = null;
  const larghezza = area.clientWidth;
  if (!larghezza) return;
  const stretta = larghezza < MAPPA_STRETTA;
  const scala = scalaPeriodo();
  const aziende = aziendeDellaMappa();
  const settori = settoriDellaMappa(aziende);
  // Se il settore ingrandito non c'è nell'indice scelto, torniamo a tutti i settori
  if (settoreAperto && !settori.some((s) => s.nome === settoreAperto)) settoreAperto = null;

  // L'altezza: un rettangolo largo sull'iPad, più alto che largo sul telefono.
  // Con tante aziende (l'S&P 500 ne ha circa 500) la mappa è più alta, così i riquadri non diventano minuscoli.
  const tante = aziende.length > 150;
  const altezza = stretta ? Math.round(Math.min(Math.max(larghezza * (tante && settoreAperto ? 1.6 : 1.25), 380), 760))
    : Math.round(Math.min(Math.max(larghezza * (tante ? (larghezza < 900 ? 1.05 : 0.82) : 0.6), 420), tante ? 940 : 780));
  area.style.height = altezza + "px";

  $("percorso-mappa").hidden = !settoreAperto;
  $("aiuto-mappa").textContent = settoreAperto
    ? "Tocca un'azienda per aprire la sua pagina. Sui riquadri piccoli il primo tocco mostra i numeri."
    : stretta ? "Tocca un settore per ingrandirlo, poi un'azienda per aprire la sua pagina."
      : "Tocca un'azienda per aprire la sua pagina, o il nome di un settore per ingrandirlo. Sui riquadri piccoli il primo tocco mostra i numeri.";

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
    : mancano === 1 ? `1 azienda su ${sigle.length} non ha ancora la capitalizzazione: ha un riquadro di grandezza media.`
      : `${mancano} aziende su ${sigle.length} non hanno ancora la capitalizzazione: hanno un riquadro di grandezza media.`;
}

// ---------- La pagina "Mercato" ----------

function disegnaMercato() {
  $("data-mercato").textContent = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  if (mappa === null || datiMercato === null) {
    Promise.all([caricaMappa(), caricaDatiMercato()]).then(() => { if (vistaAperta === "mercato") disegnaMercato(); });
    return;
  }
  disegnaPauraEMacro();
  disegnaQuotazioni();
  const pronta = Object.keys(mappa.titoli).length > 0;
  $("attesa-mercato").hidden = pronta || !$("sezione-paura").hidden || !$("sezione-macro").hidden;
  // Arrivi dall'avviso della pagina Oggi: scendiamo subito alle quotazioni
  if (vaiAlleQuotazioni) {
    vaiAlleQuotazioni = false;
    requestAnimationFrame(() => $("sezione-quotazioni").scrollIntoView({ block: "start" }));
  }
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
  // Ricordiamo se stai usando il mouse o il dito: il fumetto si comporta in modo diverso
  $("mappa").addEventListener("pointerdown", (evento) => { ultimoPuntatore = evento.pointerType; }, true);
  $("mappa").addEventListener("pointerleave", (evento) => { if (evento.pointerType === "mouse") chiudiFumettoMappa(); });
  // Un tocco fuori dalla mappa chiude il fumetto
  document.addEventListener("pointerdown", (evento) => {
    if (fumettoAperto && !evento.target.closest("#mappa")) chiudiFumettoMappa();
  });
  $("oggi-quotazioni").addEventListener("click", () => { vaiAlleQuotazioni = true; });
  // Se giri l'iPad (o allarghi la finestra), la mappa si ridisegna con la nuova larghezza
  let inAttesa = false;
  window.addEventListener("resize", () => {
    if (vistaAperta !== "mercato" || inAttesa || !mappa) return;
    inAttesa = true;
    requestAnimationFrame(() => { inAttesa = false; disegnaMappa(); });
  });
}

// ---------- Paura e avidità, numeri dell'economia (da data/mercato.json) ----------

let datiMercato = null;           // il file piccolo con paura e avidità e i numeri dell'economia
let caricamentoDatiMercato = null;

// Scarica data/mercato.json una volta sola (lo usa anche la pagina Oggi)
function caricaDatiMercato() {
  if (!caricamentoDatiMercato) {
    caricamentoDatiMercato = fetch("data/mercato.json", { cache: "no-store" })
      .then((risposta) => (risposta.ok ? risposta.json() : null))
      .catch(() => null)
      .then((dati) => { datiMercato = dati || {}; });
  }
  return caricamentoDatiMercato;
}

// Le fasce dell'umore (le stesse di scripts/agenti/mercato.py): [fino a, colore]
const FASCE_PAURA = [[25, "var(--rosso)"], [47, "var(--ambra)"], [55, "var(--testo-tenue)"], [76, "var(--verde)"], [100, "var(--verde)"]];

// Un punto sul semicerchio: 0 = tutto a sinistra, 100 = tutto a destra
function puntoArco(valore, raggio) {
  const angolo = Math.PI * (1 - valore / 100);
  return [60 + raggio * Math.cos(angolo), 60 - raggio * Math.sin(angolo)];
}

// Il semicerchio con la lancetta, come un contachilometri
function creaQuadrante(valore) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 120 66");
  svg.setAttribute("class", "quadrante-paura");
  svg.setAttribute("aria-hidden", "true");
  let inizio = 0;
  for (const [fine, colore] of FASCE_PAURA) {
    const [x1, y1] = puntoArco(inizio + 0.8, 48);
    const [x2, y2] = puntoArco(fine - 0.8, 48);
    const arco = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arco.setAttribute("d", `M ${x1.toFixed(2)} ${y1.toFixed(2)} A 48 48 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`);
    arco.setAttribute("class", "fascia-paura");
    arco.style.stroke = colore;
    // La fascia in cui sta il valore è piena, le altre più chiare
    arco.style.opacity = valore >= inizio && valore <= fine ? "1" : "0.3";
    svg.appendChild(arco);
    inizio = fine;
  }
  const [x, y] = puntoArco(valore, 40);
  const lancetta = document.createElementNS("http://www.w3.org/2000/svg", "line");
  lancetta.setAttribute("x1", "60"); lancetta.setAttribute("y1", "60");
  lancetta.setAttribute("x2", x.toFixed(2)); lancetta.setAttribute("y2", y.toFixed(2));
  lancetta.setAttribute("class", "lancetta-paura");
  const perno = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  perno.setAttribute("cx", "60"); perno.setAttribute("cy", "60"); perno.setAttribute("r", "3.5");
  perno.setAttribute("class", "perno-paura");
  svg.append(lancetta, perno);
  return svg;
}

// Un indicatore: titolo, semicerchio, numero, parola e com'era prima
function disegnaIndicatorePaura(contenitore, titolo, dato) {
  contenitore.innerHTML = "";
  contenitore.appendChild(crea("div", "titolo-paura", titolo));
  if (!dato || typeof dato.valore !== "number") {
    contenitore.appendChild(crea("p", "vuoto", "Non ancora disponibile."));
    return;
  }
  contenitore.appendChild(creaQuadrante(dato.valore));
  const numero = crea("div", "valore-paura");
  numero.append(crea("b", "", String(dato.valore)), crea("span", "", dato.umore || ""));
  contenitore.appendChild(numero);
  contenitore.setAttribute("aria-label", `${titolo}: ${dato.valore} su 100, ${dato.umore}`);
  const prima = [["ieri", "ieri"], ["settimana", "1 settimana fa"], ["mese", "1 mese fa"]]
    .filter(([k]) => typeof dato[k] === "number").map(([k, nome]) => `${nome} ${dato[k]}`);
  if (prima.length) contenitore.appendChild(crea("div", "prima-paura", prima.join(" · ")));
}

// "2026-10" → "ottobre 2026"
function meseIt(testo) {
  if (!testo) return "";
  const [anno, mese] = testo.split("-").map(Number);
  return new Date(anno, mese - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

const tassoIt = (n) => numeroIt(n, 2) + "%";

function disegnaPauraEMacro() {
  const d = datiMercato || {};
  const lento = d.lento || {};
  const azioni = d.pauraAzioni, cripto = lento.cripto;

  // Paura e avidità
  $("sezione-paura").hidden = !azioni && !cripto;
  disegnaIndicatorePaura($("paura-azioni"), "Azioni (S&P 500)", azioni);
  disegnaIndicatorePaura($("paura-cripto"), "Criptovalute", cripto);
  const pezzi = $("pezzi-paura");
  pezzi.innerHTML = "";
  for (const p of (azioni && azioni.pezzi) || []) {
    const voce = crea("li");
    voce.append(crea("b", "", `${p.nome}: ${p.valore}`), crea("span", "", ` (${p.testo})`));
    pezzi.appendChild(voce);
  }
  $("spiega-paura").hidden = !azioni;
  $("fonte-paura").textContent = [
    azioni ? `Azioni: calcolo nostro su prezzi Yahoo Finance fino al ${dataBreve(azioni.giorno)}` : "",
    cripto ? `Cripto: alternative.me, ${dataBreve(cripto.giorno)}` : "",
  ].filter(Boolean).join(" · ");

  // I numeri dell'economia
  const griglia = $("numeri-macro");
  griglia.innerHTML = "";
  const { bce, fed, inflazioneEuro: ie, inflazioneUsa: iu } = lento;
  if (bce) aggiungiDato(griglia, "Tasso BCE (depositi)", tassoIt(bce.valore), "",
    `dal ${dataBreve(bce.data)}` + (typeof bce.prima === "number" && bce.prima !== bce.valore ? `, prima ${tassoIt(bce.prima)}` : ""));
  if (fed) aggiungiDato(griglia, "Tasso Fed", `${numeroIt(fed.da, 2)}–${tassoIt(fed.a)}`, "",
    typeof fed.effettivo === "number" ? `effettivo ${tassoIt(fed.effettivo)} il ${dataBreve(fed.data)}` : "");
  const inflazione = (nome, dato) => {
    if (!dato) return;
    const nota = meseIt(dato.mese) + (typeof dato.prima === "number" ? `, il mese prima ${numeroIt(dato.prima, 1)}%` : "");
    aggiungiDato(griglia, nome, numeroIt(dato.valore, 1) + "%", "", nota);
  };
  inflazione("Inflazione area euro", ie);
  inflazione("Inflazione USA", iu);
  for (const m of d.mercati || []) {
    const valore = m.sigla === "EURUSD=X" ? numeroIt(m.prezzo, 4) : numeroIt(m.prezzo, m.prezzo >= 1000 ? 0 : 2) + " " + m.unita;
    const nota = [typeof m.oggi === "number" ? `${testoVariazione(m.oggi)} oggi` : "",
                  typeof m.anno === "number" ? `${percUno(m.anno, true)} da inizio anno` : ""].filter(Boolean).join(" · ");
    aggiungiDato(griglia, m.nome, valore, "", nota);
  }
  $("sezione-macro").hidden = griglia.children.length === 0;
  $("fonte-macro").textContent = "Fonti: BCE, Fed di New York, Eurostat, ufficio statistico USA (BLS), Yahoo Finance" +
    (d.aggiornato ? ` · controllati ${momento(d.aggiornato)}` : "");
}

// ---------- Le nuove quotazioni in Borsa (IPO) ----------

let vaiAlleQuotazioni = false;    // true = hai toccato l'avviso nella pagina Oggi

const STATI_QUOTAZIONE = { expected: "prevista", priced: "prezzo fissato", filed: "domanda depositata" };

// "2026-12-03" → la data di quel giorno a mezzanotte (ora del dispositivo)
const giornoDa = (testo) => { const [a, m, g] = testo.split("-").map(Number); return new Date(a, m - 1, g); };

// Le quotazioni della settimana in corso (da lunedì a domenica)
function quotazioniDellaSettimana(elenco) {
  const oggi = new Date();
  const lunedi = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - ((oggi.getDay() + 6) % 7));
  const lunediDopo = new Date(lunedi.getFullYear(), lunedi.getMonth(), lunedi.getDate() + 7);
  return (elenco || []).filter((q) => q.data && giornoDa(q.data) >= lunedi && giornoDa(q.data) < lunediDopo);
}

// 125000000 → "125 milioni $", 2500000000 → "2,5 miliardi $"
function soldiInDollari(numero) {
  if (!(numero > 0)) return "";
  return numero >= 1e9 ? numeroIt(numero / 1e9, 1) + " miliardi $" : numeroIt(numero / 1e6, 0) + " milioni $";
}

// Il prezzo (o la forchetta di prezzo) di Finnhub all'italiana: "15.00-17.00" → "15–17 $"
function prezzoQuotazione(testo) {
  const numeri = String(testo).split("-").map(Number);
  if (numeri.some((n) => !Number.isFinite(n) || n <= 0)) return String(testo);
  return numeri.map((n) => numeroIt(n, n % 1 ? 2 : 0)).join("–") + " $";
}

function creaSchedaQuotazione(q, settimana) {
  const scheda = crea("div", "scheda-quotazione" + (q.tipo === "piccola" ? " da-osservare" : ""));
  const giorno = giornoDa(q.data);
  const passata = giorno < new Date(new Date().toDateString());
  // A sinistra la data, come un foglio di calendario
  const data = crea("div", "data-quotazione");
  data.append(crea("span", "giorno-quotazione", String(giorno.getDate())),
    crea("span", "", giorno.toLocaleDateString("it-IT", { month: "short" })),
    crea("span", "", giorno.toLocaleDateString("it-IT", { weekday: "short" })));
  scheda.appendChild(data);

  const info = crea("div", "info-quotazione");
  const nome = crea("div", "nome-quotazione");
  nome.append(crea("b", "", q.nome));
  if (q.sigla) nome.append(crea("span", "tag", q.sigla));
  nome.append(crea("span", "etichetta-quotazione " + q.tipo, q.tipo === "grande" ? "Grande quotazione" : "Da osservare"));
  if (settimana.includes(q)) nome.append(crea("span", "etichetta-quotazione settimana", passata ? "Quotata questa settimana" : "Questa settimana"));
  info.appendChild(nome);
  info.appendChild(crea("div", "descrizione-quotazione", q.descrizione || "Cosa fa: descrizione non ancora disponibile."));
  const dettagli = [
    q.motivo,
    q.borsa,
    q.prezzo ? `prezzo ${prezzoQuotazione(q.prezzo)}` : "",
    q.raccolta ? `raccolta ${soldiInDollari(q.raccolta)}` : "",
    passata ? "già quotata" : STATI_QUOTAZIONE[q.stato] || "",
  ].filter(Boolean);
  info.appendChild(crea("div", "dettagli-quotazione", dettagli.join(" · ")));
  if (q.fonteDescrizione) info.lastChild.title = "Descrizione: " + q.fonteDescrizione;
  scheda.appendChild(info);
  return scheda;
}

function disegnaQuotazioni() {
  const quotazioni = (datiMercato || {}).quotazioni || {};
  const elenco = quotazioni.elenco || [];
  const settimana = quotazioniDellaSettimana(elenco);
  const contenitore = $("elenco-quotazioni");
  contenitore.innerHTML = "";
  for (const q of elenco) contenitore.appendChild(creaSchedaQuotazione(q, settimana));
  // Il riquadro si vede sempre (se la pagina ha i dati del mercato), anche vuoto: così sai che la funzione c'è
  $("sezione-quotazioni").hidden = !datiMercato || !datiMercato.aggiornato;
  const vuoto = $("vuoto-quotazioni");
  vuoto.hidden = elenco.length > 0;
  vuoto.textContent = quotazioni.aggiornato
    ? "Nessuna quotazione che rispetta i filtri tra la settimana scorsa e il prossimo mese."
    : "Le nuove quotazioni arriveranno con il prossimo giro degli agenti (verso le 13 e la sera).";
  $("fonte-quotazioni").textContent = quotazioni.aggiornato
    ? `Fonti: calendario delle quotazioni di Finnhub, descrizioni da Wikipedia · controllate il ${dataBreve(quotazioni.aggiornato)}` : "";
}

// L'avviso nella pagina Oggi: le quotazioni di questa settimana
function disegnaAvvisoQuotazioni() {
  if (datiMercato === null) {
    caricaDatiMercato().then(() => { if (vistaAperta === "oggi") disegnaAvvisoQuotazioni(); });
    return;
  }
  const settimana = quotazioniDellaSettimana(((datiMercato || {}).quotazioni || {}).elenco);
  const voci = $("voci-quotazioni");
  voci.innerHTML = "";
  for (const q of settimana) {
    const voce = crea("span", "voce-mercato");
    const giorno = giornoDa(q.data).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
    voce.append(crea("b", "", q.nome), crea("span", "tenue", `${giorno}${q.tipo === "piccola" ? " · da osservare" : ""}`));
    voci.appendChild(voce);
  }
  $("oggi-quotazioni").hidden = settimana.length === 0;
}
