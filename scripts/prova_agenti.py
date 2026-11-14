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

from agenti import avvocato, avvocato_ai, cacciatore, fondamentale, tecnico

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

    # Senza fondamentali (fonte chiusa) resta il solo criterio del calo, preso dall'analisi tecnica
    solo_tecnica = cacciatore.valuta(None, {"dalMassimo": -0.3})
    assert solo_tecnica["rispettati"] == 1 and [c["ok"] for c in solo_tecnica["criteri"]] == [True, None, None, None]

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


# ---------- Avvocato del diavolo ----------

def tipi(campanelli):
    return [c["titolo"] for c in campanelli]


def prova_avvocato_azienda_sana():
    """L'azienda finta è sana: l'unico campanello è la trimestrale del 26 novembre (tra 12 giorni)."""
    scheda = {"tipo": "Azione", "fondamentali": fondamentale.analizza(azienda_finta(), OGGI),
              "tecnica": {"sopraMm200": True}}
    assert tipi(avvocato.controlla(scheda, [], OGGI)) == ["Trimestrale in arrivo"]
    assert avvocato.controlla(scheda, [], "2026-10-01") == []          # a ottobre la trimestrale è lontana


def prova_avvocato_campanelli():
    grezzi = azienda_finta(financialData__earningsGrowth=-0.3, financialData__totalDebt=3e10,
                           financialData__targetMeanPrice=90.0, financialData__recommendationMean=3.4,
                           defaultKeyStatistics__forwardEps=4.0)
    grezzi["earningsTrend"]["trend"][0]["epsTrend"]["90daysAgo"] = n(7.0)       # stime tagliate: da 7 a 6
    grezzi["earningsHistory"]["history"][-1]["epsActual"] = n(1.0)              # ultima trimestrale sotto le attese
    scheda = {"tipo": "Azione", "fondamentali": fondamentale.analizza(grezzi, OGGI),
              "tecnica": {"sopraMm200": False, "incrocio": "ribasso"},
              "storiaTarget": {"2026-10-10": 110.0, "2026-11-14": 90.0}}
    notizie = [{"titolo": "Azienda Finta: indagine dell'antitrust"}, {"titolo": "Azienda Finta taglia le stime per il 2027"},
               {"titolo": "A causa del maltempo slitta la presentazione"}]
    trovati = avvocato.controlla(scheda, notizie, OGGI)
    for atteso in ["Utili attesi in calo", "Utili in calo", "Trimestrale sotto le attese", "Debito alto",
                   "Target degli analisti abbassato", "Stime sugli utili tagliate", "Prezzo sopra il target",
                   "Analisti freddi", "Sotto la media a 200 giorni", "Trimestrale in arrivo", "Notizie da leggere"]:
        assert atteso in tipi(trovati), f"manca: {atteso} in {tipi(trovati)}"
    assert trovati[0]["livello"] == "alto" and trovati[-1]["livello"] == "medio"   # prima i più gravi
    notizia = next(c for c in trovati if c["tipo"] == "notizie")
    assert notizia["livello"] == "alto" and "maltempo" not in notizia["testo"]      # "a causa di" non è una causa legale


def prova_avvocato_target_e_etf():
    storia = avvocato.aggiorna_storia_target({"2026-01-01": 50.0, "2026-10-14": 100.0}, 93.0, OGGI)
    assert list(storia) == ["2026-10-14", "2026-11-14"]                           # i target troppo vecchi spariscono
    assert uguale(avvocato.variazione_target(storia, OGGI), -0.07)
    assert avvocato.variazione_target({"2026-11-12": 100.0, OGGI: 80.0}, OGGI) is None   # storia troppo corta
    # Un ETF non ha fondamentali: contano solo tecnica e notizie
    etf = {"tipo": "ETF", "tecnica": {"sopraMm200": False}}
    assert tipi(avvocato.controlla(etf, [], OGGI)) == ["Sotto la media a 200 giorni"]


# ---------- Avvocato con AI (con un Claude finto: nessuna chiamata vera, nessuna spesa) ----------

