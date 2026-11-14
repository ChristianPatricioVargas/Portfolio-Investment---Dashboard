"""
La "squadra di agenti" della dashboard. Ogni file è un agente con un compito solo:

  yahoo.py         il fattorino: va a prendere i dati grezzi da Yahoo Finance
  fondamentale.py  l'analista fondamentale: i conti dell'azienda (il "se")
  tecnico.py       l'analista tecnico: l'andamento del prezzo (il "quando")
  cacciatore.py    il cacciatore: cerca occasioni nella watchlist
  avvocato.py      l'avvocato del diavolo: i campanelli d'allarme (i rischi)
  avvocato_ai.py   la versione con AI dell'avvocato (spenta finché non crei il segreto)

Il "direttore" che li fa lavorare in ordine è scripts/aggiorna_analisi.py.
Nessun agente conosce i tuoi dati personali: lavorano solo su dati pubblici.
"""
