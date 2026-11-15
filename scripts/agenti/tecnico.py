"""
tecnico.py = l'ANALISTA TECNICO (il "quando").

Non guarda i conti dell'azienda ma solo l'andamento del prezzo:
  - medie mobili a 50 e 200 giorni (il prezzo medio degli ultimi 50 / 200 giorni di Borsa)
  - RSI a 14 giorni (un numero da 0 a 100: sotto 30 il titolo è sceso molto in fretta,
    sopra 70 è salito molto in fretta)
  - distanza dal massimo e dal minimo delle ultime 52 settimane
  - supporti e resistenze semplici (prezzi dove in passato il titolo si è fermato più volte)

Poi riassume tutto in una frase comprensibile.

IMPORTANTE: l'analisi tecnica descrive il passato. Non prevede il futuro.
"""

from datetime import datetime, timedelta, timezone

GIORNI_GRAFICO = 252      # un anno di Borsa: quanti giorni mandiamo alla pagina per il grafico
GIORNI_CANDELE = 90       # per quanti giorni mandiamo anche le "candele" (circa 4 mesi di Borsa)
FINESTRA_PIVOT = 5        # un "picco" è il prezzo più alto dei 5 giorni prima e dei 5 dopo
TOLLERANZA_LIVELLO = 0.015   # due livelli più vicini dell'1,5% sono lo stesso livello


def chiusure(grafico):
    """Dai dati grezzi di Yahoo a due liste: i giorni ("2026-11-13") e i prezzi di chiusura."""
    fuso = timedelta(seconds=grafico["meta"].get("gmtoffset", 0))
    prezzi = grafico["indicators"]["quote"][0]["close"]
    per_giorno = {}
    for istante, prezzo in zip(grafico.get("timestamp") or [], prezzi):
        if prezzo is None:      # giorno senza scambi
            continue
        giorno = (datetime.fromtimestamp(istante, timezone.utc) + fuso).strftime("%Y-%m-%d")
        per_giorno[giorno] = float(prezzo)
    giorni = sorted(per_giorno)
    return giorni, [per_giorno[g] for g in giorni]


def candele(grafico, giorni):
    """Le "candele" degli ultimi giorni: per ogni giorno apertura, massimo, minimo, chiusura e volume.
    Una candela racconta la giornata: da dove è partito il prezzo, fin dove è salito e sceso, dove ha chiuso.
    "giorni" è la lista dei giorni del grafico: restituiamo le candele dei suoi ultimi 90 giorni
    (None se Yahoo non dà questi dati, come capita per qualche ETF)."""
    fuso = timedelta(seconds=grafico["meta"].get("gmtoffset", 0))
    dati = grafico["indicators"]["quote"][0]
    per_giorno = {}
    for i, istante in enumerate(grafico.get("timestamp") or []):
        valori = [(dati.get(campo) or [None] * (i + 1))[i] for campo in ("open", "high", "low", "close")]
        if any(v is None for v in valori):
            continue
        volume = (dati.get("volume") or [None] * (i + 1))[i]
        giorno = (datetime.fromtimestamp(istante, timezone.utc) + fuso).strftime("%Y-%m-%d")
        per_giorno[giorno] = [round(float(v), 2) for v in valori] + [int(volume or 0)]
    ultimi = giorni[-GIORNI_CANDELE:]
    if not ultimi or any(g not in per_giorno for g in ultimi):
        return None
    colonne = list(zip(*(per_giorno[g] for g in ultimi)))
    return {"da": len(giorni) - len(ultimi),      # la posizione, nella serie, del primo giorno con la candela
            "apertura": list(colonne[0]), "massimo": list(colonne[1]), "minimo": list(colonne[2]),
            "chiusura": list(colonne[3]), "volume": list(colonne[4])}


def media_mobile(valori, giorni):
    """Per ogni giorno, la media degli ultimi N prezzi (None finché non ci sono N giorni)."""
    risultato, somma = [], 0.0
    for i, valore in enumerate(valori):
        somma += valore
        if i >= giorni:
            somma -= valori[i - giorni]
        risultato.append(somma / giorni if i >= giorni - 1 else None)
    return risultato


