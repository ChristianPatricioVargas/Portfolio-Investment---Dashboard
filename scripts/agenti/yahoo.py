"""
yahoo.py = il "fattorino": va a prendere i dati grezzi da Yahoo Finance.

Yahoo ha due tipi di pagine:
  - il GRAFICO (prezzi passati): libero, è quello che usiamo già per i prezzi
  - il RIEPILOGO (fondamentali, target degli analisti, trimestrali): vuole prima
    un "biscotto" (cookie) e una parola d'ordine (crumb), come fa un browser.

ATTENZIONE: non è un servizio ufficiale. È gratuito e senza chiavi, ma Yahoo può
cambiarlo o rifiutare le richieste senza preavviso. Per questo ogni richiesta è
protetta: se fallisce, il direttore tiene i dati del giorno prima.
"""

import http.cookiejar
import json
import time
import urllib.error
import urllib.parse
import urllib.request

NAVIGATORE = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
              "(KHTML, like Gecko) Version/17.0 Safari/605.1.15")
SERVER = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]

# Le "pagine" del riepilogo che ci servono
MODULI = ("price,summaryDetail,financialData,defaultKeyStatistics,calendarEvents,"
          "earningsTrend,earningsHistory,assetProfile")


class FonteNonDisponibile(Exception):
    """Yahoo ha rifiutato le richieste dei fondamentali: per questo giro non insistiamo."""


class Yahoo:
    def __init__(self, pausa=0.5):
        self.pausa = pausa            # secondi di attesa tra una richiesta e l'altra (per educazione)
        self.crumb = None
        self.rifiutato = None         # il motivo, se Yahoo ha rifiutato i fondamentali in questo giro
        biscotti = http.cookiejar.CookieJar()
        self.navigatore = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(biscotti))
        self.navigatore.addheaders = [("User-Agent", NAVIGATORE), ("Accept-Language", "en-US,en;q=0.9")]

    def _scarica(self, indirizzo):
        """Scarica una pagina del riepilogo. Una richiesta sola: se Yahoo dice di no, non insistiamo."""
        time.sleep(self.pausa)
        with self.navigatore.open(indirizzo, timeout=20) as risposta:
            return risposta.read()

    def _prepara_crumb(self):
        """Prende il biscotto e la parola d'ordine, come farebbe un browser."""
        try:
            self._scarica("https://fc.yahoo.com")
        except urllib.error.HTTPError:
            pass   # questa pagina risponde "non trovata", ma intanto ci dà il biscotto
        crumb = self._scarica(SERVER[0] + "/v1/test/getcrumb").decode("utf-8").strip()
        if not crumb or "<" in crumb or len(crumb) >= 40:
            raise ValueError("parola d'ordine (crumb) non valida")
        self.crumb = crumb

    def grafico(self, ticker, periodo="2y", intervallo="1d"):
        """I prezzi passati di un titolo (dati grezzi).
        Usa la stessa identica richiesta che aggiorna_prezzi.py fa da sempre per i prezzi:
        semplice, senza biscotti, e sappiamo che dai server di GitHub funziona."""
        time.sleep(self.pausa)
        richiesta = urllib.request.Request(
            "{}/v8/finance/chart/{}?range={}&interval={}".format(SERVER[0], urllib.parse.quote(ticker), periodo, intervallo),
            headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(richiesta, timeout=20) as risposta:
            return json.load(risposta)["chart"]["result"][0]

    def riepilogo(self, ticker):
        """Fondamentali, analisti e calendario di un titolo (dati grezzi).
        Se Yahoo rifiuta (troppe richieste, accesso negato) ci fermiamo per tutto il giro:
        continuare a bussare sarebbe scortese e inutile."""
        if self.rifiutato:
            raise FonteNonDisponibile(self.rifiutato)
        try:
            if not self.crumb:
                self._prepara_crumb()
            indirizzo = "{}/v10/finance/quoteSummary/{}?modules={}&crumb={}".format(
                SERVER[1], urllib.parse.quote(ticker), MODULI, urllib.parse.quote(self.crumb))
            return json.loads(self._scarica(indirizzo))["quoteSummary"]["result"][0]
        except urllib.error.HTTPError as errore:
            if errore.code in (401, 403, 429):
                self.rifiutato = f"Yahoo Finance ha rifiutato la richiesta dei fondamentali (errore {errore.code})"
                raise FonteNonDisponibile(self.rifiutato) from errore
            raise     # altri errori (es. 404: sigla sconosciuta) riguardano solo questo titolo
