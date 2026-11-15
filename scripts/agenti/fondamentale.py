"""
fondamentale.py = l'ANALISTA FONDAMENTALE (il "se").

Guarda i conti dell'azienda, non il grafico: quanto costa rispetto agli utili,
se cresce, quanto debito ha, quanto guadagna, cosa pensano gli analisti e
quando esce la prossima trimestrale.

Riceve i dati grezzi di Finnhub (dal fattorino) e restituisce una scheda ordinata.
Non dà consigli: mette in fila i numeri.

Nota: Finnhub scrive le percentuali come numeri interi (27.6 = 27,6%).
Qui le trasformiamo in frazioni (0.276), che è il formato usato da tutti gli altri agenti.
"""

from datetime import datetime, timezone

SETTORI_FINANZIARI = ("Banking", "Insurance", "Financial Services")


def numero(blocco, chiave):
    """Prende un numero dai dati di Finnhub. Se manca (capita spesso) restituisce None, senza errori."""
    valore = (blocco or {}).get(chiave)
    if isinstance(valore, bool) or not isinstance(valore, (int, float)):
        return None
    if valore != valore or valore in (float("inf"), float("-inf")):   # "non è un numero" o infinito
        return None
    return valore


def frazione(blocco, chiave):
    """Una percentuale di Finnhub (27.6) come frazione (0.276)."""
    valore = numero(blocco, chiave)
    return None if valore is None else valore / 100


def arrotonda(valore, cifre=4):
    return None if valore is None else round(valore, cifre)


def giudizi_analisti(mesi):
    """Dai giudizi degli analisti (uno per mese, il più recente per primo) ricava:
    quanti sono positivi, neutri e negativi, e il voto medio da 1 (molto positivo) a 5 (molto negativo)."""
    def riassumi(mese):
        conta = [mese.get(c) or 0 for c in ("strongBuy", "buy", "hold", "sell", "strongSell")]
        totale = sum(conta)
        if totale == 0:
            return None
        return {"positivi": conta[0] + conta[1], "neutri": conta[2], "negativi": conta[3] + conta[4], "totale": totale,
                "voto": sum(voto * quanti for voto, quanti in zip((1, 2, 3, 4, 5), conta)) / totale,
                "mese": mese.get("period") or ""}
    ordinati = sorted((m for m in mesi or [] if isinstance(m, dict)), key=lambda m: m.get("period") or "", reverse=True)
    adesso = riassumi(ordinati[0]) if ordinati else None
    prima = riassumi(ordinati[1]) if len(ordinati) > 1 else None
    return adesso, prima


def sorprese_utili(trimestri):
    """Gli ultimi 4 trimestri: utile per azione atteso, effettivo e differenza in %."""
    risultato = []
    for voce in trimestri or []:
        effettivo, atteso = numero(voce, "actual"), numero(voce, "estimate")
        if effettivo is None or atteso is None:
            continue
        risultato.append({"trimestre": voce.get("period") or "", "effettivo": arrotonda(effettivo),
                          "atteso": arrotonda(atteso), "sorpresa": arrotonda(frazione(voce, "surprisePercent"))})
    return sorted(risultato, key=lambda s: s["trimestre"])[-4:]


def prossima_trimestrale(calendario, oggi):
    """La data della prossima trimestrale (la prima da oggi in poi)."""
    future = sorted(v.get("date") for v in calendario or [] if isinstance(v, dict) and (v.get("date") or "") >= oggi)
    return future[0] if future else None