class ClaudeFinto:
    """Si comporta come la libreria di Anthropic, ma risponde sempre la stessa cosa e conta le chiamate."""

    def __init__(self, motivo="end_turn"):
        import json
        from types import SimpleNamespace as Oggetto
        self.richieste = []
        testo = json.dumps({"sintesi": "Quadro misto.", "pro": ["Conti solidi"], "contro": ["Utili in calo"],
                            "daVerificare": ["La guidance è confermata?"]})
        self.risposta = Oggetto(stop_reason=motivo, content=[Oggetto(type="thinking"), Oggetto(type="text", text=testo)],
                                usage=Oggetto(input_tokens=2000, output_tokens=1500))
        crea = lambda **richiesta: self.richieste.append(richiesta) or self.risposta
        self.messages = Oggetto(create=crea)
        self.beta = Oggetto(messages=Oggetto(create=crea))


def prova_ai_spenta_senza_chiave():
    os.environ.pop("ANTHROPIC_API_KEY", None)
    stato = avvocato_ai.lavora({}, ["A"], {"A": {"nome": "A"}}, {}, OGGI)
    assert stato["attiva"] is False and stato["analisi"] == {}


def prova_ai_freni():
    try:
        import anthropic   # noqa: F401  (serve la libreria vera per riconoscere gli errori)
    except ImportError:
        print("    (libreria anthropic non installata: prova saltata)")
        return
    for nome in ("AI_MODELLO", "AI_CHIAMATE_AL_GIORNO", "AI_BUDGET_MENSILE_USD"):
        os.environ.pop(nome, None)
    schede = {t: {"nome": t, "campanelli": []} for t in "ABCDEF"}
    finto = ClaudeFinto()

    # 1. Limite giornaliero: 6 titoli da analizzare, ma al massimo 4 chiamate al giorno
    stato = avvocato_ai.lavora({}, list("ABCDEF"), schede, {}, OGGI, cliente=finto)
    assert len(finto.richieste) == 4 and sorted(stato["analisi"]) == list("ABCD")
    assert stato["analisi"]["A"]["contro"] == ["Utili in calo"] and stato["analisi"]["A"]["modello"] == "claude-opus-5-5"
    # 2000 token in ingresso a 4 $ + 1500 in uscita a 20 $ al milione = 0,038 $ a chiamata
    assert uguale(stato["spesa"]["2026-11"], 4 * 0.038, 1e-3)
    # La richiesta: modello predefinito, riserva attiva, risposta in formato fisso, nessun dato personale possibile
    richiesta = finto.richieste[0]
    assert richiesta["model"] == "claude-opus-5-5" and richiesta["fallbacks"] == "default"
    assert richiesta["output_config"]["format"]["type"] == "json_schema"

    # 2. Lo stesso giorno non riparte: il limite di oggi è già raggiunto
    stato = avvocato_ai.lavora(stato, list("ABCDEF"), schede, {}, OGGI, cliente=finto)
    assert len(finto.richieste) == 4

    # 3. Il giorno dopo fa solo i titoli mancanti: quelli già analizzati e non cambiati si saltano
    stato = avvocato_ai.lavora(stato, list("ABCDEF"), schede, {}, "2026-11-15", cliente=finto)
    assert len(finto.richieste) == 6 and sorted(stato["analisi"]) == list("ABCDEF")
    stato = avvocato_ai.lavora(stato, list("ABCDEF"), schede, {}, "2026-11-16", cliente=finto)
    assert len(finto.richieste) == 6
    # ...ma se arriva una notizia nuova su A, A viene rifatto
    stato = avvocato_ai.lavora(stato, list("ABCDEF"), schede, {"A": [{"titolo": "Novità"}]}, "2026-11-17", cliente=finto)
    assert len(finto.richieste) == 7

    # 4. Tetto mensile: con 0,10 $ di budget non parte nemmeno una chiamata (una può costare fino a 0,12 $)
    os.environ["AI_BUDGET_MENSILE_USD"] = "0.10"
    finto2 = ClaudeFinto()
    stato2 = avvocato_ai.lavora({}, list("ABC"), schede, {}, OGGI, cliente=finto2)
    assert finto2.richieste == [] and stato2["analisi"] == {}
    os.environ.pop("AI_BUDGET_MENSILE_USD")

    # 5. Risposta rifiutata o tagliata: non viene salvata, ma la spesa viene contata
    rifiuto = ClaudeFinto(motivo="refusal")
    stato3 = avvocato_ai.lavora({}, ["A"], schede, {}, OGGI, cliente=rifiuto)
    assert stato3["analisi"] == {} and stato3["spesa"]["2026-11"] > 0

    # 6. Un modello economico senza riserva usa la chiamata normale
    os.environ["AI_MODELLO"] = "claude-haiku-5-5"
    economico = ClaudeFinto()
    stato4 = avvocato_ai.lavora({}, ["A"], schede, {}, OGGI, cliente=economico)
    assert "fallbacks" not in economico.richieste[0] and stato4["spesa"]["2026-11"] < 0.002
    os.environ.pop("AI_MODELLO")


