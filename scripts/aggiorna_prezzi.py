"""
aggiorna_prezzi.py = il programma che scarica i prezzi e manda gli allarmi.

Non lo esegui tu: lo fa GitHub da solo, ogni 30 minuti nei giorni di Borsa
(le istruzioni sono in .github/workflows/aggiorna-prezzi.yml).

Cosa fa, passo per passo:
  1. legge l'elenco dei titoli da data/titoli.json
  2. per ogni titolo chiede a Yahoo Finance:
       - il prezzo attuale e la chiusura di ieri  -> data/prezzi.json
       - i prezzi ogni 5 minuti dell'ultimo giorno di Borsa -> data/intraday.json (grafico "1 giorno")
       - i prezzi di chiusura dell'ultimo anno    -> data/storico.json (per il grafico)
  3. per ogni titolo scarica le ultime notizie da Google News (in italiano)
                                               -> data/notizie.json
  4. se un titolo scende troppo in giornata manda una notifica con ntfy:
       - Azione: -5% o peggio
       - ETF:    -3% o peggio
     Ogni titolo dà al massimo un allarme al giorno (data/allarmi.json).

Nessun dato personale passa di qui: il programma conosce solo i prezzi pubblici.
Il nome del canale ntfy è segreto e arriva da GitHub Secrets (NTFY_TOPIC).
"""

import json
import os
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

CARTELLA_DATI = Path(__file__).resolve().parent.parent / "data"
FILE_TITOLI = CARTELLA_DATI / "titoli.json"
FILE_PREZZI = CARTELLA_DATI / "prezzi.json"
FILE_STORICO = CARTELLA_DATI / "storico.json"
FILE_INTRADAY = CARTELLA_DATI / "intraday.json"
FILE_NOTIZIE = CARTELLA_DATI / "notizie.json"

# Google News: notizie in italiano degli ultimi 7 giorni. Gratis, senza chiave.
INDIRIZZO_NOTIZIE = "https://news.google.com/rss/search?q={ricerca}&hl=it&gl=IT&ceid=IT:it"
NOTIZIE_PER_TITOLO = 10
FILE_ALLARMI = CARTELLA_DATI / "allarmi.json"

INDIRIZZO_YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range={periodo}&interval={intervallo}"

# Di quanto deve scendere un titolo in giornata per far scattare l'allarme
SOGLIE_ALLARME = {"Azione": -0.05, "ETF": -0.03}


# ---------- Leggere e scrivere i file ----------