def analizza(grezzi, oggi=None, quotazione_estera=False):
    """Dai dati grezzi di Finnhub alla scheda dei fondamentali.

    quotazione_estera=True per le aziende non americane, di cui leggiamo la versione quotata negli USA.
    Per loro due numeri che ricaviamo con un calcolo (utili attesi e debito netto ÷ EBITDA) NON sono
    affidabili: nella prova dal vivo AstraZeneca risultava con un debito di 5 volte l'EBITDA (è circa 1,5)
    e Samsung con utili attesi a +99%. Meglio nessun numero che un numero sbagliato: li lasciamo vuoti
    e gli altri agenti usano i dati diretti (crescita degli utili già realizzata, debito ÷ capitale)."""
    oggi = oggi or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    m = grezzi.get("metric") or {}
    profilo = grezzi.get("profile") or {}
    adesso, prima = giudizi_analisti(grezzi.get("recommendation"))

    # Crescita attesa degli utili. Il P/E di oggi usa gli utili degli ultimi 12 mesi, quello "atteso"
    # gli utili previsti: se il P/E atteso è più basso, vuol dire che gli analisti si aspettano utili più alti.
    pe, pe_atteso = numero(m, "peTTM"), numero(m, "forwardPE")
    crescita_attesa = pe / pe_atteso - 1 if pe and pe_atteso and pe > 0 and pe_atteso > 0 else None
    if quotazione_estera:
        crescita_attesa = None

    # Debito netto ÷ EBITDA (quanti anni di guadagni operativi servono per ripagare i debiti).
    # Finnhub non lo dà direttamente, ma si ricava: il "valore d'impresa" è capitalizzazione + debito netto,
    # e il rapporto valore d'impresa ÷ EBITDA ci dice quanto vale l'EBITDA.
    valore_impresa, capitalizzazione, multiplo = numero(m, "enterpriseValue"), numero(m, "marketCapitalization"), numero(m, "evEbitdaTTM")
    debito_ebitda = None
    if not quotazione_estera and valore_impresa and capitalizzazione and multiplo and multiplo > 0 and valore_impresa > 0:
        debito_ebitda = (valore_impresa - capitalizzazione) / (valore_impresa / multiplo)

    settore = profilo.get("finnhubIndustry") or ""
    return {
        "fonte": "Finnhub",
        "valuta": profilo.get("currency") or "",
        "settore": settore,
        "paese": profilo.get("country") or "",
        # Per banche e assicurazioni il debito fa parte del mestiere: non si giudica come per le altre aziende
        "finanziario": settore in SETTORI_FINANZIARI,
        # Valutazione
        "pe": arrotonda(pe, 2),
        "peAtteso": arrotonda(pe_atteso, 2),
        # Crescita (ultimo trimestre rispetto allo stesso trimestre di un anno fa)
        "crescitaRicavi": arrotonda(frazione(m, "revenueGrowthQuarterlyYoy")),
        "crescitaUtili": arrotonda(frazione(m, "epsGrowthQuarterlyYoy")),
        "crescitaUtiliAnno": arrotonda(frazione(m, "epsGrowthTTMYoy")),      # ultimi 12 mesi sui 12 precedenti
        "crescitaUtiliAttesa": arrotonda(crescita_attesa),
        # Solidità
        "debitoNettoSuEbitda": arrotonda(debito_ebitda, 2),
        "debitoSuCapitale": arrotonda(numero(m, "totalDebt/totalEquityQuarterly"), 2),
        "roe": arrotonda(frazione(m, "roeTTM")),
        # Margini: quanti centesimi restano per ogni euro incassato
        "margineLordo": arrotonda(frazione(m, "grossMarginTTM")),
        "margineOperativo": arrotonda(frazione(m, "operatingMarginTTM")),
        "margineNetto": arrotonda(frazione(m, "netProfitMarginTTM")),
        # Analisti: Finnhub gratis dà i giudizi (positivo, neutro, negativo), non il target price
        "target": None,
        "potenziale": None,
        "analisti": adesso["totale"] if adesso else None,
        "analistiPositivi": adesso["positivi"] if adesso else None,
        "analistiNeutri": adesso["neutri"] if adesso else None,
        "analistiNegativi": adesso["negativi"] if adesso else None,
        "raccomandazione": arrotonda(adesso["voto"], 2) if adesso else None,      # 1 = molto positiva, 5 = molto negativa
        "raccomandazionePrima": arrotonda(prima["voto"], 2) if prima else None,   # il voto del mese precedente
        # Calendario
        "prossimaTrimestrale": prossima_trimestrale(grezzi.get("calendar"), oggi),
        "sorprese": sorprese_utili(grezzi.get("earnings")),
    }


def ha_dati(scheda):
    """Vero se la scheda contiene almeno i numeri essenziali (a volte arrivano risposte quasi vuote)."""
    return sum(scheda.get(chiave) is not None for chiave in ("pe", "margineNetto", "crescitaRicavi", "crescitaUtili", "analisti")) >= 2
