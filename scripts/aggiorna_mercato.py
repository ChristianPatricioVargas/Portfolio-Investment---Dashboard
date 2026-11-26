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
  - scarica le capitalizzazioni di tutte le aziende quotate in America dall'elenco pubblico del Nasdaq
    (una sola richiesta, gratuita, senza chiave): così l'S&P 500 ha subito le grandezze giuste
  - chiede a Finnhub logo e capitalizzazione delle aziende: ognuna una volta a settimana,
    al massimo PROFILI_PER_GIRO per giro, una richiesta al secondo (il limite gratuito è 60 al minuto).
    Prima quelle che il Nasdaq non conosce (le europee quotate in America solo "fuori listino", es. LVMUY)

E poi le altre parti della pagina:
  - "paura e avidità" delle azioni, calcolato da noi con i prezzi già scaricati (S&P 500, VIX e le sue aziende),
    e quello delle criptovalute di alternative.me (gratuito, due volte al giorno)
  - i numeri dell'economia: euro/dollaro, petrolio e oro (Yahoo, ogni giro); tassi della BCE e della Fed,
    inflazione dell'area euro e americana (fonti ufficiali gratuite, due volte al giorno)
  - le nuove quotazioni in Borsa (IPO) dal calendario gratuito di Finnhub, due volte al giorno:
    per le candidate chiede anche settore e numero di notizie (ognuna al massimo ogni 3 giorni),
    e per quelle scelte una riga su cosa fa l'azienda (da Wikipedia, gratuita)

