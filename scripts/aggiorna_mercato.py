"""
aggiorna_mercato.py = il "direttore" della pagina MERCATO.

Non lo esegui tu: lo fa GitHub (le istruzioni sono in .github/workflows/pubblica-sito.yml).

Ogni 30 minuti, nei giorni di Borsa:
  - scarica da Yahoo Finance i prezzi di tutte le aziende della mappa, a gruppi di 20
    (S&P 500, Euro Stoxx 50 e la watchlist: circa 600 titoli, una trentina di richieste)
  - calcola di quanto sono salite o scese oggi, in una settimana, in un mese e da inizio anno

Due volte al giorno (con l'opzione --completo, insieme agli agenti) fa anche il lavoro lento:
  - una volta a settimana riscarica gli elenchi degli indici da liste pubbliche gratuite
    (S&P 500: un file CSV pubblico su GitHub; Euro Stoxx 50: la tabella di Wikipedia)
  - chiede a Finnhub logo e capitalizzazione delle aziende: ognuna una volta a settimana,
    al massimo PROFILI_PER_GIRO per giro, una richiesta al secondo (il limite gratuito è 60 al minuto)

E poi le altre parti della pagina:
  - "paura e avidità" delle azioni, calcolato da noi con i prezzi già scaricati (S&P 500, VIX e le sue aziende),
    e quello delle criptovalute di alternative.me (gratuito, due volte al giorno)
  - i numeri dell'economia: euro/dollaro, petrolio e oro (Yahoo, ogni giro); tassi della BCE e della Fed,
    inflazione dell'area euro e americana (fonti ufficiali gratuite, due volte al giorno)

Cosa scrive:
  data/mappa.json        i riquadri della mappa (la pagina lo scarica solo quando apri Mercato)
  data/mercato.json      paura e avidità, numeri dell'economia (piccolo: lo legge anche la pagina Oggi)
  data/anagrafica.json   gli elenchi degli indici e i profili (logo, capitalizzazione) già chiesti
                         a Finnhub: serve solo ai giri successivi, la pagina non lo usa

Se una fonte non risponde restano i dati del giro prima. Solo dati pubblici: niente di personale.
"""

import gzip
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

from aggiorna_prezzi import CARTELLA_DATI, leggi_json
from agenti import mercato
from agenti.finnhub import Finnhub, FonteNonDisponibile, TitoloNonCoperto
from agenti.yahoo import MASSIMO_GRUPPO, Yahoo

FILE_MAPPA = CARTELLA_DATI / "mappa.json"
FILE_MERCATO = CARTELLA_DATI / "mercato.json"
FILE_ANAGRAFICA = CARTELLA_DATI / "anagrafica.json"
FILE_WATCHLIST = CARTELLA_DATI / "watchlist.json"
FILE_ANALISI = CARTELLA_DATI / "analisi.json"

# Le liste pubbliche e gratuite degli indici
INDIRIZZO_SP500 = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv"
INDIRIZZO_EUROSTOXX50 = ("https://en.wikipedia.org/w/api.php?action=parse&page=EURO_STOXX_50"
                         "&prop=wikitext&format=json&formatversion=2")
# I numeri dell'economia: fonti ufficiali, gratuite e senza chiave
INDIRIZZO_BCE = ("https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.DFR.LEV"
                 "?format=csvdata&lastNObservations=2")          # tasso sui depositi della BCE
INDIRIZZO_FED = "https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json"   # Fed di New York
INDIRIZZO_EUROSTAT = ("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr"
                      "?geo=EA&coicop18=TOTAL&unit=RCH_A&lastTimePeriod=2")   # inflazione dell'area euro
INDIRIZZO_BLS = "https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0"   # prezzi al consumo USA
INDIRIZZO_CRIPTO = "https://api.alternative.me/fng/?limit=31"     # paura e avidità delle criptovalute

