# Personal Command Center

A password-gated **Google Apps Script** web app for UAE + Philippines personal finance and life admin — backed by **Google Sheets** and Drive. Built for phone and desktop.

This repo is **public-safe**: real Sheet / Drive / script IDs and allowlisted emails stay in local-only files (`Config.gs`, `.clasp.json`).

## Interface

- **Login gate** — app password unlock; allowlisted Google accounts only
- **Overview dashboard** — KPI cards, cashflow chart, account balances chart, reminders, budgets/goals
- **Drag-and-drop Overview layout** — show/hide panels; rearrange what you see first
- **Money workspace** — accounts, transactions, transfers, remittances with live FX awareness
- **Obligations** — credit cards, loans (lent / owed / monthly), rent cheques, installments, subscriptions
- **Vault views** — documents (expiry radar), credentials, phones
- **Settings** — base currency, FX fallbacks, employment/gratuity inputs, dropdown catalogs, sample profiles
- **Sheets sync status** — load/sync banners, version stamp, retry when Google is slow

## Features

- **Liquid cash vs debt** — checking/savings/e-wallets count as cash; credit cards count as money you **owe**, not money you have
- **Net cash position** — liquid + allotted goals + investments/MP2 − credit due
- **Goals allotment** — funding a goal pulls cash out of liquid so free-to-spend stays honest
- **Multi-currency** — AED / PHP / USD with live `GOOGLEFINANCE` FX (Settings keep offline fallbacks)
- **Remittances** — AED→PHP sends with fees, effective rate, and automatic account balance updates
- **Loans ledger** — receivables, payables, monthly outs, payments/charges, person-level offsets
- **UAE rent cheques** — uncleared cheque totals and due reminders
- **Installments & subscriptions** — monthly obligation rollups on Overview
- **UAE gratuity (EOSB) estimate** — from basic salary + employment start date
- **Document compliance** — expiry badges; optional daily email radar for docs, cheques, loans
- **Drive uploads & backups** — photo/PDF upload to Drive; spreadsheet backup hook
- **Email allowlist** — only configured Google accounts can open the web app

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

- Account type `credit` is **never** counted in Liquid Cash
- Negative card balances feed **Credit Due** (what you owe)
- **Net cash position** = liquid + allotted goals + investments/MP2 − credit due
- Goal funding cannot debit a credit card

Store card debt as a **negative** balance (UI shows “due”).

## Contributing / feedback

- **Issues** are welcome — use them to highlight bugs or suggest fixes
- Do **not** push to `main`. Open a pull request from a fork/branch; `main` is protected
- Keep secrets out of PRs (no real Sheet/Drive/script IDs or emails)

## Versioning & ship

Bump `APP_VERSION` in `command_center.html` before every ship. Full checklist: **[DEPLOY.md](./DEPLOY.md)**.
