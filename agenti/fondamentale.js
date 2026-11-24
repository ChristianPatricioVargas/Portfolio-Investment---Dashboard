// agenti/fondamentale.js = la parte della pagina dell'ANALISTA FONDAMENTALE (il "se").
// Mostra tre cose nella pagina di un titolo:
//   1. la scheda dei fondamentali (dati pubblici, preparati ogni sera da GitHub)
//   2. la TUA scheda tesi (perché sei entrato, target, condizioni di uscita): resta solo nel browser
//   3. "Se vendo oggi": quanto ti resta in tasca dopo tasse e commissione
//
// Questo file contiene solo funzioni: le chiama app.js quando disegna la pagina.

const TASSA_PLUSVALENZE = 0.26;   // in Italia: 26% sul guadagno
const COMMISSIONE_VENDITA = 1;    // Trade Republic: 1 € a operazione
const VICINO_AL_TARGET = 0.05;    // "vicino al target" = mancano meno del 5%

// ---------- Formattazione ----------

// 0.123 → "12,3%"   (con conSegno: "+12,3%")
function percUno(numero, conSegno = false) {
  const segno = conSegno && numero > 0 ? "+" : "";
  return segno + (numero * 100).toFixed(1).replace(".", ",") + "%";
}

// 12.345 → "12,3"
function numeroIt(numero, decimali = 1) {
  return numero.toLocaleString("it-IT", { minimumFractionDigits: decimali, maximumFractionDigits: decimali });
}

// Un prezzo nella valuta del titolo: (182.5, "USD") → "182,50 USD". Per gli euro usa "€".
function prezzoIn(numero, valuta) {
  if (!valuta || valuta === "EUR") return euro(numero);
  return numeroIt(numero, numero >= 1000 ? 0 : 2) + " " + valuta;
}

// "2026-11-26" → quanti giorni mancano da oggi (negativo = già passata)
function giorniA(data) {
  return Math.round((leggiData(data) - leggiData(oggiISO())) / 86400000);
}

// La raccomandazione media degli analisti è un voto da 1 a 5
function testoRaccomandazione(voto) {
  if (voto <= 1.5) return "molto positiva";
  if (voto <= 2.5) return "positiva";
  if (voto <= 3.5) return "neutrale";
  if (voto <= 4.5) return "negativa";
  return "molto negativa";
}

// Aggiunge a una griglia un numero con la sua etichetta (e una nota piccola, se serve)
function aggiungiDato(griglia, etichetta, valore, classe = "", nota = "") {
  const blocco = document.createElement("div");
  blocco.innerHTML = "<dt></dt><dd></dd>";
  blocco.querySelector("dt").textContent = etichetta;
  const dd = blocco.querySelector("dd");
  dd.textContent = valore;
  if (classe) dd.className = classe;
  if (nota) {
    const piccola = document.createElement("small");
    piccola.textContent = nota;
    blocco.appendChild(piccola);
  }
  griglia.appendChild(blocco);
}

// Un gruppo di numeri con il suo titolino ("Crescita", "Margini"...)
function aggiungiGruppo(contenitore, titolo, dati) {
  const visibili = dati.filter(Boolean);
  if (visibili.length === 0) return;
  const intestazione = document.createElement("h3");
  intestazione.textContent = titolo;
  const griglia = document.createElement("dl");
  griglia.className = "numeri-agente";
  for (const dato of visibili) aggiungiDato(griglia, ...dato);
  contenitore.append(intestazione, griglia);
}

// ---------- 1. La scheda dei fondamentali ----------

// Se all'ultimo giro la fonte dei fondamentali ha rifiutato le richieste, restituisce il motivo (altrimenti "")
function fonteFondamentaliChiusa() {
  return (analisi.errori || []).find((e) => e.includes("ha rifiutato") || e.includes("FINNHUB_API_KEY")) || "";
}

