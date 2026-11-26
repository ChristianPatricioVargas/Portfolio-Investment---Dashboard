"""
mercato.py = i calcoli della pagina MERCATO.

Non scarica niente da internet: riceve i dati grezzi (dal direttore aggiorna_mercato.py)
e li trasforma in ciò che la pagina mostra. Per questo si può provare con dati finti.

La mappa del mercato:
  - gli elenchi degli indici (S&P 500 ed Euro Stoxx 50), letti da liste pubbliche gratuite
  - il settore di ogni azienda, tradotto in italiano e raggruppato in 11 grandi settori
  - quanto è salito o sceso ogni titolo oggi, in una settimana, in un mese e da inizio anno
"""

import csv
import io
import re
from datetime import datetime, timezone

# ---------- I settori ----------
# Le liste pubbliche usano i nomi inglesi dei settori "GICS" (la classificazione più diffusa).
# Li traduciamo e li usiamo per raggruppare la mappa.
SETTORI = {
    "Information Technology": "Tecnologia",
    "Health Care": "Salute",
    "Financials": "Finanza",
    "Consumer Discretionary": "Beni voluttuari",
    "Consumer Staples": "Beni di prima necessità",
    "Communication Services": "Comunicazione",
    "Communication": "Comunicazione",
    "Industrials": "Industria",
    "Energy": "Energia",
    "Utilities": "Servizi pubblici",
    "Real Estate": "Immobiliare",
    "Materials": "Materiali",
}

# Finnhub invece usa nomi più dettagliati ("Semiconductors", "Banking"...): li portiamo agli stessi 11 settori.
INDUSTRIE = {
    "Technology": "Tecnologia", "Semiconductors": "Tecnologia", "Communications": "Tecnologia",
    "Electrical Equipment": "Industria", "Machinery": "Industria", "Industrial Conglomerates": "Industria",
    "Aerospace & Defense": "Industria", "Logistics & Transportation": "Industria", "Airlines": "Industria",
    "Building": "Industria", "Construction": "Industria", "Commercial Services & Supplies": "Industria",
    "Trading Companies & Distributors": "Industria", "Professional Services": "Industria", "Marine": "Industria",
    "Road & Rail": "Industria", "Transportation Infrastructure": "Industria", "Packaging": "Materiali",
    "Pharmaceuticals": "Salute", "Health Care": "Salute", "Biotechnology": "Salute",
    "Life Sciences Tools & Services": "Salute", "Health Care Equipment & Supplies": "Salute",
    "Health Care Providers & Services": "Salute",
    "Banking": "Finanza", "Insurance": "Finanza", "Financial Services": "Finanza", "Capital Markets": "Finanza",
    "Diversified Financial Services": "Finanza", "Consumer Finance": "Finanza",
    "Retail": "Beni voluttuari", "Automobiles": "Beni voluttuari", "Auto Components": "Beni voluttuari",
    "Textiles, Apparel & Luxury Goods": "Beni voluttuari", "Hotels, Restaurants & Leisure": "Beni voluttuari",
    "Leisure Products": "Beni voluttuari", "Household Durables": "Beni voluttuari", "Distributors": "Beni voluttuari",
    "Diversified Consumer Services": "Beni voluttuari",
    "Beverages": "Beni di prima necessità", "Food Products": "Beni di prima necessità",
    "Consumer products": "Beni di prima necessità", "Tobacco": "Beni di prima necessità",
    "Personal Products": "Beni di prima necessità", "Food & Staples Retailing": "Beni di prima necessità",
    "Media": "Comunicazione", "Telecommunication": "Comunicazione", "Entertainment": "Comunicazione",
    "Energy": "Energia", "Oil & Gas": "Energia",
    "Utilities": "Servizi pubblici",
    "Real Estate": "Immobiliare",
    "Chemicals": "Materiali", "Metals & Mining": "Materiali", "Paper & Forest": "Materiali",
    "Construction Materials": "Materiali",
}
ALTRO = "Altro"


def settore_italiano(nome):
    """Il nome inglese di un settore (GICS o Finnhub) → uno degli 11 grandi settori in italiano."""
    nome = (nome or "").strip()
    return SETTORI.get(nome) or INDUSTRIE.get(nome) or ALTRO


# ---------- Gli elenchi degli indici ----------

