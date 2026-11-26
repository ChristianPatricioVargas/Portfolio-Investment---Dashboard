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

from agenti import avvocato, avvocato_ai, cacciatore, fondamentale, mercato, tecnico
from agenti.finnhub import TitoloNonCoperto
from agenti.yahoo import leggi_gruppo

OGGI = "2026-11-14"


def azienda_finta(**modifiche):
    """Una risposta di Finnhub inventata: un'azienda sana, con utili in crescita e analisti positivi.
    Le percentuali sono scritte come le scrive Finnhub: 15.0 vuol dire 15%."""
    grezzi = {
        "metric": {
            "peTTM": 20.0, "forwardPE": 16.0,
            "revenueGrowthQuarterlyYoy": 8.0, "epsGrowthQuarterlyYoy": 12.0, "epsGrowthTTMYoy": 10.0,
            "grossMarginTTM": 55.0, "operatingMarginTTM": 22.0, "netProfitMarginTTM": 15.0, "roeTTM": 18.0,
            "totalDebt/totalEquityQuarterly": 0.45,
            # capitalizzazione 50 miliardi, debito netto 5, EBITDA 5 (valore d'impresa 55 = 11 volte l'EBITDA)
            "marketCapitalization": 50000.0, "enterpriseValue": 55000.0, "evEbitdaTTM": 11.0,
        },
        "recommendation": [
            {"period": "2026-11-01", "strongBuy": 8, "buy": 10, "hold": 5, "sell": 1, "strongSell": 0},
            {"period": "2026-10-01", "strongBuy": 8, "buy": 10, "hold": 5, "sell": 1, "strongSell": 0},
        ],
        "earnings": [
            {"period": "2026-09-30", "actual": 1.4, "estimate": 1.3, "surprisePercent": 7.69},
            {"period": "2026-06-30", "actual": 1.3, "estimate": 1.2, "surprisePercent": 8.33},
        ],
        "calendar": [{"date": "2026-11-26"}, {"date": "2027-02-25"}],
        "profile": {"finnhubIndustry": "Technology", "currency": "USD", "country": "DE"},
    }
    for chiave, valore in modifiche.items():
        if chiave in grezzi:
            grezzi[chiave] = valore             # sostituisce un blocco intero (es. recommendation=[...])
        else:
            grezzi["metric"][chiave.replace("__", "/")] = valore    # oppure un singolo numero di bilancio
    return grezzi


def uguale(a, b, tolleranza=1e-6):
    return a is not None and abs(a - b) < tolleranza


# ---------- Analista fondamentale ----------

def prova_fondamentale():
    f = fondamentale.analizza(azienda_finta(), OGGI)
    assert f["pe"] == 20.0 and f["peAtteso"] == 16.0
    assert uguale(f["crescitaUtiliAttesa"], 0.25)                      # P/E 20 con gli utili di oggi, 16 con quelli attesi
    assert uguale(f["crescitaUtili"], 0.12) and uguale(f["margineNetto"], 0.15)   # percentuali → frazioni
    assert uguale(f["debitoNettoSuEbitda"], 1.0)                       # debito netto 5 miliardi su 5 di EBITDA
    assert uguale(f["debitoSuCapitale"], 0.45)
    assert f["prossimaTrimestrale"] == "2026-11-26"
    assert len(f["sorprese"]) == 2 and f["sorprese"][-1]["effettivo"] == 1.4      # la più recente per ultima
    assert (f["analisti"], f["analistiPositivi"], f["analistiNeutri"], f["analistiNegativi"]) == (24, 18, 5, 1)
    assert uguale(f["raccomandazione"], (8 * 1 + 10 * 2 + 5 * 3 + 1 * 4) / 24, 1e-2)
    assert f["target"] is None and not f["finanziario"]                # il target price gratis non c'è
    assert fondamentale.ha_dati(f)
    assert fondamentale.analizza(azienda_finta(profile={"finnhubIndustry": "Banking"}), OGGI)["finanziario"]
    # Azienda non americana: i due numeri ricavati con un calcolo restano vuoti, gli altri ci sono
    estera = fondamentale.analizza(azienda_finta(), OGGI, quotazione_estera=True)
    assert estera["crescitaUtiliAttesa"] is None and estera["debitoNettoSuEbitda"] is None
    assert uguale(estera["debitoSuCapitale"], 0.45) and uguale(estera["crescitaUtili"], 0.12)
    assert cacciatore.valuta(estera, {"dalMassimo": -0.2})["rispettati"] == 4     # i criteri usano i dati diretti