# Le sigle di Yahoo che servono oltre alle aziende: l'S&P 500 e il VIX per "paura e avidità",
# euro/dollaro, petrolio e oro per i numeri dell'economia
INDICE_SP500, SIGLA_VIX = "^GSPC", "^VIX"
MERCATI = [("EURUSD=X", "Euro/dollaro", ""), ("BZ=F", "Petrolio Brent", "$ al barile"), ("GC=F", "Oro", "$ l'oncia")]

# Wikipedia chiede ai programmi di presentarsi con un nome: un nome generico, senza dati personali
PRESENTAZIONE = "PortafoglioDashboard/1.0 (progetto personale open source)"

GIORNI_ELENCHI = 7       # ogni quanto riscaricare gli elenchi degli indici
GIORNI_PROFILI = 7       # ogni quanto richiedere logo e capitalizzazione di un'azienda
PROFILI_PER_GIRO = 150   # al massimo quanti profili per giro (circa 2 minuti e mezzo)
ORE_COMPLETO = 30        # se il lavoro lento non si fa da più di così, si fa anche senza --completo
FORMATO_ORA = "%Y-%m-%dT%H:%M:%SZ"

INDICI = {
    "sp500": {"nome": "S&P 500", "fonte": "elenco pubblico datasets/s-and-p-500-companies (GitHub)", "minimo": 450},
    "eurostoxx50": {"nome": "Euro Stoxx 50", "fonte": "Wikipedia", "minimo": 45},
}


def scarica_testo(indirizzo):
    richiesta = urllib.request.Request(indirizzo, headers={"User-Agent": PRESENTAZIONE})
    with urllib.request.urlopen(richiesta, timeout=30) as risposta:
        dati = risposta.read()
    # Qualche fonte (la BCE) manda il file compresso anche se non lo chiediamo: lo riconosciamo e lo apriamo
    if dati[:2] == b"\x1f\x8b":
        dati = gzip.decompress(dati)
    return dati.decode("utf-8")


def vecchio_di(giorno, giorni, oggi):
    """Vero se la data "giorno" (2026-11-17) è più vecchia di "giorni" giorni (o manca)."""
    if not giorno:
        return True
    limite = (datetime.strptime(oggi, "%Y-%m-%d") - timedelta(days=giorni)).strftime("%Y-%m-%d")
    return giorno <= limite


def aggiorna_elenchi(vecchi, oggi, errori, forza=False):
    """Riscarica gli elenchi degli indici se hanno più di una settimana.
    Un elenco troppo corto (la fonte ha cambiato forma?) viene scartato: resta quello vecchio."""
    elenchi = dict(vecchi)
    for chiave, indice in INDICI.items():
        vecchio = elenchi.get(chiave) or {}
        if not forza and not vecchio_di(vecchio.get("aggiornato"), GIORNI_ELENCHI, oggi):
            continue
        try:
            if chiave == "sp500":
                voci = mercato.leggi_sp500(scarica_testo(INDIRIZZO_SP500))
            else:
                testo = json.loads(scarica_testo(INDIRIZZO_EUROSTOXX50))["parse"]["wikitext"]
                voci = mercato.leggi_eurostoxx50(testo, sigle_americane_watchlist())
            if len(voci) < indice["minimo"]:
                raise ValueError(f"solo {len(voci)} aziende: la lista sembra incompleta")
            elenchi[chiave] = {"nome": indice["nome"], "fonte": indice["fonte"], "aggiornato": oggi, "voci": voci}
            print(f"OK   elenco {indice['nome']}: {len(voci)} aziende")
        except Exception as errore:
            errori.append(f"elenco {indice['nome']}: {errore}")
            print(f"ERRORE elenco {indice['nome']}: {errore} (tengo quello di prima, se c'è)")
    return elenchi


def sigle_americane_watchlist():
    return {t["ticker"]: t["usa"] for t in leggi_json(FILE_WATCHLIST, []) if t.get("ticker") and t.get("usa")}


