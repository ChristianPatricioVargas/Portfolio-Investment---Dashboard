# Portfolio-Investment---Dashboard

Dashboard personale per monitorare un portafoglio di investimenti e ragionare sulle decisioni.
Funziona nel browser, anche da iPad. Sito statico su GitHub Pages, dati aggiornati da GitHub Actions.

## In breve

Una dashboard che non si limita a mostrare i prezzi: una **squadra di agenti** raccoglie dati pubblici,
li analizza da punti di vista diversi e me li riassume, così posso decidere con più informazioni.
**La decisione finale resta sempre mia**: gli agenti segnalano e spiegano, non dicono mai "compra" o "vendi".

> ⚠️ Niente di ciò che mostra questa dashboard è consulenza finanziaria. Sono dati di terzi e regole
> meccaniche, che possono essere sbagliati, incompleti o in ritardo.

## La squadra di agenti

Ogni agente ha un compito solo, un file Python che fa i calcoli (su GitHub, una volta al giorno)
e un file JavaScript che li mostra nella pagina.

| Agente | Domanda | Cosa fa | Calcoli | Pagina |
|---|---|---|---|---|
| 🔎 **Analista fondamentale** | *Se* è una buona azienda | P/E, crescita di ricavi e utili, debito, margini, giudizi degli analisti (positivi, neutri, negativi) e giudizio medio, prossima trimestrale | `scripts/agenti/fondamentale.py` | `agenti/fondamentale.js` |
| 📈 **Analista tecnico** | *Quando* guardarla | Medie mobili a 50 e 200 giorni, RSI a 14 giorni, distanza da massimo e minimo a 52 settimane, supporti e resistenze, una frase di riassunto | `scripts/agenti/tecnico.py` | `agenti/tecnico.js` |
| 🎯 **Cacciatore** | *Dove* sono le occasioni | Applica 4 criteri a una watchlist di grandi aziende e fa la classifica, spiegando il motivo | `scripts/agenti/cacciatore.py` | `agenti/cacciatore.js` |
| 😈 **Avvocato del diavolo** | *Cosa può andare storto* | Campanelli d'allarme con regole semplici; in più, se accesa, un'analisi pro e contro scritta da un'AI | `scripts/agenti/avvocato.py`, `avvocato_ai.py` | `agenti/avvocato.js` |
| 📋 **Riepilogo** | *Cosa devo sapere oggi* | La pagina "Oggi" e il testo di "Copia per l'analisi" | – | `agenti/oggi.js` |

Attorno agli agenti:

- **I fattorini** vanno a prendere i dati grezzi: `scripts/agenti/yahoo.py` i prezzi da Yahoo Finance, `scripts/agenti/finnhub.py` i conti delle aziende da Finnhub.
- **Il direttore** (`scripts/aggiorna_analisi.py`) fa lavorare gli agenti in ordine e salva il risultato.
- **Le prove automatiche** (`scripts/prova_agenti.py`) controllano i calcoli con dati finti di cui si conosce il risultato.

```
        GitHub Actions (due volte al giorno)                    Il mio browser
 ┌──────────────────────────────────────────────┐      ┌───────────────────────────────┐
 │ Finnhub + Yahoo ─► fattorini ─► fondamentale │      │ analisi.json + i MIEI dati    │
 │                           ─► tecnico         │      │ (acquisti, tesi: solo qui)    │
 │   watchlist ─► cacciatore ─► avvocato (─► AI)│ ───► │   ─► Oggi · Portafoglio ·     │
 │                    │                         │ sito │      Occasioni · Titolo       │
 │        data/analisi.json, serie.json, ai.json│      │   ─► "Copia per l'analisi"    │
 └──────────────────────────────────────────────┘      └───────────────────────────────┘
        solo dati pubblici, nessuna chiave nel codice        i dati personali non escono mai
```

Scelte di progetto:

- **Dati personali solo in locale.** Gli agenti su GitHub lavorano solo su dati pubblici. Acquisti, tesi e
  titoli tolti dalla watchlist stanno nel browser (`localStorage`) e nel backup.