def prova_fondamentale_dati_mancanti():
    """Spesso mancano dei numeri (o sono scritti "None"): non deve rompersi niente."""
    grezzi = azienda_finta(evEbitdaTTM=None, forwardPE=None, recommendation=[], calendar=[], earnings=[{"period": "x"}])
    f = fondamentale.analizza(grezzi, OGGI)
    assert f["debitoNettoSuEbitda"] is None and f["crescitaUtiliAttesa"] is None
    assert f["analisti"] is None and f["raccomandazione"] is None and f["sorprese"] == []
    assert f["prossimaTrimestrale"] is None
    assert not fondamentale.ha_dati(fondamentale.analizza({}, OGGI))   # risposta vuota
    # Più cassa che debiti: il valore d'impresa è più basso della capitalizzazione
    assert fondamentale.analizza(azienda_finta(enterpriseValue=45000.0), OGGI)["debitoNettoSuEbitda"] < 0


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


def prova_tecnico_candele():
    giorno = lambda g: int(__import__("datetime").datetime(2026, 11, g, 12, tzinfo=__import__("datetime").timezone.utc).timestamp())
    grafico = {"meta": {"gmtoffset": 3600}, "timestamp": [giorno(10), giorno(11), giorno(12)],
               "indicators": {"quote": [{"open": [10, 11, 12], "high": [11, 12.5, 13], "low": [9.5, 10.8, 11.9],
                                          "close": [11, 12, 12.4], "volume": [100, None, 300]}]}}
    c = tecnico.candele(grafico, ["2026-11-10", "2026-11-11", "2026-11-12"])
    assert c["da"] == 0 and c["apertura"] == [10.0, 11.0, 12.0] and c["massimo"][1] == 12.5 and c["volume"] == [100, 0, 300]
    assert tecnico.candele(grafico, ["2026-11-09", "2026-11-10"]) is None        # manca un giorno: niente candele


def prova_tecnico_storia():
    giorno = lambda g: int(__import__("datetime").datetime(2026, 11, g, 12, tzinfo=__import__("datetime").timezone.utc).timestamp())
    grafico = {"meta": {"gmtoffset": 3600, "currency": "EUR"}, "timestamp": [giorno(10), giorno(11), giorno(12), giorno(13)],
               "indicators": {"quote": [{"open": [10, None, 12, 13], "high": [11, 12.5, 13, 14], "low": [9.5, 10.8, 11.9, 12],
                                          "close": [9.876543, 12, None, 13.456], "volume": [100, None, 300, 5]}]}}
    s = tecnico.storia(grafico)
    assert s["giorni"] == ["2026-11-10", "2026-11-11", "2026-11-13"]          # il 12 non ha chiusura: saltato
    assert s["chiusura"] == [9.8765, 12.0, 13.46] and s["valuta"] == "EUR"     # sotto 10: 4 decimali, sopra: 2
    assert s["apertura"] == [10.0, None, 13.0] and s["massimo"][1] is None     # l'11 manca l'apertura: candela piatta
    assert s["volume"] == [100, 0, 5]
    giorni, valori = tecnico.ultimi_anni(giorni_finti(900), list(range(900)))
    assert giorni[0] == "2024-11-14" and len(giorni) == len(valori) == 730     # ultimi 2 anni di calendario


def prova_tecnico_livelli():
    # Il prezzo rimbalza tre volte su 90 e viene respinto tre volte da 110
    onda = [100, 104, 108, 110, 108, 104, 100, 96, 92, 90, 92, 96] * 3 + [100, 101, 101, 101, 101, 101, 101]
    supporti, resistenze = tecnico.livelli(onda, 101)
    assert supporti[0] == {"prezzo": 90.0, "tocchi": 3}, supporti
    # Il primo picco a 110 è troppo vicino all'inizio per essere contato (servono 5 giorni prima)
    assert resistenze[0] == {"prezzo": 110.0, "tocchi": 2}, resistenze


