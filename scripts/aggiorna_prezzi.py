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
  3. per ogni titolo scarica le ultime notizie (Google News, o Bing News, o Yahoo Finance)
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


# ---------- Notizie ----------
# Proviamo tre servizi, in ordine. Il primo che risponde con almeno una notizia vince:
#   1. Google News (italiano)  - a volte rifiuta le richieste che arrivano dai server di GitHub
#   2. Bing News   (italiano)  - riserva
#   3. Yahoo Finance (inglese) - ultima riserva: da GitHub funziona sempre (i prezzi arrivano da lì)
# Teniamo solo le notizie degli ultimi 7 giorni, senza doppioni e con link sicuri.

GIORNI_NOTIZIE = 7


def scarica(indirizzo):
    """Scarica una pagina qualsiasi (feed RSS o dati JSON) e restituisce i byte."""
    richiesta = urllib.request.Request(indirizzo, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "Accept-Language": "it-IT,it;q=0.9",
    })
    with urllib.request.urlopen(richiesta, timeout=20) as risposta:
        return risposta.read()


def notizia(titolo, fonte, link, data):
    """Mette una notizia nel formato che usa la pagina."""
    return {"titolo": titolo.strip(), "fonte": (fonte or "").strip(), "link": link.strip(),
            "data": data.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


def leggi_feed_rss(xml):
    """Legge un feed RSS (Google News o Bing News) e restituisce le notizie."""
    risultato = []
    for elemento in ET.fromstring(xml).iter("item"):
        titolo = (elemento.findtext("title") or "").strip()
        link = (elemento.findtext("link") or "").strip()
        # Il nome del giornale: <source> in Google, <News:Source> in Bing
        fonte = elemento.findtext("source") or ""
        for figlio in elemento:
            if figlio.tag.endswith("}Source"):
                fonte = figlio.text or fonte
        fonte = fonte.strip()
        # Google scrive "Titolo della notizia - Nome giornale": togliamo il giornale dal titolo
        if fonte and titolo.endswith(" - " + fonte):
            titolo = titolo[: -len(" - " + fonte)]
        try:
            data = parsedate_to_datetime(elemento.findtext("pubDate"))
        except (TypeError, ValueError):
            continue   # notizia senza data: la saltiamo
        if titolo and link:
            risultato.append(notizia(titolo, fonte, link, data))
    return risultato


def notizie_google(ricerca, _inglese):
    indirizzo = "https://news.google.com/rss/search?q={}&hl=it&gl=IT&ceid=IT:it".format(
        urllib.parse.quote(f"{ricerca} when:{GIORNI_NOTIZIE}d"))
    return leggi_feed_rss(scarica(indirizzo))


def notizie_bing(ricerca, _inglese):
    indirizzo = "https://www.bing.com/news/search?q={}&format=rss&setlang=it-IT&mkt=it-IT".format(
        urllib.parse.quote(ricerca))
    return leggi_feed_rss(scarica(indirizzo))


def notizie_yahoo(_ricerca, inglese):
    indirizzo = "https://query1.finance.yahoo.com/v1/finance/search?q={}&quotesCount=0&newsCount=15".format(
        urllib.parse.quote(inglese))
    dati = json.loads(scarica(indirizzo))
    return [notizia(n.get("title", ""), n.get("publisher", ""), n.get("link", ""),
                    datetime.fromtimestamp(n["providerPublishTime"], timezone.utc))
            for n in dati.get("news", []) if n.get("providerPublishTime")]


SERVIZI_NOTIZIE = [("Google News", notizie_google), ("Bing News", notizie_bing), ("Yahoo Finance", notizie_yahoo)]


def pulisci(notizie):
    """Solo ultimi 7 giorni, solo link https, niente doppioni; le più recenti prima."""
    limite = (datetime.now(timezone.utc) - timedelta(days=GIORNI_NOTIZIE)).strftime("%Y-%m-%dT%H:%M:%SZ")
    risultato, visti = [], set()
    for n in sorted(notizie, key=lambda n: n["data"], reverse=True):
        chiave = n["titolo"].lower()
        if n["data"] < limite or not n["link"].startswith("https://") or not n["titolo"] or chiave in visti:
            continue
        visti.add(chiave)
        risultato.append(n)
    return risultato[:NOTIZIE_PER_TITOLO]


def notizie_di(titolo):
    """Prova i servizi in ordine; restituisce (nome del servizio, notizie)."""
    ricerca = titolo.get("notizie") or titolo["nome"]
    inglese = titolo.get("notizie_en") or titolo["nome"]
    for nome, servizio in SERVIZI_NOTIZIE:
        try:
            trovate = pulisci(servizio(ricerca, inglese))
        except Exception as errore:
            print(f"  {nome}: non risponde ({errore})")
            continue
        if trovate:
            return nome, trovate
        print(f"  {nome}: nessuna notizia")
    return None, []


def aggiorna_notizie(titoli):
    """Scarica le notizie di ogni titolo. Se nessun servizio risponde, tiene quelle vecchie."""
    vecchie = leggi_json(FILE_NOTIZIE, {})
    notizie = dict(vecchie.get("notizie", {}))
    servizi = dict(vecchie.get("servizi", {}))
    for titolo in titoli:
        ticker = titolo["ticker"]
        print(f"NOTIZIE {ticker}:")
        nome, trovate = notizie_di(titolo)
        if nome:
            notizie[ticker], servizi[ticker] = trovate, nome
            print(f"  → {len(trovate)} {'notizia' if len(trovate) == 1 else 'notizie'} da {nome}")
        else:
            print("  → nessun servizio ha risposto: tengo le notizie di prima")
    scrivi_json(FILE_NOTIZIE, {
        "aggiornato": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "servizi": servizi,   # da quale servizio arrivano le notizie di ogni titolo
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
