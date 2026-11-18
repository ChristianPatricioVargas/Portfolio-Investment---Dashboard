"""
trova_sigla.py = un programma di PROVA: non cambia nessun file.

Serve a scoprire quale sigla riconosce Yahoo Finance per un titolo (per esempio
quando un'azienda dà "errore 404", cioè "sigla sconosciuta").
Per ogni sigla della lista chiede a Yahoo l'ultimo mese di prezzi e scrive una tabella:
nome del titolo, borsa, valuta, ultimo prezzo e quanti giorni di prezzi ci sono.

Si lancia da GitHub, perché è da lì che Yahoo risponde:
  Actions → "Prova agenti" → Run workflow → scrivi le sigle nel campo
  "Sigle di Yahoo da provare", separate da spazi (es. "ROG.SW RO.SW").
La tabella compare nella pagina dell'esecuzione, sotto "Summary".

Si può lanciare anche dal computer:
    python3 scripts/trova_sigla.py ROG.SW RO.SW
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# La stessa richiesta semplice che usano da sempre aggiorna_prezzi.py e il fattorino yahoo.py
INDIRIZZO = "https://query1.finance.yahoo.com/v8/finance/chart/{}?range=1mo&interval=1d"


def prova_sigla(sigla):
    """Chiede a Yahoo una sigla e restituisce una riga di tabella (lista di testi)."""
    richiesta = urllib.request.Request(INDIRIZZO.format(urllib.parse.quote(sigla)),
                                       headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(richiesta, timeout=20) as risposta:
            dati = json.load(risposta)["chart"]["result"][0]
    except urllib.error.HTTPError as errore:
        # 404 = Yahoo non conosce la sigla; 429 = troppe richieste
        return [sigla, f"NO (errore {errore.code})", "–", "–", "–", "–", "–"]
    except Exception as errore:
        return [sigla, f"NO ({type(errore).__name__})", "–", "–", "–", "–", "–"]
    meta = dati.get("meta", {})
    # Contiamo solo i giorni con un prezzo vero (Yahoo a volte mette dei "vuoti")
    chiusure = (dati.get("indicators", {}).get("quote") or [{}])[0].get("close") or []
    giorni = sum(1 for c in chiusure if c is not None)
    nome = meta.get("longName") or meta.get("shortName") or "–"
    return [sigla, "SÌ", nome, meta.get("fullExchangeName") or meta.get("exchangeName") or "–",
            meta.get("currency") or "–", str(meta.get("regularMarketPrice") or "–"), str(giorni)]


def main():
    # Le sigle arrivano dalla riga di comando o, da GitHub, dalla variabile SIGLE
    sigle = sys.argv[1:] or (os.environ.get("SIGLE") or "").split()
    if not sigle:
        raise SystemExit("Scrivi almeno una sigla, es.: python3 scripts/trova_sigla.py ROG.SW RO.SW")
    righe = ["## Quali sigle riconosce Yahoo Finance", "",
             "| Sigla | Riconosciuta | Nome | Borsa | Valuta | Ultimo prezzo | Giorni con prezzo (ultimo mese) |",
             "|---|---|---|---|---|---|---|"]
    for sigla in sigle:
        righe.append("| " + " | ".join(prova_sigla(sigla)) + " |")
        time.sleep(0.5)   # una piccola pausa tra una richiesta e l'altra, per educazione
    righe += ["", "Una sigla va bene se è riconosciuta, è sulla Borsa principale e ha circa 20 giorni di prezzi."]
    testo = "\n".join(righe)
    print(testo)
    riepilogo = os.environ.get("GITHUB_STEP_SUMMARY")
    if riepilogo:
        with open(riepilogo, "a", encoding="utf-8") as file:
            file.write(testo + "\n")


if __name__ == "__main__":
    main()
