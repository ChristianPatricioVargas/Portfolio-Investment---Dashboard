// agenti/mercato.js = la pagina "Mercato": uno sguardo d'insieme sulle Borse.
// Qui la pagina mostra soltanto: i dati li prepara GitHub con scripts/aggiorna_mercato.py.
// Tutto ciò che c'è in questa pagina è pubblico: nessun dato personale.

// ---------- La pagina "Mercato" ----------

function disegnaMercato() {
  $("data-mercato").textContent = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

// Collega i pulsanti della pagina Mercato (lo chiama app.js all'avvio)
function collegaMercato() {
}