- **Nessun segreto nel codice.** Le chiavi (`NTFY_TOPIC`, `FINNHUB_API_KEY`, `ANTHROPIC_API_KEY`) stanno in GitHub Secrets.
- **Pochi minuti di GitHub Actions.** I prezzi si aggiornano ogni 30 minuti; gli agenti lavorano due volte al giorno:
  alle 11:53 UTC (in Italia 12:53 d'inverno, 13:53 d'estate) e alle 21:23 UTC (dopo la chiusura di Wall Street).
  Ogni giro dura circa 8 minuti. Se un giro salta, lavorano al primo giro utile.
- **Se una fonte non risponde, niente si rompe.** Resta la scheda del giorno prima e la pagina Occasioni lo dice.
- **Nessuna libreria da installare** per la pagina e per gli agenti (solo Python e JavaScript "puri");
  la libreria di Anthropic viene installata solo se l'AI è accesa.

## Le pagine

- **Oggi** (pagina iniziale): come va il portafoglio, cosa è successo ai miei titoli (prezzo, notizia principale,
  trimestrale vicina, campanelli), stato delle tesi, le 3 migliori occasioni con il loro rischio principale,
  e il pulsante **Copia per l'analisi**.
- **Portafoglio**: totale, grafico, schede dei titoli, backup (com'era prima).
- **Occasioni**: le 5 aziende della watchlist che oggi spiccano (più segnali e punteggio più alto), ciascuna con la direzione recente del prezzo e il rischio principale. Il resto della watchlist sta in elenchi chiusi: altre con 3 o 4 segnali, con 1 o 2, senza segnali.
- **Pagina di un titolo** (mio o della watchlist): analista tecnico, analista fondamentale, criteri del cacciatore,
  avvocato del diavolo, notizie. Per i miei titoli anche acquisti, rendimento, **scheda tesi** e **Se vendo oggi**.

### La scheda tesi e "Se vendo oggi"

Per ogni titolo posso scrivere **perché sono entrato**, il **mio target** e le **condizioni di uscita** (una per riga).
Una barra mostra a che punto sono tra il mio prezzo medio e il target. Quando una condizione di uscita si verifica
la spunto io: comparirà nella pagina Oggi.

**Se vendo oggi** calcola il netto in tasca:

- incasso = quote × prezzo − 1 € di commissione
- plusvalenza = incasso − capitale investito
- tasse = 26% della plusvalenza (zero se in perdita)
- netto in tasca = incasso − tasse

È una stima: non considera minusvalenze passate e usa il prezzo di Xetra, non quello di vendita di Trade Republic.

### Il cacciatore e la watchlist

La watchlist è in `data/watchlist.json`: circa 90 grandi aziende di Europa e Stati Uniti e, per l'Asia, solo nomi
molto noti (Toyota, Sony, Samsung, TSMC...). Niente aziende piccole o poco trasparenti.

I quattro segnali (le soglie sono in cima a `scripts/agenti/cacciatore.py`):

1. **Calo**: almeno −15% dal massimo a 52 settimane
2. **Utili in crescita**: attesi dagli analisti, o nell'ultimo trimestre
3. **Conti solidi**: in utile e con debito netto non oltre 3 volte l'EBITDA (per banche e assicurazioni conta solo l'utile)
4. **Analisti positivi**: almeno il 60% degli analisti (e almeno 5 analisti) ha un giudizio positivo

La pagina mette in cima le 5 aziende con più segnali e punteggio più alto. È una selezione da studiare, non una previsione.
Il punteggio (0-100) ordina le aziende a parità di segnali: più calo, più crescita, meno debito e più analisti positivi = più punti.

**Togliere un titolo**: nella pagina Occasioni, "Togli" lo nasconde su questo dispositivo (si può rimettere).
**Aggiungere un titolo**: la pagina Occasioni prepara la riga da incollare in `data/watchlist.json`
(servono la sigla di Yahoo Finance sulla Borsa principale, es. `MC.PA`, e la sigla americana per i fondamentali,
es. `LVMUY`). Deve stare nel repository perché è GitHub, non il browser, a scaricare i dati.

Per **comprare** un titolo della watchlist e seguirlo nel Portafoglio va aggiunto a `data/titoli.json` con la sigla
di Xetra in euro (es. `NKE.DE`) e, nel campo `usa`, la sigla americana (es. `NKE`):
così i prezzi sono in euro e i fondamentali arrivano da Finnhub.

