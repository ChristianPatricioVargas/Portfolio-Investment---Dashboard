"""
aggiorna_analisi.py = il "direttore" della squadra di agenti.

Non lo esegui tu: lo fa GitHub DUE VOLTE AL GIORNO, verso le 13 e la sera dopo la chiusura
delle Borse (le istruzioni sono in .github/workflows/pubblica-sito.yml). I prezzi invece
continuano ad aggiornarsi ogni 30 minuti con aggiorna_prezzi.py: questo lavoro è più pesante.

Cosa fa, passo per passo:
  1. legge i titoli del portafoglio (data/titoli.json) e la watchlist (data/watchlist.json)
  2. per ogni azione chiede a Finnhub i conti dell'azienda e li passa all'analista fondamentale
     (serve il segreto FINNHUB_API_KEY; senza, i fondamentali restano vuoti)
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
import os
import sys
from datetime import datetime, timedelta, timezone

from aggiorna_prezzi import CARTELLA_DATI, FILE_NOTIZIE, FILE_TITOLI, leggi_json, notizie_di, scrivi_json
from agenti import avvocato, avvocato_ai, cacciatore, fondamentale, tecnico
from agenti.finnhub import Finnhub, FonteNonDisponibile, TitoloNonCoperto
from agenti.yahoo import Yahoo

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
    # Se ora c'è la chiave dei fondamentali ma l'analisi salvata non ne contiene nessuno
    # (es. la chiave è appena stata creata), conviene rifarla subito
    if os.environ.get("FINNHUB_API_KEY") and not any(s.get("fondamentali") for s in (analisi.get("titoli") or {}).values()):
        return False
    return datetime.now(timezone.utc) - fatta < timedelta(hours=ORE_VALIDITA)


def elenco_titoli():
    """Tutti i titoli da analizzare: quelli del portafoglio e quelli della watchlist.
    "usa" è la sigla americana dell'azienda, da usare per i fondamentali (Finnhub gratis copre
    solo le aziende quotate negli Stati Uniti): per Airbus è EADSY, per SAP è SAP."""
    elenco = []
    for t in leggi_json(FILE_TITOLI, []):
        elenco.append({"ticker": t["ticker"], "nome": t["nome"], "tipo": t["tipo"], "gruppo": "portafoglio",
                       "usa": t.get("usa") or "", "notizie": t.get("notizie"),
                       "notizie_en": t.get("notizie_en")})
    # La watchlist: saltiamo i doppioni e i titoli che sono già nel portafoglio
    gia_visti = {v["ticker"] for v in elenco}
    sigle_usa_mie = {v["usa"] for v in elenco if v["usa"]}
    for t in leggi_json(FILE_WATCHLIST, []):
        if not t.get("ticker") or t["ticker"] in gia_visti or t.get("usa") in sigle_usa_mie:
            continue
        gia_visti.add(t["ticker"])
        elenco.append({"ticker": t["ticker"], "nome": t.get("nome") or t["ticker"], "tipo": "Azione",
                       "gruppo": "watchlist", "area": t.get("area") or "", "usa": t.get("usa") or "",
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


def analizza_titolo(yahoo, finnhub, voce, scheda, serie, oggi):
    """Fa lavorare gli agenti su un titolo: aggiorna la sua scheda e la sua serie per il grafico.
    Restituisce gli errori incontrati."""
    errori = []
    ticker = voce["ticker"]

    # --- Analista fondamentale (solo azioni: un ETF contiene migliaia di aziende) ---
    if voce["tipo"] == "Azione":
        scheda["usa"] = voce["usa"]
        try:
            if not finnhub:
                raise FonteNonDisponibile("Manca il segreto FINNHUB_API_KEY: i fondamentali non vengono scaricati")
            if not voce["usa"]:
                raise TitoloNonCoperto(f"{voce['nome']} non ha una sigla americana: niente fondamentali")
            # Il settore non cambia: se lo conosciamo già, risparmiamo una richiesta
            vecchio = scheda.get("fondamentali") or {}
            nuova = fondamentale.analizza(finnhub.grezzi(voce["usa"], oggi, con_profilo=not vecchio.get("settore")), oggi)
            if not fondamentale.ha_dati(nuova):
                raise TitoloNonCoperto(f"Finnhub ha dati troppo scarsi per {voce['usa']}")
            if not nuova["settore"] and vecchio.get("settore"):
                for campo in ("settore", "paese", "valuta", "finanziario"):
                    nuova[campo] = vecchio.get(campo)
            nuova["aggiornato"] = oggi
            scheda["fondamentali"] = nuova
            print(f"OK   fondamentali {ticker} ({voce['usa']}): P/E {nuova['pe']}, "
                  f"{nuova['analistiPositivi']} analisti positivi su {nuova['analisti']}")
        except FonteNonDisponibile as errore:
            errori.append(str(errore))          # vale per tutti i titoli: il direttore lo conta una volta sola
        except TitoloNonCoperto as errore:
            scheda.pop("fondamentali", None)    # meglio nessun dato che un dato vecchio di un'altra fonte
            errori.append(str(errore))
            print(f"SENZA fondamentali {ticker}: {errore}")
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
    chiave = (os.environ.get("FINNHUB_API_KEY") or "").strip()
    finnhub = Finnhub(chiave) if chiave else None
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
        for errore in analizza_titolo(yahoo, finnhub, voce, scheda, serie, oggi):
            if errore not in errori:        # lo stesso errore (es. "fonte chiusa") si segna una volta sola
                errori.append(errore)
                if "FINNHUB_API_KEY" in errore or "ha rifiutato" in errore:
                    print(f"ERRORE fondamentali: {errore}. Per questo giro tengo quelli di prima, se ci sono.")
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
        "fonte": "Finnhub (fondamentali), Yahoo Finance (prezzi)",
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
