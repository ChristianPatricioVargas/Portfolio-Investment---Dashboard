// agenti/avvocato.js = la parte della pagina dell'AVVOCATO DEL DIAVOLO (i rischi).
// Nella pagina di un titolo mostra:
//   - i "campanelli d'allarme" trovati dalle regole (scripts/agenti/avvocato.py)
//   - se l'AI è accesa, l'analisi pro e contro scritta da Claude (scripts/agenti/avvocato_ai.py)
// E dà alle altre pagine il "rischio principale" di ogni titolo.
// Nessun campanello NON vuol dire nessun rischio: sono regole meccaniche.

// Le analisi scritte dall'AI (da data/ai.json). Se l'AI è spenta resta vuoto.
let ai = { attiva: false, analisi: {} };

const NOMI_LIVELLO = { alto: "Attenzione", medio: "Da tenere d'occhio" };

function campanelliDi(ticker) {
  return (analisi.titoli[ticker] || {}).campanelli || [];
}

// "⚠️ 3 campanelli (1 da guardare subito)" per le schede, "" se non ce ne sono
function testoCampanelli(ticker) {
  const lista = campanelliDi(ticker);
  if (lista.length === 0) return "";
  return `⚠️ ${lista.length} ${lista.length === 1 ? "campanello" : "campanelli"}`;
}

// Il rischio più importante di un titolo, in una riga (il primo della lista: i gravi vengono prima)
function rischioPrincipale(ticker) {
  const primo = campanelliDi(ticker)[0];
  return primo ? `${primo.titolo}: ${primo.testo}` : "";
}

function creaCampanello(c) {
  const voce = document.createElement("li");
  voce.className = "campanello " + c.livello;
  voce.innerHTML = `<span class="livello"></span><div><b></b><span></span></div>`;
  voce.querySelector(".livello").textContent = (c.livello === "alto" ? "▲ " : "● ") + (NOMI_LIVELLO[c.livello] || c.livello);
  voce.querySelector("b").textContent = c.titolo;
  voce.querySelector("div span").textContent = c.testo;
  return voce;
}

function disegnaAvvocato() {
  const scheda = analisi.titoli[tickerAperto];
  const lista = campanelliDi(tickerAperto);
  const pronto = Boolean(scheda && scheda.campanelli);
  $("attesa-avvocato").hidden = pronto;
  $("corpo-avvocato").hidden = !pronto;
  if (!pronto) return;

  const elenco = $("elenco-campanelli");
  elenco.innerHTML = "";
  for (const c of lista) elenco.appendChild(creaCampanello(c));
  $("nessun-campanello").hidden = lista.length > 0;
  // Senza fondamentali i campanelli sui conti non sono stati controllati: va detto
  const mancanoConti = infoTitolo(tickerAperto).tipo !== "ETF" && !scheda.fondamentali;
  $("avvocato-incompleto").hidden = !mancanoConti;

  // ---- L'analisi scritta dall'AI (solo se accesa e solo per alcuni titoli) ----
  const a = (ai.analisi || {})[tickerAperto];
  $("blocco-ai").hidden = !a;
  if (a) {
    $("sintesi-ai").textContent = a.sintesi;
    for (const [id, voci] of [["pro-ai", a.pro], ["contro-ai", a.contro], ["verificare-ai", a.daVerificare]]) {
      $(id).innerHTML = "";
      for (const testo of voci || []) {
        const voce = document.createElement("li");
        voce.textContent = testo;     // testo semplice: ciò che scrive l'AI non viene mai eseguito
        $(id).appendChild(voce);
      }
    }
    $("fonte-ai").textContent = `Scritta da un'intelligenza artificiale (${a.modello || "Claude"}) il ${dataBreve(a.data)}, ` +
      "leggendo solo dati pubblici. Può sbagliare o non sapere cose importanti: verifica sempre.";
  }
  const info = infoTitolo(tickerAperto);
  $("stato-ai").hidden = Boolean(a) || info.tipo === "ETF";
  $("stato-ai").textContent = ai.attiva
    ? "Analisi con AI: accesa, ma non ancora scritta per questo titolo (ne fa poche al giorno, partendo dalle tue azioni e dalla classifica)."
    : "Analisi con AI: spenta. Si accende solo se crei il segreto ANTHROPIC_API_KEY su GitHub (vedi README).";
}
