# Portfolio-Investment---Dashboard

Dashboard personale per monitorare un portafoglio di investimenti.
Funziona nel browser, anche da iPad.

## Privacy

Il codice è pubblico, ma **le quote e il capitale investito non sono nel codice**:
ognuno li inserisce dalla pagina e restano salvati solo nel proprio browser
(`localStorage`). Chi apre il link vede una dashboard vuota e può usarla per sé.

## Com'è fatto

| File | A cosa serve |
|---|---|
| `index.html` | Lo scheletro della pagina: riquadri, tabella, modulo |
| `style.css` | L'aspetto: colori, spazi, modalità scura |
| `app.js` | Il cervello: legge i dati, fa i calcoli, salva sul dispositivo |
| `data/titoli.json` | L'elenco dei titoli che si possono scegliere |
| `data/prezzi.json` | I prezzi attuali, scritti in automatico (non modificarlo a mano) |
| `scripts/aggiorna_prezzi.py` | Il programma che scarica i prezzi da Yahoo Finance |
| `.github/workflows/aggiorna-prezzi.yml` | Dice a GitHub di eseguire quel programma ogni 30 minuti nei giorni di Borsa |

## Calcoli

- **Valore attuale** = quote × prezzo attuale
- **Guadagno/perdita (€)** = valore attuale − capitale investito
- **Guadagno/perdita (%)** = guadagno/perdita ÷ capitale investito

## Tabella di marcia

1. ✅ Pagina con totale e schede dei titoli (stile scuro)
2. Pubblicazione con GitHub Pages
3. ✅ Prezzi automatici da Yahoo Finance con GitHub Actions (parte dopo l'unione in `main`)
4. Grafici
5. Allarmi (−5% giornaliero azioni, −3% ETF)
6. Notizie sui titoli