def leggi_json(percorso, predefinito):
    """Legge un file JSON; se non esiste o è rovinato, usa il valore predefinito."""
    try:
        return json.loads(percorso.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return predefinito


def scrivi_json(percorso, dati):
    percorso.write_text(json.dumps(dati, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


# ---------- Parlare con Yahoo Finance ----------

def chiedi_a_yahoo(ticker, periodo, intervallo="1d"):
    """Scarica i dati grezzi di un titolo.
    periodo: "1d" = l'ultimo giorno, "1y" = un anno.  intervallo: "5m" = ogni 5 minuti, "1d" = un prezzo al giorno."""
    richiesta = urllib.request.Request(
        INDIRIZZO_YAHOO.format(ticker=ticker, periodo=periodo, intervallo=intervallo),
        headers={"User-Agent": "Mozilla/5.0"},   # Yahoo vuole sapere "chi" chiede
    )
    with urllib.request.urlopen(richiesta, timeout=20) as risposta:
        return json.load(risposta)


def estrai_prezzi(dati):
    """Dalla risposta di Yahoo tiene: prezzo attuale, chiusura di ieri,
    la borsa da cui arriva il prezzo e l'ora dell'ultimo scambio."""
    info = dati["chart"]["result"][0]["meta"]
    if info.get("currency") != "EUR":
        raise ValueError("prezzo non in euro: " + str(info.get("currency")))
    risultato = {
        "prezzo": round(float(info["regularMarketPrice"]), 4),
        "chiusuraIeri": round(float(info.get("previousClose") or info["chartPreviousClose"]), 4),
        # Il nome della borsa, es. "XETRA" (Yahoo lo chiama fullExchangeName)
        "borsa": info.get("fullExchangeName") or info.get("exchangeName") or "",
    }
    # L'ora dell'ultimo scambio, in UTC (la pagina la converte nell'ora italiana)
    if info.get("regularMarketTime"):
        istante = datetime.fromtimestamp(int(info["regularMarketTime"]), timezone.utc)
        risultato["orario"] = istante.strftime("%Y-%m-%dT%H:%M:%SZ")
    return risultato


def estrai_storico(dati, formato="%Y-%m-%d"):
    """Dalla risposta di Yahoo costruisce { "2026-10-01": 171.2, ... }.
    Con formato="%Y-%m-%dT%H:%M" le chiavi hanno anche l'ora (per i prezzi ogni 5 minuti)."""
    risultato = dati["chart"]["result"][0]
    if risultato["meta"].get("currency") != "EUR":
        raise ValueError("storico non in euro")
    # Yahoo dà gli orari in secondi UTC: aggiungiamo il fuso della Borsa per avere il giorno giusto
    fuso = timedelta(seconds=risultato["meta"].get("gmtoffset", 0))
    chiusure = risultato["indicators"]["quote"][0]["close"]
    storico = {}
    for istante, chiusura in zip(risultato.get("timestamp", []), chiusure):
        if chiusura is None:          # giorni senza scambi: li saltiamo
            continue
        giorno = (datetime.fromtimestamp(istante, timezone.utc) + fuso).strftime(formato)
        storico[giorno] = round(float(chiusura), 4)
    return storico


# ---------- Notizie da Google News ----------

def chiedi_notizie(ricerca):
    """Scarica il "feed RSS" di Google News: un elenco di notizie in formato XML."""
    indirizzo = INDIRIZZO_NOTIZIE.format(ricerca=urllib.parse.quote(ricerca + " when:7d"))
    richiesta = urllib.request.Request(indirizzo, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(richiesta, timeout=20) as risposta:
        return risposta.read()


def estrai_notizie(xml):
    """Dal feed tiene, per ogni notizia: titolo, giornale, link e data. Le più recenti prima."""
    notizie, visti = [], set()
    for elemento in ET.fromstring(xml).iter("item"):
        titolo = (elemento.findtext("title") or "").strip()
        link = (elemento.findtext("link") or "").strip()
        fonte = (elemento.findtext("source") or "").strip()
        # Google scrive "Titolo della notizia - Nome giornale": togliamo il giornale dal titolo
        if fonte and titolo.endswith(" - " + fonte):
            titolo = titolo[: -len(" - " + fonte)]
        if not titolo or not link.startswith("https://") or titolo.lower() in visti:
            continue   # notizie vuote, link strani o doppioni: le saltiamo
        visti.add(titolo.lower())
        try:
            data = parsedate_to_datetime(elemento.findtext("pubDate")).astimezone(timezone.utc)
        except (TypeError, ValueError):
            continue
        notizie.append({"titolo": titolo, "fonte": fonte, "link": link, "data": data.strftime("%Y-%m-%dT%H:%M:%SZ")})
    notizie.sort(key=lambda n: n["data"], reverse=True)
    return notizie[:NOTIZIE_PER_TITOLO]


def aggiorna_notizie(titoli):
    """Scarica le notizie di ogni titolo. Se un titolo non risponde, tiene quelle vecchie."""
    vecchie = leggi_json(FILE_NOTIZIE, {}).get("notizie", {})
    notizie = dict(vecchie)
    for titolo in titoli:
        ricerca = titolo.get("notizie") or titolo["nome"]
        try:
            notizie[titolo["ticker"]] = estrai_notizie(chiedi_notizie(ricerca))
            print(f"NOTIZIE {titolo['ticker']}: {len(notizie[titolo['ticker']])}")
        except Exception as errore:
            print(f"ERRORE notizie {titolo['ticker']}: {errore}")
    scrivi_json(FILE_NOTIZIE, {
        "fonte": "Google News",
        "aggiornato": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "notizie": notizie,
    })


# ---------- Allarmi con ntfy ----------

def manda_notifica(canale, titolo, messaggio):
    """Manda una notifica al canale ntfy (arriva sull'app ntfy dell'iPad)."""
    corpo = {"topic": canale, "title": titolo, "message": messaggio, "priority": 4}
    richiesta = urllib.request.Request(
        "https://ntfy.sh/",
        data=json.dumps(corpo).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(richiesta, timeout=20):
        pass


def percentuale(numero):
    """0.0523 -> "+5,23%" (con la virgola, all'italiana)"""
    return f"{numero * 100:+.2f}%".replace(".", ",")


def euro(numero):
    """171.5 -> "171,50 €" """
    return f"{numero:.2f} €".replace(".", ",")


def controlla_allarmi(titoli, prezzi, canale):
    """Manda un allarme per ogni titolo sceso oltre la sua soglia (uno al giorno)."""
    oggi = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    registro = leggi_json(FILE_ALLARMI, {})
    gia_avvisati = set(registro.get(oggi, []))

    for titolo in titoli:
        ticker = titolo["ticker"]
        p = prezzi.get(ticker)
        soglia = SOGLIE_ALLARME.get(titolo["tipo"])
        if not p or soglia is None or ticker in gia_avvisati:
            continue
        variazione = p["prezzo"] / p["chiusuraIeri"] - 1
        if variazione <= soglia:
            testo = (f"{titolo['nome']} oggi {percentuale(variazione)} "
                     f"(prezzo {euro(p['prezzo'])}, ieri {euro(p['chiusuraIeri'])}).\n"
                     f"Soglia di allarme per {titolo['tipo']}: {percentuale(soglia)}.")
            try:
                manda_notifica(canale, f"⚠️ {titolo['nome']} {percentuale(variazione)}", testo)
                gia_avvisati.add(ticker)
                print(f"ALLARME inviato per {ticker}: {percentuale(variazione)}")
            except Exception as errore:
                print(f"ERRORE invio allarme {ticker}: {errore}")

    # Teniamo solo il registro di oggi: i giorni passati non servono più
    scrivi_json(FILE_ALLARMI, {oggi: sorted(gia_avvisati)})


# ---------- Programma principale ----------

def main():
    titoli = leggi_json(FILE_TITOLI, [])
    canale = os.environ.get("NTFY_TOPIC", "").strip()

    # Prova: manda una notifica di test. In ogni caso poi aggiorna i prezzi,
    # così il pulsante "Run workflow" funziona sempre, qualunque casella sia spuntata.
    if os.environ.get("PROVA_NOTIFICA") == "true":
        if not canale:
            print("AVVISO: prova notifica richiesta, ma ntfy non è configurato "
                  "(manca il segreto NTFY_TOPIC). Aggiorno solo i prezzi.")
        else:
            try:
                manda_notifica(canale, "✅ Prova riuscita", "Gli allarmi del tuo portafoglio funzionano.")
                print("Notifica di prova inviata.")
            except Exception as errore:
                print(f"ERRORE notifica di prova: {errore}")

    # Partiamo dai dati vecchi: se un titolo non risponde, teniamo gli ultimi noti
    prezzi = leggi_json(FILE_PREZZI, {}).get("prezzi", {})
    storico = leggi_json(FILE_STORICO, {})
    intraday = leggi_json(FILE_INTRADAY, {})

    riusciti = 0
    for titolo in titoli:
        ticker = titolo["ticker"]
        try:
            # Una sola richiesta dà sia il prezzo attuale sia i prezzi ogni 5 minuti di oggi
            dati = chiedi_a_yahoo(ticker, "1d", "5m")
            prezzi[ticker] = estrai_prezzi(dati)
            intraday[ticker] = estrai_storico(dati, "%Y-%m-%dT%H:%M")
            riusciti += 1
            print(f"OK   {ticker}: {prezzi[ticker]['prezzo']} €")
        except Exception as errore:   # qualsiasi problema: lo scriviamo e andiamo avanti
            print(f"ERRORE prezzo {ticker}: {errore}")
        try:
            # Uniamo lo storico nuovo a quello vecchio: così cresce nel tempo
            storico.setdefault(ticker, {}).update(estrai_storico(chiedi_a_yahoo(ticker, "1y")))
            storico[ticker] = dict(sorted(storico[ticker].items()))
        except Exception as errore:
            print(f"ERRORE storico {ticker}: {errore}")

    if riusciti == 0:
        raise SystemExit("Nessun prezzo scaricato: lascio i file com'erano.")

    scrivi_json(FILE_PREZZI, {
        "fonte": "Yahoo Finance (Xetra)",
        "aggiornato": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "prezzi": prezzi,
    })
    scrivi_json(FILE_STORICO, storico)
    scrivi_json(FILE_INTRADAY, intraday)

    # Le notizie non sono indispensabili: se qualcosa va storto, i prezzi restano salvati
    try:
        aggiorna_notizie(titoli)
    except Exception as errore:
        print(f"ERRORE notizie: {errore}")
    print(f"Salvati {riusciti} prezzi su {len(titoli)}.")

    if canale:
        controlla_allarmi(titoli, prezzi, canale)
    else:
        print("Allarmi spenti: manca il segreto NTFY_TOPIC.")


if __name__ == "__main__":
    main()
