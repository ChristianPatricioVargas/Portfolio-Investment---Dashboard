"""
confronta_borse.py = un programma di PROVA: non cambia nessun file.

Per ogni titolo della lista chiede a Yahoo Finance il prezzo su più borse tedesche
e scrive una tabella di confronto. Serve a scegliere la fonte dei prezzi più vicina
a Trade Republic (che usa LS Exchange, aperta fino alle 23:00).

Borse confrontate (il suffisso è quello che usa Yahoo):
  .DE = Xetra        (9:00-17:30)  ← quella che usiamo adesso
  .F  = Francoforte  (8:00-22:00)
  .SG = Stoccarda    (8:00-22:00)
  .MU = Monaco/gettex (8:00-22:00 circa)

Si lancia da GitHub: Actions → "Confronta borse" → Run workflow.
La tabella compare nella pagina dell'esecuzione, sotto "Summary".
"""

import json
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

FILE_TITOLI = Path(__file__).resolve().parent.parent / "data" / "titoli.json"
INDIRIZZO = "https://query1.finance.yahoo.com/v8/finance/chart/{simbolo}?range=1d&interval=5m"
BORSE = [("DE", "Xetra"), ("F", "Francoforte"), ("SG", "Stoccarda"), ("MU", "Monaco/gettex")]
ROMA = ZoneInfo("Europe/Rome")
GIORNI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"]


def all_italiana(testo):
    """Virgola al posto del punto nei numeri: "100.50" → "100,50" """
    return testo.replace(".", ",")


def chiedi(simbolo):
    richiesta = urllib.request.Request(INDIRIZZO.format(simbolo=simbolo), headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(richiesta, timeout=20) as risposta:
        return json.load(risposta)["chart"]["result"][0]


def descrivi(simbolo):
    """Restituisce una riga di tabella con i dati di quel simbolo, o il motivo per cui manca."""
    try:
        r = chiedi(simbolo)
    except Exception as errore:
        return ["–", "–", "–", "–", f"non disponibile ({type(errore).__name__})"]
    meta = r["meta"]
    if meta.get("currency") != "EUR":
        return ["–", "–", "–", "–", f"valuta {meta.get('currency')}"]
    prezzo = meta.get("regularMarketPrice")
    ieri = meta.get("previousClose") or meta.get("chartPreviousClose")
    ultimo = meta.get("regularMarketTime")
    if ultimo:
        quando = datetime.fromtimestamp(ultimo, timezone.utc).astimezone(ROMA)
        ora = f"{GIORNI[quando.weekday()]} {quando:%d/%m %H:%M}"
    else:
        ora = "–"
    # Quante "candele" da 5 minuti hanno avuto scambi: indica quanto è vivace quella borsa
    volumi = (r.get("indicators", {}).get("quote") or [{}])[0].get("volume") or []
    attive = sum(1 for v in volumi if v)
    variazione = all_italiana(f"{(prezzo / ieri - 1) * 100:+.2f}%") if prezzo and ieri else "–"
    return [all_italiana(f"{prezzo:.3f} €") if prezzo else "–", variazione, ora, str(attive), "ok"]


def main():
    titoli = json.loads(FILE_TITOLI.read_text(encoding="utf-8"))
    righe = ["## Confronto prezzi tra borse", "",
             f"Controllato il {datetime.now(ROMA).strftime('%d/%m/%Y alle %H:%M')} (ora italiana).", "",
             "| Titolo | Borsa | Prezzo | Oggi | Ultimo scambio | Intervalli di 5 min con scambi | Stato |",
             "|---|---|---|---|---|---|---|"]
    for titolo in titoli:
        base = titolo["ticker"].split(".")[0]
        for suffisso, nome in BORSE:
            dati = descrivi(f"{base}.{suffisso}")
            righe.append(f"| {titolo['nome']} | {nome} (`{base}.{suffisso}`) | " + " | ".join(dati) + " |")
    testo = "\n".join(righe)
    print(testo)
    # In GitHub Actions la tabella compare anche, bella ordinata, nella pagina "Summary"
    riepilogo = os.environ.get("GITHUB_STEP_SUMMARY")
    if riepilogo:
        with open(riepilogo, "a", encoding="utf-8") as f:
            f.write(testo + "\n")


if __name__ == "__main__":
    main()