Cosa scrive:
  data/mappa.json        i riquadri della mappa (la pagina lo scarica solo quando apri Mercato)
  data/mercato.json      paura e avidità, numeri dell'economia, nuove quotazioni
                         (piccolo: lo legge anche la pagina Oggi, per l'avviso delle quotazioni della settimana)
  data/anagrafica.json   gli elenchi degli indici e i profili (logo, capitalizzazione) già chiesti
                         a Finnhub: serve solo ai giri successivi, la pagina non lo usa

Se una fonte non risponde restano i dati del giro prima. Solo dati pubblici: niente di personale.
"""

import gzip
import json
import os
import sys
import urllib.parse
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
# Le capitalizzazioni di tutte le aziende quotate in America: l'elenco pubblico del sito del Nasdaq
INDIRIZZO_NASDAQ = "https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true"

# I numeri dell'economia: fonti ufficiali, gratuite e senza chiave
INDIRIZZO_BCE = ("https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.DFR.LEV"
                 "?format=csvdata&lastNObservations=2")          # tasso sui depositi della BCE
INDIRIZZO_FED = "https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json"   # Fed di New York
INDIRIZZO_EUROSTAT = ("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr"
                      "?geo=EA&coicop18=TOTAL&unit=RCH_A&lastTimePeriod=2")   # inflazione dell'area euro
INDIRIZZO_BLS = "https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0"   # prezzi al consumo USA
INDIRIZZO_CRIPTO = "https://api.alternative.me/fng/?limit=31"     # paura e avidità delle criptovalute

# Wikipedia (gratuita): una riga su cosa fa un'azienda appena quotata
INDIRIZZO_WIKIPEDIA = "https://{lingua}.wikipedia.org/w/api.php?{parametri}"
IPO_DA_CONTROLLARE = 40    # al massimo quante quotazioni per giro guardiamo da vicino (2 richieste a Finnhub ciascuna)
GIORNI_DETTAGLI_IPO = 3    # ogni quanto richiedere settore e notizie di una quotazione
GIORNI_ARCHIVIO_IPO = 60   # dopo quanto dimenticare una quotazione

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


def aggiorna_capitalizzazioni(vecchie, sigle_usa, oggi, errori):
    """Le capitalizzazioni dal Nasdaq, solo per le aziende che ci servono. Se il Nasdaq non risponde restano quelle di prima."""
    try:
        richiesta = urllib.request.Request(INDIRIZZO_NASDAQ, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with urllib.request.urlopen(richiesta, timeout=60) as risposta:
            dati = risposta.read()
        if dati[:2] == b"\x1f\x8b":
            dati = gzip.decompress(dati)
        tutte = mercato.leggi_nasdaq(json.loads(dati))
        if len(tutte) < 1000:
            raise ValueError(f"solo {len(tutte)} aziende: l'elenco sembra incompleto")
        valori = {s: tutte[s] for s in sigle_usa if s in tutte}
        print(f"OK   capitalizzazioni dal Nasdaq: {len(valori)} aziende su {len(sigle_usa)}")
        return {"giorno": oggi, "valori": valori}
    except Exception as errore:
        errori.append(f"capitalizzazioni Nasdaq: {errore}")
        print(f"ERRORE capitalizzazioni Nasdaq: {errore} (tengo quelle di prima)")
        return vecchie


def aggiorna_profili(finnhub, profili, sigle_usa, oggi, errori, gia_note=()):
    """Chiede a Finnhub logo e capitalizzazione: prima le aziende mai chieste, poi le più vecchie.
    A parità, prima quelle di cui non conosciamo la capitalizzazione dal Nasdaq ("gia_note").
    Ognuna al massimo una volta a settimana, e non più di PROFILI_PER_GIRO per giro."""
    da_chiedere = sorted((s for s in sigle_usa if vecchio_di((profili.get(s) or {}).get("giorno"), GIORNI_PROFILI, oggi)),
                         key=lambda s: ((profili.get(s) or {}).get("giorno") or "", s in gia_note, s))
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


def cerca_descrizione(nome):
    """Una riga su cosa fa l'azienda: prima da Wikipedia in italiano, poi da quella in inglese."""
    for lingua, fonte in (("it", "Wikipedia"), ("en", "Wikipedia in inglese")):
        parametri = urllib.parse.urlencode({
            "action": "query", "generator": "search", "gsrsearch": nome, "gsrlimit": 1,
            "prop": "extracts|description", "exintro": 1, "explaintext": 1, "exsentences": 1,
            "format": "json", "formatversion": 2})
        try:
            testo = mercato.descrizione_wiki(json.loads(scarica_testo(INDIRIZZO_WIKIPEDIA.format(lingua=lingua, parametri=parametri))), nome)
        except Exception as errore:
            print(f"ERRORE Wikipedia ({lingua}) per {nome}: {errore}")
            continue
        if testo:
            return testo, fonte
    return None, None


def aggiorna_quotazioni(finnhub, archivio, oggi, errori):
    """Le nuove quotazioni da mostrare. "archivio" ricorda, per ogni quotazione, settore, notizie e descrizione
    già chiesti: così non si richiedono a ogni giro. Restituisce None se Finnhub non risponde."""
    giorno = datetime.strptime(oggi, "%Y-%m-%d")
    da = (giorno - timedelta(days=mercato.IPO["giorniPrima"])).strftime("%Y-%m-%d")
    a = (giorno + timedelta(days=mercato.IPO["giorniDopo"])).strftime("%Y-%m-%d")
    mese_fa = (giorno - timedelta(days=30)).strftime("%Y-%m-%d")
    try:
        calendario = finnhub.quotazioni(da, a)
    except Exception as errore:
        errori.append(f"quotazioni: {errore}")
        print(f"ERRORE calendario delle quotazioni: {errore} (tengo quelle di prima)")
        return None

    # 1. Settore e notizie delle candidate (quelle con la sigla, non ritirate, non SPAC), dalle più vicine
    candidate = sorted((v for v in calendario if (v.get("symbol") or "").strip() and v.get("status") != "withdrawn"
                        and not mercato.e_spac(v.get("name"))), key=lambda v: abs((datetime.strptime(v["date"], "%Y-%m-%d") - giorno).days)
                       if v.get("date") else 999)
    chieste = 0
    for voce in candidate[:IPO_DA_CONTROLLARE]:
        sigla = voce["symbol"].strip()
        d = archivio.setdefault(sigla, {})
        if not vecchio_di(d.get("giorno"), GIORNI_DETTAGLI_IPO, oggi):
            continue
        try:
            try:
                d["industria"] = finnhub.profilo(sigla).get("finnhubIndustry") or None
            except TitoloNonCoperto:
                d["industria"] = None
            d["notizie"] = len(finnhub.notizie(sigla, mese_fa, oggi))
            d["giorno"] = oggi
            chieste += 1
        except FonteNonDisponibile as errore:
            errori.append(str(errore))
            print(f"ERRORE quotazioni: {errore}. Riprovo al prossimo giro.")
            break
        except Exception as errore:
            print(f"ERRORE dettagli quotazione {sigla}: {errore}")

    # 2. Le quotazioni scelte, e per ognuna (una volta sola) la riga su cosa fa l'azienda
    scelte = mercato.scegli_quotazioni(calendario, archivio, oggi)
    for q in scelte:
        d = archivio.setdefault(q["sigla"] or q["nome"], {})
        if d.get("descrizione") or not vecchio_di(d.get("cercata"), GIORNI_DETTAGLI_IPO, oggi):
            continue
        d["descrizione"], d["fonteDescrizione"] = cerca_descrizione(q["nome"])
        d["cercata"] = oggi
    scelte = mercato.scegli_quotazioni(calendario, archivio, oggi)

    # 3. Dimentichiamo le quotazioni vecchie
    for chiave in [k for k, d in archivio.items() if vecchio_di(d.get("giorno") or d.get("cercata"), GIORNI_ARCHIVIO_IPO, oggi)]:
        del archivio[chiave]
    print(f"QUOTAZIONI: {len(calendario)} in calendario, {chieste} controllate da vicino, {len(scelte)} scelte.")
    return scelte


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

    # 2. Le capitalizzazioni dal Nasdaq (tutte insieme, due volte al giorno),
    #    poi logo e capitalizzazione da Finnhub (lavoro lento: ogni azienda una volta a settimana)
    sigle_usa = sorted({v["usa"] for v in tutte.values() if v.get("usa")})
    capitali = archivio.get("capitalizzazioni") or {}
    if completo or not capitali:
        capitali = aggiorna_capitalizzazioni(capitali, sigle_usa, oggi, errori)
    chiave = (os.environ.get("FINNHUB_API_KEY") or "").strip()
    if completo and chiave:
        aggiorna_profili(Finnhub(chiave), profili, sigle_usa, oggi, errori, set(capitali.get("valori") or {}))
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
        # La capitalizzazione del Nasdaq (aggiornata due volte al giorno) vale più di quella di Finnhub (una a settimana)
        profilo = dict(profili.get(voce.get("usa")) or {})
        if (capitali.get("valori") or {}).get(voce.get("usa")):
            profilo["cap"] = capitali["valori"][voce["usa"]]
        titoli[ticker] = mercato.scheda_mappa(voce, prezzo, profilo)

    risultato = {
        "aggiornato": adesso.strftime(FORMATO_ORA),
        "completo": adesso.strftime(FORMATO_ORA) if completo else vecchia.get("completo"),
        "fonte": "Yahoo Finance (prezzi), Nasdaq e Finnhub (capitalizzazione), Finnhub (logo)",
        "errori": errori,
        # Per ogni indice: nome, fonte, data dell'elenco e le sigle (i dettagli stanno in "titoli")
        "elenchi": {k: {**{c: v for c, v in e.items() if c != "voci"}, "sigle": [x["ticker"] for x in e["voci"]]}
                    for k, e in elenchi.items()},
        "titoli": titoli,
    }
    scrivi_compatto(FILE_MAPPA, risultato)

    # 4. Paura e avidità, numeri dell'economia: il file piccolo data/mercato.json
    vecchio_mercato = leggi_json(FILE_MERCATO, {})
    lento = vecchio_mercato.get("lento") or {}
    if completo or not lento:
        lento = aggiorna_lento(lento, errori)
    paura = calcola_paura(serie, elenchi) or vecchio_mercato.get("pauraAzioni")
    # Le nuove quotazioni: due volte al giorno, solo con la chiave di Finnhub
    quotazioni = vecchio_mercato.get("quotazioni") or {}
    archivio_ipo = archivio.get("ipo") or {}
    if completo and chiave:
        scelte = aggiorna_quotazioni(Finnhub(chiave), archivio_ipo, oggi, errori)
        if scelte is not None:
            quotazioni = {"aggiornato": oggi, "elenco": scelte}
    mercati = calcola_mercati(serie) or vecchio_mercato.get("mercati") or []
    scrivi_compatto(FILE_MERCATO, {
        "aggiornato": adesso.strftime(FORMATO_ORA),
        "pauraAzioni": paura,
        "mercati": mercati,
        "lento": lento,      # tassi, inflazione e paura delle cripto (aggiornati due volte al giorno)
        "quotazioni": quotazioni,
    })
    print(f"Paura e avidità delle azioni: {(paura or {}).get('valore')} ({(paura or {}).get('umore')}).")
    # L'archivio per i giri successivi: elenchi, profili Finnhub e quotazioni già controllate
    scrivi_compatto(FILE_ANAGRAFICA, {"elenchi": {k: e for k, e in elenchi.items() if k in INDICI}, "profili": profili,
                                      "capitalizzazioni": capitali, "ipo": archivio_ipo})

    con_prezzo = sum(1 for t in titoli.values() if t.get("giorno"))
    con_cap = sum(1 for t in titoli.values() if t.get("cap"))
    print(f"Mappa salvata: {len(titoli)} aziende, {con_prezzo} con il prezzo, {con_cap} con la capitalizzazione.")
    if errori:
        print(f"::warning::Mercato: {len(errori)} problemi. Primo: {errori[0]}")


if __name__ == "__main__":
    main()