### L'avvocato del diavolo

Campanelli d'allarme, in due livelli (**attenzione** e **da tenere d'occhio**):

- utili o ricavi in calo, ultima trimestrale sotto le attese
- debito alto, azienda in perdita
- giudizio medio degli analisti peggiorato nell'ultimo mese, pochi analisti positivi
- prezzo sotto la media a 200 giorni
- trimestrale in arrivo entro 14 giorni
- notizie con parole negative nel titolo (indagine, richiamo, causa, multa, guidance tagliata, profit warning...)

Nessun campanello **non** vuol dire nessun rischio: le regole guardano solo alcuni numeri.

#### La versione con AI (spenta)

L'avvocato può anche farsi scrivere da Claude (API di Anthropic) un'analisi **pro e contro** leggendo fondamentali,
segnali tecnici, campanelli e titoli delle notizie. **È spenta**: si accende solo creando il segreto `ANTHROPIC_API_KEY`.
All'AI arrivano solo dati pubblici, mai quote, importi o tesi.

Per accenderla:

1. crea una chiave su [console.anthropic.com](https://console.anthropic.com) e carica un piccolo credito;
2. **nella Console imposta un limite di spesa mensile** (è la protezione vera: vale qualunque cosa succeda);
3. su GitHub: **Settings → Secrets and variables → Actions → New repository secret**, nome `ANTHROPIC_API_KEY`.

Per spegnerla basta cancellare il segreto.

I freni alla spesa si regolano dalla scheda **Variables** della stessa pagina (non sono segreti):

| Variabile | A cosa serve | Predefinito |
|---|---|---|
| `AI_CHIAMATE_AL_GIORNO` | quante analisi al massimo in un giorno | `4` |
| `AI_BUDGET_MENSILE_USD` | tetto di spesa del mese, in dollari | `5` |
| `AI_MODELLO` | quale modello usare | `claude-opus-5-5` |

In più un'analisi viene rifatta solo se sono cambiate le notizie o i campanelli del titolo, o dopo una settimana.

**Quanto costa.** Un'analisi usa circa 2.500 token in ingresso e 2.000 in uscita. Con i prezzi di novembre 2026:

| Modello | Costo di un'analisi | Uso normale (1-2 analisi al giorno) | Massimo possibile (4 al giorno, 22 giorni) |
|---|---|---|---|
| `claude-opus-5-5` (predefinito, il più capace) | circa 0,05 $ | 1 - 2,5 $ al mese | circa 4,5 $ (il tetto è 5 $) |
| `claude-sonnet-5-5` | circa 0,025 $ | 0,5 - 1,2 $ al mese | circa 2,2 $ |
| `claude-haiku-5-5` (il più economico) | circa 0,001 $ | pochi centesimi al mese | circa 0,12 $ |

Il contatore della spesa è nel file `data/ai.json` del sito: se un giorno il sito non fosse raggiungibile il contatore
ripartirebbe da zero, per questo il limite nella Console di Anthropic resta consigliato.

### Copia per l'analisi

Nella pagina Oggi, **Copia per l'analisi** mette in un testo semplice portafoglio, tesi, fondamentali, segnali tecnici,
campanelli, occasioni e notizie. Incollandolo in una chat con Claude si ottiene un'analisi critica **gratis**
(senza API) e con tutti i dati, compresi quelli personali, che però escono dal dispositivo solo se li incollo io.

## Le fonti dei dati e i loro limiti

| Dato | Fonte | Note |
|---|---|---|
| Prezzi, storico, analisi tecnica | Yahoo Finance (grafico) | Senza chiave. Funziona dai server di GitHub |
| Conti delle aziende, giudizi degli analisti, trimestrali | **Finnhub**, con chiave gratuita (`FINNHUB_API_KEY` nei Secrets) | Il piano gratuito copre le aziende quotate negli Stati Uniti: per questo ogni titolo ha una sigla americana (campo `usa`) |
| Notizie | Google News, Bing News, Yahoo Finance | Senza chiave |

**Come ci si è arrivati** (prove dal vivo del 14-15 novembre 2026, fatte dai server di GitHub):

1. *Yahoo Finance* dà i prezzi, ma **rifiuta le richieste dei fondamentali** che partono da GitHub (errore 429).
   Esistono librerie che si fingono un browser per farsi accettare: scelta scartata, perché aggira un rifiuto esplicito.
2. *Alpha Vantage* gratuito: i fondamentali sono diventati a pagamento (resta gratis solo il calendario delle trimestrali).
3. *Finnhub* gratuito: dà circa 130 numeri di bilancio per azienda, i giudizi degli analisti mese per mese,
   le sorprese sulle trimestrali e la data della prossima. **Non dà il target price medio** (a pagamento)
   e non copre le sigle europee dirette, ma copre le stesse aziende con la loro sigla americana
   (SAP → `SAP`, Airbus → `EADSY`, Toyota → `TM`, LVMH → `LVMUY`...).

**Conseguenze sul progetto:**

- Il quarto segnale del cacciatore non è "target almeno +15%" ma "**almeno il 60% degli analisti è positivo**".
  Se un giorno la fonte desse il target, il codice userebbe quello (è già previsto).
- Il mio target lo scrivo io nella scheda tesi (lo si trova su Trade Republic): la barra di avanzamento usa quello.
- I conti sono quelli della quotazione americana: percentuali, margini e giudizi valgono per l'azienda;
  il calo dai massimi è calcolato sui prezzi della Borsa principale (Yahoo).
- Per le aziende non americane due numeri ricavati con un calcolo (utili attesi e debito netto ÷ EBITDA) nella prova
  dal vivo risultavano sbagliati: restano vuoti, e gli agenti usano la crescita degli utili già realizzata e il
  rapporto debito ÷ capitale, che arrivano direttamente dalla fonte.
- Un'azienda senza sigla americana, o non coperta dal piano gratuito, resta nella watchlist con analisi tecnica
  e notizie ma senza fondamentali: la pagina Occasioni le elenca.
- Solo `scripts/agenti/finnhub.py` e `fondamentale.py` conoscono la forma dei dati di Finnhub:
  cambiare fonte non tocca gli altri agenti.

Per ricontrollare le fonti: **Actions → Prova agenti → Run workflow**. La tabella compare sotto "Summary".

## Privacy

Il codice è pubblico, ma **quote, capitale investito, prezzi d'acquisto e tesi non sono nel codice**:
ognuno li inserisce dalla pagina e restano salvati solo nel proprio browser (`localStorage`).
Chi apre il link vede una dashboard vuota e può usarla per sé.
Il backup ("Copia backup" nella pagina Portafoglio) contiene acquisti, tesi e titoli tolti dalla watchlist.

## Com'è fatto

| File | A cosa serve |
|---|---|
| `index.html` | Lo scheletro della pagina: le viste Oggi, Portafoglio, Occasioni e Titolo |
| `style.css` | L'aspetto: colori, spazi, modalità scura |
| `app.js` | Il cervello: legge i dati, fa i calcoli del portafoglio, salva sul dispositivo, cambia pagina |
| `agenti/*.js` | La parte di pagina di ogni agente (vedi tabella sopra) |
| `data/titoli.json` | I titoli del portafoglio, con le parole da cercare nelle notizie |
| `data/watchlist.json` | Le grandi aziende che il cacciatore tiene d'occhio |
| `data/prezzi.json`, `storico.json`, `intraday.json`, `notizie.json`, `allarmi.json`, `analisi.json`, `serie.json`, `ai.json` | **Non sono nel repository**: li crea GitHub Actions e stanno solo nel sito pubblicato (prezzi, storico, notizie, allarmi inviati, lavoro degli agenti, linee dei grafici tecnici, analisi dell'AI) |
| `scripts/aggiorna_prezzi.py` | Scarica prezzi, storico e notizie e manda gli allarmi (ogni 30 minuti) |
| `scripts/aggiorna_analisi.py` | Il direttore degli agenti (due volte al giorno) |
| `scripts/agenti/*.py` | I calcoli di ogni agente |
| `scripts/prova_agenti.py` | Le prove automatiche degli agenti |
| `scripts/confronta_borse.py` | Programma di prova: confronta i prezzi di Xetra, Francoforte, Stoccarda e Monaco |
| `.github/workflows/pubblica-sito.yml` | Ogni 30 minuti nei giorni di Borsa: prezzi, allarmi, pubblicazione. Due volte al giorno: anche gli agenti |
| `.github/workflows/prova-agenti.yml` | Le prove automatiche e la prova dal vivo delle fonti |
| `.github/workflows/confronta-borse.yml` | Il pulsante "Run workflow" per il confronto tra borse |

## Come viene pubblicato il sito

Il sito è pubblicato da **GitHub Actions** (non direttamente dal ramo `main`):
il workflow scarica i prezzi, li mette nei file `data/` **del sito pubblicato** e pubblica.
I prezzi quindi non vengono salvati nel repository e la cronologia contiene solo le modifiche al codice.
Tra un giro e l'altro i dati restano nel sito stesso: a ogni giro vengono riscaricati, aggiornati e ripubblicati.

## Da dove vengono i prezzi

I prezzi sono quelli di **Xetra** (Borsa tedesca, 9:00-17:30) presi da Yahoo Finance.
Sotto il totale la pagina scrive la borsa, l'ora dell'ultimo scambio e quando GitHub ha controllato i prezzi.

Trade Republic invece valuta le posizioni con il **prezzo di vendita (bid) di LS Exchange**, aperta fino alle 23:00:
per questo, soprattutto la sera, i valori possono essere un po' diversi.

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

Toccando un titolo si apre la sua pagina: a sinistra i numeri, il rendimento del titolo dal primo
acquisto (confrontato con quello di tutto il portafoglio) e il lavoro degli agenti; a destra l'elenco degli
acquisti, da aggiungere, modificare o eliminare, e la scheda tesi. Con "‹ Indietro" o il gesto indietro si torna alla pagina di prima.

## Notizie

Nella pagina di ogni titolo, sotto il grafico, compaiono le ultime notizie (ultimi 7 giorni).
Il programma prova tre servizi in ordine e usa il primo che risponde: **Google News** (italiano), **Bing News** (italiano)
e **Yahoo Finance** (inglese, ultima riserva: Google a volte rifiuta le richieste dai server di GitHub). Per ogni notizia:
titolo, giornale e da quanto tempo è uscita; toccandola si apre l'articolo.
Le parole da cercare sono nei campi `notizie` (italiano) e `notizie_en` (inglese, per Yahoo) di `data/titoli.json`.
Per gli ETF si cercano notizie sull'indice e sui mercati, perché di notizie sul singolo ETF ce ne sono poche.

## Allarmi (ntfy)

Se un titolo scende troppo in giornata arriva una notifica sull'app **ntfy**:
**−5%** per le azioni, **−3%** per gli ETF (al massimo un avviso al giorno per titolo).

Per attivarli:
1. installa l'app gratuita **ntfy** e iscriviti a un canale con un nome lungo e casuale;
2. salva quel nome in **Settings → Secrets and variables → Actions → New repository secret**
   con nome `NTFY_TOPIC`;
3. prova: **Actions → Aggiorna prezzi e pubblica sito → Run workflow** con "Manda anche una notifica di prova" spuntato.

Gli allarmi contengono solo prezzi pubblici: le tue quote e i tuoi importi non lasciano mai il dispositivo.

## Tabella di marcia

1. ✅ Pagina con totale e schede dei titoli (stile scuro)
2. ✅ Pubblicazione con GitHub Pages
3. ✅ Prezzi automatici da Yahoo Finance con GitHub Actions
4. ✅ Grafico dell'andamento dall'acquisto
5. ✅ Allarmi (−5% giornaliero azioni, −3% ETF) con ntfy
6. ✅ Notizie sui titoli
7. ✅ Analista fondamentale, scheda tesi e "Se vendo oggi"
8. ✅ Analista tecnico
9. ✅ Cacciatore e watchlist
10. ✅ Avvocato del diavolo (regole; versione con AI pronta ma spenta)
11. ✅ Pagina "Oggi" e "Copia per l'analisi"
12. ✅ Fondamentali da Finnhub (dopo aver scartato Yahoo e Alpha Vantage con prove dal vivo), agenti due volte al giorno
