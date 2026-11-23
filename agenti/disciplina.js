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

// Tutte le operazioni: [{ tipo, ticker, nome, data, quote, importo, prezzo, motivo, vendita, chiusa }]
// "vendita" è proprio l'oggetto salvato: cambiandolo (voto, errore) e salvando, cambia il dato vero.
function operazioniDiario() {
  const elenco = [];
  const aggiungi = (p, nome, chiusa) => {
    for (const a of p.acquisti) {
      elenco.push({ tipo: "acquisto", ticker: p.ticker, nome, data: a.data || "", quote: a.quote, importo: a.investito,
        prezzo: a.investito / a.quote, motivo: a.motivo || "", tesiPronta: a.tesiPronta, chiusa });
    }
    for (const v of contaOperazioni(p).vendite) {
      elenco.push({ tipo: "vendita", ticker: p.ticker, nome, data: v.data, quote: v.quote, importo: v.incassato,
        prezzo: v.incassato / v.quote, motivo: v.motivo, guadagno: v.guadagno, vendita: p.vendite[v.indice], chiusa });
    }
  };
  for (const p of posizioni) aggiungi(p, infoTitolo(p.ticker).nome, false);
  for (const c of chiuse) aggiungi(c, c.nome || c.ticker, true);
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

// ---------- La pagina Disciplina ----------

function disegnaDisciplina() {
  disegnaDiario();
  disegnaStatistiche();
  disegnaChiuse();
}

// Collega i pulsanti della pagina (lo chiama app.js all'avvio)
function collegaDisciplina() {
  $("altre-operazioni").onclick = () => { diarioTutto = !diarioTutto; disegnaDiario(); };
}
