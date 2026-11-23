// agenti/disciplina.js = la pagina "DISCIPLINA": quanto segui le TUE regole.
// Non guarda il guadagno: guarda se scrivi la tesi prima di comprare, se dai un motivo quando vendi,
// se ricontrolli le tesi, se rifletti sulle tue scelte. Un'uscita motivata non è mai un errore.
// Contiene:
//   1. il voto "la tesi era giusta?" e gli errori più comuni, che scegli quando vendi
//   2. il diario delle operazioni (data, prezzo, motivo) e le statistiche sugli errori
//   3. i titoli che hai venduto del tutto (con la possibilità di annullare l'ultima vendita)
//
// Tutto è PERSONALE: resta solo nel browser di questo dispositivo ed è incluso nel backup.
// Gli agenti su GitHub e l'AI non vedono niente di tutto questo.
// Questo file contiene solo funzioni: le chiama app.js.

// ---------- 1. Il voto sulla tesi e gli errori ----------

// Il voto che dai alla tesi quando vendi. "" (nessun voto) = "Non so ancora": lo puoi dare dopo, nel diario.
const VOTI = {
  "giusta": "Sì",
  "in-parte": "In parte",
  "sbagliata": "No",
};

// Gli errori più comuni: ne scegli uno (facoltativo) quando la tesi era giusta solo in parte o era sbagliata
const ERRORI = {
  "senza-tesi": "Ho comprato senza una tesi chiara",
  "troppo-presto": "Sono entrato troppo presto (il prezzo è sceso ancora)",
  "conti": "Ho sopravvalutato i conti dell'azienda",
  "target-alto": "Il target era troppo ottimista",
  "ignorato-uscita": "Ho ignorato una mia condizione di uscita",
  "impulso": "Ho deciso d'impulso (paura o entusiasmo)",
  "imprevisto": "È successo un fatto che non potevo prevedere",
  "altro": "Altro",
};

// Crea i quattro pulsanti del voto (Sì / In parte / No / Non so ancora) dentro un contenitore.
// Sono "radio": se ne sceglie uno solo. alCambio(voto) viene chiamata quando cambi scelta.
let numeroScelteVoto = 0;   // per dare un nome diverso a ogni gruppo di pulsanti
function creaSceltaVoto(contenitore, valore, alCambio) {
  contenitore.innerHTML = "";
  contenitore.classList.add("scelta-voto");
  contenitore.setAttribute("role", "radiogroup");
  const nome = "voto-" + ++numeroScelteVoto;
  for (const [chiave, testo] of [...Object.entries(VOTI), ["", "Non so ancora"]]) {
    const etichetta = document.createElement("label");
    etichetta.innerHTML = `<input type="radio"><span></span>`;
    const pulsante = etichetta.querySelector("input");
    pulsante.name = nome;
    pulsante.value = chiave;
    pulsante.checked = (valore || "") === chiave;
    pulsante.onchange = () => alCambio(chiave);
    etichetta.querySelector("span").textContent = testo;
    contenitore.appendChild(etichetta);
  }
}

// Il voto scelto in un gruppo di pulsanti ("" = non so ancora)
function votoScelto(contenitore) {
  const scelto = contenitore.querySelector("input:checked");
  return scelto ? scelto.value : "";
}

// Riempie il menu degli errori
function riempiErrori(menu, valore) {
  menu.innerHTML = "";
  for (const [chiave, testo] of [["", "— scegli (facoltativo) —"], ...Object.entries(ERRORI)]) {
    const opzione = document.createElement("option");
    opzione.value = chiave;
    opzione.textContent = testo;
    menu.appendChild(opzione);
  }
  menu.value = ERRORI[valore] ? valore : "";
}

// Il menu degli errori serve solo se la tesi era giusta in parte o sbagliata
const serveErrore = (voto) => voto === "in-parte" || voto === "sbagliata";

// ---------- 2. Il diario delle operazioni ----------
// Mette insieme, in ordine di data (le più recenti in alto), acquisti e vendite dei titoli che hai
// e di quelli che hai venduto del tutto.

const OPERAZIONI_VISIBILI = 12;   // quante se ne vedono prima di "Mostra tutte"
let diarioTutto = false;

// Tutte le operazioni: [{ tipo, ticker, nome, tipoTitolo, data, quote, importo, prezzo, motivo, vendita, chiusa }]
// "vendita" è proprio l'oggetto salvato: cambiandolo (voto, errore) e salvando, cambia il dato vero.
function operazioniDiario() {
  const elenco = [];
  const aggiungi = (p, nome, tipoTitolo, chiusa) => {
    for (const a of p.acquisti) {
      elenco.push({ tipo: "acquisto", ticker: p.ticker, nome, tipoTitolo, data: a.data || "", quote: a.quote, importo: a.investito,
        prezzo: a.investito / a.quote, motivo: a.motivo || "", tesiPronta: a.tesiPronta, chiusa });
    }
    for (const v of contaOperazioni(p).vendite) {
      elenco.push({ tipo: "vendita", ticker: p.ticker, nome, tipoTitolo, data: v.data, quote: v.quote, importo: v.incassato,
        prezzo: v.incassato / v.quote, motivo: v.motivo, guadagno: v.guadagno, vendita: p.vendite[v.indice], chiusa });
    }
  };
  for (const p of posizioni) aggiungi(p, infoTitolo(p.ticker).nome, infoTitolo(p.ticker).tipo || "", false);
  for (const c of chiuse) aggiungi(c, c.nome || c.ticker, c.tipo, true);
  // Le più recenti in alto; nello stesso giorno la vendita sopra l'acquisto
  return elenco.sort((x, y) => y.data.localeCompare(x.data) || (x.tipo === "vendita" ? -1 : 1));
}