// Prepara i gruppi di numeri di una scheda. Serve sia alla pagina sia a "Copia per l'analisi".
function gruppiFondamentali(f) {
  const c = f.valuta;
  const c2 = (n) => (n > 0 ? "positivo" : n < 0 ? "negativo" : "");
  const dato = (valore, crea) => (valore === null || valore === undefined ? null : crea(valore));
  return [
    ["Valutazione", [
      dato(f.pe, (v) => ["P/E", numeroIt(v), "", "prezzo ÷ utili degli ultimi 12 mesi"]),
      dato(f.peAtteso, (v) => ["P/E atteso", numeroIt(v), "", "con gli utili previsti"]),
    ]],
    ["Crescita", [
      dato(f.crescitaRicavi, (v) => ["Ricavi", percUno(v, true), c2(v), "ultimo trimestre su un anno prima"]),
      dato(f.crescitaUtili, (v) => ["Utili", percUno(v, true), c2(v), "ultimo trimestre su un anno prima"]),
      dato(f.crescitaUtiliAnno, (v) => ["Utili, ultimi 12 mesi", percUno(v, true), c2(v), "sui 12 mesi precedenti"]),
      dato(f.crescitaUtiliAttesa, (v) => ["Utili attesi", percUno(v, true), c2(v), "previsione degli analisti"]),
    ]],
    ["Debito", f.finanziario
      ? [["Debito", "non confrontabile", "", "per banche e assicurazioni il debito fa parte del mestiere"]]
      : [
        dato(f.debitoNettoSuEbitda, (v) => ["Debito netto ÷ EBITDA", v <= 0 ? "più cassa che debiti" : numeroIt(v) + " anni", "", "anni di guadagni per ripagarlo"]),
        dato(f.debitoSuCapitale, (v) => ["Debito ÷ capitale", percUno(v), "", "debiti rispetto ai soldi dei soci"]),
      ]],
    ["Margini", [
      dato(f.margineLordo, (v) => ["Lordo", percUno(v)]),
      dato(f.margineOperativo, (v) => ["Operativo", percUno(v)]),
      dato(f.margineNetto, (v) => ["Netto", percUno(v), c2(v), "utile per ogni 100 di ricavi"]),
    ]],
    ["Analisti", [
      dato(f.analistiPositivi, (v) => ["Giudizi positivi", `${v} su ${f.analisti}`, "",
        `${f.analistiNeutri} neutri, ${f.analistiNegativi} negativi`]),
      dato(f.raccomandazione, (v) => ["Giudizio medio", `${numeroIt(v)} su 5`, "", `${testoRaccomandazione(v)} (1 = il più positivo)`]),
      f.raccomandazione !== null && f.raccomandazionePrima !== null && f.raccomandazionePrima !== undefined
        ? ["Un mese fa", `${numeroIt(f.raccomandazionePrima)} su 5`, "",
          f.raccomandazione > f.raccomandazionePrima + 0.04 ? "da allora è peggiorato"
            : f.raccomandazione < f.raccomandazionePrima - 0.04 ? "da allora è migliorato" : "da allora è stabile"]
        : null,
      // Il target price c'è solo se la fonte lo dà (quella gratuita non lo dà)
      dato(f.target, (v) => ["Target medio a 12 mesi", prezzoIn(v, c), "",
        f.targetMin && f.targetMax ? `da ${prezzoIn(f.targetMin, c)} a ${prezzoIn(f.targetMax, c)}` : ""]),
      dato(f.potenziale, (v) => ["Distanza dal target", percUno(v, true), c2(v)]),
    ]],
  ];
}

// "26 nov 2026 (tra 12 giorni)"
function testoTrimestrale(f) {
  if (!f.prossimaTrimestrale) return "";
  const giorni = giorniA(f.prossimaTrimestrale);
  if (giorni < 0) return "";   // data già passata: aspettiamo quella nuova
  const quando = giorni === 0 ? "oggi" : giorni === 1 ? "domani" : `tra ${giorni} giorni`;
  return `${f.trimestraleStimata ? "circa " : ""}${dataBreve(f.prossimaTrimestrale)} (${quando})`;
}

// "utili sopra le attese 3 volte su 4"
function testoSorprese(f) {
  const s = f.sorprese || [];
  if (s.length === 0) return "";
  const sopra = s.filter((x) => x.effettivo >= x.atteso).length;
  return `utili sopra o in linea con le attese ${sopra} ${sopra === 1 ? "volta" : "volte"} su ${s.length}`;
}

