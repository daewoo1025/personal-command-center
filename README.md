# Personal Command Center

Private finance + life tracker built as a **Google Apps Script** web app backed by **Google Sheets** and Drive.

This GitHub repo is meant to be **public-safe**: real Sheet / Drive / script IDs and allowlisted emails stay on your machine only.

## What it does

- Overview KPIs (liquid cash, goals, investments, net cash vs cards)
- Accounts, transactions, transfers, remittances
- Credit cards as **debt** (not cash you have)
- Loans, budgets, goals, rent cheques, installments, subscriptions
- Documents / credentials / phones vault views
- Live FX via Sheets `GOOGLEFINANCE` (Settings hold offline fallbacks only)
- Sync app state ↔ Sheets; weekly backup hooks in Apps Script

## Secrets (local only)

| Local file (gitignored) | Committed sample |
|-------------------------|------------------|
| `Config.gs` | `Config.gs.example` |
| `.clasp.json` | `.clasp.json.example` |

```powershell
copy Config.gs.example Config.gs
copy .clasp.json.example .clasp.json
# edit both files with your real IDs / emails / scriptId
```

Never commit `Config.gs`, `.clasp.json`, `.clasprc.json`, or `.env*`.

## Repo layout

| File | Role |
|------|------|
| `Config.gs.example` | Dummy Sheet/Drive/allowlist values |
| `Code.gs` | Apps Script backend (`doGet`, Sheets sync, Drive, alerts) |
| `command_center.html` | Full UI + client logic (`APP_VERSION` lives here) |
| `appsscript.json` | Manifest (timezone, OAuth scopes, web app access) |
| `.clasp.json.example` | Sample clasp project link |
| `DEPLOY.md` | GitHub + clasp ship checklist |

## Prerequisites

- Node.js 18+ and [clasp](https://github.com/google/clasp): `npm i -g @google/clasp`
- A Google account + Apps Script project + Sheet + Drive folders you own
- `clasp login` once on this machine

## Quick start

```powershell
git clone https://github.com/daewoo1025/personal-command-center.git
cd personal-command-center
copy Config.gs.example Config.gs
copy .clasp.json.example .clasp.json
# fill real values in Config.gs and .clasp.json
clasp login
clasp push
clasp deploy -d "vX.Y.Z first deploy"
```

Then open the web-app URL from Apps Script → **Deploy → Manage deployments**. Hard-refresh until the UI shows your `APP_VERSION`.

Run `shareAccessWithAllowedUsers` once (as owner) so allowlisted accounts can edit the Sheet and Drive folders. Run `initializeDatabase` once if tabs are missing.

## Money model (credit cards)

- Account type `credit` is **never** counted in Liquid Cash.
- Negative card balances feed **Credit Due** (money you owe).
- **Net cash position** = liquid + allotted goals + investments/MP2 − credit due.
- Goal funding cannot debit a credit card.

Store card debt as a **negative** balance (UI shows “due”).

## Contributing / feedback

- **Issues** are welcome — use them to highlight bugs or suggest fixes.
- Do **not** push to `main`. Open a pull request from a fork/branch; `main` is protected.
- Keep secrets out of PRs (no real Sheet/Drive/script IDs or emails).

## Versioning & ship

Bump `APP_VERSION` in `command_center.html` before every ship. Full checklist: **[DEPLOY.md](./DEPLOY.md)**.