PROVE = [prova_fondamentale, prova_fondamentale_dati_mancanti,
         prova_tecnico_medie_e_rsi, prova_tecnico_scheda, prova_tecnico_livelli,
         prova_cacciatore, prova_classifica, prova_watchlist,
         prova_avvocato_azienda_sana, prova_avvocato_campanelli, prova_avvocato_target_e_etf,
         prova_ai_spenta_senza_chiave, prova_ai_freni]


# ---------- Prova dal vivo (con internet) ----------

def prova_dal_vivo():
    """Chiede a Yahoo i dati veri di pochi titoli e scrive una tabella. Restituisce True se la fonte funziona."""
    from agenti.yahoo import Yahoo
    yahoo = Yahoo()
    righe = ["## Prova dal vivo delle fonti (Yahoo Finance)", "",
             "| Titolo | Fondamentali | P/E | Target | Analisti | Trimestrale | Tecnica | RSI | Dal massimo | Criteri |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    riusciti = tecniche_ok = 0
    campione = ["SAP.DE", "AIR.PA", "AAPL", "JPM", "7203.T", "005930.KS", "AZN.L", "NOVO-B.CO"]
    for ticker in campione:
        f, t = {}, None
        try:
            f = fondamentale.analizza(yahoo.riepilogo(ticker))
            stato_f = "ok" if fondamentale.ha_dati(f) else "vuoti"
        except Exception as errore:
            stato_f = f"ERRORE {type(errore).__name__}: {errore}"
        try:
            grafico = yahoo.grafico(ticker, "2y")
            t, _ = tecnico.analizza(*tecnico.chiusure(grafico), grafico["meta"].get("currency") or "")
            stato_t = "ok" if t else "pochi dati"
        except Exception as errore:
            stato_t = f"ERRORE {type(errore).__name__}: {errore}"
        riusciti += stato_f == "ok" and stato_t == "ok"
        tecniche_ok += stato_t == "ok"
        criteri = cacciatore.valuta(f, t)["rispettati"] if stato_f == "ok" else "–"
        righe.append(f"| {ticker} | {stato_f} | {f.get('pe')} | {f.get('target')} {f.get('valuta', '')} | {f.get('analisti')} "
                     f"| {f.get('prossimaTrimestrale')} | {stato_t} | {t['rsi'] if t else '–'} "
                     f"| {t['dalMassimo'] if t else '–'} | {criteri} su 4 |")
    righe += ["", f"Prezzi storici (analisi tecnica): {tecniche_ok} titoli su {len(campione)}.",
              f"Fondamentali e analisti: {riusciti} titoli su {len(campione)}."]
    if yahoo.rifiutato:
        righe.append(f"**{yahoo.rifiutato}.** Senza questa fonte restano vuoti: fondamentali, classifica del cacciatore "
                     "e campanelli sui conti. Vedi \"Le fonti dei dati e i loro limiti\" nel README.")
    # Se esiste il segreto ALPHAVANTAGE_API_KEY, proviamo anche la fonte alternativa
    chiave = (os.environ.get("ALPHAVANTAGE_API_KEY") or "").strip()
    if chiave:
        from agenti import alphavantage
        righe += [""] + alphavantage.prova_copertura(chiave)
    else:
        righe += ["", "Alpha Vantage: non provata (manca il segreto ALPHAVANTAGE_API_KEY)."]
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