// Salva sia le posizioni sia le operazioni chiuse (un voto può stare in una delle due)
function salvaOperazioni() {
  salvaPosizioni();
  salvaChiuse();
}

function disegnaDiario() {
  const elenco = operazioniDiario();
  const contenitore = $("elenco-diario");
  contenitore.innerHTML = "";
  const visibili = diarioTutto ? elenco : elenco.slice(0, OPERAZIONI_VISIBILI);
  for (const o of visibili) {
    const voce = crea("div", "voce-diario" + (o.tipo === "vendita" ? " vendita" : ""));
    // Riga 1: data, tipo (scritto, non solo colorato), titolo; a destra il prezzo
    const testa = crea("div", "testa-diario");
    testa.append(crea("span", "data-diario", dataBreve(o.data)),
      crea("span", "tipo-diario " + o.tipo, o.tipo === "vendita" ? "Vendita" : "Acquisto"),
      crea("b", "", o.nome),
      crea("span", "numero prezzo-diario", "a " + euro(o.prezzo)));
    voce.appendChild(testa);
    // Riga 2: quote e importo (e il guadagno, per le vendite)
    const dettagli = [`${quote(o.quote)} quote · ${euro(o.importo)}`];
    if (o.tipo === "vendita") dettagli.push(`${o.guadagno >= 0 ? "guadagno" : "perdita"} ${euro(o.guadagno, true)}`);
    if (o.chiusa) dettagli.push("titolo venduto del tutto");
    voce.appendChild(crea("span", "dettaglio-oggi", dettagli.join(" · ")));
    // Riga 3: il motivo
    const motivo = o.motivo || (o.tipo === "acquisto" && o.tesiPronta === false ? "— (tesi non scritta quando hai comprato)" : "—");
    voce.appendChild(crea("span", "motivo-diario", "Perché: " + motivo));
    // Per le vendite: il voto sulla tesi, che puoi dare o cambiare qui
    if (o.tipo === "vendita") voce.appendChild(creaVotoDiario(o.vendita));
    contenitore.appendChild(voce);
  }
  $("diario-vuoto").hidden = elenco.length > 0;
  const altre = $("altre-operazioni");
  altre.hidden = elenco.length <= OPERAZIONI_VISIBILI;
  altre.textContent = diarioTutto ? "Mostra meno" : `Mostra tutte (${elenco.length})`;
}

// Il voto di una vendita nel diario: i pulsanti e, se serve, il menu dell'errore
function creaVotoDiario(vendita) {
  const blocco = crea("div", "voto-diario");
  blocco.appendChild(crea("span", "etichetta-voto", "La tesi era giusta?"));
  const scelte = crea("div");
  const menu = crea("select", "errore-diario");
  menu.setAttribute("aria-label", "Cosa non ha funzionato");
  riempiErrori(menu, vendita.errore);
  menu.hidden = !serveErrore(vendita.voto);
  creaSceltaVoto(scelte, vendita.voto, (voto) => {
    if (voto) vendita.voto = voto; else delete vendita.voto;
    if (!serveErrore(voto)) delete vendita.errore;
    salvaOperazioni();
    disegnaDisciplina();
  });
  menu.onchange = () => {
    if (menu.value) vendita.errore = menu.value; else delete vendita.errore;
    salvaOperazioni();
    disegnaDisciplina();
  };
  blocco.append(scelte, menu);
  return blocco;
}

// ---------- Le statistiche: come sono andate le tue tesi, e gli errori più frequenti ----------

function disegnaStatistiche() {
  const operazioni = operazioniDiario();
  const vendite = operazioni.filter((o) => o.tipo === "vendita");
  const conta = (filtro) => vendite.filter(filtro).length;
  const griglia = $("numeri-diario");
  griglia.innerHTML = "";
  aggiungiDato(griglia, "Vendite", String(vendite.length));
  aggiungiDato(griglia, "Tesi giusta", String(conta((o) => o.vendita.voto === "giusta")));
  aggiungiDato(griglia, "In parte", String(conta((o) => o.vendita.voto === "in-parte")));
  aggiungiDato(griglia, "Sbagliata", String(conta((o) => o.vendita.voto === "sbagliata")));
  aggiungiDato(griglia, "Da votare", String(conta((o) => !o.vendita.voto)), conta((o) => !o.vendita.voto) ? "attenzione" : "");
  aggiungiDato(griglia, "Uscite prima del target", String(conta((o) => o.vendita.primaDelTarget)), "",
    "con un motivo: non sono errori");

  // Gli errori più frequenti: quelli che hai scelto tu, più uno che la pagina conta da sola
  // (gli acquisti di azioni fatti quando la tesi non era ancora scritta)
  const conteggi = {};
  for (const o of vendite) if (o.vendita.errore) conteggi[o.vendita.errore] = (conteggi[o.vendita.errore] || 0) + 1;
  const senzaTesi = operazioni.filter((o) => o.tipo === "acquisto" && o.tesiPronta === false).length;
  const righe = Object.entries(conteggi).map(([chiave, numero]) => [ERRORI[chiave], numero]);
  if (senzaTesi) righe.push(["Acquisti di azioni senza tesi scritta (contati dalla pagina)", senzaTesi]);
  righe.sort((a, b) => b[1] - a[1]);

  const barre = $("errori-frequenti");
  barre.innerHTML = "";
  const massimo = Math.max(1, ...righe.map((r) => r[1]));
  for (const [testo, numero] of righe.slice(0, 6)) {
    const riga = crea("div", "riga-errore");
    const barra = crea("span", "barra-errore");
    barra.appendChild(crea("span")).style.width = `${(numero / massimo) * 100}%`;
    riga.append(crea("span", "testo-errore", testo), crea("span", "numero", String(numero)), barra);
    barre.appendChild(riga);
  }
  $("errori-vuoto").hidden = righe.length > 0;
  $("errori-vuoto").textContent = vendite.length
    ? "Nessun errore segnato. Quando una tesi è giusta solo in parte o è sbagliata, nel voto puoi scegliere cosa non ha funzionato."
    : "Le statistiche compariranno dopo le prime vendite.";
}

