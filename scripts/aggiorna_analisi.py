"""
aggiorna_analisi.py = il "direttore" della squadra di agenti.

Non lo esegui tu: lo fa GitHub UNA VOLTA AL GIORNO, la sera dopo la chiusura delle Borse
(le istruzioni sono in .github/workflows/pubblica-sito.yml). I prezzi invece continuano
ad aggiornarsi ogni 30 minuti con aggiorna_prezzi.py: questo lavoro è più pesante e
una volta al giorno basta.

Cosa fa, passo per passo:
  1. legge i titoli del portafoglio (data/titoli.json) e la watchlist (data/watchlist.json)
  2. per ogni azione chiede a Yahoo Finance i dati e li passa all'analista fondamentale
  3. per ogni titolo scarica due anni di prezzi e li passa all'analista tecnico
  4. il cacciatore controlla i suoi criteri e prepara la classifica delle occasioni;
     per i titoli in classifica scarica anche le notizie
  5. l'avvocato del diavolo cerca i campanelli d'allarme di ogni titolo
  6. se esiste il segreto ANTHROPIC_API_KEY, la versione con AI dell'avvocato scrive
     un'analisi pro e contro per pochi titoli al giorno (altrimenti resta spenta)
  7. salva tutto in data/analisi.json (i numeri) e data/serie.json (le linee dei grafici),
     che la pagina legge e mostra

Se un titolo non risponde, tiene la scheda del giorno prima.
Nessun dato personale passa di qui: solo dati pubblici.

Opzioni:
  --se-vecchia   lavora solo se l'ultima analisi ha più di 30 ore (o non esiste)
"""

import json
import sys
from datetime import datetime, timedelta, timezone

from aggiorna_prezzi import CARTELLA_DATI, FILE_NOTIZIE, FILE_TITOLI, leggi_json, notizie_di, scrivi_json
from agenti import avvocato, avvocato_ai, cacciatore, fondamentale, tecnico
from agenti.yahoo import FonteNonDisponibile, Yahoo

FILE_ANALISI = CARTELLA_DATI / "analisi.json"
FILE_WATCHLIST = CARTELLA_DATI / "watchlist.json"   # le grandi aziende che il cacciatore tiene d'occhio
FILE_AI = CARTELLA_DATI / "ai.json"          # le analisi scritte dall'AI e il contatore della spesa
FILE_SERIE = CARTELLA_DATI / "serie.json"     # le linee del grafico tecnico (prezzo e medie mobili)
ORE_VALIDITA = 30   # dopo quante ore l'analisi è considerata "vecchia"
GIORNI_DATI_VALIDI = 7      # fondamentali più vecchi di così non entrano in classifica
NOTIZIE_PER_OCCASIONI = 12  # per quanti titoli della classifica scarichiamo le notizie
OCCASIONI_PER_AI = 5        # quante occasioni (oltre alle azioni del portafoglio) può analizzare l'AI
FORMATO_ORA = "%Y-%m-%dT%H:%M:%SZ"


def ancora_fresca(analisi):
    """Vero se l'analisi salvata è recente: non serve rifarla."""
    try:
        fatta = datetime.strptime(analisi["aggiornato"], FORMATO_ORA).replace(tzinfo=timezone.utc)
    except (KeyError, TypeError, ValueError):
        return False
    return datetime.now(timezone.utc) - fatta < timedelta(hours=ORE_VALIDITA)