def rsi(valori, giorni=14):
    """RSI (indice di forza relativa) con il metodo classico di Wilder.
    Confronta la media dei rialzi con la media dei ribassi degli ultimi 14 giorni."""
    if len(valori) <= giorni:
        return None
    variazioni = [b - a for a, b in zip(valori, valori[1:])]
    rialzi = sum(max(v, 0) for v in variazioni[:giorni]) / giorni
    ribassi = sum(max(-v, 0) for v in variazioni[:giorni]) / giorni
    for v in variazioni[giorni:]:
        rialzi = (rialzi * (giorni - 1) + max(v, 0)) / giorni
        ribassi = (ribassi * (giorni - 1) + max(-v, 0)) / giorni
    if ribassi == 0:
        return 100.0
    return 100 - 100 / (1 + rialzi / ribassi)


def livelli(valori, prezzo):
    """Supporti e resistenze semplici.
    1. cerchiamo i "picchi" e le "valli" dell'ultimo anno
    2. uniamo quelli quasi uguali: più volte il prezzo si è fermato lì, più il livello conta
    3. i livelli sotto il prezzo di oggi sono supporti, quelli sopra resistenze"""
    f = FINESTRA_PIVOT
    punti = []
    for i in range(f, len(valori) - f):
        intorno = valori[i - f:i + f + 1]
        if valori[i] == max(intorno) or valori[i] == min(intorno):
            punti.append(valori[i])
    punti.sort()
    gruppi = []     # ogni gruppo: [somma dei prezzi, quanti tocchi]
    for p in punti:
        if gruppi and p / (gruppi[-1][0] / gruppi[-1][1]) - 1 <= TOLLERANZA_LIVELLO:
            gruppi[-1][0] += p
            gruppi[-1][1] += 1
        else:
            gruppi.append([p, 1])
    trovati = [{"prezzo": round(somma / tocchi, 2), "tocchi": tocchi} for somma, tocchi in gruppi]
    # Teniamo i due più vicini al prezzo, da ogni lato (a più dello 0,5% di distanza)
    supporti = [l for l in trovati if l["prezzo"] < prezzo * 0.995][-2:][::-1]
    resistenze = [l for l in trovati if l["prezzo"] > prezzo * 1.005][:2]
    return supporti, resistenze


def frase(t):
    """Riassume i numeri in una frase semplice. Descrive, non consiglia."""
    # 1. Dov'è il prezzo rispetto all'ultimo anno
    if t["dalMassimo"] >= -0.03:
        posizione, zona = "Vicino al massimo dell'anno", "alto"
    elif t["dalMinimo"] <= 0.05:
        posizione, zona = "Vicino al minimo dell'anno", "basso"
    else:
        posizione, zona = f"A {abs(t['dalMassimo']) * 100:.0f}% dal massimo dell'anno".replace(".", ","), "mezzo"

    # 2. La velocità del movimento (RSI)
    valore = t["rsi"]
    if valore is None:
        forza, stato = "RSI non disponibile", "neutro"
    elif valore < 30:
        forza, stato = "RSI basso (è sceso molto in fretta)", "basso"
    elif valore > 70:
        forza, stato = "RSI alto (è salito molto in fretta)", "alto"
    else:
        forza, stato = "RSI nella norma", "neutro"

    # 3. Che cosa se ne può dire, con prudenza
    if zona == "basso" and stato == "basso":
        lettura = "zona di possibile interesse per chi cerca titoli scesi molto, ma il calo può continuare"
    elif zona == "basso":
        lettura = "il titolo è debole e, prima di pensare a un'occasione, conviene capire perché scende"
    elif zona == "alto" and stato == "alto":
        lettura = "il titolo ha corso molto: chi entra adesso compra dopo una lunga salita"
    elif zona == "alto":
        lettura = "il titolo è forte e vicino ai suoi massimi"
    elif stato == "basso":
        lettura = "discesa rapida negli ultimi giorni: possibile rimbalzo, ma non è detto"
    elif stato == "alto":
        lettura = "salita rapida negli ultimi giorni: possibile pausa, ma non è detto"
    else:
        lettura = "nessun segnale particolare"

    # 4. La tendenza (medie mobili)
    if t["mm200"] is None:
        tendenza = "Storia troppo breve per la media a 200 giorni."
    elif t["sopraMm50"] and t["sopraMm200"]:
        tendenza = "Tendenza positiva: il prezzo è sopra le medie a 50 e 200 giorni."
    elif not t["sopraMm50"] and not t["sopraMm200"]:
        tendenza = "Tendenza negativa: il prezzo è sotto le medie a 50 e 200 giorni."
    elif t["sopraMm200"]:
        tendenza = "Tendenza di fondo positiva (sopra la media a 200 giorni), ma debole nel breve (sotto quella a 50)."
    else:
        tendenza = "Tendenza di fondo negativa (sotto la media a 200 giorni), ma in ripresa nel breve (sopra quella a 50)."
    if t["incrocio"] == "rialzo":
        tendenza += " Di recente la media a 50 giorni è salita sopra quella a 200."
    elif t["incrocio"] == "ribasso":
        tendenza += " Di recente la media a 50 giorni è scesa sotto quella a 200."
    return f"{posizione}, {forza}: {lettura}. {tendenza}"


