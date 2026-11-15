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

const SIMBOLI_STATO = { bene: "🎯", attenzione: "⚠️", neutro: "•" };

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

function disegnaOggi() {
  $("data-oggi").textContent = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const haTitoli = posizioni.length > 0;
  $("oggi-vuoto").hidden = haTitoli;
  $("oggi-portafoglio").hidden = !haTitoli;
  $("oggi-titoli").hidden = !haTitoli;

  // ---- 1. Come va il portafoglio ----
  if (haTitoli) {
    const r = riepilogoPortafoglio();
    $("oggi-valore").textContent = r.completo ? euro(r.valore) : "–";
    const chip = $("oggi-gp");
    chip.textContent = r.completo ? `${r.gp >= 0 ? "▲" : "▼"} ${euro(r.gp, true)} · ${percentuale(r.gp / r.investito)} dall'inizio` : "";
    chip.className = "chip " + (r.completo ? classeColore(r.gp) : "");
    const giorno = $("oggi-variazione");
    giorno.textContent = r.completo && r.valoreIeri > 0
      ? `Oggi ${euro(r.variazioneOggi, true)} · ${percentuale(r.variazioneOggi / r.valoreIeri)}` : "In attesa dei prezzi";
    giorno.className = "sotto " + (r.completo ? classeColore(r.variazioneOggi) : "");
    $("oggi-fonte").textContent = Object.keys(prezzi).length ? testoFonte(posizioni.map((p) => p.ticker)) : "";
  }

  // ---- 2. Cosa è successo ai miei titoli ----
  const elencoTitoli = $("elenco-oggi-titoli");
  elencoTitoli.innerHTML = "";
  for (const posizione of posizioni) {
    const ticker = posizione.ticker;
    const r = calcola(posizione);
    const f = (analisi.titoli[ticker] || {}).fondamentali;
    const notizia = (notizie[ticker] || []).find((n) => typeof n.link === "string" && n.link.startsWith("https://"));
    const giorni = f && f.prossimaTrimestrale ? giorniA(f.prossimaTrimestrale) : null;
    elencoTitoli.appendChild(creaRigaOggi(
      ticker,
      r && r.oggi !== null ? "oggi " + percentuale(r.oggi) : "–",
      r && r.oggi !== null ? classeColore(r.oggi) : "",
      [
        r ? `Dall'acquisto ${percentuale(r.gpPerc)} · prezzo ${euro(r.prezzo)}` : "In attesa del prezzo",
        notizia ? `📰 ${notizia.titolo} (${tempoFa(notizia.data)})` : null,
        giorni !== null && giorni >= 0 && giorni <= GIORNI_AVVISO_TRIMESTRALE ? `📅 Trimestrale ${testoTrimestrale(f)}` : null,
        rischioPrincipale(ticker) ? `${testoCampanelli(ticker)} · ${campanelliDi(ticker).map((c) => c.titolo.toLowerCase()).join(", ")}` : null,
      ]));
  }

  // ---- 3. Le mie tesi (solo azioni: gli ETF sono di lungo termine) ----
  const azioni = posizioni.filter((p) => infoTitolo(p.ticker).tipo !== "ETF");
  $("oggi-tesi").hidden = azioni.length === 0;
  const elencoTesi = $("elenco-oggi-tesi");
  elencoTesi.innerHTML = "";
  for (const posizione of azioni) {
    const stato = statoTesi(posizione.ticker);
    const a = avanzamentoTesi(posizione.ticker);
    elencoTesi.appendChild(creaRigaOggi(
      posizione.ticker,
      a ? `target ${euro(a.target)}` : "",
      "",
      [`${SIMBOLI_STATO[stato.livello]} ${stato.testo}`]));
  }

  // ---- 4. Le migliori occasioni del cacciatore ----
  const migliori = occasioni(3).slice(0, OCCASIONI_IN_EVIDENZA);
  const elencoOccasioni = $("elenco-oggi-occasioni");
  elencoOccasioni.innerHTML = "";
  for (const [i, ticker] of migliori.entries()) {
    elencoOccasioni.appendChild(creaSchedaOccasione(ticker, i + 1,
      rischioPrincipale(ticker) ? "⚠️ Rischio principale: " + rischioPrincipale(ticker) : "Nessun campanello d'allarme dalle regole."));
  }
  $("oggi-occasioni-vuoto").hidden = migliori.length > 0;
  $("oggi-occasioni-vuoto").textContent = fonteFondamentaliChiusa()
    ? "La classifica non è disponibile: mancano i fondamentali (vedi la nota in fondo alla pagina)."
    : analisi.classifica
    ? "Oggi nessuna azienda della watchlist ha almeno 3 segnali su 4."
    : "⏳ Le occasioni arriveranno con il prossimo giro degli agenti.";

  $("oggi-aggiornamento").textContent = analisi.aggiornato
    ? `Gli agenti hanno lavorato l'ultima volta ${momento(analisi.aggiornato)} (due volte al giorno: verso le 13 e la sera).` +
      (fonteFondamentaliChiusa() ? ` ⚠️ ${fonteFondamentaliChiusa()}: fondamentali, classifica e campanelli sui conti non sono aggiornati.` : "")
    : "Gli agenti non hanno ancora lavorato: lavorano due volte al giorno, verso le 13 e la sera.";
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
  $("copia-analisi").onclick = copiaPerAnalisi;
}