// ---------- 3. I titoli venduti del tutto ----------

function disegnaChiuse() {
  const contenitore = $("elenco-chiuse");
  contenitore.innerHTML = "";
  $("disciplina-chiuse").hidden = chiuse.length === 0;
  chiuse.map((c, indice) => ({ c, indice }))
    .sort((a, b) => b.c.chiusa.localeCompare(a.c.chiusa))
    .forEach(({ c, indice }) => {
      const conti = contaOperazioni({ acquisti: c.acquisti, vendite: c.vendite });
      const voce = crea("div", "voce-chiusa");
      const testa = crea("div", "testa-riga");
      testa.append(crea("b", "", c.nome || c.ticker),
        crea("span", "numero " + classeColore(conti.realizzato), euro(conti.realizzato, true)));
      voce.appendChild(testa);
      voce.appendChild(crea("span", "dettaglio-oggi",
        `Venduto del tutto il ${dataBreve(c.chiusa)} · ${c.acquisti.length} ${c.acquisti.length === 1 ? "acquisto" : "acquisti"}, ` +
        `${c.vendite.length} ${c.vendite.length === 1 ? "vendita" : "vendite"}`));
      if (c.tesi && c.tesi.motivo) voce.appendChild(crea("span", "motivo-diario", "La tesi era: " + c.tesi.motivo.split("\n")[0]));
      // Per rimediare a una vendita inserita per sbaglio
      const annulla = crea("button", "link", "Annulla l'ultima vendita");
      annulla.type = "button";
      annulla.onclick = () => riapriChiusa(indice);
      voce.appendChild(annulla);
      contenitore.appendChild(voce);
    });
}

// Toglie l'ultima vendita di un titolo venduto del tutto: il titolo torna nel portafoglio (con la sua tesi)
function riapriChiusa(indice) {
  const c = chiuse[indice];
  if (!confirm(`Vuoi annullare l'ultima vendita di ${c.nome || c.ticker}? Il titolo torna nel portafoglio.`)) return;
  const vendite = c.vendite.slice().sort((a, b) => a.data.localeCompare(b.data));
  const ultima = vendite[vendite.length - 1];
  const restanti = c.vendite.filter((v) => v !== ultima);
  // Se nel frattempo l'hai ricomprato, le operazioni si uniscono
  const giaAperta = posizioni.find((p) => p.ticker === c.ticker);
  const acquisti = [...c.acquisti, ...(giaAperta ? giaAperta.acquisti : [])];
  const tutteVendite = [...restanti, ...(giaAperta ? giaAperta.vendite || [] : [])];
  if (!contaOperazioni({ acquisti, vendite: tutteVendite }).valida) {
    alert("Non riesco a riaprire questo titolo: le operazioni non tornano. Controlla gli acquisti nella pagina del titolo.");
    return;
  }
  const posizione = { ticker: c.ticker, acquisti };
  if (tutteVendite.length) posizione.vendite = tutteVendite;
  posizioni = posizioni.filter((p) => p !== giaAperta);
  posizioni.push(posizione);
  if (c.tesi && !tesi[c.ticker]) { tesi[c.ticker] = c.tesi; salvaTesi(); }
  chiuse.splice(indice, 1);
  salvaOperazioni();
  disegna();
}

// ---------- 4. I dati della disciplina (salvati solo nel browser) ----------
// disciplina = {
//   iniziata: "2026-11-23",                      il primo giorno in cui hai aperto questa versione
//   revisioni: { "2026-11": { data: "2026-11-28", risposte: ["...", "...", "...", "...", "..."] } },
//   trimestraliViste: { "SAP.DE": ["2026-10-21", "2027-01-28"] }   le date delle trimestrali che la pagina ha visto
// }
// Le date delle trimestrali passate non arrivano dagli agenti (sanno solo la PROSSIMA): per questo la pagina
// le annota man mano che le vede, e quando una data è passata ti chiede "la tesi regge ancora?".

const CHIAVE_DISCIPLINA = "disciplina-v1";
let disciplina = { iniziata: "", revisioni: {}, trimestraliViste: {} };