# ---------- Cacciatore ----------

def prova_cacciatore():
    # L'azienda finta: utili attesi +25%, debito 1×EBITDA, 18 analisti positivi su 24 (75%). Il calo viene dalla tecnica.
    f = fondamentale.analizza(azienda_finta(), OGGI)
    esito = cacciatore.valuta(f, {"dalMassimo": -0.23})
    assert esito["rispettati"] == 4, esito
    assert esito["motivo"].startswith("-23% dal massimo"), esito["motivo"]
    assert "18 analisti su 24 sono positivi (75%)" in esito["motivo"]
    assert 0 < esito["punteggio"] <= 100

    # Poco calo: il primo criterio non è rispettato
    poco_calo = cacciatore.valuta(f, {"dalMassimo": -0.02})
    assert poco_calo["rispettati"] == 3 and poco_calo["criteri"][0]["ok"] is False

    # Troppo debito: debito netto 30 miliardi su 5 di EBITDA
    debito = cacciatore.valuta(fondamentale.analizza(azienda_finta(enterpriseValue=80000.0, evEbitdaTTM=16.0), OGGI), None)
    assert debito["criteri"][2]["ok"] is False and "debito alto" in debito["criteri"][2]["testo"]

    # Analisti divisi: solo 10 positivi su 24 → il quarto criterio non è rispettato
    freddi = azienda_finta(recommendation=[{"period": "2026-11-01", "strongBuy": 2, "buy": 8, "hold": 12, "sell": 2, "strongSell": 0}])
    assert cacciatore.valuta(fondamentale.analizza(freddi, OGGI), None)["criteri"][3]["ok"] is False

    # Pochi analisti: il giudizio non conta
    pochi = azienda_finta(recommendation=[{"period": "2026-11-01", "strongBuy": 2, "buy": 1, "hold": 0, "sell": 0, "strongSell": 0}])
    assert cacciatore.valuta(fondamentale.analizza(pochi, OGGI), None)["criteri"][3]["ok"] is False

    # Se un giorno la fonte desse il target price, il quarto criterio userebbe quello
    con_target = dict(f, potenziale=0.25)
    assert "target medio di 24 analisti a +25%" in cacciatore.valuta(con_target, None)["criteri"][3]["testo"]

    # Senza fondamentali resta il solo criterio del calo, preso dall'analisi tecnica
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
    americane = [t["usa"] for t in watchlist if t.get("usa")]
    assert len(americane) == len(set(americane)), "due titoli con la stessa sigla americana"
    assert len(americane) >= len(watchlist) - 5, "troppi titoli senza sigla americana: resterebbero senza fondamentali"


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
    grezzi = azienda_finta(
        epsGrowthQuarterlyYoy=-30.0, forwardPE=25.0,                   # utili in calo, e attesi in calo
        enterpriseValue=80000.0, evEbitdaTTM=16.0,                     # debito netto 6 volte l'EBITDA
        recommendation=[{"period": "2026-11-01", "strongBuy": 0, "buy": 4, "hold": 10, "sell": 8, "strongSell": 2},
                        {"period": "2026-10-01", "strongBuy": 2, "buy": 8, "hold": 10, "sell": 4, "strongSell": 0}],
        earnings=[{"period": "2026-09-30", "actual": 1.0, "estimate": 1.3}, {"period": "2026-06-30", "actual": 1.3, "estimate": 1.2}])
    scheda = {"tipo": "Azione", "fondamentali": fondamentale.analizza(grezzi, OGGI),
              "tecnica": {"sopraMm200": False, "incrocio": "ribasso"}}
    notizie = [{"titolo": "Azienda Finta: indagine dell'antitrust"}, {"titolo": "Azienda Finta taglia le stime per il 2027"},
               {"titolo": "A causa del maltempo slitta la presentazione"}]
    trovati = avvocato.controlla(scheda, notizie, OGGI)
    for atteso in ["Utili attesi in calo", "Utili in calo", "Trimestrale sotto le attese", "Debito alto",
                   "Analisti più freddi", "Pochi analisti positivi", "Analisti freddi",
                   "Sotto la media a 200 giorni", "Trimestrale in arrivo", "Notizie da leggere"]:
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


