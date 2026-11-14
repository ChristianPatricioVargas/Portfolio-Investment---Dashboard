"""
fondamentale.py = l'ANALISTA FONDAMENTALE (il "se").

Guarda i conti dell'azienda, non il grafico: quanto costa rispetto agli utili,
se cresce, quanto debito ha, quanto guadagna, cosa pensano gli analisti e
quando esce la prossima trimestrale.

Riceve i dati grezzi di Yahoo (dal fattorino) e restituisce una scheda ordinata.
Non dà consigli: mette in fila i numeri.
"""

from datetime import datetime, timezone


def numero(blocco, chiave):
    """Yahoo scrive i numeri così: {"raw": 12.3, "fmt": "12.30"}. Prendiamo il "raw".
    Se il dato manca (capita spesso) restituiamo None, senza errori."""
    valore = (blocco or {}).get(chiave)
    if isinstance(valore, dict):
        valore = valore.get("raw")
    if isinstance(valore, bool) or not isinstance(valore, (int, float)):
        return None
    if valore != valore or valore in (float("inf"), float("-inf")):   # "non è un numero" o infinito
        return None
    return valore


def arrotonda(valore, cifre=4):
    return None if valore is None else round(valore, cifre)


def giorno(secondi):
    """Secondi dal 1970 (come li scrive Yahoo) → "2026-11-14" """
    return datetime.fromtimestamp(secondi, timezone.utc).strftime("%Y-%m-%d")


def prossima_trimestrale(calendario, oggi):
    """La data della prossima trimestrale. Se Yahoo dà due date è una stima ("tra il ... e il ...")."""
    date = []
    for voce in ((calendario or {}).get("earnings") or {}).get("earningsDate") or []:
        secondi = voce.get("raw") if isinstance(voce, dict) else voce
        if isinstance(secondi, (int, float)):
            date.append(giorno(secondi))
    future = sorted(d for d in date if d >= oggi)
    if not future:
        return None, False
    return future[0], len(date) > 1


def sorprese_utili(storia):
    """Gli ultimi 4 trimestri: utile per azione atteso, effettivo e differenza in %."""
    risultato = []
    for voce in (storia or {}).get("history") or []:
        effettivo, atteso = numero(voce, "epsActual"), numero(voce, "epsEstimate")
        if effettivo is None or atteso is None:
            continue
        trimestre = voce.get("quarter")
        secondi = trimestre.get("raw") if isinstance(trimestre, dict) else None
        sorpresa = numero(voce, "surprisePercent")
        if sorpresa is None and atteso:
            sorpresa = (effettivo - atteso) / abs(atteso)
        risultato.append({
            "trimestre": giorno(secondi) if secondi else "",
            "effettivo": arrotonda(effettivo), "atteso": arrotonda(atteso), "sorpresa": arrotonda(sorpresa),
        })
    return sorted(risultato, key=lambda s: s["trimestre"])[-4:]


def stime_anno(tendenza):
    """Le stime degli analisti sugli utili dell'anno in corso: quella di oggi e quella di 90 giorni fa.
    Se la stima è scesa, gli analisti sono diventati più pessimisti."""
    for voce in (tendenza or {}).get("trend") or []:
        if voce.get("period") == "0y":
            stime = voce.get("epsTrend") or {}
            return {
                "crescita": numero(voce, "growth"),
                "oggi": numero(stime, "current"),
                "giorni30": numero(stime, "30daysAgo"),
                "giorni90": numero(stime, "90daysAgo"),
            }
    return {}


