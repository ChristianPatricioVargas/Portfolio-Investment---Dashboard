"""
aggiorna_analisi.py = il "direttore" della squadra di agenti.

Non lo esegui tu: lo fa GitHub UNA VOLTA AL GIORNO, la sera dopo la chiusura delle Borse
(le istruzioni sono in .github/workflows/pubblica-sito.yml). I prezzi invece continuano
ad aggiornarsi ogni 30 minuti con aggiorna_prezzi.py: questo lavoro è più pesante e
una volta al giorno basta.

Cosa fa, passo per passo:
  1. legge i titoli del portafoglio (data/titoli.json)
  2. per ogni azione chiede a Yahoo Finance i dati e li passa all'analista fondamentale
  3. per ogni titolo scarica due anni di prezzi e li passa all'analista tecnico
  4. salva tutto in data/analisi.json (i numeri) e data/serie.json (le linee dei grafici),
     che la pagina legge e mostra

Se un titolo non risponde, tiene la scheda del giorno prima.
Nessun dato personale passa di qui: solo dati pubblici.

Opzioni:
  --se-vecchia   lavora solo se l'ultima analisi ha più di 30 ore (o non esiste)
"""

import json
import sys
from datetime import datetime, timedelta, timezone

from aggiorna_prezzi import CARTELLA_DATI, FILE_TITOLI, leggi_json, scrivi_json
from agenti import fondamentale, tecnico
from agenti.yahoo import Yahoo

FILE_ANALISI = CARTELLA_DATI / "analisi.json"
FILE_SERIE = CARTELLA_DATI / "serie.json"     # le linee del grafico tecnico (prezzo e medie mobili)
ORE_VALIDITA = 30   # dopo quante ore l'analisi è considerata "vecchia"
FORMATO_ORA = "%Y-%m-%dT%H:%M:%SZ"


def ancora_fresca(analisi):
    """Vero se l'analisi salvata è recente: non serve rifarla."""
    try:
        fatta = datetime.strptime(analisi["aggiornato"], FORMATO_ORA).replace(tzinfo=timezone.utc)
    except (KeyError, TypeError, ValueError):
        return False
    return datetime.now(timezone.utc) - fatta < timedelta(hours=ORE_VALIDITA)


def elenco_titoli():
    """Tutti i titoli da analizzare. Per ora: quelli del portafoglio.
    "fonte" è la sigla da usare per i fondamentali: per Airbus è AIR.PA (Parigi, la Borsa
    principale), perché su quella di Francoforte (AIR.DE) Yahoo ha meno dati sugli analisti."""
    elenco = []
    for t in leggi_json(FILE_TITOLI, []):
        elenco.append({"ticker": t["ticker"], "nome": t["nome"], "tipo": t["tipo"], "gruppo": "portafoglio",
                       "fonte": t.get("fondamentali") or t["ticker"]})
    return elenco


def analizza_titolo(yahoo, voce, scheda, serie, oggi):
    """Fa lavorare gli agenti su un titolo: aggiorna la sua scheda e la sua serie per il grafico.
    Restituisce gli errori incontrati."""
    errori = []
    ticker = voce["ticker"]

    # --- Analista fondamentale (solo azioni: un ETF contiene migliaia di aziende) ---
    if voce["tipo"] == "Azione":
        try:
            nuova = fondamentale.analizza(yahoo.riepilogo(voce["fonte"]), oggi)
            if not fondamentale.ha_dati(nuova):
                raise ValueError("Yahoo ha risposto senza dati")
            nuova["aggiornato"] = oggi
            scheda["fondamentali"] = nuova
            print(f"OK   fondamentali {ticker}: P/E {nuova['pe']}, target {nuova['target']} {nuova['valuta']}")
        except Exception as errore:
            errori.append(f"fondamentali {ticker}: {errore}")
            print(f"ERRORE fondamentali {ticker}: {errore} (tengo quelli di prima, se ci sono)")

    # --- Analista tecnico (azioni ed ETF): servono due anni di prezzi per la media a 200 giorni ---
    try:
        grafico = yahoo.grafico(ticker, "2y")
        giorni, valori = tecnico.chiusure(grafico)
        nuova, linee = tecnico.analizza(giorni, valori, grafico["meta"].get("currency") or "")
        if nuova is None:
            raise ValueError("storia dei prezzi troppo breve")
        scheda["tecnica"] = nuova
        serie[ticker] = linee
        print(f"OK   tecnica {ticker}: RSI {nuova['rsi']}, {nuova['dalMassimo'] * 100:.0f}% dal massimo")
    except Exception as errore:
        errori.append(f"tecnica {ticker}: {errore}")
        print(f"ERRORE tecnica {ticker}: {errore} (tengo quella di prima, se c'è)")
    return errori


def main():
    vecchia = leggi_json(FILE_ANALISI, {})
    if "--se-vecchia" in sys.argv and ancora_fresca(vecchia):
        print(f"Analisi ancora fresca (del {vecchia['aggiornato']}): gli agenti oggi hanno già lavorato.")
        return

    adesso = datetime.now(timezone.utc)
    oggi = adesso.strftime("%Y-%m-%d")
    yahoo = Yahoo()
    schede, errori = {}, []
    vecchie_serie = leggi_json(FILE_SERIE, {})
    serie = {}

    for voce in elenco_titoli():
        # Partiamo dalla scheda vecchia: se oggi un dato non arriva, resta quello di prima
        scheda = dict((vecchia.get("titoli") or {}).get(voce["ticker"], {}))
        scheda.update({"nome": voce["nome"], "tipo": voce["tipo"], "gruppo": voce["gruppo"]})
        if voce["ticker"] in vecchie_serie:
            serie[voce["ticker"]] = vecchie_serie[voce["ticker"]]
        errori += analizza_titolo(yahoo, voce, scheda, serie, oggi)
        schede[voce["ticker"]] = scheda

    scrivi_json(FILE_ANALISI, {
        "aggiornato": adesso.strftime(FORMATO_ORA),
        "fonte": "Yahoo Finance (non ufficiale)",
        "errori": errori,       # la pagina li mostra, così sai se una fonte non ha funzionato
        "titoli": schede,
    })
    # Senza rientri e spazi: questo file contiene migliaia di numeri, così pesa molto meno
    FILE_SERIE.write_text(json.dumps(serie, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Analisi salvata: {len(schede)} titoli, {len(errori)} errori.")
    if errori:
        # "::warning::" fa comparire un avviso giallo nella pagina di GitHub Actions
        print(f"::warning::Agenti: {len(errori)} dati non scaricati. Primo errore: {errori[0]}")


if __name__ == "__main__":
    main()