# ---------- La pagina Mercato: la mappa ----------

def prova_mercato_elenchi():
    # S&P 500: il punto della sigla diventa trattino per Yahoo, ma resta per Finnhub; il settore si traduce
    testo = ("Symbol,Security,GICS Sector,GICS Sub-Industry\n"
             "AAPL,Apple Inc.,Information Technology,Tech Hardware\n"
             "BRK.B,Berkshire Hathaway,Financials,Multi-Sector Holdings\n"
             ",riga vuota,,\n")
    elenco = mercato.leggi_sp500(testo)
    assert [v["ticker"] for v in elenco] == ["AAPL", "BRK-B"]
    assert elenco[1]["usa"] == "BRK.B" and elenco[0]["settore"] == "Tecnologia" and elenco[1]["settore"] == "Finanza"

    # Euro Stoxx 50: la tabella di Wikipedia, con celle su righe diverse e comandi da pulire
    wiki = ('intro\n{| class="wikitable" id="constituents"\n! Ticker !! Main listing !! Name !! Form !! Office !! Sector\n'
            '|-\n| ADS.DE || [[Xetra]] || [[Adidas]] || AG || {{Flagicon|Germany}} Herzogenaurach || Consumer Discretionary\n'
            '|-\n| SU.PA\n| Euronext\n| [[Schneider Electric|Schneider]]\n| SE\n| Rueil\n| Industrials\n'
            '|-\n| sbagliata || x || y || z || w || Energy\n|}\naltro testo')
    elenco = mercato.leggi_eurostoxx50(wiki, {"SU.PA": "SBGSY-PROVA"})
    assert [v["ticker"] for v in elenco] == ["ADS.DE", "SU.PA"]
    assert elenco[0]["nome"] == "Adidas" and elenco[0]["usa"] == "ADDYY" and elenco[0]["settore"] == "Beni voluttuari"
    assert elenco[1]["nome"] == "Schneider" and elenco[1]["usa"] == "SBGSY-PROVA" and elenco[1]["settore"] == "Industria"
    assert mercato.leggi_eurostoxx50("pagina senza tabella") == []

    # I settori di Finnhub finiscono negli stessi 11 grandi settori; quelli sconosciuti in "Altro"
    assert mercato.settore_italiano("Semiconductors") == "Tecnologia"
    assert mercato.settore_italiano("Banking") == "Finanza"
    assert mercato.settore_italiano("Qualcosa di nuovo") == mercato.ALTRO


def prova_mercato_variazioni():
    # 300 sedute: dal 2 gennaio 2025, un giorno di Borsa dopo l'altro, prezzo che sale di 1 al giorno
    from datetime import datetime, timedelta, timezone
    inizio = datetime(2025, 1, 2, 21, tzinfo=timezone.utc)
    giorni, tempi = [], []
    giorno = inizio
    while len(tempi) < 300:
        if giorno.weekday() < 5:
            tempi.append(int(giorno.timestamp()))
            giorni.append(giorno.date())
        giorno += timedelta(days=1)
    chiusure = [100.0 + i for i in range(300)]
    chiusure[150] = None                       # un buco nei dati di Yahoo non deve rompere i conti
    v = mercato.variazioni(tempi, chiusure)
    assert v["giorno"] == giorni[-1].isoformat() and v["prezzo"] == 399
    assert uguale(v["oggi"], round(399 / 398 - 1, 5)) and uguale(v["settimana"], round(399 / 394 - 1, 5))
    assert uguale(v["mese"], round(399 / 378 - 1, 5)) and len(v["linea"]) == mercato.PUNTI_LINEA
    # Da inizio anno: rispetto all'ultima chiusura dell'anno prima
    ultima_2025 = max(i for i, g in enumerate(giorni) if g.year == 2025)
    assert uguale(v["anno"], round(399 / chiusure[ultima_2025] - 1, 5))
    # Pochi dati: niente variazioni lunghe, ma niente errori
    corto = mercato.variazioni(tempi[-3:], [10, 11, 12])
    assert corto["settimana"] is None and corto["anno"] is None and uguale(corto["oggi"], round(12 / 11 - 1, 5))
    assert mercato.variazioni([], []) is None


