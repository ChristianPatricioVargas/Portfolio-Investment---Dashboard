"""
avvocato.py = l'AVVOCATO DEL DIAVOLO (i rischi).

Il suo mestiere è cercare i motivi per NON comprare (o per uscire). Per ogni titolo
controlla una lista di regole semplici e accende un "campanello d'allarme" quando
una scatta:

  1. utili in calo, o trimestrale sotto le attese
  2. debito alto, o azienda in perdita
  3. analisti che diventano più negativi (o target e stime abbassati, se la fonte li dà)
  4. prezzo sotto la media a 200 giorni
  5. trimestrale in arrivo (il prezzo può muoversi molto)
  6. notizie con parole negative (indagine, richiamo, causa, guidance tagliata...)

Ogni campanello ha un livello: "alto" (da guardare subito) o "medio" (da tenere d'occhio).
Sono regole meccaniche: nessun campanello NON vuol dire nessun rischio.
"""

import re
from datetime import datetime, timedelta

GIORNI_TRIMESTRALE = 14     # "in arrivo" = entro due settimane
GIORNI_CONFRONTO_TARGET = 30   # confrontiamo il target di oggi con quello di circa un mese fa
GIORNI_STORIA_TARGET = 120  # per quanti giorni ricordiamo i target passati

# Le parole negative da cercare nei titoli delle notizie, in italiano e in inglese.
# \b = "confine di parola": così "causa" non scatta dentro "a causa di" (vedi sotto).
PAROLE_GRAVI = [
    r"frod[ei]", r"fraud", r"scandal[oi]?", r"bancarott\w*", r"bankruptcy", r"falliment\w*",
    r"profit warning", r"allarme utili", r"guidance tagliata", r"tagli\w* (la guidance|le stime|le previsioni)",
    r"cuts? (its )?(guidance|forecast|outlook)", r"lowers? (its )?(guidance|forecast|outlook)", r"guidance cut",
]
PAROLE_NEGATIVE = [
    r"indagin[ei]", r"inchiest[ae]", r"indagat\w*", r"investigation", r"probe",
    r"richiam\w+ (di|del|dei|delle|per|prodott\w+)", r"richiamat\w+", r"maxi[- ]richiamo", r"recalls?", r"ritir\w+ dal mercato",
    r"class action", r"causa (legale|collettiva|contro|da|per)", r"fa(nno)? causa", r"lawsuit", r"sue[sd]",
    r"mult[ae]", r"sanzion\w+", r"fined", r"antitrust",
    r"croll\w+", r"plunges?", r"slumps?", r"tumbles?",
    r"licenziament\w+", r"layoffs?", r"sciopero", r"dimission\w+", r"resigns?",
    r"downgrade\w*", r"declassa\w*", r"bocciat\w+", r"taglia il (rating|giudizio|target)",
    r"in rosso", r"perdit[ae] (record|netta|trimestrale)", r"misses", r"sotto le attese",
    r"attacco (informatico|hacker)", r"data breach", r"hack(ed|er)?", r"difett\w+", r"defects?",
]
CERCA_GRAVI = re.compile(r"\b(" + "|".join(PAROLE_GRAVI) + r")\b", re.IGNORECASE)
CERCA_NEGATIVE = re.compile(r"\b(" + "|".join(PAROLE_NEGATIVE) + r")\b", re.IGNORECASE)


def perc(valore):
    """-0.153 → "−15%" """
    return f"{valore * 100:+.0f}%".replace("-", "−")


def data_italiana(testo):
    """ "2026-11-26" → "26/11/2026" """
    anno, mese, giorno = testo.split("-")
    return f"{giorno}/{mese}/{anno}"


def campanello(tipo, livello, titolo, testo):
    return {"tipo": tipo, "livello": livello, "titolo": titolo, "testo": testo}


def aggiorna_storia_target(storia, target, oggi):
    """Segna il target di oggi e butta via quelli troppo vecchi. Serve per accorgersi dei ribassi."""
    storia = dict(storia or {})
    if target:
        storia[oggi] = target
    limite = (datetime.strptime(oggi, "%Y-%m-%d") - timedelta(days=GIORNI_STORIA_TARGET)).strftime("%Y-%m-%d")
    return {giorno: valore for giorno, valore in sorted(storia.items()) if giorno >= limite}