function disegnaFondamentali() {
  const info = infoTitolo(tickerAperto);
  const f = (analisi.titoli[tickerAperto] || {}).fondamentali;
  const corpo = $("corpo-fondamentali");
  corpo.innerHTML = "";
  $("glossario-fondamentali").hidden = !f;
  $("fonte-fondamentali").textContent = "";

  const messaggio = (testo) => {
    const p = document.createElement("p");
    p.className = "vuoto";
    p.textContent = testo;
    corpo.appendChild(p);
  };
  if (info.tipo === "ETF") {
    return messaggio("Un ETF contiene migliaia di aziende: non ha utili, debiti o target suoi. " +
      "Nella tua strategia è un investimento di lungo termine: qui conta l'andamento, non la singola trimestrale.");
  }
  if (!f) {
    const scheda = analisi.titoli[tickerAperto];
    return messaggio(fonteFondamentaliChiusa()
      ? `⚠ ${fonteFondamentaliChiusa()}. I fondamentali di questo titolo non sono disponibili.`
      : scheda && scheda.tecnica
        ? "Per questa azienda la fonte gratuita dei fondamentali non ha dati (copre solo le aziende quotate anche negli Stati Uniti)."
        : "I fondamentali arriveranno con il prossimo giro degli agenti.");
  }

  // In alto: settore e prossima trimestrale
  const riga = document.createElement("p");
  riga.className = "riga-settore";
  riga.textContent = f.settore || "";
  if (riga.textContent) corpo.appendChild(riga);

  for (const [titolo, dati] of gruppiFondamentali(f)) aggiungiGruppo(corpo, titolo, dati);

  const trimestrale = testoTrimestrale(f);
  aggiungiGruppo(corpo, "Trimestrali", [
    trimestrale ? ["Prossima trimestrale", trimestrale] : null,
    testoSorprese(f) ? ["Ultime trimestrali", testoSorprese(f)] : null,
    f.revisioneStime !== null && f.revisioneStime !== undefined
      ? ["Stime sugli utili dell'anno", percUno(f.revisioneStime, true), classeColore(f.revisioneStime), "variazione negli ultimi 90 giorni"]
      : null,
  ]);

  const parti = ["Fonte: " + (f.fonte || "Yahoo Finance")];
  if (f.aggiornato) parti.push("dati del " + dataBreve(f.aggiornato));
  const usa = (analisi.titoli[tickerAperto] || {}).usa;
  if (usa && usa !== tickerAperto) parti.push(`conti della quotazione americana (${usa})`);
  if (fonteFondamentaliChiusa()) parti.push("⚠ all'ultimo giro la fonte non ha risposto: potrebbero essere vecchi");
  $("fonte-fondamentali").textContent = parti.join(" · ");
}

// ---------- 2. La scheda tesi (personale, salvata solo nel browser) ----------
// È una scheda LEGGERA, solo per le azioni (ETF e cripto non ne hanno bisogno): quattro righe,
// solo la prima obbligatoria.
// tesi = { "SAP.DE": {
//   motivo: "...",            perché compro (obbligatorio)
//   target: 250,              target a 12 mesi, in € per azione (facoltativo)
//   uscita: [{ testo: "...", scattata: false, scattataIl: "" }],   quando esco (facoltativo)
//   rischio: "...",           il rischio principale (facoltativo)
//   scritta: "2026-11-14",    quando l'hai scritta la prima volta (da qui partono i 12 mesi)
//   aggiornata: "2026-11-14", l'ultima modifica
//   verificata: "",           l'ultima volta che hai detto "la tesi regge ancora" (pagina Disciplina)
//   rinnovata: "",            l'ultima volta che l'hai rinnovata per altri 12 mesi (pagina Disciplina)
// } }

const CHIAVE_TESI = "tesi-v1";

// ETF e cripto non hanno la scheda tesi: un ETF si tiene a lungo, una cripto non ha conti da leggere.
// Il tipo arriva da data/titoli.json ("Azione", "ETF", in futuro magari "Cripto").
const SENZA_TESI = /^(etf|etc|cripto|crypto)/i;
function serveTesi(ticker) {
  return !SENZA_TESI.test(infoTitolo(ticker).tipo || "");
}