def leggi_sp500(testo_csv):
    """L'elenco delle aziende dell'S&P 500 (file CSV pubblico: Symbol, Security, GICS Sector...).
    La sigla di Yahoo usa il trattino dove la lista usa il punto (BRK.B → BRK-B);
    quella "americana" (per Finnhub) resta col punto."""
    elenco = []
    for riga in csv.DictReader(io.StringIO(testo_csv)):
        sigla = (riga.get("Symbol") or "").strip()
        if not sigla:
            continue
        elenco.append({"ticker": sigla.replace(".", "-"), "nome": (riga.get("Security") or sigla).strip(),
                       "settore": settore_italiano(riga.get("GICS Sector")), "usa": sigla})
    return elenco


# Le aziende dell'Euro Stoxx 50 sono quotate in Europa: Finnhub gratis non le copre con la sigla europea,
# ma con quella americana (ADR) sì. Le serve solo per logo e capitalizzazione: se una manca, l'azienda
# compare lo stesso nella mappa, con la grandezza media e il cerchio con l'iniziale al posto del logo.
SIGLE_AMERICANE_EUROPA = {
    "ADS.DE": "ADDYY", "ADYEN.AS": "ADYEY", "AD.AS": "ADRNY", "AI.PA": "AIQUY", "AIR.PA": "EADSY",
    "ALV.DE": "ALIZY", "ABI.BR": "BUD", "ARGX.BR": "ARGX", "ASML.AS": "ASML", "CS.PA": "AXAHY",
    "BAS.DE": "BASFY", "BAYN.DE": "BAYRY", "BBVA.MC": "BBVA", "SAN.MC": "SAN", "BMW.DE": "BMWYY",
    "BNP.PA": "BNPQY", "BN.PA": "DANOY", "DBK.DE": "DB", "DB1.DE": "DBOEY", "DHL.DE": "DHLGY",
    "DTE.DE": "DTEGY", "ENEL.MI": "ENLAY", "ENGI.PA": "ENGIY", "ENI.MI": "E", "EL.PA": "ESLOY",
    "RACE.MI": "RACE", "RMS.PA": "HESAY", "IBE.MC": "IBDRY", "ITX.MC": "IDEXY", "IFX.DE": "IFNNY",
    "INGA.AS": "ING", "ISP.MI": "ISNPY", "OR.PA": "LRLCY", "MC.PA": "LVMUY", "MBG.DE": "MBGYY",
    "MUV2.DE": "MURGY", "NOKIA.HE": "NOK", "NDA-FI.HE": "NRDBY", "PRX.AS": "PROSY", "RHM.DE": "RNMBY",
    "SAF.PA": "SAFRY", "SGO.PA": "CODYY", "SAN.PA": "SNY", "SAP.DE": "SAP", "SU.PA": "SBGSY",
    "SIE.DE": "SIEGY", "ENR.DE": "SMNEY", "TTE.PA": "TTE", "DG.PA": "VCISY", "UCG.MI": "UNCRY",
}


def pulisci_wiki(testo):
    """Toglie i comandi di Wikipedia da una cella: "[[Vinci SA|Vinci]]" → "Vinci", "{{Flagicon|...}}" → ""."""
    testo = re.sub(r"\{\{[^{}]*\}\}", "", testo or "")
    testo = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", testo)
    testo = re.sub(r"<[^>]+>|''+", "", testo)
    return testo.strip()


def leggi_eurostoxx50(wikitext, sigle_americane=None):
    """L'elenco dell'Euro Stoxx 50 dalla tabella "constituents" della pagina di Wikipedia
    (colonne: Ticker, Main listing, Name, Corporate form, Registered office, Sector, Founded).
    La sigla della prima colonna è già quella di Yahoo (es. ADS.DE)."""
    americane = {**SIGLE_AMERICANE_EUROPA, **(sigle_americane or {})}
    inizio = wikitext.find('id="constituents"')
    if inizio < 0:
        return []
    fine = wikitext.find("\n|}", inizio)
    tabella = wikitext[inizio:fine if fine > 0 else None]
    elenco = []
    for riga in tabella.split("\n|-")[1:]:
        # Le celle possono stare sulla stessa riga ("||") o su righe diverse (che iniziano con "|")
        celle = [c.strip() for c in re.sub(r"\n\|", "||", riga.strip()).lstrip("|").split("||")]
        if len(celle) < 6 or not re.fullmatch(r"[A-Z0-9.\-]+", celle[0]):
            continue
        sigla = celle[0]
        elenco.append({"ticker": sigla, "nome": pulisci_wiki(celle[2]) or sigla,
                       "settore": settore_italiano(pulisci_wiki(celle[5])), "usa": americane.get(sigla, "")})
    return elenco