def elenco_watchlist():
    """La watchlist (data/watchlist.json). Il settore viene dagli agenti (data/analisi.json), se lo conoscono."""
    schede = leggi_json(FILE_ANALISI, {}).get("titoli") or {}
    voci = []
    for t in leggi_json(FILE_WATCHLIST, []):
        if not t.get("ticker"):
            continue
        industria = ((schede.get(t["ticker"]) or {}).get("fondamentali") or {}).get("settore")
        voci.append({"ticker": t["ticker"], "nome": t.get("nome") or t["ticker"], "usa": t.get("usa") or "",
                     "settore": mercato.settore_italiano(industria) if industria else "", "area": t.get("area") or ""})
    return {"nome": "La mia watchlist", "fonte": "data/watchlist.json", "voci": voci}


def anagrafica(elenchi, profili):
    """Tutte le aziende della mappa, una volta sola anche se sono in più indici.
    Per il settore vale quello delle liste degli indici (GICS); altrimenti quello di Finnhub."""
    tutte = {}
    for chiave in ("sp500", "eurostoxx50", "watchlist"):
        for voce in (elenchi.get(chiave) or {}).get("voci") or []:
            gia = tutte.get(voce["ticker"])
            if gia:
                gia["usa"] = gia.get("usa") or voce.get("usa")
                continue
            tutte[voce["ticker"]] = dict(voce)
    for voce in tutte.values():
        if not voce.get("settore"):
            industria = (profili.get(voce.get("usa")) or {}).get("industria")
            voce["settore"] = mercato.settore_italiano(industria)
    return tutte


def aggiorna_profili(finnhub, profili, sigle_usa, oggi, errori):
    """Chiede a Finnhub logo e capitalizzazione: prima le aziende mai chieste, poi le più vecchie.
    Ognuna al massimo una volta a settimana, e non più di PROFILI_PER_GIRO per giro."""
    da_chiedere = sorted((s for s in sigle_usa if vecchio_di((profili.get(s) or {}).get("giorno"), GIORNI_PROFILI, oggi)),
                         key=lambda s: ((profili.get(s) or {}).get("giorno") or "", s))
    fatti = 0
    for sigla in da_chiedere[:PROFILI_PER_GIRO]:
        try:
            profili[sigla] = mercato.profilo_breve(finnhub.profilo(sigla), oggi)
            fatti += 1
        except TitoloNonCoperto:
            profili[sigla] = {"giorno": oggi}          # non coperta: riproviamo tra una settimana
        except FonteNonDisponibile as errore:
            errori.append(str(errore))
            print(f"ERRORE profili: {errore}. Riprovo al prossimo giro.")
            break
        except Exception as errore:
            print(f"ERRORE profilo {sigla}: {errore}")
    print(f"PROFILI: {fatti} aggiornati, {max(len(da_chiedere) - PROFILI_PER_GIRO, 0)} rimandati al prossimo giro.")


def scarica_prezzi(yahoo, sigle, errori):
    """Le chiusure di un anno di tutte le sigle, a gruppi di 20. Un gruppo che non risponde viene saltato."""
    serie = {}
    sigle = list(dict.fromkeys(sigle))
    gruppi_falliti = 0
    for inizio in range(0, len(sigle), MASSIMO_GRUPPO):
        gruppo = sigle[inizio:inizio + MASSIMO_GRUPPO]
        try:
            serie.update(yahoo.gruppo(gruppo, "1y"))
        except Exception as errore:
            gruppi_falliti += 1
            print(f"ERRORE prezzi {gruppo[0]}...{gruppo[-1]}: {errore}")
    if gruppi_falliti:
        errori.append(f"prezzi: {gruppi_falliti} gruppi di titoli non scaricati")
    print(f"PREZZI: {len(serie)} titoli su {len(sigle)}.")
    return serie