function caricaTesi() {
  try {
    return pulisciTesi(JSON.parse(localStorage.getItem(CHIAVE_TESI) || "{}"));
  } catch (errore) {
    return {};
  }
}

function salvaTesi() {
  try {
    localStorage.setItem(CHIAVE_TESI, JSON.stringify(tesi));
  } catch (errore) {
    alert("Non riesco a salvare su questo dispositivo (navigazione privata?).");
  }
}

// Controlla che le tesi (lette dal browser o da un backup) abbiano la forma giusta
function pulisciTesi(dati) {
  const risultato = {};
  if (!dati || typeof dati !== "object" || Array.isArray(dati)) return risultato;
  for (const [ticker, t] of Object.entries(dati)) {
    if (!t || typeof t !== "object") continue;
    const data = (testo) => (/^\d{4}-\d{2}-\d{2}$/.test(String(testo || "")) ? String(testo) : "");
    risultato[ticker] = {
      motivo: String(t.motivo || ""),
      target: Number(t.target) > 0 ? Number(t.target) : null,
      uscita: (Array.isArray(t.uscita) ? t.uscita : [])
        .filter((u) => u && u.testo)
        .map((u) => ({ testo: String(u.testo), scattata: Boolean(u.scattata), scattataIl: data(u.scattataIl) })),
      rischio: String(t.rischio || ""),
      // Le tesi scritte prima di questa versione non hanno "scritta": usiamo l'ultima modifica
      scritta: data(t.scritta) || data(t.aggiornata),
      aggiornata: data(t.aggiornata),
      verificata: data(t.verificata),
      rinnovata: data(t.rinnovata),
    };
  }
  return risultato;
}

// ---------- Il promemoria quando compri ----------
// Nel modulo di un NUOVO acquisto di un'azione compare una piccola lista di controllo:
// c'è la tesi? c'è il target? Se manca qualcosa lo dice, ma puoi comprare lo stesso:
// è un promemoria, non un blocco. Per ETF e cripto non compare.

// Le quattro righe della tesi: [fatta?, testo]
function vociPromemoria(ticker) {
  const t = tesi[ticker];
  return [
    [Boolean(t && t.motivo), t && t.motivo ? "Tesi scritta: " + t.motivo.split("\n")[0] : "Tesi non scritta"],
    [Boolean(t && t.target), t && t.target ? "Target a 12 mesi: " + euro(t.target) : "Target a 12 mesi non scritto"],
    [Boolean(t && t.uscita.length), t && t.uscita.length ? "Sai quando esci" : "Non hai scritto quando esci"],
    [Boolean(t && t.rischio), t && t.rischio ? "Rischio principale: " + t.rischio : "Rischio principale non scritto"],
  ];
}

function disegnaPromemoriaAcquisto(ticker, nuovo) {
  const riquadro = $("promemoria-acquisto");
  riquadro.hidden = !nuovo || !ticker || !serveTesi(ticker);
  if (riquadro.hidden) return;
  const elenco = $("lista-promemoria");
  elenco.innerHTML = "";
  const voci = vociPromemoria(ticker);
  voci.forEach(([fatta, testo], i) => {
    const voce = document.createElement("li");
    // Un simbolo E un colore: si capisce anche senza distinguere i colori
    voce.className = fatta ? "fatta" : i === 0 ? "manca-tesi" : "";
    voce.innerHTML = `<span class="segno" aria-hidden="true"></span><span></span>`;
    voce.querySelector(".segno").textContent = fatta ? "✓" : i === 0 ? "!" : "○";
    voce.lastChild.textContent = testo;
    elenco.appendChild(voce);
  });
  $("nota-promemoria").textContent = voci[0][0]
    ? "Rileggi la tesi: è ancora il motivo per cui compri?"
    : "Puoi salvare l'acquisto lo stesso: è solo un promemoria. La tesi la scrivi quando vuoi, nella pagina del titolo.";
}