# ---------- Le variazioni di prezzo ----------

GIORNI_SETTIMANA = 5     # sedute di Borsa in una settimana
GIORNI_MESE = 21         # sedute di Borsa in un mese
PUNTI_LINEA = 22         # quante chiusure teniamo per il mini-grafico del mese


def tondo(numero, cifre=4):
    """Arrotonda tenendo 4 cifre significative: 1234.5678 → 1235, 0.012345 → 0.01235 (file più leggero)."""
    if not numero:
        return numero
    return float(f"{numero:.{cifre}g}")


def variazioni(tempi, chiusure):
    """Dalle chiusure giornaliere di un titolo (un anno) calcola:
       prezzo e giorno dell'ultima chiusura, variazione dell'ultima seduta ("oggi"),
       di una settimana, di un mese e da inizio anno, e la linea dell'ultimo mese.
    Le variazioni sono numeri: 0.012 = +1,2%. None se mancano i dati."""
    punti = [(datetime.fromtimestamp(t, timezone.utc).date(), c) for t, c in zip(tempi or [], chiusure or [])
             if t and isinstance(c, (int, float)) and c > 0]
    if len(punti) < 2:
        return None
    giorno, ultimo = punti[-1]

    def da_indietro(sedute):
        i = len(punti) - 1 - sedute
        return round(ultimo / punti[i][1] - 1, 5) if i >= 0 else None

    # Da inizio anno: rispetto all'ultima chiusura dell'anno prima
    anno_prima = [c for g, c in punti if g.year < giorno.year]
    return {
        "prezzo": tondo(ultimo, 6),
        "giorno": giorno.isoformat(),
        "oggi": da_indietro(1),
        "settimana": da_indietro(GIORNI_SETTIMANA),
        "mese": da_indietro(GIORNI_MESE),
        "anno": round(ultimo / anno_prima[-1] - 1, 5) if anno_prima else None,
        "linea": [tondo(c) for _, c in punti[-PUNTI_LINEA:]],
    }


def scheda_mappa(voce, prezzo, profilo):
    """Un riquadro della mappa: chi è (nome, settore), quanto è grande (capitalizzazione in miliardi
    di dollari, da Finnhub), il logo e le variazioni di prezzo."""
    profilo = profilo or {}
    scheda = {"nome": voce["nome"], "settore": voce.get("settore") or ALTRO}
    if voce.get("usa"):
        scheda["usa"] = voce["usa"]
    if profilo.get("cap"):
        scheda["cap"] = profilo["cap"]
    if profilo.get("logo"):
        scheda["logo"] = profilo["logo"]
    scheda.update(prezzo or {})
    return scheda


def profilo_breve(grezzo, oggi):
    """Dal profilo di Finnhub teniamo solo ciò che serve: capitalizzazione (miliardi), logo, settore."""
    cap = grezzo.get("marketCapitalization")      # Finnhub la dà in milioni
    return {"cap": round(cap / 1000, 1) if cap else None, "logo": grezzo.get("logo") or None,
            "industria": grezzo.get("finnhubIndustry") or None, "giorno": oggi}


# ---------- Paura e avidità ----------
# Un numero da 0 (paura estrema: tutti vendono) a 100 (avidità estrema: tutti comprano).
# Non è una previsione: dice com'è l'umore del mercato adesso. Molti investitori lo leggono "al contrario"
# (quando gli altri hanno paura i prezzi sono spesso più bassi), ma non è una regola.

def umore(valore):
    """Da 0-100 alla parola: le stesse fasce dell'indice cripto di alternative.me."""
    if valore is None:
        return None
    if valore < 25:
        return "Paura estrema"
    if valore < 47:
        return "Paura"
    if valore <= 54:
        return "Neutrale"
    if valore <= 75:
        return "Avidità"
    return "Avidità estrema"


def tra_0_e_100(numero):
    return max(0, min(100, round(numero)))


