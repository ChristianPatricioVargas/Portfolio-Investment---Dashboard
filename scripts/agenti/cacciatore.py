"""
cacciatore.py = il CACCIATORE (le occasioni).

Guarda le grandi aziende della watchlist (data/watchlist.json) e segnala quelle
che rispettano i criteri della strategia "comprare titoli solidi scesi molto":

  1. CALO        scesa di almeno il 15% dal massimo delle ultime 52 settimane
  2. UTILI       utili in crescita (attesi dagli analisti, o nell'ultimo trimestre)
  3. CONTI       conti solidi: in utile e con un debito sostenibile
  4. TARGET      target medio degli analisti almeno il 15% sopra il prezzo

Chi li rispetta tutti e quattro entra in classifica, ordinato per punteggio.
Il cacciatore segnala e spiega il perché: non dice mai "compra". Decidi tu.
"""

# Le soglie dei criteri: per cambiarle basta cambiare questi numeri
CRITERI = {
    "caloMinimo": 0.15,            # almeno −15% dal massimo a 52 settimane
    "potenzialeMinimo": 0.15,      # target almeno +15% sopra il prezzo
    "analistiMinimi": 5,           # con meno analisti il target medio è poco affidabile
    "debitoSuEbitdaMassimo": 3.0,  # debito netto non oltre 3 anni di guadagni operativi
    "debitoSuCapitaleMassimo": 1.5,  # usato solo se manca il dato sopra
}


def perc(valore, segno=True):
    """0.153 → "+15%" """
    testo = f"{valore * 100:+.0f}%" if segno else f"{abs(valore) * 100:.0f}%"
    return testo


def criterio_calo(fondamentali, tecnica):
    dal_massimo = (tecnica or {}).get("dalMassimo")
    if dal_massimo is None and fondamentali.get("massimo52") and fondamentali.get("prezzo"):
        dal_massimo = fondamentali["prezzo"] / fondamentali["massimo52"] - 1
    if dal_massimo is None:
        return None, "calo dal massimo non disponibile", 0
    ok = dal_massimo <= -CRITERI["caloMinimo"]
    testo = f"{perc(dal_massimo)} dal massimo dell'anno" if dal_massimo < -0.005 else "è sui massimi dell'anno"
    # Più è scesa, più punti (fino a −40%)
    return ok, testo, min(-dal_massimo, 0.40) / 0.40 * 30


def criterio_utili(f):
    attesa, ultimo = f.get("crescitaUtiliAttesa"), f.get("crescitaUtili")
    if attesa is None and ultimo is None:
        return None, "crescita degli utili non disponibile", 0
    if attesa is not None and attesa > 0:
        testo = f"utili attesi in crescita ({perc(attesa)})"
    elif ultimo is not None and ultimo > 0:
        testo = f"utili dell'ultimo trimestre in crescita ({perc(ultimo)})"
    else:
        peggiore = attesa if attesa is not None else ultimo
        return False, f"utili in calo ({perc(peggiore)})", 0
    migliore = max(v for v in (attesa, ultimo) if v is not None)
    return True, testo, min(max(migliore, 0), 0.30) / 0.30 * 20


def criterio_conti(f):
    margine = f.get("margineNetto")
    if margine is None:
        return None, "margini non disponibili", 0
    if margine <= 0:
        return False, "l'azienda è in perdita", 0
    if f.get("finanziario"):
        # Banche e assicurazioni: il debito è la loro materia prima, guardiamo solo se guadagnano
        return True, f"in utile (margine netto {perc(margine, False)}); settore finanziario, debito non confrontabile", 8
    anni, capitale = f.get("debitoNettoSuEbitda"), f.get("debitoSuCapitale")
    if anni is not None:
        if anni > CRITERI["debitoSuEbitdaMassimo"]:
            return False, f"debito alto ({anni:.1f} volte l'EBITDA)".replace(".", ","), 0
        if anni <= 0:
            return True, "più cassa che debiti", 15
        punti = 15 if anni <= 1 else 10 if anni <= 2 else 5
        return True, f"debito sostenibile ({anni:.1f} volte l'EBITDA)".replace(".", ","), punti
    if capitale is not None:
        if capitale > CRITERI["debitoSuCapitaleMassimo"]:
            return False, f"debito alto ({perc(capitale, False)} del capitale)", 0
        return True, f"debito sostenibile ({perc(capitale, False)} del capitale)", 8
    return None, "dati sul debito non disponibili", 0


def criterio_target(f):
    potenziale, analisti = f.get("potenziale"), f.get("analisti")
    if potenziale is None:
        return None, "target degli analisti non disponibile", 0
    if (analisti or 0) < CRITERI["analistiMinimi"]:
        return False, f"solo {int(analisti or 0)} analisti: target poco affidabile", 0
    ok = potenziale >= CRITERI["potenzialeMinimo"]
    testo = f"target medio di {int(analisti)} analisti a {perc(potenziale)}"
    return ok, testo, (min(max(potenziale, 0), 0.50) / 0.50 * 35 if ok else 0)


def valuta(fondamentali, tecnica):
    """Controlla i quattro criteri su un titolo.
    Ogni criterio ha "ok": True (rispettato), False (non rispettato) o None (dato mancante)."""
    f = fondamentali or {}
    esiti = [
        ("calo", "Scesa dai massimi", criterio_calo(f, tecnica)),
        ("utili", "Utili in crescita", criterio_utili(f)),
        ("conti", "Conti solidi", criterio_conti(f)),
        ("target", "Target degli analisti", criterio_target(f)),
    ]
    criteri = [{"chiave": chiave, "nome": nome, "ok": ok, "testo": testo} for chiave, nome, (ok, testo, _) in esiti]
    rispettati = sum(1 for c in criteri if c["ok"])
    punteggio = round(sum(punti for _, _, (ok, _, punti) in esiti if ok))
    frasi = [c["testo"] for c in criteri if c["ok"]]
    motivo = ", ".join(frasi) + "." if frasi else ""
    return {"criteri": criteri, "rispettati": rispettati, "punteggio": punteggio, "motivo": motivo}


def classifica(schede):
    """Dalle schede di tutti i titoli tira fuori due liste di sigle (solo dalla watchlist):
       - chi rispetta tutti e 4 i criteri, dal punteggio più alto
       - chi ne rispetta 3 su 4 ("ci va vicino")"""
    candidati = [(t, s["cacciatore"]) for t, s in schede.items()
                 if s.get("gruppo") == "watchlist" and s.get("cacciatore")]
    ordina = lambda lista: [t for t, _ in sorted(lista, key=lambda x: (-x[1]["punteggio"], x[0]))]
    return (ordina([c for c in candidati if c[1]["rispettati"] == 4]),
            ordina([c for c in candidati if c[1]["rispettati"] == 3]))