def elenco_titoli():
    """Tutti i titoli da analizzare: quelli del portafoglio e quelli della watchlist.
    "fonte" è la sigla da usare per i fondamentali: per Airbus è AIR.PA (Parigi, la Borsa
    principale), perché su quella di Francoforte (AIR.DE) Yahoo ha meno dati sugli analisti."""
    elenco = []
    for t in leggi_json(FILE_TITOLI, []):
        elenco.append({"ticker": t["ticker"], "nome": t["nome"], "tipo": t["tipo"], "gruppo": "portafoglio",
                       "fonte": t.get("fondamentali") or t["ticker"], "notizie": t.get("notizie"),
                       "notizie_en": t.get("notizie_en")})
    # La watchlist: saltiamo i doppioni e i titoli che sono già nel portafoglio
    gia_visti = {v["ticker"] for v in elenco} | {v["fonte"] for v in elenco}
    for t in leggi_json(FILE_WATCHLIST, []):
        if not t.get("ticker") or t["ticker"] in gia_visti:
            continue
        gia_visti.add(t["ticker"])
        elenco.append({"ticker": t["ticker"], "nome": t.get("nome") or t["ticker"], "tipo": "Azione",
                       "gruppo": "watchlist", "area": t.get("area") or "", "fonte": t["ticker"],
                       "notizie": t.get("notizie"), "notizie_en": t.get("notizie_en")})
    return elenco


def dati_recenti(scheda, oggi):
    """Vero se i fondamentali della scheda sono abbastanza recenti da fidarsi."""
    fatta = (scheda.get("fondamentali") or {}).get("aggiornato")
    if not fatta:
        return False
    limite = (datetime.strptime(oggi, "%Y-%m-%d") - timedelta(days=GIORNI_DATI_VALIDI)).strftime("%Y-%m-%d")
    return fatta >= limite


def notizie_occasioni(elenco, da_seguire):
    """Scarica le notizie dei titoli in classifica e le aggiunge a data/notizie.json.
    Toglie quelle dei titoli che non sono più né in portafoglio né in classifica."""
    dati = leggi_json(FILE_NOTIZIE, {})
    notizie, servizi = dict(dati.get("notizie", {})), dict(dati.get("servizi", {}))
    voci = {v["ticker"]: v for v in elenco}
    restano = {t for t, v in voci.items() if v["gruppo"] == "portafoglio"} | set(da_seguire)
    for ticker in list(notizie):
        if ticker not in restano:
            notizie.pop(ticker)
            servizi.pop(ticker, None)
    for ticker in da_seguire:
        voce = voci[ticker]
        # Tra virgolette, così Google cerca il nome esatto dell'azienda
        ricerca = {"nome": voce["nome"], "notizie": voce.get("notizie") or f'"{voce["nome"]}"',
                   "notizie_en": voce.get("notizie_en") or voce["nome"]}
        nome, trovate = notizie_di(ricerca)
        if nome:
            notizie[ticker], servizi[ticker] = trovate, nome
        print(f"NOTIZIE {ticker}: {len(trovate)} da {nome or 'nessun servizio'}")
    dati.update({"notizie": notizie, "servizi": servizi})
    dati.setdefault("aggiornato", datetime.now(timezone.utc).strftime(FORMATO_ORA))
    scrivi_json(FILE_NOTIZIE, dati)