def variazione_target(storia, oggi):
    """Di quanto è cambiato il target medio rispetto a circa un mese fa.
    Se la storia è più corta di una settimana non diciamo niente."""
    if not storia or oggi not in storia:
        return None
    un_mese_fa = (datetime.strptime(oggi, "%Y-%m-%d") - timedelta(days=GIORNI_CONFRONTO_TARGET)).strftime("%Y-%m-%d")
    una_settimana_fa = (datetime.strptime(oggi, "%Y-%m-%d") - timedelta(days=7)).strftime("%Y-%m-%d")
    giorni = sorted(storia)
    prima = [g for g in giorni if g <= un_mese_fa]
    riferimento = prima[-1] if prima else giorni[0]     # il più vicino a un mese fa, o il più vecchio che abbiamo
    if riferimento > una_settimana_fa or not storia[riferimento]:
        return None
    return storia[oggi] / storia[riferimento] - 1


def regole_utili(f):
    trovati = []
    attesa, ultimo, ricavi = f.get("crescitaUtiliAttesa"), f.get("crescitaUtili"), f.get("crescitaRicavi")
    if attesa is not None and attesa < -0.02:      # sotto il −2%: variazioni più piccole non sono un segnale
        trovati.append(campanello("utili", "alto", "Utili attesi in calo",
                                  f"Gli analisti si aspettano utili in calo ({perc(attesa)})."))
    if ultimo is not None and ultimo < -0.02:
        trovati.append(campanello("utili", "alto" if ultimo <= -0.2 else "medio", "Utili in calo",
                                  f"Nell'ultimo trimestre gli utili sono scesi ({perc(ultimo)} su un anno prima)."))
    if ricavi is not None and ricavi < -0.02:
        trovati.append(campanello("utili", "medio", "Ricavi in calo",
                                  f"Nell'ultimo trimestre i ricavi sono scesi ({perc(ricavi)} su un anno prima)."))
    sorprese = f.get("sorprese") or []
    if sorprese and sorprese[-1]["effettivo"] < sorprese[-1]["atteso"]:
        sotto = sum(1 for s in sorprese if s["effettivo"] < s["atteso"])
        trovati.append(campanello("trimestrale", "alto" if sotto >= 2 else "medio", "Trimestrale sotto le attese",
                                  f"Nell'ultima trimestrale gli utili sono stati sotto le attese degli analisti"
                                  + (f" ({sotto} volte nelle ultime {len(sorprese)})." if sotto >= 2 else ".")))
    return trovati


def regole_debito(f):
    trovati = []
    margine = f.get("margineNetto")
    if margine is not None and margine < 0:
        trovati.append(campanello("debito", "alto", "Azienda in perdita", "Negli ultimi 12 mesi l'azienda ha chiuso in perdita."))
    if f.get("finanziario"):
        return trovati      # banche e assicurazioni: il debito non si giudica così
    anni, capitale = f.get("debitoNettoSuEbitda"), f.get("debitoSuCapitale")
    if anni is not None and anni > 2:
        trovati.append(campanello("debito", "alto" if anni > 3 else "medio", "Debito alto" if anni > 3 else "Debito da tenere d'occhio",
                                  f"Il debito netto vale {anni:.1f} anni di guadagni operativi (EBITDA).".replace(".", ",", 1)))
    elif anni is None and capitale is not None and capitale > 1.5:
        trovati.append(campanello("debito", "medio", "Debito alto",
                                  f"I debiti sono il {capitale * 100:.0f}% del capitale dei soci."))
    return trovati