// A che punto sei tra il tuo prezzo medio e il target.
// Restituisce null se manca qualcosa (target, prezzo, posizione).
function avanzamentoTesi(ticker) {
  const t = tesi[ticker];
  const posizione = posizioni.find((p) => p.ticker === ticker);
  const p = prezzi[ticker];
  if (!t || !t.target || !posizione || !p) return null;
  const medio = totali(posizione).prezzoMedio;
  const mancante = t.target / p.prezzo - 1;             // quanto deve ancora salire per arrivare al target
  const strada = t.target > medio ? (p.prezzo - medio) / (t.target - medio) : null;   // 0 = prezzo medio, 1 = target
  return {
    medio, target: t.target, prezzo: p.prezzo, mancante, strada,
    raggiunto: p.prezzo >= t.target,
    vicino: p.prezzo < t.target && mancante <= VICINO_AL_TARGET,
  };
}

// La frase che riassume l'avanzamento
function testoAvanzamento(a) {
  if (a.raggiunto) return `Target raggiunto: il prezzo è ${percUno(-a.mancante, true)} sopra il tuo target.`;
  if (a.strada === null) return `Il target è sotto il tuo prezzo medio: mancano ${percUno(a.mancante, true)} per arrivarci.`;
  if (a.strada < 0) return `Sei sotto il tuo prezzo medio (${percUno(a.prezzo / a.medio - 1, true)}). Al target mancano ${percUno(a.mancante, true)}.`;
  const inizio = a.vicino ? "Vicino al target: sei" : "Sei";
  return `${inizio} al ${Math.round(a.strada * 100)}% della strada dal prezzo medio al target. Mancano ${percUno(a.mancante, true)}.`;
}

function disegnaTesi() {
  // La scheda c'è solo per le azioni che possiedi
  const posseduto = posizioni.some((p) => p.ticker === tickerAperto) && serveTesi(tickerAperto);
  $("sezione-tesi").hidden = !posseduto;
  if (!posseduto) return;
  const t = tesi[tickerAperto];
  const corpo = $("corpo-tesi");
  corpo.innerHTML = "";
  const inModificaTesi = !$("modulo-tesi").hidden;
  $("modifica-tesi").hidden = inModificaTesi;
  $("modifica-tesi").textContent = t ? "Modifica" : "+ Scrivi";
  corpo.hidden = inModificaTesi;
  if (inModificaTesi) return;

  if (!t) {
    const p = document.createElement("p");
    p.className = "vuoto";
    p.textContent = "Tesi non scritta. Bastano poche parole: perché compri, il target a 12 mesi, quando usciresti e il rischio principale. " +
      "Rileggerla nei momenti difficili aiuta a decidere con calma.";
    corpo.appendChild(p);
    return;
  }

  const blocco = (titolo, testo) => {
    const h = document.createElement("h3");
    h.textContent = titolo;
    const p = document.createElement("p");
    p.className = "testo-tesi";
    p.textContent = testo;
    corpo.append(h, p);
  };
  blocco("Perché compro", t.motivo || "Non l'hai ancora scritto: tocca Modifica.");

  // La barra di avanzamento: dal tuo prezzo medio al target
  const a = avanzamentoTesi(tickerAperto);
  if (a) {
    const h = document.createElement("h3");
    h.textContent = "Verso il target";
    const barra = document.createElement("div");
    barra.className = "barra-tesi";
    const quota = a.strada === null ? (a.raggiunto ? 1 : 0) : Math.max(0, Math.min(1, a.strada));
    barra.innerHTML = `<div class="barra-piena" style="width:${(quota * 100).toFixed(1)}%"></div>`;
    barra.setAttribute("role", "progressbar");
    barra.setAttribute("aria-valuenow", Math.round(quota * 100));
    const estremi = document.createElement("div");
    estremi.className = "estremi-barra";
    estremi.innerHTML = "<span></span><span></span><span></span>";
    const [sinistra, centro, destra] = estremi.children;
    sinistra.textContent = "Prezzo medio " + euro(a.medio);
    centro.textContent = "Ora " + euro(a.prezzo);
    destra.textContent = "Target " + euro(a.target);
    const frase = document.createElement("p");
    frase.className = "testo-tesi";
    frase.textContent = testoAvanzamento(a);
    corpo.append(h, barra, estremi, frase);
  } else if (t.target) {
    blocco("Target a 12 mesi", euro(t.target));
  }

  // Le condizioni di uscita: le spunti tu quando si verificano
  if (t.uscita.length) {
    const h = document.createElement("h3");
    h.textContent = "Quando esco";
    corpo.appendChild(h);
    t.uscita.forEach((condizione, indice) => {
      const riga = document.createElement("label");
      riga.className = "condizione" + (condizione.scattata ? " scattata" : "");
      riga.innerHTML = `<input type="checkbox"><span></span>`;
      const casella = riga.querySelector("input");
      casella.checked = condizione.scattata;
      casella.onchange = () => {
        const u = tesi[tickerAperto].uscita[indice];
        u.scattata = casella.checked;
        // Ricordiamo il giorno: la pagina Disciplina ti ricorda di decidere (vendere o aggiornare la tesi)
        u.scattataIl = casella.checked ? oggiISO() : "";
        salvaTesi();
        disegnaTesi();
      };
      riga.querySelector("span").textContent = condizione.testo;
      corpo.appendChild(riga);
    });
    const nota = document.createElement("p");
    nota.className = "suggerimento";
    nota.textContent = t.uscita.some((u) => u.scattata)
      ? "⚠ Hai segnato una condizione di uscita come verificata: rileggi la tesi prima di decidere."
      : "Spunta una condizione quando si verifica: comparirà nella pagina Oggi.";
    corpo.appendChild(nota);
  }
  if (t.rischio) blocco("Rischio principale", t.rischio);
  if (t.scritta) {
    const data = document.createElement("p");
    data.className = "suggerimento";
    data.textContent = "Tesi scritta il " + dataBreve(t.scritta) +
      (t.aggiornata && t.aggiornata !== t.scritta ? " · modificata il " + dataBreve(t.aggiornata) : "");
    corpo.appendChild(data);
  }
}

