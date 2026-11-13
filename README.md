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
| `data/intraday.json` | I prezzi ogni 5 minuti dell'ultimo giorno di Borsa, per il grafico "1G" (scritto in automatico) |
| `data/storico.json` | I prezzi di chiusura passati, per il grafico (scritto in automatico) |
| `data/allarmi.json` | Quali allarmi sono già partiti oggi, per non ripeterli (scritto in automatico) |
| `scripts/aggiorna_prezzi.py` | Il programma che scarica prezzi e storico da Yahoo Finance e manda gli allarmi |
| `.github/workflows/aggiorna-prezzi.yml` | Dice a GitHub di eseguire quel programma ogni 30 minuti nei giorni di Borsa |

## Calcoli

Ogni titolo può avere **più acquisti** (data, quote comprate, importo pagato commissioni incluse).
La pagina li somma da sola:

- **Quote totali** = somma delle quote di tutti gli acquisti
- **Capitale investito** = somma degli importi pagati
- **Prezzo medio di carico** = capitale investito ÷ quote totali
- **Valore attuale** = quote totali × prezzo attuale
- **Guadagno/perdita (€)** = valore attuale − capitale investito
- **Guadagno/perdita (%)** = guadagno/perdita ÷ capitale investito

Il grafico della panoramica mostra di default il **rendimento in %** (valore ÷ investito − 1, giorno per giorno):
così i nuovi acquisti non creano "gradini" e si vede come stanno andando davvero i soldi investiti.
Con il selettore **€** si passa al valore in euro.

I pulsanti **1G · 1S · 1M · Anno · Tutto** scelgono il periodo. Il rendimento del periodo è:

- **guadagno nel periodo** = (valore − investito) alla fine − (valore − investito) all'inizio del periodo
- **base** = valore all'inizio del periodo + soldi investiti dopo
- **rendimento** = guadagno nel periodo ÷ base

Così un acquisto fatto durante il periodo non conta come guadagno. Con "Tutto" è il guadagno/perdita dall'inizio.

Toccando un titolo si apre la sua pagina: a sinistra i numeri e il rendimento del titolo dal primo
acquisto, confrontato con quello di tutto il portafoglio; a destra l'elenco degli acquisti, da aggiungere,
modificare o eliminare. Con "‹ Tutti i titoli" o il gesto indietro si torna alla panoramica.

## Allarmi (ntfy)

Se un titolo scende troppo in giornata arriva una notifica sull'app **ntfy**:
**−5%** per le azioni, **−3%** per gli ETF (al massimo un avviso al giorno per titolo).

Per attivarli:
1. installa l'app gratuita **ntfy** e iscriviti a un canale con un nome lungo e casuale;
2. salva quel nome in **Settings → Secrets and variables → Actions → New repository secret**
   con nome `NTFY_TOPIC`;
3. prova: **Actions → Aggiorna prezzi → Run workflow** con "Manda solo una notifica di prova" spuntato.

Gli allarmi contengono solo prezzi pubblici: le tue quote e i tuoi importi non lasciano mai il dispositivo.

## Tabella di marcia

1. ✅ Pagina con totale e schede dei titoli (stile scuro)
2. ✅ Pubblicazione con GitHub Pages
3. ✅ Prezzi automatici da Yahoo Finance con GitHub Actions
4. ✅ Grafico dell'andamento dall'acquisto
5. ✅ Allarmi (−5% giornaliero azioni, −3% ETF) con ntfy
6. Notizie sui titoli
