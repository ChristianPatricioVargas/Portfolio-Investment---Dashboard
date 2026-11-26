"""
yahoo.py = il "fattorino" dei prezzi: va a prendere da Yahoo Finance i prezzi passati di un titolo.

Usa la stessa identica richiesta che aggiorna_prezzi.py fa da sempre per i prezzi:
semplice, e sappiamo che dai server di GitHub funziona.

I fondamentali NON arrivano più da qui: Yahoo rifiuta quelle richieste quando partono da GitHub.
Li porta l'altro fattorino, finnhub.py.
"""

import json
import time
import urllib.parse
import urllib.request

INDIRIZZO = "https://query1.finance.yahoo.com/v8/finance/chart/{}?range={}&interval={}"
# Per la mappa del mercato servono i prezzi di centinaia di titoli: questa richiesta ne dà
# fino a 20 alla volta (solo le chiusure, senza candele). Con 21 Yahoo risponde "errore 400".
INDIRIZZO_GRUPPO = "https://query1.finance.yahoo.com/v8/finance/spark?symbols={}&range={}&interval={}"
MASSIMO_GRUPPO = 20


class Yahoo:
    def __init__(self, pausa=0.5):
        self.pausa = pausa            # secondi di attesa tra una richiesta e l'altra (per educazione)

    def grafico(self, ticker, periodo="2y", intervallo="1d"):
        """I prezzi passati di un titolo (dati grezzi)."""
        time.sleep(self.pausa)
        richiesta = urllib.request.Request(INDIRIZZO.format(urllib.parse.quote(ticker), periodo, intervallo),
                                           headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(richiesta, timeout=20) as risposta:
            return json.load(risposta)["chart"]["result"][0]

    def gruppo(self, sigle, periodo="1y", intervallo="1d"):
        """Le chiusure di un gruppo di titoli (al massimo 20) in una richiesta sola.
        Restituisce {sigla: {"tempi": [...], "chiusure": [...]}}; le sigle che Yahoo non conosce mancano."""
        if len(sigle) > MASSIMO_GRUPPO:
            raise ValueError(f"al massimo {MASSIMO_GRUPPO} sigle per richiesta")
        time.sleep(self.pausa)
        elenco = ",".join(urllib.parse.quote(s) for s in sigle)
        richiesta = urllib.request.Request(INDIRIZZO_GRUPPO.format(elenco, periodo, intervallo),
                                           headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(richiesta, timeout=30) as risposta:
            return leggi_gruppo(json.load(risposta))


def leggi_gruppo(dati):
    """Yahoo risponde in due forme diverse (una vecchia, una nuova): le riportiamo a una sola."""
    risultato = {}
    if isinstance(dati, dict) and "spark" in dati:
        # forma vecchia: {"spark": {"result": [{"symbol": ..., "response": [{"timestamp", "indicators"}]}]}}
        for voce in (dati["spark"] or {}).get("result") or []:
            risposta = (voce.get("response") or [{}])[0]
            chiusure = (((risposta.get("indicators") or {}).get("quote") or [{}])[0]).get("close") or []
            risultato[voce.get("symbol")] = {"tempi": risposta.get("timestamp") or [], "chiusure": chiusure}
        return risultato
    for sigla, voce in (dati or {}).items():
        # forma nuova: {"AAPL": {"timestamp": [...], "close": [...]}}
        if isinstance(voce, dict):
            risultato[sigla] = {"tempi": voce.get("timestamp") or [], "chiusure": voce.get("close") or []}
    return risultato
