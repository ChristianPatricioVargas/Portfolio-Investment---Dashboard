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


class Yahoo:
    def __init__(self, pausa=0.4):
        self.pausa = pausa            # secondi di attesa tra una richiesta e l'altra (per educazione)
        self.crumb = None
        biscotti = http.cookiejar.CookieJar()
        self.navigatore = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(biscotti))
        self.navigatore.addheaders = [("User-Agent", NAVIGATORE), ("Accept-Language", "en-US,en;q=0.9")]

    def _scarica(self, indirizzo, tentativi=3):
        """Scarica una pagina. Se Yahoo dice "troppe richieste" o ha un problema, aspetta e riprova."""
        for tentativo in range(tentativi):
            time.sleep(self.pausa)
            try:
                with self.navigatore.open(indirizzo, timeout=20) as risposta:
                    return risposta.read()
            except urllib.error.HTTPError as errore:
                riprovabile = errore.code == 429 or errore.code >= 500
                if not riprovabile or tentativo == tentativi - 1:
                    raise
                time.sleep(3 * (tentativo + 1))
            except (urllib.error.URLError, TimeoutError):
                if tentativo == tentativi - 1:
                    raise
                time.sleep(3 * (tentativo + 1))

    def _prepara_crumb(self):
        """Prende il biscotto e la parola d'ordine, come farebbe un browser."""
        try:
            self._scarica("https://fc.yahoo.com", tentativi=1)
        except urllib.error.HTTPError:
            pass   # questa pagina risponde "non trovata", ma intanto ci dà il biscotto
        for server in SERVER:
            try:
                crumb = self._scarica(server + "/v1/test/getcrumb").decode("utf-8").strip()
            except Exception:
                continue
            if crumb and "<" not in crumb and len(crumb) < 40:
                self.crumb = crumb
                return
        raise RuntimeError("Yahoo non ha dato la parola d'ordine (crumb)")

    def grafico(self, ticker, periodo="2y", intervallo="1d"):
        """I prezzi passati di un titolo (dati grezzi)."""
        indirizzo = "{}/v8/finance/chart/{}?range={}&interval={}".format(
            SERVER[0], urllib.parse.quote(ticker), periodo, intervallo)
        return json.loads(self._scarica(indirizzo))["chart"]["result"][0]

    def riepilogo(self, ticker):
        """Fondamentali, analisti e calendario di un titolo (dati grezzi)."""
        for giro in range(2):
            if not self.crumb:
                self._prepara_crumb()
            indirizzo = "{}/v10/finance/quoteSummary/{}?modules={}&crumb={}".format(
                SERVER[1], urllib.parse.quote(ticker), MODULI, urllib.parse.quote(self.crumb))
            try:
                return json.loads(self._scarica(indirizzo))["quoteSummary"]["result"][0]
            except urllib.error.HTTPError as errore:
                # 401 = parola d'ordine scaduta: ne chiediamo una nuova e riproviamo una volta
                if errore.code == 401 and giro == 0:
                    self.crumb = None
                    continue
                raise