function apriModuloTesi() {
  const t = tesi[tickerAperto] || { motivo: "", target: null, uscita: [], rischio: "" };
  const f = (analisi.titoli[tickerAperto] || {}).fondamentali;
  $("campo-motivo").value = t.motivo;
  $("campo-target").value = t.target ? String(t.target).replace(".", ",") : "";
  // Suggeriamo il target medio degli analisti, ma solo se è in euro come i tuoi prezzi
  $("campo-target").placeholder = f && f.target && f.valuta === "EUR"
    ? `es. ${String(f.target).replace(".", ",")} (target medio degli analisti)` : "es. 250,00";
  $("campo-uscita").value = t.uscita.map((u) => u.testo).join("\n");
  $("campo-rischio").value = t.rischio || "";
  $("elimina-tesi").hidden = !tesi[tickerAperto];
  $("errore-tesi").hidden = true;
  $("modulo-tesi").hidden = false;
  disegnaTesi();
}

function chiudiModuloTesi() {
  $("modulo-tesi").hidden = true;
  if (tickerAperto) disegnaTesi();
}

function quandoSalviTesi(evento) {
  evento.preventDefault();
  const errore = (testo) => { $("errore-tesi").textContent = testo; $("errore-tesi").hidden = false; };
  const motivo = $("campo-motivo").value.trim();
  if (!motivo) return errore("Scrivi almeno perché compri: è l'unica riga obbligatoria.");
  const testoTarget = $("campo-target").value.trim();
  const target = testoTarget ? leggiNumero(testoTarget) : null;
  if (testoTarget && !(target > 0)) return errore("Il target deve essere un prezzo maggiore di zero (oppure lascialo vuoto).");
  // Una condizione per riga. Se una riga c'era già, resta spuntata com'era (con il suo giorno).
  const vecchia = tesi[tickerAperto] || { uscita: [] };
  const uscita = $("campo-uscita").value.split("\n").map((r) => r.trim()).filter(Boolean)
    .map((testo) => {
      const prima = vecchia.uscita.find((v) => v.testo === testo && v.scattata);
      return { testo, scattata: Boolean(prima), scattataIl: prima ? prima.scattataIl || "" : "" };
    });
  tesi[tickerAperto] = {
    motivo, target, uscita,
    rischio: $("campo-rischio").value.trim(),
    // La data in cui l'hai scritta la prima volta non cambia con le modifiche: da lì contano i 12 mesi
    scritta: vecchia.scritta || oggiISO(),
    aggiornata: oggiISO(),
    verificata: vecchia.verificata || "",
    rinnovata: vecchia.rinnovata || "",
  };
  salvaTesi();
  chiudiModuloTesi();
  disegnaSeVendo();   // "se vendo al target" usa il target della tesi
}

