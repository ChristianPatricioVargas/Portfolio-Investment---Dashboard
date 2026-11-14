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

from agenti import cacciatore, fondamentale, tecnico

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


# ---------- Analista tecnico ----------

def giorni_finti(quanti):
    """Una lista di giorni consecutivi che finisce il 13 novembre 2026."""
    from datetime import date, timedelta
    fine = date(2026, 11, 13)
    return [(fine - timedelta(days=quanti - 1 - i)).isoformat() for i in range(quanti)]


def prova_tecnico_medie_e_rsi():
    assert tecnico.media_mobile([1, 2, 3, 4], 2) == [None, 1.5, 2.5, 3.5]
    assert tecnico.rsi(list(range(1, 40))) == 100.0                    # sale sempre: RSI al massimo
    assert uguale(tecnico.rsi(list(range(40, 1, -1))), 0.0)            # scende sempre: RSI a zero
    # Esempio classico del libro di Wilder (l'inventore dell'RSI): il risultato noto è circa 70,5
    wilder = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
              45.89, 46.03, 45.61, 46.28, 46.28]
    assert abs(tecnico.rsi(wilder) - 70.46) < 0.1, tecnico.rsi(wilder)


def prova_tecnico_scheda():
    # Un titolo che sale per 250 giorni da 100 a 200 e poi scende a 150 in 50 giorni
    valori = [100 + 100 * i / 249 for i in range(250)] + [200 - 50 * (i + 1) / 50 for i in range(50)]
    scheda, serie = tecnico.analizza(giorni_finti(300), valori, "EUR")
    assert scheda["massimo52"] == 200.0 and uguale(scheda["dalMassimo"], -0.25)
    assert scheda["sopraMm50"] is False                 # è sotto la media degli ultimi 50 giorni
    assert scheda["rsi"] < 30                           # 50 giorni di ribassi
    assert scheda["resistenze"] and scheda["resistenze"][-1]["prezzo"] == 200.0   # il picco è una resistenza
    assert len(serie["giorni"]) == 252 == len(serie["prezzo"]) == len(serie["mm200"])
    assert "RSI basso" in scheda["frase"] and "25% dal massimo" in scheda["frase"]
    assert tecnico.analizza(giorni_finti(30), valori[:30]) == (None, None)        # troppo pochi dati


def prova_tecnico_livelli():
    # Il prezzo rimbalza tre volte su 90 e viene respinto tre volte da 110
    onda = [100, 104, 108, 110, 108, 104, 100, 96, 92, 90, 92, 96] * 3 + [100, 101, 101, 101, 101, 101, 101]
    supporti, resistenze = tecnico.livelli(onda, 101)
    assert supporti[0] == {"prezzo": 90.0, "tocchi": 3}, supporti
    # Il primo picco a 110 è troppo vicino all'inizio per essere contato (servono 5 giorni prima)
    assert resistenze[0] == {"prezzo": 110.0, "tocchi": 2}, resistenze


# ---------- Cacciatore ----------

def prova_cacciatore():
    # L'azienda finta: −23% dal massimo (100 su 130), utili +25%, debito 1×EBITDA, target +25% con 24 analisti
    f = fondamentale.analizza(azienda_finta(), OGGI)
    esito = cacciatore.valuta(f, None)
    assert esito["rispettati"] == 4, esito
    assert esito["motivo"].startswith("-23% dal massimo"), esito["motivo"]
    assert 0 < esito["punteggio"] <= 100

    # Poco calo: 100 su un massimo di 105 → il primo criterio non è rispettato
    poco_calo = cacciatore.valuta(fondamentale.analizza(azienda_finta(summaryDetail__fiftyTwoWeekHigh=105.0), OGGI), None)
    assert poco_calo["rispettati"] == 3 and poco_calo["criteri"][0]["ok"] is False

    # Se c'è l'analisi tecnica, il calo si prende da lì
    assert cacciatore.valuta(f, {"dalMassimo": -0.02})["criteri"][0]["ok"] is False

    # Troppo debito: 30 miliardi su 5 di EBITDA
    debito = cacciatore.valuta(fondamentale.analizza(azienda_finta(financialData__totalDebt=3e10), OGGI), None)
    assert debito["criteri"][2]["ok"] is False and "debito alto" in debito["criteri"][2]["testo"]

    # Pochi analisti: il target non conta
    pochi = cacciatore.valuta(fondamentale.analizza(azienda_finta(financialData__numberOfAnalystOpinions=2), OGGI), None)
    assert pochi["criteri"][3]["ok"] is False

    # Dati mancanti: né sì né no
    assert cacciatore.valuta({}, None)["rispettati"] == 0
    assert cacciatore.valuta({}, None)["criteri"][1]["ok"] is None


def prova_classifica():
    scheda = lambda gruppo, rispettati, punteggio: {"gruppo": gruppo, "cacciatore": {"rispettati": rispettati, "punteggio": punteggio}}
    schede = {"A": scheda("watchlist", 4, 50), "B": scheda("watchlist", 4, 80), "C": scheda("watchlist", 3, 90),
              "D": scheda("portafoglio", 4, 99), "E": scheda("watchlist", 2, 99), "F": {"gruppo": "watchlist"}}
    assert cacciatore.classifica(schede) == (["B", "A"], ["C"])     # solo watchlist, dal punteggio più alto


def prova_watchlist():
    """La watchlist nel repository deve essere scritta bene: niente doppioni, ogni voce completa."""
    import json
    from pathlib import Path
    cartella = Path(__file__).resolve().parent.parent / "data"
    watchlist = json.loads((cartella / "watchlist.json").read_text(encoding="utf-8"))
    sigle = [t["ticker"] for t in watchlist]
    assert len(sigle) == len(set(sigle)), "doppioni nella watchlist"
    assert all(t.get("nome") and t.get("area") in ("Europa", "USA", "Asia") for t in watchlist)


PROVE = [prova_fondamentale, prova_fondamentale_dati_mancanti,
         prova_tecnico_medie_e_rsi, prova_tecnico_scheda, prova_tecnico_livelli,
         prova_cacciatore, prova_classifica, prova_watchlist]


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