def media_ultimi(valori, quanti):
    ultimi = valori[-quanti:]
    return sum(ultimi) / len(ultimi) if len(ultimi) == quanti else None


def pulite(chiusure):
    return [c for c in chiusure or [] if isinstance(c, (int, float)) and c > 0]


# Le soglie dei quattro pezzi dell'indice delle azioni: per cambiarle basta cambiare questi numeri
PAURA = {
    "mediaIndice": 125,        # sedute della media dell'S&P 500 (circa 6 mesi)
    "distanzaPiena": 0.08,     # +8% sopra la media = 100, −8% sotto = 0
    "mediaVix": 50,            # sedute della media del VIX
    "vixPieno": 0.30,          # VIX 30% sotto la sua media = 100, 30% sopra = 0
    "mediaTitoli": 50,         # quanti titoli sono sopra la loro media a 50 giorni
    "quotaMinima": 0.20,       # 20% dei titoli sopra la media = 0, 80% = 100
    "quotaMassima": 0.80,
    "vicinoAlMassimo": 0.03,   # "vicino al massimo (o al minimo) di un anno" = entro il 3%
}


def paura_azioni(indice, vix, titoli, indietro=0):
    """L'indice "paura e avidità" delle azioni, calcolato da noi con prezzi gratuiti (Yahoo).
    indice:  le chiusure dell'S&P 500 di un anno;  vix: le chiusure del VIX (la "paura" misurata dalle opzioni)
    titoli:  le chiusure di un anno di ogni azienda dell'S&P 500
    indietro: quante sedute tornare indietro (5 = com'era una settimana fa)
    Quattro pezzi, ognuno da 0 a 100; l'indice è la loro media. None se mancano i dati."""
    taglia = (lambda v: v[:-indietro]) if indietro else (lambda v: v)
    indice, vix = taglia(pulite(indice)), taglia(pulite(vix))
    pezzi = []

    # 1. Andamento: l'S&P 500 è sopra o sotto la sua media di 6 mesi?
    media = media_ultimi(indice, PAURA["mediaIndice"])
    if media:
        distanza = indice[-1] / media - 1
        pezzi.append({"chiave": "andamento", "nome": "Andamento dell'S&P 500",
                      "valore": tra_0_e_100(50 + distanza / PAURA["distanzaPiena"] * 50),
                      "testo": f"{distanza * 100:+.1f}% rispetto alla media di 6 mesi".replace(".", ",")})

    # 2. Volatilità: il VIX è più alto o più basso del solito? (VIX alto = paura)
    media = media_ultimi(vix, PAURA["mediaVix"])
    if media:
        scarto = vix[-1] / media - 1
        pezzi.append({"chiave": "volatilita", "nome": "Volatilità (VIX)",
                      "valore": tra_0_e_100(50 - scarto / PAURA["vixPieno"] * 50),
                      "testo": f"VIX a {vix[-1]:.1f}, {scarto * 100:+.0f}% rispetto alla media di 50 giorni".replace(".", ",")})

    # 3 e 4. Quanti titoli salgono insieme: sopra la loro media a 50 giorni, vicini ai massimi o ai minimi di un anno
    sopra = conti = alti = bassi = 0
    for chiusure in titoli or []:
        valori = taglia(pulite(chiusure))
        media = media_ultimi(valori, PAURA["mediaTitoli"])
        if not media:
            continue
        conti += 1
        sopra += valori[-1] > media
        anno = valori[-250:]
        alti += valori[-1] >= max(anno) * (1 - PAURA["vicinoAlMassimo"])
        bassi += valori[-1] <= min(anno) * (1 + PAURA["vicinoAlMassimo"])
    if conti >= 50:
        quota = sopra / conti
        pezzi.append({"chiave": "ampiezza", "nome": "Titoli sopra la media a 50 giorni",
                      "valore": tra_0_e_100((quota - PAURA["quotaMinima"]) / (PAURA["quotaMassima"] - PAURA["quotaMinima"]) * 100),
                      "testo": f"{sopra} su {conti} ({quota * 100:.0f}%)"})
        pezzi.append({"chiave": "massimi", "nome": "Vicini ai massimi o ai minimi di un anno",
                      "valore": tra_0_e_100(alti / (alti + bassi) * 100) if alti + bassi else 50,
                      "testo": f"{alti} vicini ai massimi, {bassi} vicini ai minimi"})

    if len(pezzi) < 3:
        return None
    valore = tra_0_e_100(sum(p["valore"] for p in pezzi) / len(pezzi))
    return {"valore": valore, "umore": umore(valore), "pezzi": pezzi}