function eliminaTesi() {
  if (!confirm("Vuoi davvero eliminare la tesi di questo titolo?")) return;
  delete tesi[tickerAperto];
  salvaTesi();
  chiudiModuloTesi();
  disegnaSeVendo();
}

// ---------- 3. "Se vendo oggi" ----------
// incasso        = quote × prezzo − 1 € di commissione
// plusvalenza    = incasso − quanto avevi pagato (commissioni d'acquisto incluse)
// tasse          = 26% della plusvalenza (zero se sei in perdita)
// netto in tasca = incasso − tasse

function calcolaVendita(posizione, prezzo) {
  const t = totali(posizione);
  const lordo = t.quote * prezzo;
  const incasso = lordo - COMMISSIONE_VENDITA;
  const plusvalenza = incasso - t.investito;
  const tasse = Math.max(0, plusvalenza) * TASSA_PLUSVALENZE;
  const netto = incasso - tasse;
  return { lordo, plusvalenza, tasse, netto, guadagnoNetto: netto - t.investito, investito: t.investito };
}

function disegnaSeVendo() {
  const posizione = posizioni.find((p) => p.ticker === tickerAperto);
  const p = prezzi[tickerAperto];
  $("sezione-se-vendo").hidden = !posizione || !p;
  if (!posizione || !p) return;
  const v = calcolaVendita(posizione, p.prezzo);
  const righe = $("righe-se-vendo");
  righe.innerHTML = "";
  const riga = (etichetta, valore, classe = "") => {
    const blocco = document.createElement("div");
    if (classe.includes("totale-riga")) blocco.className = "totale-riga";
    blocco.innerHTML = "<dt></dt><dd></dd>";
    blocco.querySelector("dt").textContent = etichetta;
    blocco.querySelector("dd").textContent = valore;
    blocco.querySelector("dd").className = classe.replace("totale-riga", "").trim();
    righe.appendChild(blocco);
  };
  riga("Valore di oggi", euro(v.lordo));
  riga("Commissione di vendita", euro(-COMMISSIONE_VENDITA));
  riga(v.plusvalenza >= 0 ? "Plusvalenza (guadagno tassabile)" : "Minusvalenza (perdita)", euro(v.plusvalenza, true));
  riga("Tasse (26%)", v.tasse > 0 ? euro(-v.tasse) : "nessuna");
  riga("Netto in tasca", euro(v.netto), "totale-riga");
  riga("Guadagno netto", `${euro(v.guadagnoNetto, true)} · ${percentuale(v.guadagnoNetto / v.investito)}`,
    "totale-riga " + classeColore(v.guadagnoNetto));

  // Con un target nella tesi: quanto resterebbe vendendo a quel prezzo
  const t = tesi[tickerAperto];
  const nota = $("nota-se-vendo");
  if (t && t.target) {
    const alTarget = calcolaVendita(posizione, t.target);
    nota.textContent = `Se vendessi al tuo target (${euro(t.target)}): guadagno netto ${euro(alTarget.guadagnoNetto, true)} · ${percentuale(alTarget.guadagnoNetto / alTarget.investito)}.`;
    nota.hidden = false;
  } else {
    nota.hidden = true;
  }
}

// Collega i pulsanti della tesi (lo chiama app.js all'avvio)
function collegaFondamentale() {
  $("modifica-tesi").onclick = apriModuloTesi;
  $("annulla-tesi").onclick = chiudiModuloTesi;
  $("elimina-tesi").onclick = eliminaTesi;
  $("modulo-tesi").addEventListener("submit", quandoSalviTesi);
}
