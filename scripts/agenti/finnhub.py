"""
finnhub.py = il "fattorino" dei fondamentali: va a prendere i dati grezzi da Finnhub.

Finnhub è un servizio ufficiale con chiave gratuita (circa 60 richieste al minuto).
Nel piano gratuito copre le aziende quotate negli Stati Uniti: per questo ogni titolo
ha una sigla americana (campo "usa" in data/titoli.json e data/watchlist.json).
Quasi tutte le grandi aziende europee e asiatiche ne hanno una (es. SAP → SAP, Airbus → EADSY).

Cosa dà gratis:  numeri di bilancio, giudizi degli analisti, sorprese sulle trimestrali,
                 data della prossima trimestrale, settore.
                 Per la pagina Mercato: logo e capitalizzazione di un'azienda, calendario delle
                 nuove quotazioni (IPO) e notizie di un'azienda.
Cosa NON dà:     il target price medio degli analisti (è a pagamento) e la descrizione dell'azienda.

La chiave NON sta nel codice: arriva dal segreto FINNHUB_API_KEY di GitHub e viaggia in
un'intestazione della richiesta (non nell'indirizzo), così non può finire stampata per sbaglio.
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

INDIRIZZO = "https://finnhub.io/api/v1"


class FonteNonDisponibile(Exception):
    """Finnhub ha rifiutato la chiave o tutte le richieste: per questo giro non insistiamo."""


class TitoloNonCoperto(Exception):
    """Questa sigla non è inclusa nel piano gratuito (o non esiste)."""


class Finnhub:
    def __init__(self, chiave, pausa=1.05):
        self.chiave = chiave
        self.pausa = pausa            # secondi tra una richiesta e l'altra: restiamo sotto le 60 al minuto
        self.rifiutato = None         # il motivo, se la fonte è chiusa per tutto il giro

    def _chiedi(self, percorso, **parametri):
        """Una richiesta a Finnhub. Se dice "troppe richieste" aspetta un minuto e riprova una volta sola."""
        if self.rifiutato:
            raise FonteNonDisponibile(self.rifiutato)
        richiesta = urllib.request.Request(f"{INDIRIZZO}{percorso}?{urllib.parse.urlencode(parametri)}",
                                           headers={"X-Finnhub-Token": self.chiave})
        for tentativo in range(2):
            time.sleep(self.pausa)
            try:
                with urllib.request.urlopen(richiesta, timeout=30) as risposta:
                    return json.load(risposta)
            except urllib.error.HTTPError as errore:
                if errore.code == 429 and tentativo == 0:
                    time.sleep(60)                      # limite al minuto raggiunto: aspettiamo e riproviamo
                    continue
                if errore.code == 403:
                    raise TitoloNonCoperto(f"{parametri.get('symbol')} non è incluso nel piano gratuito di Finnhub") from errore
                if errore.code in (401, 429):
                    motivo = "la chiave non è valida" if errore.code == 401 else "troppe richieste"
                    self.rifiutato = f"Finnhub ha rifiutato le richieste dei fondamentali ({motivo})"
                    raise FonteNonDisponibile(self.rifiutato) from errore
                raise

    def grezzi(self, sigla, oggi, con_profilo=True):
        """Tutti i dati grezzi di un titolo, pronti per l'analista fondamentale.
        con_profilo=False salta la richiesta del settore (non cambia mai: basta chiederlo una volta)."""
        numeri = (self._chiedi("/stock/metric", symbol=sigla, metric="all") or {}).get("metric") or {}
        if not numeri:
            raise TitoloNonCoperto(f"Finnhub non ha dati per {sigla}")
        tra_4_mesi = (datetime.strptime(oggi, "%Y-%m-%d") + timedelta(days=120)).strftime("%Y-%m-%d")
        return {
            "metric": numeri,
            "recommendation": self._chiedi("/stock/recommendation", symbol=sigla) or [],
            "earnings": self._chiedi("/stock/earnings", symbol=sigla) or [],
            "calendar": (self._chiedi("/calendar/earnings", symbol=sigla, **{"from": oggi, "to": tra_4_mesi}) or {}).get("earningsCalendar") or [],
            "profile": (self._chiedi("/stock/profile2", symbol=sigla) or {}) if con_profilo else {},
        }

    # ---------- Per la pagina Mercato ----------

    def profilo(self, sigla):
        """Nome, settore, logo e capitalizzazione (in milioni di dollari) di un'azienda."""
        dati = self._chiedi("/stock/profile2", symbol=sigla) or {}
        if not dati.get("name") and not dati.get("marketCapitalization"):
            raise TitoloNonCoperto(f"Finnhub non ha il profilo di {sigla}")
        return dati

    def quotazioni(self, da, a):
        """Il calendario delle nuove quotazioni in Borsa (IPO) tra due date ("2026-11-24")."""
        return (self._chiedi("/calendar/ipo", **{"from": da, "to": a}) or {}).get("ipoCalendar") or []

    def notizie(self, sigla, da, a):
        """Le notizie di un'azienda tra due date (servono solo a contarle)."""
        risposta = self._chiedi("/company-news", symbol=sigla, **{"from": da, "to": a})
        return risposta if isinstance(risposta, list) else []