def prova_mercato_riquadri():
    # Il profilo di Finnhub: la capitalizzazione arriva in milioni, la teniamo in miliardi
    profilo = mercato.profilo_breve({"marketCapitalization": 2_500_000, "logo": "https://logo/x.png",
                                     "finnhubIndustry": "Technology"}, OGGI)
    assert profilo == {"cap": 2500.0, "logo": "https://logo/x.png", "industria": "Technology", "giorno": OGGI}
    scheda = mercato.scheda_mappa({"ticker": "AAPL", "nome": "Apple", "settore": "Tecnologia", "usa": "AAPL"},
                                  {"prezzo": 10, "oggi": 0.01}, profilo)
    assert scheda["cap"] == 2500.0 and scheda["logo"] and scheda["oggi"] == 0.01 and "industria" not in scheda
    # Senza profilo e senza prezzo il riquadro c'è lo stesso (grandezza media, cerchio con l'iniziale)
    vuota = mercato.scheda_mappa({"ticker": "X", "nome": "X", "settore": ""}, None, None)
    assert vuota == {"nome": "X", "settore": mercato.ALTRO}

    # Yahoo risponde ai gruppi di 20 titoli in due forme diverse: le leggiamo tutte e due
    nuova = {"AAPL": {"timestamp": [1, 2], "close": [10, 11]}, "nota": "non è un titolo"}
    vecchia = {"spark": {"result": [{"symbol": "SAP.DE", "response": [
        {"timestamp": [1, 2], "indicators": {"quote": [{"close": [5, 6]}]}}]}]}}
    assert leggi_gruppo(nuova) == {"AAPL": {"tempi": [1, 2], "chiusure": [10, 11]}}
    assert leggi_gruppo(vecchia) == {"SAP.DE": {"tempi": [1, 2], "chiusure": [5, 6]}}


# ---------- La pagina Mercato: paura e avidità, numeri dell'economia ----------

def prova_mercato_paura():
    # Mercato calmo e in salita: indice 10% sopra la sua media, VIX più basso del solito, tutti i titoli ai massimi
    salita = [100 + i * 0.1 for i in range(250)]
    vix = [20.0] * 249 + [14.0]
    titoli = [[50 + i * 0.2 for i in range(250)] for _ in range(60)]
    p = mercato.paura_azioni(salita, vix, titoli)
    assert len(p["pezzi"]) == 4 and p["valore"] >= 76 and p["umore"] == "Avidità estrema"
    assert {x["chiave"]: x["valore"] for x in p["pezzi"]}["massimi"] == 100

    # Mercato in caduta: indice sotto la media, VIX che schizza, titoli ai minimi
    discesa = [125 - i * 0.1 for i in range(250)]
    titoli_giu = [[90 - i * 0.2 for i in range(250)] for _ in range(60)]
    p = mercato.paura_azioni(discesa, [15.0] * 249 + [30.0], titoli_giu)
    assert p["valore"] < 25 and p["umore"] == "Paura estrema"

    # Una settimana fa: si tolgono le ultime 5 sedute (qui il VIX era ancora normale)
    prima = mercato.paura_azioni(discesa, [15.0] * 245 + [30.0] * 5, titoli_giu, indietro=5)
    assert prima["valore"] > p["valore"]

    # Senza i titoli (meno di 50) restano due pezzi su quattro: troppo pochi, nessun numero
    assert mercato.paura_azioni(salita, vix, []) is None
    assert mercato.umore(50) == "Neutrale" and mercato.umore(None) is None

    # Le criptovalute: dal più recente al più vecchio, con la parola tradotta
    giorni = [{"value": str(20 + i), "value_classification": "Fear", "timestamp": str(1_790_000_000 - i * 86400)}
              for i in range(31)]
    c = mercato.paura_cripto({"data": giorni})
    assert c["valore"] == 20 and c["umore"] == "Paura" and c["ieri"] == 21 and c["settimana"] == 27 and c["mese"] == 50
    assert mercato.paura_cripto({"data": []}) is None