def analizza(grezzi, oggi=None):
    """Dai dati grezzi di Yahoo alla scheda dei fondamentali."""
    oggi = oggi or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    prezzo_info = grezzi.get("price") or {}
    riassunto = grezzi.get("summaryDetail") or {}
    finanza = grezzi.get("financialData") or {}
    statistiche = grezzi.get("defaultKeyStatistics") or {}
    profilo = grezzi.get("assetProfile") or {}

    prezzo = numero(finanza, "currentPrice") or numero(prezzo_info, "regularMarketPrice")
    target = numero(finanza, "targetMeanPrice")
    eps_ultimo, eps_atteso = numero(statistiche, "trailingEps"), numero(statistiche, "forwardEps")
    stime = stime_anno(grezzi.get("earningsTrend"))

    # Crescita attesa degli utili: utile atteso nei prossimi 12 mesi rispetto agli ultimi 12.
    # Se manca, usiamo la crescita che gli analisti stimano per l'anno in corso.
    crescita_attesa = None
    if eps_ultimo and eps_ultimo > 0 and eps_atteso is not None:
        crescita_attesa = eps_atteso / eps_ultimo - 1
    elif stime.get("crescita") is not None:
        crescita_attesa = stime["crescita"]

    # Debito: quante volte il debito netto (debiti − cassa) supera il guadagno operativo di un anno (EBITDA)
    debito, cassa, ebitda = numero(finanza, "totalDebt"), numero(finanza, "totalCash"), numero(finanza, "ebitda")
    debito_ebitda = None
    if debito is not None and ebitda and ebitda > 0:
        debito_ebitda = (debito - (cassa or 0)) / ebitda
    debito_capitale = numero(finanza, "debtToEquity")       # Yahoo lo dà in percento (es. 45.2)
    if debito_capitale is not None:
        debito_capitale /= 100

    # Di quanto è cambiata la stima sugli utili dell'anno negli ultimi 90 giorni
    revisione = None
    if stime.get("oggi") is not None and stime.get("giorni90") and stime["giorni90"] > 0:
        revisione = stime["oggi"] / stime["giorni90"] - 1

    data_trimestrale, stimata = prossima_trimestrale(grezzi.get("calendarEvents"), oggi)
    settore = profilo.get("sector") or ""

    return {
        "valuta": prezzo_info.get("currency") or finanza.get("financialCurrency") or "",
        "prezzo": arrotonda(prezzo),
        "settore": settore,
        "industria": profilo.get("industry") or "",
        "paese": profilo.get("country") or "",
        # Per banche e assicurazioni il debito fa parte del mestiere: non si giudica come per le altre aziende
        "finanziario": settore == "Financial Services",
        "capitalizzazione": numero(prezzo_info, "marketCap") or numero(riassunto, "marketCap"),
        # Valutazione
        "pe": arrotonda(numero(riassunto, "trailingPE"), 2),
        "peAtteso": arrotonda(numero(riassunto, "forwardPE") or numero(statistiche, "forwardPE"), 2),
        # Crescita (ultimo trimestre rispetto allo stesso trimestre di un anno fa)
        "crescitaRicavi": arrotonda(numero(finanza, "revenueGrowth")),
        "crescitaUtili": arrotonda(numero(finanza, "earningsGrowth")),
        "crescitaUtiliAttesa": arrotonda(crescita_attesa),
        # Solidità
        "debitoNettoSuEbitda": arrotonda(debito_ebitda, 2),
        "debitoSuCapitale": arrotonda(debito_capitale, 2),
        "flussoCassa": numero(finanza, "freeCashflow"),
        "roe": arrotonda(numero(finanza, "returnOnEquity")),
        # Margini: quanti centesimi restano per ogni euro incassato
        "margineLordo": arrotonda(numero(finanza, "grossMargins")),
        "margineOperativo": arrotonda(numero(finanza, "operatingMargins")),
        "margineNetto": arrotonda(numero(finanza, "profitMargins")),
        # Analisti
        "target": arrotonda(target, 2),
        "targetMin": arrotonda(numero(finanza, "targetLowPrice"), 2),
        "targetMax": arrotonda(numero(finanza, "targetHighPrice"), 2),
        "potenziale": arrotonda(target / prezzo - 1) if target and prezzo else None,
        "analisti": numero(finanza, "numberOfAnalystOpinions"),
        "raccomandazione": arrotonda(numero(finanza, "recommendationMean"), 2),   # 1 = molto positiva, 5 = negativa
        "revisioneStime": arrotonda(revisione),
        # Calendario
        "prossimaTrimestrale": data_trimestrale,
        "trimestraleStimata": stimata,
        "sorprese": sorprese_utili(grezzi.get("earningsHistory")),
        "massimo52": arrotonda(numero(riassunto, "fiftyTwoWeekHigh"), 2),
        "minimo52": arrotonda(numero(riassunto, "fiftyTwoWeekLow"), 2),
    }


def ha_dati(scheda):
    """Vero se la scheda contiene almeno i numeri essenziali (a volte Yahoo risponde con pagine vuote)."""
    return scheda.get("prezzo") is not None and any(
        scheda.get(chiave) is not None for chiave in ("pe", "peAtteso", "target", "margineNetto", "crescitaRicavi"))