fonte_chiusa_detta = set()   # per scrivere "fonte chiusa" una volta sola nel registro di GitHub


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
            # Ricordiamo il target di ogni giorno: serve all'avvocato per accorgersi se viene abbassato
            scheda["storiaTarget"] = avvocato.aggiorna_storia_target(scheda.get("storiaTarget"), nuova["target"], oggi)
            print(f"OK   fondamentali {ticker}: P/E {nuova['pe']}, target {nuova['target']} {nuova['valuta']}")
        except FonteNonDisponibile as errore:
            # La fonte è chiusa per tutti i titoli (il direttore lo conta una volta sola, non 90)
            errori.append(str(errore))
            if voce["ticker"] not in fonte_chiusa_detta:
                if not fonte_chiusa_detta:
                    print(f"ERRORE fondamentali: {errore}. Per questo giro tengo quelli di prima, se ci sono.")
                fonte_chiusa_detta.add(voce["ticker"])
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

    elenco = elenco_titoli()
    for voce in elenco:
        # Partiamo dalla scheda vecchia: se oggi un dato non arriva, resta quello di prima
        scheda = dict((vecchia.get("titoli") or {}).get(voce["ticker"], {}))
        scheda.update({"nome": voce["nome"], "tipo": voce["tipo"], "gruppo": voce["gruppo"], "area": voce.get("area", "")})
        if voce["ticker"] in vecchie_serie:
            serie[voce["ticker"]] = vecchie_serie[voce["ticker"]]
        for errore in analizza_titolo(yahoo, voce, scheda, serie, oggi):
            if errore not in errori:        # lo stesso errore (es. "fonte chiusa") si segna una volta sola
                errori.append(errore)
        schede[voce["ticker"]] = scheda

    # --- Cacciatore: controlla i criteri su ogni azione con dati recenti ---
    for scheda in schede.values():
        scheda.pop("cacciatore", None)
        if scheda["tipo"] != "Azione":
            continue
        # Se i fondamentali mancano o sono vecchi, il cacciatore controlla solo ciò che può (il calo
        # dai massimi, che viene dall'analisi tecnica): gli altri criteri restano "dato mancante"
        conti = scheda["fondamentali"] if dati_recenti(scheda, oggi) else None
        if conti or scheda.get("tecnica"):
            scheda["cacciatore"] = cacciatore.valuta(conti, scheda.get("tecnica"))
    in_classifica, quasi = cacciatore.classifica(schede)
    print(f"CACCIATORE: {len(in_classifica)} in classifica, {len(quasi)} ci vanno vicino.")
    try:
        notizie_occasioni(elenco, (in_classifica + quasi)[:NOTIZIE_PER_OCCASIONI])
    except Exception as errore:
        errori.append(f"notizie delle occasioni: {errore}")
        print(f"ERRORE notizie delle occasioni: {errore}")

    # --- Avvocato del diavolo: i campanelli d'allarme di ogni titolo ---
    notizie = leggi_json(FILE_NOTIZIE, {}).get("notizie", {})
    for ticker, scheda in schede.items():
        scheda["campanelli"] = avvocato.controlla(scheda, notizie.get(ticker), oggi)
    print(f"AVVOCATO: {sum(len(s['campanelli']) for s in schede.values())} campanelli d'allarme in tutto.")

    # --- Avvocato con AI: lavora solo se esiste il segreto ANTHROPIC_API_KEY ---
    try:
        azioni_mie = [t for t, s in schede.items() if s["gruppo"] == "portafoglio" and s["tipo"] == "Azione"]
        candidati = azioni_mie + in_classifica[:OCCASIONI_PER_AI]
        scrivi_json(FILE_AI, avvocato_ai.lavora(leggi_json(FILE_AI, {}), candidati, schede, notizie, oggi))
    except Exception as errore:
        errori.append(f"analisi con AI: {errore}")
        print(f"ERRORE analisi con AI: {errore}")

    risultato = {
        "aggiornato": adesso.strftime(FORMATO_ORA),
        "fonte": "Yahoo Finance (non ufficiale)",
        "errori": errori,       # la pagina li mostra, così sai se una fonte non ha funzionato
        "criteri": cacciatore.CRITERI,
        "classifica": in_classifica,
        "quasi": quasi,
        "titoli": schede,
    }
    # Senza rientri e spazi: questi file contengono migliaia di numeri, così pesano molto meno
    compatto = lambda dati: json.dumps(dati, ensure_ascii=False, separators=(",", ":")) + "\n"
    FILE_ANALISI.write_text(compatto(risultato), encoding="utf-8")
    FILE_SERIE.write_text(compatto(serie), encoding="utf-8")
    print(f"Analisi salvata: {len(schede)} titoli, {len(errori)} errori.")
    if errori:
        # "::warning::" fa comparire un avviso giallo nella pagina di GitHub Actions
        print(f"::warning::Agenti: {len(errori)} dati non scaricati. Primo errore: {errori[0]}")


if __name__ == "__main__":
    main()