def prova_mercato_macro():
    bce = mercato.leggi_bce("KEY,TIME_PERIOD,OBS_VALUE\nFM.DFR,2026-06-17,2.25\nFM.DFR,2026-09-16,2.5\n")
    assert bce == {"valore": 2.5, "data": "2026-09-16", "prima": 2.25}
    assert mercato.leggi_bce("KEY,TIME_PERIOD,OBS_VALUE\n") is None

    fed = mercato.leggi_fed({"refRates": [{"effectiveDate": "2026-11-24", "percentRate": 3.88,
                                           "targetRateFrom": 3.75, "targetRateTo": 4.0}]})
    assert fed == {"da": 3.75, "a": 4.0, "effettivo": 3.88, "data": "2026-11-24"}
    assert mercato.leggi_fed({}) is None

    euro = mercato.leggi_eurostat({"value": {"0": 3.8, "1": 4.0},
                                   "dimension": {"time": {"category": {"index": {"2026-09": 0, "2026-10": 1}}}}})
    assert euro == {"valore": 4.0, "mese": "2026-10", "prima": 3.8}

    # USA: l'inflazione è la crescita dell'indice rispetto allo stesso mese dell'anno prima.
    # Ottobre 2025 manca (succede): ottobre 2026 non si può calcolare, si usa settembre.
    dati = [{"year": "2026", "period": "M10", "value": "340"}, {"year": "2026", "period": "M09", "value": "330"},
            {"year": "2026", "period": "M08", "value": "320"}, {"year": "2025", "period": "M09", "value": "300"},
            {"year": "2025", "period": "M08", "value": "300"}, {"year": "2025", "period": "M13", "value": "999"}]
    usa = mercato.leggi_bls({"Results": {"series": [{"data": dati}]}})
    assert usa == {"valore": 10.0, "mese": "2026-09", "prima": 6.7}
    assert mercato.leggi_bls({"status": "errore"}) is None


# ---------- La pagina Mercato: le nuove quotazioni ----------

def calendario_finto():
    """Un calendario delle quotazioni inventato, nella forma di Finnhub (/calendar/ipo)."""
    voce = lambda nome, sigla, data, valore, stato="expected": {
        "name": nome, "symbol": sigla, "date": data, "exchange": "NASDAQ Global", "price": "15.00-17.00",
        "numberOfShares": 1e7, "totalSharesValue": valore, "status": stato}
    return [
        voce("Gigante Pagamenti Inc", "GIGA", "2026-11-20", 2.5e9, "priced"),   # grande per la raccolta
        voce("Famosa Bevande Corp", "FAMO", "2026-11-28", 3e8),                 # grande per le notizie
        voce("Acme AI Labs Inc", "ACME", "2026-12-02", 1.2e8),                  # piccola, intelligenza artificiale (dal nome)
        voce("Scudo Systems Inc", "SCUD", "2026-12-03", 9e7),                   # piccola, difesa (dal settore di Finnhub)
        voce("Panetteria Rossi Inc", "PANE", "2026-12-04", 5e7),                # piccola, settore che non seguiamo
        voce("Futuro Acquisition Corp", "FUTU", "2026-12-04", 2e9),             # SPAC: saltata anche se grande
        voce("Ritirata Energy Inc", "RITI", "2026-12-05", 5e8, "withdrawn"),    # ritirata
        voce("Troppo Lontana Tech", "LONT", "2027-02-01", 5e9),                 # fuori dal periodo
    ]


def prova_mercato_quotazioni():
    assert mercato.settore_seguito("Thai Food Co") is None and mercato.settore_seguito("Acme AI Labs") == "Intelligenza artificiale"
    assert mercato.settore_seguito("Qualcosa", "Aerospace & Defense") == "Difesa"
    assert mercato.e_spac("Futuro Acquisition Corp") and not mercato.e_spac("Acme AI Labs")

    dettagli = {"FAMO": {"notizie": 25}, "SCUD": {"industria": "Aerospace & Defense", "descrizione": "Fa scudi"}}
    scelte = mercato.scegli_quotazioni(calendario_finto(), dettagli, OGGI)
    assert [q["sigla"] for q in scelte] == ["GIGA", "FAMO", "ACME", "SCUD"]
    assert [q["tipo"] for q in scelte] == ["grande", "grande", "piccola", "piccola"]
    assert scelte[0]["motivo"] == "raccoglie 2,5 miliardi di dollari" and scelte[1]["motivo"].startswith("molto seguita")
    assert scelte[3]["settore"] == "Difesa" and scelte[3]["descrizione"] == "Fa scudi"

    # Wikipedia: la descrizione vale solo se la pagina trovata è proprio quella dell'azienda
    giusta = {"query": {"pages": [{"title": "Figma", "description": "editor grafico collaborativo online", "extract": "..."}]}}
    sbagliata = {"query": {"pages": [{"title": "NVIDIA", "description": "azienda di processori"}]}}
    assert mercato.descrizione_wiki(giusta, "Figma Inc") == "Editor grafico collaborativo online"
    assert mercato.descrizione_wiki(sbagliata, "CoreWeave Inc") is None
    assert mercato.descrizione_wiki({}, "Figma Inc") is None
    corta = {"query": {"pages": [{"title": "Figma", "description": "app", "extract": "figma è un'applicazione web per il design."}]}}
    assert mercato.descrizione_wiki(corta, "Figma") == "Figma è un'applicazione web per il design."


