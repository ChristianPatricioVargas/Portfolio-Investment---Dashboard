"""
aggiorna_prezzi.py = il programma che scarica i prezzi da Yahoo Finance.

Non lo esegui tu: lo fa GitHub da solo, ogni 30 minuti nei giorni di Borsa
(le istruzioni sono in .github/workflows/aggiorna-prezzi.yml).

Cosa fa, passo per passo:
  1. legge l'elenco dei titoli da data/titoli.json
  2. per ogni titolo chiede a Yahoo Finance il prezzo attuale
     e il prezzo di chiusura di ieri
  3. salva tutto in data/prezzi.json, che la pagina web poi legge

Non serve nessuna chiave segreta: Yahoo Finance risponde senza.
"""

import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

CARTELLA_DATI = Path(__file__).resolve().parent.parent / "data"
FILE_TITOLI = CARTELLA_DATI / "titoli.json"
FILE_PREZZI = CARTELLA_DATI / "prezzi.json"

INDIRIZZO_YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=1d&interval=1d"


def chiedi_a_yahoo(ticker):
    """Scarica i dati grezzi di un titolo da Yahoo Finance."""
    richiesta = urllib.request.Request(
        INDIRIZZO_YAHOO.format(ticker=ticker),
        headers={"User-Agent": "Mozilla/5.0"},   # Yahoo vuole sapere "chi" chiede
    )
    with urllib.request.urlopen(richiesta, timeout=20) as risposta:
        return json.load(risposta)


def estrai_prezzi(dati):
    """Dalla risposta di Yahoo tiene solo prezzo attuale e chiusura di ieri."""
    info = dati["chart"]["result"][0]["meta"]
    if info.get("currency") != "EUR":
        raise ValueError("prezzo non in euro: " + str(info.get("currency")))
    return {
        "prezzo": round(float(info["regularMarketPrice"]), 4),
        "chiusuraIeri": round(float(info.get("previousClose") or info["chartPreviousClose"]), 4),
    }


def main():
    titoli = json.loads(FILE_TITOLI.read_text(encoding="utf-8"))

    # Partiamo dai prezzi vecchi: se un titolo non risponde, teniamo l'ultimo prezzo noto
    try:
        vecchi = json.loads(FILE_PREZZI.read_text(encoding="utf-8")).get("prezzi", {})
    except (FileNotFoundError, json.JSONDecodeError):
        vecchi = {}
    prezzi = dict(vecchi)

    riusciti = 0
    for titolo in titoli:
        ticker = titolo["ticker"]
        try:
            prezzi[ticker] = estrai_prezzi(chiedi_a_yahoo(ticker))
            riusciti += 1
            print(f"OK   {ticker}: {prezzi[ticker]['prezzo']} €")
        except Exception as errore:   # qualsiasi problema: lo scriviamo e andiamo avanti
            print(f"ERRORE {ticker}: {errore}")

    if riusciti == 0:
        raise SystemExit("Nessun prezzo scaricato: lascio il file com'era.")

    risultato = {
        "fonte": "Yahoo Finance (Xetra)",
        "aggiornato": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "prezzi": prezzi,
    }
    FILE_PREZZI.write_text(json.dumps(risultato, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Salvati {riusciti} prezzi su {len(titoli)}.")


if __name__ == "__main__":
    main()