function pulisciDisciplina(dati) {
  const data = (testo) => (/^\d{4}-\d{2}-\d{2}$/.test(String(testo || "")) ? String(testo) : "");
  const risultato = { iniziata: "", revisioni: {}, trimestraliViste: {} };
  if (!dati || typeof dati !== "object" || Array.isArray(dati)) return risultato;
  risultato.iniziata = data(dati.iniziata);
  for (const [mese, r] of Object.entries(dati.revisioni || {})) {
    if (!/^\d{4}-\d{2}$/.test(mese) || !r || typeof r !== "object") continue;
    const risposte = (Array.isArray(r.risposte) ? r.risposte : []).slice(0, DOMANDE_REVISIONE.length).map((x) => String(x || ""));
    risultato.revisioni[mese] = { data: data(r.data), risposte };
  }
  for (const [ticker, date] of Object.entries(dati.trimestraliViste || {})) {
    if (Array.isArray(date)) risultato.trimestraliViste[ticker] = date.map(data).filter(Boolean).slice(-8);
  }
  return risultato;
}

function caricaDisciplina() {
  try {
    return pulisciDisciplina(JSON.parse(localStorage.getItem(CHIAVE_DISCIPLINA) || "{}"));
  } catch (errore) {
    return pulisciDisciplina({});
  }
}

function salvaDisciplina() {
  try {
    localStorage.setItem(CHIAVE_DISCIPLINA, JSON.stringify(disciplina));
  } catch (errore) {
    alert("Non riesco a salvare su questo dispositivo (navigazione privata?).");
  }
}

// All'avvio: annota il primo giorno e le date delle prossime trimestrali dei tuoi titoli (lo chiama app.js)
function preparaDisciplina() {
  let cambiato = false;
  if (!disciplina.iniziata) { disciplina.iniziata = oggiISO(); cambiato = true; }
  for (const p of posizioni) {
    const f = (analisi.titoli[p.ticker] || {}).fondamentali;
    if (!f || !f.prossimaTrimestrale || !serveTesi(p.ticker)) continue;
    const viste = disciplina.trimestraliViste[p.ticker] || [];
    if (viste.includes(f.prossimaTrimestrale)) continue;
    // Una data futura già annotata ma diversa è stata spostata: vale quella nuova
    disciplina.trimestraliViste[p.ticker] = [...viste.filter((d) => d < oggiISO()), f.prossimaTrimestrale].sort().slice(-8);
    cambiato = true;
  }
  if (cambiato) salvaDisciplina();
}

// ---------- Piccoli aiuti sulle date ----------