def calcola_paura(serie, elenchi):
    """Paura e avidità delle azioni: oggi, una settimana fa e un mese fa."""
    chiusure = lambda sigla: (serie.get(sigla) or {}).get("chiusure") or []
    sigle_sp500 = [v["ticker"] for v in (elenchi.get("sp500") or {}).get("voci") or []]
    titoli = [chiusure(s) for s in sigle_sp500 if s in serie]
    oggi = mercato.paura_azioni(chiusure(INDICE_SP500), chiusure(SIGLA_VIX), titoli)
    if not oggi:
        return None
    for chiave, sedute in (("settimana", 5), ("mese", 21)):
        prima = mercato.paura_azioni(chiusure(INDICE_SP500), chiusure(SIGLA_VIX), titoli, indietro=sedute)
        oggi[chiave] = prima["valore"] if prima else None
    giorni = (serie.get(INDICE_SP500) or {}).get("tempi") or []
    if giorni:
        oggi["giorno"] = datetime.fromtimestamp(giorni[-1], timezone.utc).date().isoformat()
    return oggi


def calcola_mercati(serie):
    """Euro/dollaro, petrolio e oro: prezzo e variazioni (oggi, mese, da inizio anno)."""
    risultato = []
    for sigla, nome, unita in MERCATI:
        v = mercato.variazioni(**serie[sigla]) if sigla in serie else None
        if v:
            risultato.append({"sigla": sigla, "nome": nome, "unita": unita,
                              **{k: v[k] for k in ("prezzo", "giorno", "oggi", "mese", "anno")}})
    return risultato


def aggiorna_lento(vecchio, errori):
    """Le fonti che cambiano al massimo una volta al giorno: tassi, inflazione, paura e avidità delle cripto.
    Ognuna per conto suo: se una non risponde resta il suo valore di prima."""
    fonti = {
        "bce": (INDIRIZZO_BCE, lambda testo: mercato.leggi_bce(testo)),
        "fed": (INDIRIZZO_FED, lambda testo: mercato.leggi_fed(json.loads(testo))),
        "inflazioneEuro": (INDIRIZZO_EUROSTAT, lambda testo: mercato.leggi_eurostat(json.loads(testo))),
        "inflazioneUsa": (INDIRIZZO_BLS, lambda testo: mercato.leggi_bls(json.loads(testo))),
        "cripto": (INDIRIZZO_CRIPTO, lambda testo: mercato.paura_cripto(json.loads(testo))),
    }
    risultato = dict(vecchio)
    for chiave, (indirizzo, leggi) in fonti.items():
        try:
            dato = leggi(scarica_testo(indirizzo))
            if not dato:
                raise ValueError("risposta senza dati")
            risultato[chiave] = dato
            print(f"OK   {chiave}: {dato.get('valore', dato.get('da'))}")
        except Exception as errore:
            errori.append(f"{chiave}: {errore}")
            print(f"ERRORE {chiave}: {errore} (tengo il valore di prima, se c'è)")
    return risultato


def lavoro_lento_da_fare(mappa):
    """Vero se il lavoro lento (elenchi, profili) non si fa da più di ORE_COMPLETO ore."""
    try:
        fatto = datetime.strptime(mappa["completo"], FORMATO_ORA).replace(tzinfo=timezone.utc)
    except (KeyError, TypeError, ValueError):
        return True
    return datetime.now(timezone.utc) - fatto > timedelta(hours=ORE_COMPLETO)


