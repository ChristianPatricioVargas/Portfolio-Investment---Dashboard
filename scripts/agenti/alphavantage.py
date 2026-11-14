"""
alphavantage.py = un secondo "fattorino", per ora solo IN PROVA.

Yahoo Finance rifiuta le richieste dei fondamentali che arrivano da GitHub.
Alpha Vantage è un servizio ufficiale con chiave gratuita (circa 25 richieste al giorno).
Prima di collegarlo agli agenti dobbiamo sapere se copre i titoli che ci servono:
questo file fa solo quella verifica.

La chiave NON sta nel codice: arriva dal segreto ALPHAVANTAGE_API_KEY di GitHub.
Attenzione: la chiave viaggia dentro l'indirizzo, quindi l'indirizzo non va mai stampato.
"""

import json
import time
import urllib.parse
import urllib.request

INDIRIZZO = "https://www.alphavantage.co/query?"
PAUSA = 13     # secondi tra una richiesta e l'altra: il piano gratuito ne permette poche al minuto

# I campi della "panoramica" che servirebbero all'analista fondamentale
CAMPI_UTILI = ["Currency", "PERatio", "ForwardPE", "ProfitMargin", "OperatingMarginTTM",
               "QuarterlyRevenueGrowthYOY", "QuarterlyEarningsGrowthYOY", "AnalystTargetPrice",
               "AnalystRatingStrongBuy", "AnalystRatingBuy", "AnalystRatingHold", "52WeekHigh", "LatestQuarter"]


def chiedi(chiave, **parametri):
    """Una richiesta ad Alpha Vantage. Restituisce il testo della risposta."""
    parametri["apikey"] = chiave
    with urllib.request.urlopen(INDIRIZZO + urllib.parse.urlencode(parametri), timeout=30) as risposta:
        return risposta.read().decode("utf-8", "replace")


def prova_copertura(chiave):
    """Chiede la panoramica di pochi titoli (americani, europei, asiatici, e le loro versioni
    quotate a New York) e scrive una tabella: quali campi arrivano davvero?"""
    campione = [
        ("AAPL", "Apple (USA)"),
        ("SAP", "SAP quotata a New York"),
        ("SAP.DEX", "SAP su Xetra"),
        ("AIR.PAR", "Airbus a Parigi"),
        ("EADSY", "Airbus quotata negli USA"),
        ("TM", "Toyota quotata a New York"),
        ("AZN.LON", "AstraZeneca a Londra"),
    ]
    righe = ["## Prova di Alpha Vantage (fonte alternativa per i fondamentali)", "",
             "| Sigla | Cosa | Esito | Valuta | P/E | Margine | Crescita utili | Target | Analisti (buy/hold) | Massimo 52 sett. |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for i, (sigla, nome) in enumerate(campione):
        if i:
            time.sleep(PAUSA)
        try:
            dati = json.loads(chiedi(chiave, function="OVERVIEW", symbol=sigla))
        except Exception as errore:
            righe.append(f"| {sigla} | {nome} | ERRORE {type(errore).__name__} | | | | | | | |")
            continue
        if "Symbol" not in dati:
            # Risposta vuota = titolo non coperto; "Information"/"Note" = limite di richieste raggiunto
            motivo = (dati.get("Information") or dati.get("Note") or dati.get("Error Message") or "nessun dato")[:90]
            righe.append(f"| {sigla} | {nome} | ✗ {motivo.replace(chiave, '***')} | | | | | | | |")
            continue
        v = lambda campo: dati.get(campo, "–")
        presenti = sum(1 for campo in CAMPI_UTILI if dati.get(campo) not in (None, "", "None", "-"))
        righe.append(f"| {sigla} | {nome} | ✓ {presenti} campi su {len(CAMPI_UTILI)} | {v('Currency')} | {v('PERatio')} | {v('ProfitMargin')} "
                     f"| {v('QuarterlyEarningsGrowthYOY')} | {v('AnalystTargetPrice')} "
                     f"| {v('AnalystRatingBuy')}/{v('AnalystRatingHold')} | {v('52WeekHigh')} |")

    # Il calendario delle trimestrali: una sola richiesta per tutti i titoli (risponde con una tabella CSV)
    time.sleep(PAUSA)
    try:
        calendario = chiedi(chiave, function="EARNINGS_CALENDAR", horizon="3month")
        prime = calendario.strip().splitlines()
        esito = f"{len(prime) - 1} trimestrali in calendario; colonne: `{prime[0][:80]}`" if len(prime) > 1 and "," in prime[0] \
            else "risposta inattesa: `" + calendario[:100].replace(chiave, "***").replace("\n", " ") + "`"
    except Exception as errore:
        esito = f"ERRORE {type(errore).__name__}"
    righe += ["", f"Calendario delle trimestrali: {esito}"]
    return righe
