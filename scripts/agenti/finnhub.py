"""
finnhub.py = un altro "fattorino" IN PROVA, come alphavantage.py.

Finnhub è un servizio ufficiale con chiave gratuita. Dobbiamo sapere che cosa dà
davvero nel piano gratuito, e per quali titoli: questo file fa solo quella verifica.

La chiave arriva dal segreto FINNHUB_API_KEY di GitHub e viaggia in un'intestazione
della richiesta (non nell'indirizzo), così non può finire stampata per sbaglio.
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request

INDIRIZZO = "https://finnhub.io/api/v1"
PAUSA = 1.2    # il piano gratuito permette circa 60 richieste al minuto


def chiedi(chiave, percorso, **parametri):
    """Una richiesta a Finnhub. Restituisce (dati, "") oppure (None, motivo del rifiuto)."""
    time.sleep(PAUSA)
    richiesta = urllib.request.Request(f"{INDIRIZZO}{percorso}?{urllib.parse.urlencode(parametri)}",
                                       headers={"X-Finnhub-Token": chiave})
    try:
        with urllib.request.urlopen(richiesta, timeout=30) as risposta:
            return json.load(risposta), ""
    except urllib.error.HTTPError as errore:
        return None, f"rifiutato ({errore.code})"       # 403 = non incluso nel piano gratuito
    except Exception as errore:
        return None, type(errore).__name__


def prova_copertura(chiave):
    """Per pochi titoli chiede quattro cose e scrive una tabella con ciò che arriva davvero."""
    campione = [
        ("AAPL", "Apple (USA)"), ("SAP", "SAP a New York"), ("TM", "Toyota a New York"),
        ("ASML", "ASML a New York"), ("NVO", "Novo Nordisk a New York"), ("EADSY", "Airbus negli USA"),
        ("SAP.DE", "SAP su Xetra"), ("AIR.PA", "Airbus a Parigi"),
    ]
    righe = ["## Prova di Finnhub (fonte alternativa per i fondamentali)", "",
             "| Sigla | Cosa | Numeri di bilancio | P/E | Margine netto | Crescita utili | Debito/capitale | Massimo 52 sett. | Giudizi degli analisti | Target | Trimestrale |",
             "|---|---|---|---|---|---|---|---|---|---|---|"]
    oggi = time.strftime("%Y-%m-%d")
    tra_4_mesi = time.strftime("%Y-%m-%d", time.gmtime(time.time() + 120 * 86400))
    for sigla, nome in campione:
        dati, motivo = chiedi(chiave, "/stock/metric", symbol=sigla, metric="all")
        m = (dati or {}).get("metric") or {}
        v = lambda campo: m.get(campo, "–")
        bilancio = f"✓ {len(m)} numeri" if m else f"✗ {motivo or 'vuoto'}"

        giudizi, motivo = chiedi(chiave, "/stock/recommendation", symbol=sigla)
        if giudizi:
            g = giudizi[0]
            testo_giudizi = (f"✓ {g.get('strongBuy', 0) + g.get('buy', 0)} positivi, {g.get('hold', 0)} neutri, "
                             f"{g.get('sell', 0) + g.get('strongSell', 0)} negativi ({g.get('period')})")
        else:
            testo_giudizi = f"✗ {motivo or 'vuoto'}"

        target, motivo = chiedi(chiave, "/stock/price-target", symbol=sigla)
        testo_target = f"✓ {target.get('targetMean')}" if target and target.get("targetMean") else f"✗ {motivo or 'vuoto'}"

        calendario, motivo = chiedi(chiave, "/calendar/earnings", symbol=sigla, **{"from": oggi, "to": tra_4_mesi})
        date = (calendario or {}).get("earningsCalendar") or []
        testo_data = f"✓ {min(d.get('date', '') for d in date)}" if date else f"✗ {motivo or 'nessuna data'}"

        righe.append(f"| {sigla} | {nome} | {bilancio} | {v('peTTM')} | {v('netProfitMarginTTM')} | {v('epsGrowthTTMYoy')} "
                     f"| {v('totalDebt/totalEquityQuarterly')} | {v('52WeekHigh')} | {testo_giudizi} | {testo_target} | {testo_data} |")
    return righe