def scrivi_compatto(percorso, dati):
    """Senza spazi e rientri: sono file con centinaia di titoli, così pesano meno."""
    percorso.write_text(json.dumps(dati, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def main():
    adesso = datetime.now(timezone.utc)
    oggi = adesso.strftime("%Y-%m-%d")
    vecchia = leggi_json(FILE_MAPPA, {})
    archivio = leggi_json(FILE_ANAGRAFICA, {})
    profili = archivio.get("profili") or {}
    completo = "--completo" in sys.argv or lavoro_lento_da_fare(vecchia)
    errori = []

    # 1. Gli elenchi degli indici (lavoro lento: una volta a settimana)
    elenchi = {k: v for k, v in (archivio.get("elenchi") or {}).items() if k in INDICI}
    if completo or not elenchi:
        elenchi = aggiorna_elenchi(elenchi, oggi, errori)
    elenchi["watchlist"] = elenco_watchlist()
    tutte = anagrafica(elenchi, profili)

    # 2. Logo e capitalizzazione da Finnhub (lavoro lento: ogni azienda una volta a settimana)
    chiave = (os.environ.get("FINNHUB_API_KEY") or "").strip()
    if completo and chiave:
        sigle_usa = sorted({v["usa"] for v in tutte.values() if v.get("usa")})
        aggiorna_profili(Finnhub(chiave), profili, sigle_usa, oggi, errori)
        tutte = anagrafica(elenchi, profili)     # i settori della watchlist possono essere arrivati ora
    elif completo:
        print("Manca il segreto FINNHUB_API_KEY: niente loghi e capitalizzazioni nuove.")

    # 3. I prezzi di tutte le aziende, più indici e mercati per le altre parti della pagina (ogni giro)
    serie = scarica_prezzi(Yahoo(pausa=0.3), list(tutte) + [INDICE_SP500, SIGLA_VIX] + [m[0] for m in MERCATI], errori)
    vecchi_titoli = vecchia.get("titoli") or {}
    titoli = {}
    for ticker, voce in tutte.items():
        prezzo = mercato.variazioni(**serie[ticker]) if ticker in serie else None
        if prezzo is None and ticker in vecchi_titoli:
            # Yahoo oggi non l'ha dato: teniamo i numeri del giro prima
            prezzo = {k: v for k, v in vecchi_titoli[ticker].items()
                      if k in ("prezzo", "giorno", "oggi", "settimana", "mese", "anno", "linea")}
        titoli[ticker] = mercato.scheda_mappa(voce, prezzo, profili.get(voce.get("usa")))

    risultato = {
        "aggiornato": adesso.strftime(FORMATO_ORA),
        "completo": adesso.strftime(FORMATO_ORA) if completo else vecchia.get("completo"),
        "fonte": "Yahoo Finance (prezzi), Finnhub (logo e capitalizzazione)",
        "errori": errori,
        # Per ogni indice: nome, fonte, data dell'elenco e le sigle (i dettagli stanno in "titoli")
        "elenchi": {k: {**{c: v for c, v in e.items() if c != "voci"}, "sigle": [x["ticker"] for x in e["voci"]]}
                    for k, e in elenchi.items()},
        "titoli": titoli,
    }
    scrivi_compatto(FILE_MAPPA, risultato)
    scrivi_compatto(FILE_ANAGRAFICA, {"elenchi": {k: e for k, e in elenchi.items() if k in INDICI}, "profili": profili})

    # 4. Paura e avidità, numeri dell'economia: il file piccolo data/mercato.json
    vecchio_mercato = leggi_json(FILE_MERCATO, {})
    lento = vecchio_mercato.get("lento") or {}
    if completo or not lento:
        lento = aggiorna_lento(lento, errori)
    paura = calcola_paura(serie, elenchi) or vecchio_mercato.get("pauraAzioni")
    mercati = calcola_mercati(serie) or vecchio_mercato.get("mercati") or []
    scrivi_compatto(FILE_MERCATO, {
        "aggiornato": adesso.strftime(FORMATO_ORA),
        "pauraAzioni": paura,
        "mercati": mercati,
        "lento": lento,      # tassi, inflazione e paura delle cripto (aggiornati due volte al giorno)
    })
    print(f"Paura e avidità delle azioni: {(paura or {}).get('valore')} ({(paura or {}).get('umore')}).")

    con_prezzo = sum(1 for t in titoli.values() if t.get("giorno"))
    con_cap = sum(1 for t in titoli.values() if t.get("cap"))
    print(f"Mappa salvata: {len(titoli)} aziende, {con_prezzo} con il prezzo, {con_cap} con la capitalizzazione.")
    if errori:
        print(f"::warning::Mercato: {len(errori)} problemi. Primo: {errori[0]}")


if __name__ == "__main__":
    main()