def regole_analisti(f, storia_target, oggi):
    trovati = []
    cambio = variazione_target(storia_target, oggi)
    if cambio is not None and cambio <= -0.05:
        trovati.append(campanello("target", "alto" if cambio <= -0.10 else "medio", "Target degli analisti abbassato",
                                  f"Il target medio è sceso del {abs(cambio) * 100:.0f}% nell'ultimo mese."))
    revisione = f.get("revisioneStime")
    if revisione is not None and revisione <= -0.05:
        trovati.append(campanello("target", "alto" if revisione <= -0.10 else "medio", "Stime sugli utili tagliate",
                                  f"Negli ultimi 90 giorni gli analisti hanno abbassato le stime sugli utili dell'anno ({perc(revisione)})."))
    potenziale = f.get("potenziale")
    if potenziale is not None and potenziale < 0:
        trovati.append(campanello("target", "medio", "Prezzo sopra il target",
                                  f"Il prezzo ha già superato il target medio degli analisti (il target è il {abs(potenziale) * 100:.0f}% più in basso)."))
    voto, prima = f.get("raccomandazione"), f.get("raccomandazionePrima")
    if voto is not None and prima is not None and voto - prima >= 0.15:
        trovati.append(campanello("target", "medio", "Analisti più freddi",
                                  f"Nell'ultimo mese il giudizio medio degli analisti è peggiorato "
                                  f"(da {prima:.1f} a {voto:.1f} su 5, dove 1 è il più positivo).".replace(".", ",", 2)))
    positivi, totale = f.get("analistiPositivi"), f.get("analisti")
    if positivi is not None and totale and totale >= 5 and positivi / totale < 0.4:
        trovati.append(campanello("target", "medio", "Pochi analisti positivi",
                                  f"Solo {int(positivi)} analisti su {int(totale)} hanno un giudizio positivo."))
    if voto is not None and voto > 3:
        trovati.append(campanello("target", "medio", "Analisti freddi",
                                  f"La raccomandazione media è {voto:.1f} su 5 (sopra 3 prevalgono i giudizi negativi).".replace(".", ",", 1)))
    return trovati


def regole_tecniche(t):
    if not t or t.get("sopraMm200") is not False:
        return []
    testo = "Il prezzo è sotto la media degli ultimi 200 giorni: la tendenza di fondo è negativa."
    if t.get("incrocio") == "ribasso":
        testo += " Di recente anche la media a 50 giorni è scesa sotto quella a 200."
    return [campanello("tecnica", "medio", "Sotto la media a 200 giorni", testo)]


def regola_trimestrale(f, oggi):
    data = f.get("prossimaTrimestrale")
    if not data:
        return []
    giorni = (datetime.strptime(data, "%Y-%m-%d") - datetime.strptime(oggi, "%Y-%m-%d")).days
    if not 0 <= giorni <= GIORNI_TRIMESTRALE:
        return []
    circa = "circa il " if f.get("trimestraleStimata") else "il "
    return [campanello("calendario", "medio", "Trimestrale in arrivo",
                       f"La prossima trimestrale è attesa {circa}{data_italiana(data)}: in quei giorni il prezzo può muoversi molto.")]


def regola_notizie(notizie):
    """Cerca le parole negative nei titoli delle notizie. Riporta i titoli, così giudichi tu."""
    gravi = [n["titolo"] for n in notizie or [] if CERCA_GRAVI.search(n.get("titolo", ""))]
    negative = [n["titolo"] for n in notizie or [] if CERCA_NEGATIVE.search(n.get("titolo", "")) and n["titolo"] not in gravi]
    trovate = gravi + negative
    if not trovate:
        return []
    elenco = " · ".join(f"«{titolo}»" for titolo in trovate[:3])
    altre = f" (e altre {len(trovate) - 3})" if len(trovate) > 3 else ""
    return [campanello("notizie", "alto" if gravi else "medio", "Notizie da leggere",
                       f"Titoli con parole negative: {elenco}{altre}.")]


def controlla(scheda, notizie, oggi):
    """Tutti i campanelli di un titolo: prima quelli di livello alto."""
    f = scheda.get("fondamentali") or {}
    trovati = []
    if scheda.get("tipo") == "Azione" and f:
        trovati += regole_utili(f) + regole_debito(f) + regole_analisti(f, scheda.get("storiaTarget"), oggi)
        trovati += regola_trimestrale(f, oggi)
    trovati += regole_tecniche(scheda.get("tecnica"))
    trovati += regola_notizie(notizie)
    return sorted(trovati, key=lambda c: c["livello"] != "alto")     # l'ordine tra pari livello resta quello delle regole