UMORI_INGLESI = {"Extreme Fear": "Paura estrema", "Fear": "Paura", "Neutral": "Neutrale",
                 "Greed": "Avidità", "Extreme Greed": "Avidità estrema"}


def paura_cripto(risposta):
    """L'indice "Fear & Greed" delle criptovalute di alternative.me (gratuito, uno al giorno).
    La risposta ha i valori dal più recente al più vecchio."""
    giorni = (risposta or {}).get("data") or []
    valori = []
    for g in giorni:
        try:
            valori.append((int(g["value"]), datetime.fromtimestamp(int(g["timestamp"]), timezone.utc).date().isoformat(),
                           g.get("value_classification")))
        except (KeyError, TypeError, ValueError):
            continue
    if not valori:
        return None
    valore, giorno, inglese = valori[0]
    indietro = lambda n: valori[n][0] if len(valori) > n else None
    return {"valore": valore, "umore": UMORI_INGLESI.get(inglese) or umore(valore), "giorno": giorno,
            "ieri": indietro(1), "settimana": indietro(7), "mese": indietro(30)}


# ---------- I numeri dell'economia ----------

def leggi_bce(testo_csv):
    """Il tasso sui depositi della BCE (dal portale dati della BCE, formato CSV): ultimo valore e quello prima."""
    righe = [r for r in csv.DictReader(io.StringIO(testo_csv)) if r.get("OBS_VALUE")]
    if not righe:
        return None
    ultima = righe[-1]
    dato = {"valore": float(ultima["OBS_VALUE"]), "data": ultima["TIME_PERIOD"]}
    if len(righe) > 1:
        dato["prima"] = float(righe[-2]["OBS_VALUE"])
    return dato


def leggi_fed(risposta):
    """Il tasso della Fed (dalla Fed di New York): la "forchetta" decisa dalla Fed e il tasso effettivo del giorno."""
    voce = ((risposta or {}).get("refRates") or [None])[0]
    if not voce or voce.get("targetRateFrom") is None:
        return None
    return {"da": voce["targetRateFrom"], "a": voce["targetRateTo"], "effettivo": voce.get("percentRate"),
            "data": voce.get("effectiveDate")}


def leggi_eurostat(risposta):
    """L'inflazione dell'area euro (Eurostat, formato JSON-stat): ultimo mese e quello prima."""
    valori = (risposta or {}).get("value") or {}
    mesi = (((risposta or {}).get("dimension") or {}).get("time") or {}).get("category", {}).get("index") or {}
    serie = sorted((posto, mese) for mese, posto in mesi.items() if str(posto) in valori)
    if not serie:
        return None
    dato = {"valore": valori[str(serie[-1][0])], "mese": serie[-1][1]}
    if len(serie) > 1:
        dato["prima"] = valori[str(serie[-2][0])]
    return dato


def leggi_bls(risposta):
    """L'inflazione americana dall'ufficio statistico USA (BLS): l'indice dei prezzi di ogni mese.
    L'inflazione è quanto è cresciuto l'indice rispetto allo stesso mese di un anno prima."""
    try:
        dati = risposta["Results"]["series"][0]["data"]
    except (KeyError, IndexError, TypeError):
        return None
    indici = {}
    for d in dati:
        if str(d.get("period", "")).startswith("M") and d.get("period") != "M13":
            try:
                indici[(int(d["year"]), int(d["period"][1:]))] = float(d["value"])
            except (KeyError, ValueError):
                continue

    def inflazione(anno, mese):
        if (anno, mese) in indici and (anno - 1, mese) in indici:
            return round((indici[(anno, mese)] / indici[(anno - 1, mese)] - 1) * 100, 1)
        return None

    mesi = sorted(indici, reverse=True)
    for anno, mese in mesi:
        valore = inflazione(anno, mese)
        if valore is not None:
            prima = inflazione(anno, mese - 1) if mese > 1 else inflazione(anno - 1, 12)
            dato = {"valore": valore, "mese": f"{anno}-{mese:02d}"}
            if prima is not None:
                dato["prima"] = prima
            return dato
    return None
