"""
prova_agenti.py = le PROVE AUTOMATICHE degli agenti.

Controlla che i calcoli degli agenti siano giusti, usando dati finti di cui
conosciamo già il risultato. Non usa internet e non cambia nessun file.

    python3 scripts/prova_agenti.py

Con l'opzione --dal-vivo fa anche una prova vera con Yahoo Finance su pochi titoli
(serve internet): così si vede subito se la fonte dei dati funziona ancora.

    python3 scripts/prova_agenti.py --dal-vivo
"""

import os
import sys

from agenti import fondamentale

OGGI = "2026-11-14"


def n(valore):
    """Scrive un numero come fa Yahoo: {"raw": 1.5, "fmt": "1.50"}"""
    return {"raw": valore, "fmt": str(valore)}


def azienda_finta(**modifiche):
    """Una risposta di Yahoo inventata: un'azienda sana, scesa dai massimi, con target più alto."""
    grezzi = {
        "price": {"currency": "EUR", "regularMarketPrice": n(100.0), "marketCap": n(5e10)},
        "summaryDetail": {"trailingPE": n(20.0), "forwardPE": n(16.0),
                          "fiftyTwoWeekHigh": n(130.0), "fiftyTwoWeekLow": n(90.0)},
        "financialData": {
            "currentPrice": n(100.0), "targetMeanPrice": n(125.0), "targetLowPrice": n(95.0),
            "targetHighPrice": n(150.0), "numberOfAnalystOpinions": n(24), "recommendationMean": n(1.9),
            "revenueGrowth": n(0.08), "earningsGrowth": n(0.12), "grossMargins": n(0.55),
            "operatingMargins": n(0.22), "profitMargins": n(0.15), "returnOnEquity": n(0.18),
            "totalDebt": n(8e9), "totalCash": n(3e9), "ebitda": n(5e9), "debtToEquity": n(45.0),
            "freeCashflow": n(2e9),
        },
        "defaultKeyStatistics": {"trailingEps": n(5.0), "forwardEps": n(6.25)},
        "calendarEvents": {"earnings": {"earningsDate": [n(1795651200)]}},   # 26 novembre 2026
        "earningsTrend": {"trend": [{"period": "0y", "growth": n(0.2), "epsTrend": {
            "current": n(6.0), "30daysAgo": n(6.0), "90daysAgo": n(5.9)}}]},
        "earningsHistory": {"history": [
            {"quarter": n(1782777600), "epsActual": n(1.3), "epsEstimate": n(1.2), "surprisePercent": n(0.0833)},
            {"quarter": n(1790726400), "epsActual": n(1.4), "epsEstimate": n(1.3), "surprisePercent": n(0.0769)},
        ]},
        "assetProfile": {"sector": "Technology", "industry": "Software", "country": "Germany"},
    }
    for percorso, valore in modifiche.items():
        blocco, chiave = percorso.split("__")
        grezzi[blocco][chiave] = n(valore) if isinstance(valore, (int, float)) else valore
    return grezzi


def uguale(a, b, tolleranza=1e-6):
    return a is not None and abs(a - b) < tolleranza


# ---------- Analista fondamentale ----------

def prova_fondamentale():
    f = fondamentale.analizza(azienda_finta(), OGGI)
    assert f["pe"] == 20.0 and f["peAtteso"] == 16.0
    assert uguale(f["potenziale"], 0.25), f["potenziale"]             # target 125 su prezzo 100
    assert uguale(f["crescitaUtiliAttesa"], 0.25)                      # utile atteso 6,25 su 5
    assert uguale(f["debitoNettoSuEbitda"], 1.0)                       # (8 − 3) miliardi su 5
    assert uguale(f["debitoSuCapitale"], 0.45)
    assert f["prossimaTrimestrale"] == "2026-11-26" and not f["trimestraleStimata"]
    assert len(f["sorprese"]) == 2 and f["sorprese"][-1]["effettivo"] == 1.4
    assert uguale(f["revisioneStime"], 6.0 / 5.9 - 1, 1e-3)
    assert f["analisti"] == 24 and not f["finanziario"]
    assert fondamentale.ha_dati(f)


def prova_fondamentale_dati_mancanti():
    """Yahoo spesso lascia dei buchi ({} al posto del numero): non deve rompersi niente."""
    grezzi = azienda_finta(financialData__ebitda={}, financialData__targetMeanPrice={},
                           defaultKeyStatistics__trailingEps=-1.0)
    grezzi["calendarEvents"] = {}
    f = fondamentale.analizza(grezzi, OGGI)
    assert f["debitoNettoSuEbitda"] is None and f["target"] is None and f["potenziale"] is None
    assert uguale(f["crescitaUtiliAttesa"], 0.2)          # utili negativi: usa la stima degli analisti
    assert f["prossimaTrimestrale"] is None
    assert not fondamentale.ha_dati(fondamentale.analizza({}, OGGI))   # risposta vuota


PROVE = [prova_fondamentale, prova_fondamentale_dati_mancanti]


# ---------- Prova dal vivo (con internet) ----------

def prova_dal_vivo():
    """Chiede a Yahoo i dati veri di pochi titoli e scrive una tabella. Restituisce True se la fonte funziona."""
    from agenti.yahoo import Yahoo
    yahoo = Yahoo()
    righe = ["## Prova dal vivo delle fonti (Yahoo Finance)", "",
             "| Titolo | Fondamentali | P/E | Target | Analisti | Prossima trimestrale |", "|---|---|---|---|---|---|"]
    riusciti = 0
    campione = ["SAP.DE", "AIR.PA", "AAPL", "7203.T", "005930.KS", "AZN.L"]
    for ticker in campione:
        try:
            f = fondamentale.analizza(yahoo.riepilogo(ticker))
            stato = "ok" if fondamentale.ha_dati(f) else "vuoti"
            riusciti += stato == "ok"
            righe.append(f"| {ticker} | {stato} | {f['pe']} | {f['target']} {f['valuta']} | {f['analisti']} | {f['prossimaTrimestrale']} |")
        except Exception as errore:
            righe.append(f"| {ticker} | ERRORE: {type(errore).__name__} {errore} | | | | |")
    testo = "\n".join(righe)
    print(testo)
    riepilogo = os.environ.get("GITHUB_STEP_SUMMARY")
    if riepilogo:
        with open(riepilogo, "a", encoding="utf-8") as f:
            f.write(testo + "\n")
    return riusciti >= len(campione) - 1


def main():
    for prova in PROVE:
        prova()
        print(f"OK  {prova.__name__}")
    print(f"Tutte le {len(PROVE)} prove sono riuscite.")
    if "--dal-vivo" in sys.argv and not prova_dal_vivo():
        raise SystemExit("La prova dal vivo NON è riuscita: la fonte dei dati non risponde come previsto.")


if __name__ == "__main__":
    main()
