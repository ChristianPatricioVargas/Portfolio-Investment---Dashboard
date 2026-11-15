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