class FinnhubFinto:
    """Un Finnhub inventato per le quotazioni: conta le richieste, senza internet."""
    def __init__(self):
        self.richieste = []

    def quotazioni(self, da, a):
        self.richieste.append(("calendario", da, a))
        return calendario_finto()

    def profilo(self, sigla):
        self.richieste.append(("profilo", sigla))
        if sigla == "SCUD":
            return {"finnhubIndustry": "Aerospace & Defense"}
        raise TitoloNonCoperto(sigla)

    def notizie(self, sigla, da, a):
        self.richieste.append(("notizie", sigla))
        return [{}] * (30 if sigla == "FAMO" else 1)


def prova_mercato_quotazioni_giro():
    import aggiorna_mercato
    cercate = []
    vera = aggiorna_mercato.cerca_descrizione
    aggiorna_mercato.cerca_descrizione = lambda nome: (cercate.append(nome) or ("Riga di prova", "Wikipedia"))
    try:
        finto, archivio, errori = FinnhubFinto(), {}, []
        scelte = aggiorna_mercato.aggiorna_quotazioni(finto, archivio, OGGI, errori)
        assert [q["sigla"] for q in scelte] == ["GIGA", "FAMO", "ACME", "SCUD"] and errori == []
        assert all(q["descrizione"] == "Riga di prova" for q in scelte) and len(cercate) == 4
        # Settore e notizie solo per le candidate: niente SPAC né ritirate (5 su 8 nel periodo, più quella lontana)
        sigle_chieste = {r[1] for r in finto.richieste if r[0] == "profilo"}
        assert "FUTU" not in sigle_chieste and "RITI" not in sigle_chieste and "PANE" in sigle_chieste

        # Il giro dopo, lo stesso giorno: niente richieste nuove di settore, notizie e descrizioni
        prima = len(finto.richieste)
        aggiorna_mercato.aggiorna_quotazioni(finto, archivio, OGGI, errori)
        assert len(finto.richieste) == prima + 1 and len(cercate) == 4   # solo il calendario
    finally:
        aggiorna_mercato.cerca_descrizione = vera


PROVE = [prova_fondamentale, prova_fondamentale_dati_mancanti,
         prova_tecnico_medie_e_rsi, prova_tecnico_scheda, prova_tecnico_candele, prova_tecnico_storia, prova_tecnico_livelli,
         prova_cacciatore, prova_classifica, prova_watchlist,
         prova_avvocato_azienda_sana, prova_avvocato_campanelli, prova_avvocato_target_e_etf,
         prova_ai_spenta_senza_chiave, prova_ai_freni,
         prova_mercato_elenchi, prova_mercato_variazioni, prova_mercato_riquadri,
         prova_mercato_paura, prova_mercato_macro, prova_mercato_quotazioni, prova_mercato_quotazioni_giro]


# ---------- Prova dal vivo (con internet) ----------

