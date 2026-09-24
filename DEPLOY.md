# Deploy guide — Personal Command Center

Ship order: **sanitize locally → GitHub branch/PR → clasp push (with local Config.gs) → clasp deploy → verify version**.

## One-time machine setup

```powershell
npm i -g @google/clasp
clasp login
cd path\to\personal-command-center
copy Config.gs.example Config.gs
copy .clasp.json.example .clasp.json
# edit Config.gs + .clasp.json with REAL values (never commit them)
clasp status
```

`clasp status` should list:

- `appsscript.json`
- `Config.gs` (local only)
- `Code.gs`
- `command_center.html`

## Secrets policy

| Committed (dummy) | Local only (real) |
|-------------------|-------------------|
| `Config.gs.example` | `Config.gs` |
| `.clasp.json.example` | `.clasp.json` |

Do not paste real spreadsheet IDs, Drive folder IDs, script IDs, deployment IDs, or allowlist emails into git, issues, or PR descriptions.

## GitHub workflow

### Branch

```powershell
git checkout main
git pull origin main
git checkout -b feature/short-name   # or fix/… / chore/…
```

Never commit feature work directly on `main`. Never force-push `main` unless you are intentionally rewriting public history after a secret leak.

### Commit (no Cursor co-author)

```powershell
git add -A
git status   # confirm Config.gs and .clasp.json are NOT staged
@"
Short summary of why this ships.

Optional second sentence with context.
"@ | git commit -F -
git log -1 --format='%B'   # confirm no Co-authored-by: Cursor line
```

### Push + PR

```powershell
git push -u origin HEAD
gh pr create --title "Short title" --body "## Summary`n- …`n`n## Test plan`n- [ ] Hard-refresh shows new APP_VERSION`n- [ ] Overview / Sheets load`n- [ ] No secrets in the diff"
```

Outsiders should open **Issues** to highlight errors. Merges to `main` stay owner-controlled via branch protection.

## Apps Script deploy (clasp)

### 1. Bump version

In `command_center.html`:

```js
const APP_VERSION='1.0.62';
```

### 2. Push source (includes local Config.gs)

```powershell
clasp push
```

### 3. Versioned web-app deployment

```powershell
clasp deployments
clasp deploy -i YOUR_WEBAPP_DEPLOYMENT_ID -d "v1.0.62 short description"
```

Or create a new deployment (new URL):

```powershell
clasp deploy -d "v1.0.62 short description"
```

### 4. Verify

1. Open the web-app URL from **Deploy → Manage deployments**.
2. Hard refresh (or private window).
3. Confirm version `v1.0.62` (or whatever you set).
4. Unlock → Overview paints; Sheets load; liquid excludes credit cards.

## First-time Google setup

1. Create Sheet + Drive folders; put IDs in `Config.gs`.
2. Create Apps Script project; put `scriptId` in `.clasp.json`.
3. `clasp push` then **Deploy → New deployment → Web app**
   - Execute as: **User accessing the web app**
   - Who has access: as needed for your privacy model
4. Run `shareAccessWithAllowedUsers` once as owner.
5. Run `initializeDatabase` once if tabs are missing.

## Rollback

```powershell
git checkout <good-sha>
clasp push
clasp deploy -i YOUR_WEBAPP_DEPLOYMENT_ID -d "rollback vX.Y.Z"
```

## Checklist (copy into PR)

- [ ] On a feature/fix/chore branch (not direct `main` commit)
- [ ] `Config.gs` / `.clasp.json` not in the diff
- [ ] `APP_VERSION` bumped
- [ ] Commit has **no** Cursor co-author trailer
- [ ] Branch pushed; PR opened
- [ ] `clasp push` + versioned `clasp deploy` (owner machine)
- [ ] Hard refresh shows new version
