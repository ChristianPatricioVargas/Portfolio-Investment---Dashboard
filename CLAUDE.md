# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Personal investment-portfolio dashboard: a static site (GitHub Pages, used mostly from iPad/phone) whose public data is produced by Python scripts run in GitHub Actions. The README (in Italian) is the authoritative, detailed spec of every page, rule and threshold — read the relevant section before changing behaviour.

## Conventions

- **Everything is in Italian**: identifiers, comments, UI text, commit messages, PR titles. Comments are written in plain language for a non-expert owner (explain the "why", avoid jargon). Keep this style.
- **No dependencies, no build step.** Plain JS (classic `<script>` tags, no modules/bundler/npm) and plain Python stdlib. The only exceptions: `librerie/lightweight-charts-5.2.1.js` (vendored, Apache 2.0 — the TradingView attribution link at the bottom of each page must stay) and the `anthropic` pip package, installed only when the AI is on.
- **Privacy split is a hard rule.** Personal data (purchases, theses, hidden watchlist items, chart drawings) lives only in browser `localStorage` and the manual backup. Python agents and the AI see only public data — never quantities, amounts or theses.
- **Agents never say "buy"/"sell"**: they flag and explain; the decision stays with the user.
- When behaviour changes, update the README accordingly (it documents thresholds, formulas, data sources and the roadmap).

## Commands

```bash
python3 scripts/prova_agenti.py              # offline unit tests of all agents (fake data, no network)
python3 scripts/prova_agenti.py --dal-vivo   # + live check of Yahoo/Finnhub (needs internet, FINNHUB_API_KEY)

# run a single test (tests are plain functions listed in PROVE)
cd scripts && python3 -c "import prova_agenti as p; p.prova_cacciatore()"

python3 scripts/aggiorna_prezzi.py           # prices, history, news, ntfy alerts → data/*.json
python3 scripts/aggiorna_analisi.py          # run all agents → data/analisi.json, serie.json, ai.json, grafici/
python3 scripts/aggiorna_analisi.py --se-vecchia   # only if the analysis is missing/stale

SIGLE="RO.SW ROG.SW" python3 scripts/trova_sigla.py   # which Yahoo tickers exist

python3 -m http.server   # serve the page locally (needs generated data/*.json to show anything)
```

The `anthropic` package is needed to import `avvocato_ai` in tests (`pip install "anthropic>=2.8,<3"`); tests use a fake Claude, no real calls. There is no linter configured.

## Architecture

**Two halves joined by JSON files in `data/`.**

1. **Backend (Python, `scripts/`)** — runs in `.github/workflows/pubblica-sito.yml` every 30 min on weekdays (prices) and twice a day (agents). The generated files (`prezzi`, `storico`, `intraday`, `notizie`, `allarmi`, `analisi`, `serie`, `ai`.json and `grafici/<ticker>.json`) are **gitignored and never committed**: each run downloads the previous ones from the *published site*, updates them, and redeploys. `grafici/` travels between runs as `data/grafici.tar.gz`. Only `data/titoli.json` (portfolio tickers, Xetra EUR symbol + `usa` US symbol for Finnhub + news keywords) and `data/watchlist.json` are in git.
   - `aggiorna_analisi.py` is the "director": calls the agents in `scripts/agenti/` in order. Fetchers (`yahoo.py` prices, `finnhub.py` fundamentals) are isolated — only `finnhub.py` and `fondamentale.py` know Finnhub's data shape. Each agent (`fondamentale`, `tecnico`, `cacciatore`, `avvocato`, `avvocato_ai`) is pure computation on fetched data, which is what makes the fake-data tests possible.
   - Robustness: a failing source must not break the site — steps are `continue-on-error`, and the previous day's analysis is kept. The site is not republished if `prezzi.json` is missing.
   - AI devil's advocate is off unless the `ANTHROPIC_API_KEY` secret exists; spend limits come from repo Variables (`AI_MODELLO`, `AI_CHIAMATE_AL_GIORNO`, `AI_BUDGET_MENSILE_USD`) and the counter in `data/ai.json`.

2. **Frontend (`index.html`, `style.css`, `app.js`, `agenti/*.js`)** — all scripts share the global scope, loaded in order: the chart library, then `agenti/*.js` (each defines `disegnaXxx()` functions for one agent's part of the page, mirroring the Python agent of the same name), then `app.js` last. `app.js` owns state (global `let`s: `titoli`, `prezzi`, `posizioni`, `analisi`, `tesi`…), localStorage persistence (`portafoglio-v2`, with migration from v1), portfolio math, and view switching (`disegnaVista()` → Oggi / Portafoglio / Occasioni / Titolo). `agenti/grafico.js` wraps Lightweight Charts (zoom, periods, moving averages, purchase dots, comparison, drawings); `agenti/oggi.js` builds the home page and the "Copia per l'analisi" text.
   - Cache-busting: the deploy step `sed`s `?v=<sha>` onto `style.css`, `app.js` and `agenti/*.js` references in `index.html`. A new JS file must match that regex (`agenti/[a-z]+.js`) and must also be copied into `_site` by the workflow if it lives in a new folder.

## CI

- `prova-agenti.yml`: runs the offline tests + live source check on PRs touching `scripts/**`, `data/watchlist.json`, `data/titoli.json`; manual run accepts Yahoo tickers to probe.
- `pubblica-sito.yml`: deploys on push to `main`, on schedule, or manually (options: test ntfy notification, force agents run).
- `confronta-borse.yml`: manual price comparison across German exchanges.

Work is merged via PRs from `claude/...` branches into `main`.

## Lavoro in locale (portatile Windows con WSL)

- **Prima di iniziare**: fai sempre `git pull`, così parti dall'ultima versione ed eviti conflitti.
- **Mai su `main`**: lavora sempre su un ramo `claude/...`; `main` riceve le modifiche solo tramite PR.
- **Vedere la pagina in locale**: servono i file `data/*.json`, ma sono ignorati da git, quindi non li trovi dopo un `git pull`. Scaricali dal sito pubblicato oppure generali con gli script (`aggiorna_prezzi.py`, `aggiorna_analisi.py`) *prima* di lanciare `python3 -m http.server`; senza, la pagina resta vuota.
- **Prima di aprire una PR**: esegui `python3 scripts/prova_agenti.py` e controlla che tutti i test passino.
- **Funzioni grosse**: usa `/feature-dev`, che guida passo passo dall'analisi del codice esistente al progetto della modifica.