def prova_dal_vivo():
    """Chiede i dati veri di pochi titoli alle due fonti e scrive una tabella.
    Restituisce True se le fonti funzionano."""
    from agenti.finnhub import Finnhub
    from agenti.yahoo import Yahoo
    yahoo = Yahoo()
    chiave = (os.environ.get("FINNHUB_API_KEY") or "").strip()
    finnhub = Finnhub(chiave) if chiave else None
    oggi = __import__("datetime").datetime.now().strftime("%Y-%m-%d")
    righe = ["## Prova dal vivo delle fonti", "",
             "Prezzi storici: Yahoo Finance. Fondamentali: Finnhub (con la sigla americana dell'azienda).", "",
             "| Azienda | Prezzi (Yahoo) | RSI | Dal massimo | Fondamentali (Finnhub) | P/E | Margine netto | Crescita utili | Debito÷capitale | Analisti positivi | Trimestrale | Segnali |",
             "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    # (sigla di Yahoo per i prezzi, sigla americana per i fondamentali)
    campione = [("SAP.DE", "SAP"), ("AIR.PA", "EADSY"), ("AAPL", "AAPL"), ("JPM", "JPM"),
                ("7203.T", "TM"), ("005930.KS", "SSNLF"), ("AZN.L", "AZN"), ("NOVO-B.CO", "NVO")]
    americane = {"AAPL", "JPM"}
    prezzi_ok = conti_ok = 0
    for ticker, usa in campione:
        f, t = {}, None
        try:
            grafico = yahoo.grafico(ticker, "2y")
            t, _ = tecnico.analizza(*tecnico.chiusure(grafico), grafico["meta"].get("currency") or "")
            stato_t = "ok" if t else "pochi dati"
        except Exception as errore:
            stato_t = f"ERRORE {type(errore).__name__}: {errore}"
        try:
            if not finnhub:
                raise RuntimeError("manca il segreto FINNHUB_API_KEY")
            f = fondamentale.analizza(finnhub.grezzi(usa, oggi), oggi, quotazione_estera=usa not in americane)
            stato_f = "ok" if fondamentale.ha_dati(f) else "vuoti"
        except Exception as errore:
            stato_f = f"ERRORE {type(errore).__name__}: {errore}"
        prezzi_ok += stato_t == "ok"
        conti_ok += stato_f == "ok"
        segnali = f"{cacciatore.valuta(f, t)['rispettati']} su 4" if stato_f == "ok" else "–"
        righe.append(f"| {ticker} / {usa} | {stato_t} | {t['rsi'] if t else '–'} | {t['dalMassimo'] if t else '–'} | {stato_f} "
                     f"| {f.get('pe')} | {f.get('margineNetto')} | {f.get('crescitaUtili')} | {f.get('debitoSuCapitale')} "
                     f"| {f.get('analistiPositivi')} su {f.get('analisti')} | {f.get('prossimaTrimestrale')} | {segnali} |")
    # Il grafico della pagina usa 5 anni di candele giornaliere: Yahoo le dà?
    try:
        storia = tecnico.storia(yahoo.grafico("SAP.DE", "5y"))
        candele = sum(1 for v in storia["apertura"] if v is not None)
        stato_storia = f"{len(storia['giorni'])} giorni dal {storia['giorni'][0]}, {candele} con la candela"
        storia_ok = len(storia["giorni"]) > 1000
    except Exception as errore:
        stato_storia, storia_ok = f"ERRORE {type(errore).__name__}: {errore}", False
    righe += ["", f"Prezzi storici (analisi tecnica): {prezzi_ok} titoli su {len(campione)}.",
              f"Fondamentali e analisti: {conti_ok} titoli su {len(campione)}.",
              f"Grafico a 5 anni (SAP.DE): {stato_storia}."]
    testo = "\n".join(righe)
    print(testo)
    riepilogo = os.environ.get("GITHUB_STEP_SUMMARY")
    if riepilogo:
        with open(riepilogo, "a", encoding="utf-8") as file:
            file.write(testo + "\n")
    # Tolleriamo un titolo mancante per fonte: un singolo intoppo non deve far scattare l'allarme
    return prezzi_ok >= len(campione) - 1 and conti_ok >= len(campione) - 1 and storia_ok


def main():
    for prova in PROVE:
        prova()
        print(f"OK  {prova.__name__}")
    print(f"Tutte le {len(PROVE)} prove sono riuscite.")
    if "--dal-vivo" in sys.argv and not prova_dal_vivo():
        raise SystemExit("La prova dal vivo NON è riuscita: la fonte dei dati non risponde come previsto.")


if __name__ == "__main__":
    main()