// "2026-11-23" + 30 giorni → "2026-12-23"
function piuGiorni(data, giorni) {
  const d = leggiData(data);
  d.setDate(d.getDate() + giorni);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const meseDi = (data) => data.slice(0, 7);                    // "2026-11-23" → "2026-11"
function nomeMese(mese) {                                       // "2026-11" → "novembre"
  return leggiData(mese + "-01").toLocaleDateString("it-IT", { month: "long" });
}
function mesePrima(mese) {                                      // "2026-01" → "2025-12"
  const [anno, m] = mese.split("-").map(Number);
  return m === 1 ? `${anno - 1}-12` : `${anno}-${String(m - 1).padStart(2, "0")}`;
}
// La data più recente tra quelle date (le vuote non contano)
const piuRecente = (...date) => date.filter(Boolean).sort().pop() || "";

// ---------- 5. I promemoria ----------
// Quanto tempo hai per sistemare un promemoria prima che tolga punti al punteggio
const GIORNI_PER_TRIMESTRALE = 14;   // per rispondere a "la tesi regge ancora?" dopo una trimestrale
const GIORNI_PER_DECIDERE = 30;      // per una condizione di uscita spuntata o una tesi di 12 mesi

// Le azioni che possiedi (ETF e cripto non hanno tesi)
const azioniPossedute = () => posizioni.filter((p) => serveTesi(p.ticker));

// Gli "avvisi" sulle tue tesi, ognuno con il suo stato:
//   "aperto"   = da sistemare, ma sei ancora nei tempi
//   "scaduto"  = da sistemare e il tempo è passato (toglie punti)
//   "fatto"    = sistemato (conta come regola rispettata)
function avvisiTesi() {
  const oggi = oggiISO();
  const avvisi = [];
  const stato = (fatto, inizio, giorni) => (fatto ? "fatto" : piuGiorni(inizio, giorni) < oggi ? "scaduto" : "aperto");
  const unAnnoFa = piuGiorni(oggi, -365);
  for (const p of azioniPossedute()) {
    const t = tesi[p.ticker];
    if (!t || !t.motivo) continue;
    const nome = infoTitolo(p.ticker).nome;
    // a. Dopo ogni trimestrale: la tesi regge ancora? (basta dirlo, o modificare la tesi)
    const ricontrollata = piuRecente(t.verificata, t.aggiornata, t.rinnovata);
    for (const data of disciplina.trimestraliViste[p.ticker] || []) {
      if (data > oggi || data <= (t.scritta || "") || data < unAnnoFa) continue;
      avvisi.push({ tipo: "trimestrale", ticker: p.ticker, nome, data,
        stato: stato(ricontrollata >= data, data, GIORNI_PER_TRIMESTRALE) });
    }
    // b. Una condizione di uscita spuntata: decidi (vendi con un motivo, oppure aggiorna la tesi o conferma che regge)
    for (const u of t.uscita) {
      if (!u.scattata || !u.scattataIl) continue;
      avvisi.push({ tipo: "uscita", ticker: p.ticker, nome, data: u.scattataIl, testo: u.testo,
        stato: stato(piuRecente(t.verificata, t.aggiornata) >= u.scattataIl, u.scattataIl, GIORNI_PER_DECIDERE) });
    }
    // c. La tesi compie 12 mesi senza aver raggiunto il target
    const partenza = piuRecente(t.scritta, t.rinnovata);
    const a = avanzamentoTesi(p.ticker);
    if (t.target && partenza && a && !a.raggiunto) {
      const compleanno = piuGiorni(partenza, 365);
      if (compleanno <= oggi) {
        avvisi.push({ tipo: "dodici-mesi", ticker: p.ticker, nome, data: compleanno, target: t.target,
          stato: stato(false, compleanno, GIORNI_PER_DECIDERE) });
      }
    }
  }
  return avvisi;
}

// ---------- 6. Il punteggio di disciplina ----------
// Da 0 a 100. Premia il rispetto delle TUE regole, non il guadagno.
// È la media pesata di alcune regole; una regola che oggi non si può valutare (per esempio
// "vendite" se non hai mai venduto) non conta, e il peso passa alle altre.
// Un'uscita prima del target, con un motivo, NON toglie punti.

const REGOLE = [
  { chiave: "tesi", peso: 25, nome: "Tesi scritte", spiega: "Ogni azione che possiedi ha la sua tesi." },
  { chiave: "complete", peso: 10, nome: "Tesi complete", spiega: "Oltre al perché: target a 12 mesi e quando esci (metà punti se c'è solo uno dei due)." },
  { chiave: "prima", peso: 15, nome: "Tesi prima di comprare", spiega: "Acquisti di azioni degli ultimi 12 mesi fatti con la tesi già scritta." },
  { chiave: "vendite", peso: 10, nome: "Vendite ragionate", spiega: "Ogni vendita degli ultimi 12 mesi: metà punti per il motivo, metà per il voto sulla tesi (lo puoi dare anche dopo)." },
  { chiave: "trimestrali", peso: 15, nome: "Tesi ricontrollate", spiega: `Dopo ogni trimestrale hai detto se la tesi regge (entro ${GIORNI_PER_TRIMESTRALE} giorni).` },
  { chiave: "revisione", peso: 15, nome: "Revisione mensile", spiega: "Le revisioni guidate degli ultimi mesi (quella di questo mese conta appena la fai)." },
  { chiave: "avvisi", peso: 10, nome: "Avvisi gestiti", spiega: `Condizioni di uscita spuntate e tesi di 12 mesi: hai deciso cosa fare entro ${GIORNI_PER_DECIDERE} giorni.` },
];

// Restituisce { punteggio (0-100, oppure null se non c'è niente da valutare), regole: [{ ...regola, quota (0-1 o null), dettaglio }] }
function calcolaDisciplina() {
  const oggi = oggiISO();
  const unAnnoFa = piuGiorni(oggi, -365);
  const risultati = {};
  const metti = (chiave, fatti, totale, dettaglio) => {
    risultati[chiave] = { quota: totale > 0 ? fatti / totale : null, dettaglio: totale > 0 ? dettaglio : "Non ancora valutabile." };
  };

  // Tesi scritte e complete
  const azioni = azioniPossedute();
  const conTesi = azioni.filter((p) => tesi[p.ticker] && tesi[p.ticker].motivo);
  metti("tesi", conTesi.length, azioni.length, `${conTesi.length} azioni su ${azioni.length} hanno la tesi.`);
  const completezza = conTesi.map((p) => ((tesi[p.ticker].target ? 0.5 : 0) + (tesi[p.ticker].uscita.length ? 0.5 : 0)));
  const complete = completezza.filter((x) => x === 1).length;
  metti("complete", completezza.reduce((s, x) => s + x, 0), completezza.length, `${complete} tesi su ${completezza.length} hanno target e uscita.`);

  // Acquisti e vendite degli ultimi 12 mesi (anche dei titoli venduti del tutto)
  const operazioni = operazioniDiario().filter((o) => o.data >= unAnnoFa);
  const acquisti = operazioni.filter((o) => o.tipo === "acquisto" && typeof o.tesiPronta === "boolean");
  const conTesiPronta = acquisti.filter((o) => o.tesiPronta).length;
  metti("prima", conTesiPronta, acquisti.length, `${conTesiPronta} acquisti su ${acquisti.length} con la tesi già scritta.`);
  const vendite = operazioni.filter((o) => o.tipo === "vendita");
  // Per ETF e cripto non c'è tesi da votare: basta il motivo
  const puntiVendita = (o) => {
    if (SENZA_TESI.test(o.tipoTitolo)) return o.motivo ? 1 : 0;
    return (o.motivo ? 0.5 : 0) + (o.vendita.voto ? 0.5 : 0);
  };
  const daVotare = vendite.filter((o) => puntiVendita(o) < 1).length;
  metti("vendite", vendite.reduce((s, o) => s + puntiVendita(o), 0), vendite.length,
    daVotare ? `${daVotare} vendite su ${vendite.length} senza voto sulla tesi.` : `Tutte le ${vendite.length} vendite hanno motivo e voto.`);

  // Trimestrali e avvisi: contano quelli sistemati e quelli scaduti (quelli ancora nei tempi no)
  const avvisi = avvisiTesi();
  const valutati = (tipi) => avvisi.filter((a) => tipi.includes(a.tipo) && a.stato !== "aperto");
  const trimestrali = valutati(["trimestrale"]);
  const trimFatte = trimestrali.filter((a) => a.stato === "fatto").length;
  metti("trimestrali", trimFatte, trimestrali.length, `${trimFatte} trimestrali su ${trimestrali.length} seguite da un controllo della tesi.`);
  const altri = valutati(["uscita", "dodici-mesi"]);
  const altriFatti = altri.filter((a) => a.stato === "fatto").length;
  metti("avvisi", altriFatti, altri.length, `${altriFatti} avvisi su ${altri.length} gestiti in tempo.`);

  // Revisione mensile: i 3 mesi prima di questo (da quando usi la pagina), più questo se l'hai già fatta
  const mese = meseDi(oggi);
  const mesi = [];
  for (let m = mesePrima(mese), i = 0; i < 3; m = mesePrima(m), i++) {
    if (disciplina.iniziata && m >= meseDi(disciplina.iniziata)) mesi.push(m);
  }
  if (disciplina.revisioni[mese]) mesi.push(mese);
  const fatte = mesi.filter((m) => disciplina.revisioni[m]).length;
  metti("revisione", fatte, mesi.length, `${fatte} revisioni su ${mesi.length} ${mesi.length === 1 ? "mese" : "mesi"}.`);

  const regole = REGOLE.map((r) => ({ ...r, ...risultati[r.chiave] }));
  const valide = regole.filter((r) => r.quota !== null);
  const pesoTotale = valide.reduce((s, r) => s + r.peso, 0);
  const punteggio = pesoTotale ? Math.round((valide.reduce((s, r) => s + r.peso * r.quota, 0) / pesoTotale) * 100) : null;
  return { punteggio, regole };
}

// Il giudizio in poche parole
function fraseDisciplina(punteggio) {
  if (punteggio === null) return "Il voto comparirà quando avrai un'azione in portafoglio.";
  if (punteggio >= 85) return "Stai seguendo bene le tue regole.";
  if (punteggio >= 65) return "Quasi: qualche promemoria da sistemare.";
  if (punteggio >= 40) return "Alcune regole sono rimaste indietro.";
  return "Le regole sono poco seguite: riparti da una cosa sola.";
}

// L'anello: dal rosso (0) al verde (100), con il voto al centro.
// Il colore cambia con il voto, ma il numero e la frase dicono la stessa cosa anche senza colori.
function disegnaAnelloDisciplina(svg, punteggio) {
  const raggio = 44;
  const giro = 2 * Math.PI * raggio;
  const quota = punteggio === null ? 0 : punteggio / 100;
  // tonalità: 0 = rosso, 130 = verde; la luminosità la decide il tema (variabile --luce-anello in style.css)
  svg.style.setProperty("--tinta", String(Math.round(quota * 130)));
  svg.innerHTML = `<circle class="fondo-anello" cx="60" cy="60" r="${raggio}"/>` +
    (punteggio === null ? "" : `<circle class="arco-anello" cx="60" cy="60" r="${raggio}" stroke-dasharray="${Math.max(quota * giro, 0.1).toFixed(1)} ${giro.toFixed(1)}" transform="rotate(-90 60 60)"/>`) +
    `<text class="voto-anello" x="60" y="${punteggio === null ? 66 : 68}" text-anchor="middle">${punteggio === null ? "–" : punteggio}</text>`;
  svg.setAttribute("aria-label", punteggio === null ? "Punteggio di disciplina non ancora disponibile" : `Punteggio di disciplina: ${punteggio} su 100`);
}

// ---------- 7. Le cose da fare adesso ----------
// Ogni voce: un testo, una spiegazione e uno o due pulsanti.

function cosaFare() {
  const voci = [];
  const azione = (testo, quando) => ({ testo, quando });
  for (const p of azioniPossedute()) {
    if (tesi[p.ticker] && tesi[p.ticker].motivo) continue;
    voci.push({ urgente: true, titolo: `Tesi non scritta: ${infoTitolo(p.ticker).nome}`,
      testo: "Bastano poche parole: perché l'hai comprata. Il resto è facoltativo.",
      azioni: [azione("Scrivi la tesi", () => scriviTesi(p.ticker))] });
  }
  for (const a of avvisiTesi().filter((x) => x.stato !== "fatto")) {
    const urgente = a.stato === "scaduto";
    const regge = azione("Sì, regge", () => confermaTesi(a.ticker));
    const rivedi = azione("Rivedo la tesi", () => scriviTesi(a.ticker));
    if (a.tipo === "trimestrale") {
      voci.push({ urgente, titolo: `${a.nome}: la tesi regge ancora?`,
        testo: `C'è stata la trimestrale (${dataBreve(a.data)}). Rileggi la tesi e i nuovi conti nella pagina del titolo.`,
        azioni: [regge, rivedi] });
    } else if (a.tipo === "uscita") {
      voci.push({ urgente, titolo: `${a.nome}: hai spuntato "${a.testo}"`,
        testo: "Una tua condizione di uscita si è verificata. Decidi con calma: vendere (con un motivo) o aggiornare la tesi sono entrambe scelte valide.",
        azioni: [azione("La tesi regge", () => confermaTesi(a.ticker)), azione("Apri il titolo", () => vaiAlTitolo(a.ticker))] });
    } else {
      voci.push({ urgente, titolo: `${a.nome}: la tesi ha compiuto 12 mesi`,
        testo: `Il target (${euro(a.target)}) non è stato raggiunto. Puoi rinnovarla per altri 12 mesi, rivederla, oppure uscire: con un motivo non è un errore.`,
        azioni: [azione("Rinnova per 12 mesi", () => rinnovaTesi(a.ticker)), rivedi] });
    }
  }
  const mese = meseDi(oggiISO());
  if (!disciplina.revisioni[mese] && (posizioni.length || chiuse.length)) {
    voci.push({ urgente: false, titolo: `Revisione di ${nomeMese(mese)} da fare`,
      testo: "Cinque domande, pochi minuti. Le risposte restano su questo dispositivo.",
      azioni: [azione("Inizia", () => { revisioneAperta = true; disegnaRevisione(); $("disciplina-revisione").scrollIntoView({ behavior: "smooth", block: "start" }); })] });
  }
  const senzaVoto = operazioniDiario().filter((o) => o.tipo === "vendita" && !o.vendita.voto).length;
  if (senzaVoto) {
    voci.push({ urgente: false, titolo: senzaVoto === 1 ? "1 vendita senza voto sulla tesi" : `${senzaVoto} vendite senza voto sulla tesi`,
      testo: "Quando sai com'è andata, dai il voto nel diario: serve a capire i tuoi errori più frequenti.",
      azioni: [azione("Vai al diario", () => $("disciplina-diario").scrollIntoView({ behavior: "smooth", block: "start" }))] });
  }
  // Prima le cose scadute o urgenti
  return voci.sort((a, b) => Number(b.urgente) - Number(a.urgente));
}

// "La tesi regge ancora": lo annotiamo con la data di oggi
function confermaTesi(ticker) {
  if (!tesi[ticker]) return;
  tesi[ticker].verificata = oggiISO();
  salvaTesi();
  disegnaDisciplina();
}

// Rinnova la tesi per altri 12 mesi (target e motivo restano: se vuoi cambiarli, "Rivedo la tesi")
function rinnovaTesi(ticker) {
  if (!tesi[ticker]) return;
  if (!confirm(`Rinnovi la tesi di ${infoTitolo(ticker).nome} per altri 12 mesi, con lo stesso target?`)) return;
  tesi[ticker].rinnovata = oggiISO();
  tesi[ticker].verificata = oggiISO();
  salvaTesi();
  disegnaDisciplina();
}

// ---------- 8. La revisione mensile guidata ----------
// Cinque domande. Sotto ognuna, i tuoi dati che aiutano a rispondere.

const DOMANDE_REVISIONE = [
  "Le mie tesi reggono ancora? C'è un'azione che oggi non ricomprerei?",
  "Ho seguito le mie regole? (tesi prima di comprare, motivo quando vendo)",
  "Ho fatto qualcosa d'impulso, per paura o per entusiasmo?",
  "Una trimestrale o una condizione di uscita ha cambiato qualcosa? Cosa ho deciso?",
  "Cosa faccio di diverso il mese prossimo? (una cosa sola basta)",
];

let revisioneAperta = false;   // true = il modulo delle 5 domande è aperto

// I dati che aiutano a rispondere a ogni domanda
function aiutiRevisione() {
  const mese = meseDi(oggiISO());
  const delMese = operazioniDiario().filter((o) => meseDi(o.data) === mese);
  const acquisti = delMese.filter((o) => o.tipo === "acquisto");
  const conTesi = acquisti.filter((o) => o.tesiPronta === true).length;
  const vendite = delMese.filter((o) => o.tipo === "vendita");
  const tesiOra = azioniPossedute().map((p) => {
    const t = tesi[p.ticker];
    if (!t || !t.motivo) return `${nomeCorto(p.ticker)}: tesi non scritta`;
    const a = avanzamentoTesi(p.ticker);
    return `${nomeCorto(p.ticker)}: ${a ? (a.raggiunto ? "target raggiunto" : `al target mancano ${percUno(a.mancante, true)}`) : t.target ? "in attesa del prezzo" : "senza target"}`;
  });
  const avvisi = avvisiTesi().filter((a) => meseDi(a.data) === mese && a.tipo !== "dodici-mesi")
    .map((a) => (a.tipo === "trimestrale" ? `${a.nome}: trimestrale del ${dataBreve(a.data)}` : `${a.nome}: spuntata "${a.testo}"`));
  const scorsa = disciplina.revisioni[mesePrima(mese)];
  return [
    tesiOra.length ? tesiOra.join(" · ") : "Nessuna azione in portafoglio.",
    `Questo mese: ${acquisti.length} acquisti (${conTesi} con la tesi già scritta) e ${vendite.length} vendite` +
      (vendite.length ? ", tutte con il motivo." : "."),
    vendite.length ? "Le vendite del mese: " + vendite.map((v) => `${nomeCorto(v.ticker)} (${v.motivo})`).join("; ") : "Ripensa alle notizie che ti hanno colpito di più questo mese.",
    avvisi.length ? avvisi.join(" · ") : "Nessuna trimestrale o condizione di uscita questo mese.",
    scorsa && scorsa.risposte[4] ? `Il mese scorso ti eri detto: "${scorsa.risposte[4]}"` : "Una cosa concreta, che potrai controllare il mese prossimo.",
  ];
}

function disegnaRevisione() {
  const mese = meseDi(oggiISO());
  const fatta = disciplina.revisioni[mese];
  $("titolo-revisione").textContent = `Revisione di ${nomeMese(mese)}`;
  $("stato-revisione").textContent = fatta ? `✓ Fatta il ${dataBreve(fatta.data)}` : "Da fare";
  $("stato-revisione").className = "stato-revisione " + (fatta ? "positivo" : "attenzione");
  const modulo = $("modulo-revisione");
  const riepilogo = $("riepilogo-revisione");
  modulo.hidden = !revisioneAperta;
  riepilogo.hidden = revisioneAperta || !fatta;
  $("apri-revisione").hidden = revisioneAperta;
  $("apri-revisione").textContent = fatta ? "Modifica le risposte" : "Inizia la revisione";

  if (revisioneAperta) {
    const domande = $("domande-revisione");
    domande.innerHTML = "";
    const aiuti = aiutiRevisione();
    DOMANDE_REVISIONE.forEach((testo, i) => {
      const etichetta = crea("label", "domanda-revisione");
      etichetta.append(crea("span", "testo-domanda", `${i + 1}. ${testo}`), crea("span", "aiuto-domanda", aiuti[i]));
      const campo = crea("textarea");
      campo.rows = 2;
      campo.value = fatta ? fatta.risposte[i] || "" : "";
      etichetta.appendChild(campo);
      domande.appendChild(etichetta);
    });
    $("errore-revisione").hidden = true;
  } else if (fatta) {
    riepilogo.innerHTML = "";
    DOMANDE_REVISIONE.forEach((testo, i) => {
      if (!fatta.risposte[i]) return;
      riepilogo.append(crea("h3", "", testo), crea("p", "testo-tesi", fatta.risposte[i]));
    });
  }

  // Le revisioni dei mesi passati, dalla più recente
  const passate = Object.keys(disciplina.revisioni).filter((m) => m !== mese).sort().reverse();
  const archivio = $("revisioni-passate");
  archivio.hidden = passate.length === 0;
  const elenco = $("elenco-revisioni-passate");
  elenco.innerHTML = "";
  for (const m of passate) {
    const r = disciplina.revisioni[m];
    const voce = crea("details", "revisione-passata");
    voce.appendChild(crea("summary", "", `${nomeMese(m)} ${m.slice(0, 4)} · fatta il ${r.data ? dataBreve(r.data) : "?"}`));
    DOMANDE_REVISIONE.forEach((testo, i) => {
      if (r.risposte[i]) voce.append(crea("h3", "", testo), crea("p", "testo-tesi", r.risposte[i]));
    });
    elenco.appendChild(voce);
  }
}

function quandoSalviRevisione(evento) {
  evento.preventDefault();
  const risposte = [...$("domande-revisione").querySelectorAll("textarea")].map((c) => c.value.trim());
  if (!risposte.some(Boolean)) {
    $("errore-revisione").textContent = "Rispondi almeno a una domanda, anche con poche parole.";
    $("errore-revisione").hidden = false;
    return;
  }
  disciplina.revisioni[meseDi(oggiISO())] = { data: oggiISO(), risposte };
  salvaDisciplina();
  revisioneAperta = false;
  disegnaDisciplina();
}

// ---------- La pagina Disciplina ----------

function disegnaDisciplina() {
  // Il punteggio, con il dettaglio regola per regola
  const { punteggio, regole } = calcolaDisciplina();
  disegnaAnelloDisciplina($("anello-disciplina"), punteggio);
  $("frase-disciplina").textContent = fraseDisciplina(punteggio);
  const elenco = $("regole-disciplina");
  elenco.innerHTML = "";
  for (const r of regole) {
    const voce = crea("li", "regola" + (r.quota === null ? " non-valutabile" : ""));
    const testa = crea("div", "testa-regola");
    testa.append(crea("b", "", r.nome), crea("span", "numero", r.quota === null ? "–" : `${Math.round(r.quota * 100)}%`));
    const barra = crea("span", "barra-regola");
    barra.appendChild(crea("span")).style.width = `${(r.quota || 0) * 100}%`;
    voce.append(testa, barra, crea("span", "spiega-regola", `${r.dettaglio} ${r.spiega}`));
    elenco.appendChild(voce);
  }

  // Le cose da fare
  const voci = cosaFare();
  const contenitore = $("elenco-da-fare");
  contenitore.innerHTML = "";
  for (const v of voci) {
    const voce = crea("div", "voce-da-fare" + (v.urgente ? " urgente" : ""));
    voce.append(crea("b", "", v.titolo), crea("span", "dettaglio-oggi", v.testo));
    const pulsanti = crea("div", "pulsanti-da-fare");
    for (const a of v.azioni) {
      const pulsante = crea("button", "pulsante secondario", a.testo);
      pulsante.type = "button";
      pulsante.onclick = a.quando;
      pulsanti.appendChild(pulsante);
    }
    voce.appendChild(pulsanti);
    contenitore.appendChild(voce);
  }
  $("niente-da-fare").hidden = voci.length > 0;

  disegnaRevisione();
  disegnaDiario();
  disegnaStatistiche();
  disegnaChiuse();
}

// Collega i pulsanti della pagina (lo chiama app.js all'avvio)
function collegaDisciplina() {
  $("altre-operazioni").onclick = () => { diarioTutto = !diarioTutto; disegnaDiario(); };
  $("apri-revisione").onclick = () => { revisioneAperta = true; disegnaRevisione(); };
  $("annulla-revisione").onclick = () => { revisioneAperta = false; disegnaRevisione(); };
  $("modulo-revisione").addEventListener("submit", quandoSalviRevisione);
}