def analizza(giorni, valori, valuta=""):
    """Dai prezzi di chiusura alla scheda tecnica e alla serie per il grafico.
    Restituisce (scheda, serie); (None, None) se i dati sono troppo pochi."""
    if len(valori) < 60:
        return None, None
    mm50, mm200 = media_mobile(valori, 50), media_mobile(valori, 200)
    prezzo = valori[-1]

    # Le ultime 52 settimane, contate sul calendario
    un_anno_fa = (datetime.strptime(giorni[-1], "%Y-%m-%d") - timedelta(days=365)).strftime("%Y-%m-%d")
    inizio = next(i for i, g in enumerate(giorni) if g >= un_anno_fa)
    anno = valori[inizio:]
    massimo, minimo = max(anno), min(anno)

    # La media a 50 giorni ha incrociato quella a 200 negli ultimi 20 giorni di Borsa?
    incrocio = None
    coppie = [(a, b) for a, b in zip(mm50[-21:], mm200[-21:]) if a is not None and b is not None]
    if len(coppie) >= 2:
        prima, adesso = coppie[0][0] > coppie[0][1], coppie[-1][0] > coppie[-1][1]
        if prima != adesso:
            incrocio = "rialzo" if adesso else "ribasso"

    supporti, resistenze = livelli(anno, prezzo)
    scheda = {
        "valuta": valuta,
        "prezzo": round(prezzo, 2),
        "data": giorni[-1],                      # il giorno dell'ultima chiusura usata
        "mm50": round(mm50[-1], 2),
        "mm200": round(mm200[-1], 2) if mm200[-1] is not None else None,
        "sopraMm50": prezzo >= mm50[-1],
        "sopraMm200": prezzo >= mm200[-1] if mm200[-1] is not None else None,
        "incrocio": incrocio,
        "rsi": round(rsi(valori), 1) if rsi(valori) is not None else None,
        "massimo52": round(massimo, 2),
        "minimo52": round(minimo, 2),
        "dalMassimo": round(prezzo / massimo - 1, 4),   # es. -0.18 = 18% sotto il massimo
        "dalMinimo": round(prezzo / minimo - 1, 4),     # es. 0.05 = 5% sopra il minimo
        "supporti": supporti,
        "resistenze": resistenze,
    }
    scheda["frase"] = frase(scheda)

    ultimi = slice(-GIORNI_GRAFICO, None)
    arrotonda = lambda lista: [None if v is None else round(v, 2) for v in lista[ultimi]]
    serie = {"giorni": giorni[ultimi], "prezzo": arrotonda(valori), "mm50": arrotonda(mm50), "mm200": arrotonda(mm200)}
    return scheda, serie
