/**
 * Personal Command Center - Backend Engine (Code.gs)
 * Web App serving, Sheets sync, Drive photo upload, weekly backups, due-date alerts, loans ledger.
 *
 * Secrets live in Config.gs (gitignored). Copy Config.gs.example → Config.gs locally.
 */

function assertConfig_() {
  if (typeof CONFIG === 'undefined' || !CONFIG || !CONFIG.SPREADSHEET_ID) {
    throw new Error('Missing Config.gs. Copy Config.gs.example to Config.gs and set your Sheet/Drive IDs.');
  }
}

function allowedEmailsList_() {
  assertConfig_();
  return (CONFIG.ALLOWED_EMAILS || []).map(function (e) { return String(e).toLowerCase().trim(); }).filter(Boolean);
}

function getViewerEmail_() {
  var email = '';
  try {
    email = String(Session.getActiveUser().getEmail() || '').toLowerCase().trim();
  } catch (e) {
    email = '';
  }
  return email;
}

function assertAllowedUser_() {
  var email = getViewerEmail_();
  var allowed = allowedEmailsList_();
  if (!email || allowed.indexOf(email) === -1) {
    throw new Error('Access denied. This Command Center is private.');
  }
  return email;
}

/** Client breadcrumb for Executions (no secrets). */
function clientDebugPing(stage, detailJson) {
  var detail = '';
  try {
    detail = String(detailJson || '').slice(0, 900);
  } catch (e) {
    detail = '';
  }
  console.log('[clientDebugPing]', String(stage || ''), detail);
  Logger.log('[clientDebugPing] ' + String(stage || '') + ' ' + detail);
  return { ok: true, stage: String(stage || '') };
}

/** Client probe — why Sheets load/sync may be blocked (no secrets). */
function getAuthProbe() {
  var email = getViewerEmail_();
  var out = {
    ok: false,
    hasEmail: !!email,
    allowed: false,
    spreadsheet: '',
    error: ''
  };
  try {
    assertAllowedUser_();
    out.allowed = true;
  } catch (err) {
    out.error = String(err && err.message ? err.message : err);
    if (!email) {
      out.error = 'Google did not return your email (common with multiple Google accounts). Sign in with an allowlisted account, then reopen.';
    }
    return out;
  }
  try {
    var ss = getSpreadsheet_();
    out.spreadsheet = ss ? String(ss.getName() || '') : '';
    out.ok = true;
  } catch (err2) {
    out.error = 'Spreadsheet: ' + String(err2 && err2.message ? err2.message : err2);
  }
  return out;
}

function accessDeniedHtml_() {
  var email = getViewerEmail_();
  var allowed = allowedEmailsList_();
  var allowedHint = allowed.length
    ? ('Allowed accounts are configured by the owner (' + allowed.length + ' email(s)).')
    : 'No allowlisted emails are configured.';
  var signedIn = email
    ? ('Signed in as <b>' + email + '</b>, which is not on the allowlist.')
    : 'Google did not return your email. Sign in with an allowlisted Google account in a private window, then reopen the link.';
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Access Denied</title></head><body style="font-family:system-ui;padding:2rem;max-width:28rem;margin:auto">' +
    '<h1 style="font-size:1.25rem">Access denied</h1>' +
    '<p>' + signedIn + '</p>' +
    '<p>' + allowedHint + '</p>' +
    '</body></html>'
  ).setTitle('Access Denied');
}

/**
 * Run once (as owner) so both allowlisted accounts can use Sheet + Drive when the web app runs as the visitor.
 */
function shareAccessWithAllowedUsers() {
  assertConfig_();
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var folderIds = [
    CONFIG.DRIVE_ROOT_FOLDER_ID,
    CONFIG.PHOTOS_FOLDER_ID,
    CONFIG.BACKUPS_FOLDER_ID
  ];
  var results = [];
  CONFIG.ALLOWED_EMAILS.forEach(function (email) {
    try {
      ss.addEditor(email);
      results.push({ target: 'sheet', email: email, ok: true });
    } catch (err) {
      results.push({ target: 'sheet', email: email, ok: false, error: String(err.message || err) });
    }
    folderIds.forEach(function (folderId) {
      try {
        DriveApp.getFolderById(folderId).addEditor(email);
        results.push({ target: folderId, email: email, ok: true });
      } catch (err2) {
        results.push({ target: folderId, email: email, ok: false, error: String(err2.message || err2) });
      }
    });
  });
  return results;
}

function doGet(e) {
  try {
    assertAllowedUser_();
  } catch (err) {
    return accessDeniedHtml_();
  }
  return HtmlService.createHtmlOutputFromFile('command_center')
    .setTitle('Personal Command Center | UAE & PH')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, viewport-fit=cover')
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getSpreadsheet_() {
  assertConfig_();
  try {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  } catch (err) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

function getConfig() {
  assertConfig_();
  return {
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    driveRootFolderId: CONFIG.DRIVE_ROOT_FOLDER_ID,
    photosFolderId: CONFIG.PHOTOS_FOLDER_ID,
    backupsFolderId: CONFIG.BACKUPS_FOLDER_ID,
    photosFolderUrl: CONFIG.PHOTOS_FOLDER_URL,
    backupsFolderUrl: CONFIG.BACKUPS_FOLDER_URL,
    driveRootUrl: CONFIG.DRIVE_ROOT_URL
  };
}

/**
 * Create all required sheet tabs + headers if missing.
 */
function initializeDatabase() {
  var ss = getSpreadsheet_();
  var schemas = {
    Accounts: ['Account_ID', 'Name', 'Type', 'Currency', 'Balance', 'Card_Last4', 'Cutoff_Day', 'Due_Day', 'Credit_Limit'],
    Transactions: ['Trans_ID', 'Date', 'Type', 'Amount', 'Currency', 'Category', 'Account_ID', 'Dest_Account', 'Notes'],
    Documents: ['Doc_ID', 'Title', 'Category', 'Doc_Number', 'Issuer', 'Issue_Date', 'Expiry_Date', 'Drive_URL'],
    Rent_Cheques: ['Cheque_ID', 'Cheque_Number', 'Drawn_Bank', 'Payee', 'Amount_AED', 'Due_Date', 'Cleared', 'Account_ID'],
    Remittances: ['Remit_ID', 'Date', 'Sent_AED', 'Received_PHP', 'Fee_AED', 'Effective_FX', 'Provider', 'Source_ACC', 'Dest_ACC', 'MTCN_Ref'],
    Installments: ['ID', 'Item', 'Currency', 'Total_Principal', 'Monthly_Amt', 'Months_Total', 'Months_Paid', 'Due_Day', 'Charged_To'],
    Subscriptions: ['ID', 'Name', 'Currency', 'Amount', 'Due_Day', 'Payment_Method'],
    Credentials: ['ID', 'Website', 'Username', 'Encrypted_Password', 'Setup_Date', 'Last_Saved', 'Pass_History', 'Linked_Phone'],
    Phones: ['ID', 'Number', 'Carrier', 'Status', 'Linked_To'],
    Loans: ['Loan_ID', 'Person', 'Direction', 'Kind', 'Currency', 'Principal', 'Balance', 'Monthly_Amt', 'Due_Day', 'Next_Due', 'Notes', 'Status', 'Payment_History'],
    Budgets: ['Budget_ID', 'Category', 'Limit', 'Currency'],
    Goals: ['Goal_ID', 'Name', 'Kind', 'Target', 'Saved', 'Currency', 'Deadline', 'Notes', 'Status'],
    Settings: ['Key', 'Value']
  };

  Object.keys(schemas).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(schemas[name]);
    } else if (sheet.getLastRow() === 0) {
      sheet.appendRow(schemas[name]);
    }
  });

  ensureFxRatesSheet_(ss);

  var settings = ss.getSheetByName('Settings');
  if (settings.getLastRow() < 2) {
    settings.clear();
    settings.appendRow(['Key', 'Value']);
    settings.appendRow(['baseCurrency', 'AED']);
    settings.appendRow(['fxRateAedToPhp', '']);
    settings.appendRow(['fxRateUsdToAed', '']);
    settings.appendRow(['fxRateUsdToPhp', '']);
    settings.appendRow(['driveFolderUrl', CONFIG.PHOTOS_FOLDER_URL]);
    settings.appendRow(['photosFolderUrl', CONFIG.PHOTOS_FOLDER_URL]);
    settings.appendRow(['backupsFolderUrl', CONFIG.BACKUPS_FOLDER_URL]);
    settings.appendRow(['driveRootUrl', CONFIG.DRIVE_ROOT_URL]);
    settings.appendRow(['employmentStartDate', '']);
    settings.appendRow(['basicSalaryAed', '']);
    settings.appendRow(['appPassword', '1234']);
    settings.appendRow(['appName', 'Personal Command Center']);
    settings.appendRow(['appTagline', 'UAE & PH']);
  }

  return { success: true, message: 'Empty database tabs ready (no sample data).', fx: getLiveFxRates() };
}

/**
 * FX sheet powered by Google Finance formulas — auto-updates in Sheets.
 */
function ensureFxRatesSheet_(ss) {
  ss = ss || getSpreadsheet_();
  var sheet = ss.getSheetByName('FX_Rates');
  if (!sheet) sheet = ss.insertSheet('FX_Rates');
  if (sheet.getLastRow() < 2 || String(sheet.getRange(2, 2).getFormula() || '').indexOf('GOOGLEFINANCE') === -1) {
    sheet.clear();
    sheet.getRange(1, 1, 1, 3).setValues([['Pair', 'Rate', 'Meaning']]);
    sheet.getRange(2, 1, 4, 3).setValues([
      ['AEDPHP', '=GOOGLEFINANCE("CURRENCY:AEDPHP")', '1 AED in PHP'],
      ['USDAED', '=GOOGLEFINANCE("CURRENCY:USDAED")', '1 USD in AED'],
      ['USDPHP', '=GOOGLEFINANCE("CURRENCY:USDPHP")', '1 USD in PHP'],
      ['Updated', '=NOW()', 'Last sheet recalc']
    ]);
    sheet.getRange('B2:B4').setNumberFormat('0.0000');
  }
  return sheet;
}

/**
 * Read live FX from Google Finance via the FX_Rates sheet.
 */
function getLiveFxRates() {
  try {
    assertAllowedUser_();
    var ss = getSpreadsheet_();
    var sheet = ensureFxRatesSheet_(ss);
    SpreadsheetApp.flush();
    Utilities.sleep(150);
    var aedPhp = Number(sheet.getRange('B2').getValue());
    var usdAed = Number(sheet.getRange('B3').getValue());
    var usdPhp = Number(sheet.getRange('B4').getValue());
    if (!aedPhp || isNaN(aedPhp) || aedPhp <= 0) aedPhp = 15.65;
    if (!usdAed || isNaN(usdAed) || usdAed <= 0) usdAed = 3.67;
    if (!usdPhp || isNaN(usdPhp) || usdPhp <= 0) usdPhp = aedPhp * usdAed;

    var rates = {
      success: true,
      aedToPhp: Math.round(aedPhp * 10000) / 10000,
      usdToAed: Math.round(usdAed * 10000) / 10000,
      usdToPhp: Math.round(usdPhp * 10000) / 10000,
      phpToAed: Math.round((1 / aedPhp) * 1000000) / 1000000,
      aedToUsd: Math.round((1 / usdAed) * 1000000) / 1000000,
      phpToUsd: Math.round((1 / usdPhp) * 1000000) / 1000000,
      source: 'GOOGLEFINANCE',
      updatedAt: new Date().toISOString(),
      // Live FX stays on FX_Rates only — never overwrite Settings fallbacks.
      wroteSettings: false
    };
    return rates;
  } catch (err) {
    return {
      success: false,
      error: String(err),
      aedToPhp: 15.65,
      usdToAed: 3.67,
      usdToPhp: 58,
      phpToAed: 1 / 15.65,
      aedToUsd: 1 / 3.67,
      phpToUsd: 1 / 58,
      source: 'fallback',
      updatedAt: new Date().toISOString()
    };
  }
}

function upsertSetting_(sheet, key, value) {
  var vals = sheet.getDataRange().getValues();
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function countSheetDataRows_(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return 0;
  var last = sheet.getLastRow();
  return last > 1 ? last - 1 : 0;
}

function countPayloadRecords_(data) {
  var keys = ['accounts', 'transactions', 'documents', 'cheques', 'remittances', 'installments', 'subscriptions', 'credentials', 'phones', 'loans', 'budgets', 'goals'];
  var n = 0;
  keys.forEach(function (k) {
    if (data[k] && data[k].length) n += data[k].length;
  });
  return n;
}

function countSpreadsheetRecords_(ss) {
  var names = ['Accounts', 'Transactions', 'Documents', 'Rent_Cheques', 'Remittances', 'Installments', 'Subscriptions', 'Credentials', 'Phones', 'Loans', 'Budgets', 'Goals'];
  var n = 0;
  names.forEach(function (name) {
    n += countSheetDataRows_(ss, name);
  });
  return n;
}

function syncIfSafe_(ss, sheetName, list, syncFn, forceEmpty, allowEmptyTabs) {
  var rows = list || [];
  // #region agent log
  var before = countSheetDataRows_(ss, sheetName);
  // #endregion
  if (!rows.length && !forceEmpty && !allowEmptyTabs && before > 0) {
    // #region agent log
    Logger.log('[syncIfSafe_] SKIP ' + sheetName + ' emptyPayload keepSheetRows=' + before);
    // #endregion
    return false;
  }
  syncFn(ss, rows);
  // #region agent log
  Logger.log('[syncIfSafe_] WRITE ' + sheetName + ' before=' + before + ' after=' + countSheetDataRows_(ss, sheetName) + ' payload=' + rows.length);
  // #endregion
  return true;
}

function syncAllDataToSheets(payloadJson) {
  assertAllowedUser_();
  try {
    var data = typeof payloadJson === 'string' ? JSON.parse(payloadJson) : payloadJson;
    if (!data || typeof data !== 'object') {
      return { success: false, error: 'Invalid sync payload' };
    }
    var ss = getSpreadsheet_();
    var payloadCount = countPayloadRecords_(data);
    var sheetCount = countSpreadsheetRecords_(ss);
    var forceEmpty = !!data.forceEmptySync;
    /* Empty individual tabs are OK when the client still has other data (intentional deletes). */
    var allowEmptyTabs = forceEmpty || payloadCount > 0;

    // #region agent log
    Logger.log('[syncAllDataToSheets] payloadCount=' + payloadCount + ' sheetCount=' + sheetCount + ' forceEmpty=' + forceEmpty + ' allowEmptyTabs=' + allowEmptyTabs +
      ' acc=' + ((data.accounts && data.accounts.length) || 0) +
      ' txn=' + ((data.transactions && data.transactions.length) || 0));
    // #endregion

    // Hard guard: fully empty app must not wipe Sheets unless forceEmptySync is set.
    // Still save Settings so Settings → Save works even when local data tabs are empty.
    if (payloadCount === 0 && sheetCount > 0 && !forceEmpty) {
      syncSettings(ss, data.settings, data.baseCurrency, data.fxRateAedToPhp);
      // #region agent log
      Logger.log('[syncAllDataToSheets] settings-only; refused data wipe sheetCount=' + sheetCount);
      // #endregion
      return {
        success: true,
        settingsOnly: true,
        needsForceClear: true,
        message: 'Settings saved. Data tabs unchanged — this device has 0 rows but Sheets still have ' + sheetCount + '. Use “Clear Sheets to match app” if you want Sheets emptied.',
        written: ['Settings'],
        skipped: ['Accounts', 'Transactions', 'Documents', 'Rent_Cheques', 'Remittances', 'Installments', 'Subscriptions', 'Credentials', 'Phones', 'Loans', 'Budgets', 'Goals'],
        payloadCount: payloadCount,
        sheetCount: sheetCount,
        sheetCountAfter: sheetCount
      };
    }

    var skipped = [];
    var written = [];
    function runTab(name, list, fn) {
      if (syncIfSafe_(ss, name, list, fn, forceEmpty, allowEmptyTabs)) written.push(name);
      else skipped.push(name);
    }
    runTab('Accounts', data.accounts, syncAccounts);
    runTab('Transactions', data.transactions, syncTransactions);
    runTab('Documents', data.documents, syncDocuments);
    runTab('Rent_Cheques', data.cheques, syncCheques);
    runTab('Remittances', data.remittances, syncRemittances);
    runTab('Installments', data.installments, syncInstallments);
    runTab('Subscriptions', data.subscriptions, syncSubscriptions);
    runTab('Credentials', data.credentials, syncCredentials);
    runTab('Phones', data.phones, syncPhones);
    runTab('Loans', data.loans, syncLoans);
    runTab('Budgets', data.budgets, syncBudgets);
    runTab('Goals', data.goals, syncGoals);
    syncSettings(ss, data.settings, data.baseCurrency, data.fxRateAedToPhp);
    written.push('Settings');

    // #region agent log
    Logger.log('[syncAllDataToSheets] written=' + written.join(',') + ' skipped=' + skipped.join(','));
    // #endregion

    if (!written.length || (written.length === 1 && written[0] === 'Settings' && skipped.length && sheetCount > 0 && payloadCount > 0)) {
      /* Should not happen with allowEmptyTabs — keep as safety */
    }

    var msg = 'Synced to Sheets (' + written.length + ' tab(s)).';
    if (skipped.length) msg += ' Kept existing rows for: ' + skipped.join(', ') + '.';
    return {
      success: true,
      message: msg,
      skipped: skipped,
      written: written,
      payloadCount: payloadCount,
      sheetCountAfter: countSpreadsheetRecords_(ss)
    };
  } catch (err) {
    // #region agent log
    Logger.log('[syncAllDataToSheets] FAIL ' + String(err));
    // #endregion
    return { success: false, error: String(err) };
  }
}

function toJsonSafe_(obj) {
  return JSON.parse(JSON.stringify(obj, function (key, value) {
    if (value === undefined) return null;
    if (typeof value === 'number' && !isFinite(value)) return null;
    if (Object.prototype.toString.call(value) === '[object Date]') {
      try {
        return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
      } catch (e) {
        return String(value);
      }
    }
    return value;
  }));
}

function loadAllDataFromSheets() {
  // Always return a structured object (never bare null) so the client can show a real error.
  try {
    assertAllowedUser_();
    var ss = getSpreadsheet_();
    var settings = getSettingsRecord(ss);

    if (!settings.driveFolderUrl) settings.driveFolderUrl = CONFIG.PHOTOS_FOLDER_URL;
    if (!settings.photosFolderUrl) settings.photosFolderUrl = CONFIG.PHOTOS_FOLDER_URL;
    if (!settings.backupsFolderUrl) settings.backupsFolderUrl = CONFIG.BACKUPS_FOLDER_URL;
    if (!settings.driveRootUrl) settings.driveRootUrl = CONFIG.DRIVE_ROOT_URL;

    // Use cached Settings FX on bootstrap — never block login on GOOGLEFINANCE + sleep.
    var fxCached = {
      success: true,
      aedToPhp: Number(settings.fxRateAedToPhp) || 15.65,
      usdToAed: Number(settings.fxRateUsdToAed) || 3.67,
      usdToPhp: Number(settings.fxRateUsdToPhp) || 58,
      source: 'settings-cache',
      updatedAt: settings.fxUpdatedAt || new Date().toISOString()
    };
    fxCached.phpToAed = 1 / fxCached.aedToPhp;
    fxCached.aedToUsd = 1 / fxCached.usdToAed;
    fxCached.phpToUsd = 1 / fxCached.usdToPhp;

    var payload = {
      ok: true,
      accounts: getSheetRecords(ss, 'Accounts'),
      transactions: getSheetRecords(ss, 'Transactions'),
      documents: getSheetRecords(ss, 'Documents'),
      cheques: getSheetRecords(ss, 'Rent_Cheques'),
      remittances: getSheetRecords(ss, 'Remittances'),
      installments: getSheetRecords(ss, 'Installments'),
      subscriptions: getSheetRecords(ss, 'Subscriptions'),
      credentials: getSheetRecords(ss, 'Credentials'),
      phones: getSheetRecords(ss, 'Phones'),
      loans: getSheetRecords(ss, 'Loans'),
      budgets: getSheetRecords(ss, 'Budgets'),
      goals: getSheetRecords(ss, 'Goals'),
      settings: settings,
      config: getConfig(),
      fx: fxCached,
      loadedAt: new Date().toISOString()
    };
    // google.script.run delivers null if the return value isn't serializable — force plain JSON.
    var safe = toJsonSafe_(payload);
    return safe;
  } catch (err) {
    return toJsonSafe_({
      ok: false,
      error: String(err && err.message ? err.message : err),
      accounts: [],
      transactions: [],
      documents: [],
      cheques: [],
      remittances: [],
      installments: [],
      subscriptions: [],
      credentials: [],
      phones: [],
      loans: [],
      budgets: [],
      goals: [],
      settings: {},
      config: {},
      fx: null,
      loadedAt: new Date().toISOString()
    });
  }
}

function getSheetRecords(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var vals = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  if (vals.length < 2) return [];
  var headers = vals[0];
  var records = [];
  for (var i = 1; i < vals.length; i++) {
    var row = {};
    var empty = true;
    for (var j = 0; j < headers.length; j++) {
      var cell = vals[i][j];
      if (cell instanceof Date) {
        cell = Utilities.formatDate(cell, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      row[headers[j]] = cell;
      if (cell !== '' && cell !== null && cell !== undefined) empty = false;
    }
    if (!empty) records.push(row);
  }
  return records;
}

function getSettingsRecord(ss) {
  var sheet = ss.getSheetByName('Settings');
  if (!sheet) return {};
  var vals = sheet.getDataRange().getValues();
  var settings = {};
  for (var i = 0; i < vals.length; i++) {
    if (!vals[i][0]) continue;
    var key = String(vals[i][0]);
    var val = vals[i][1];
    if (val instanceof Date) {
      val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
    }
    settings[key] = val;
  }
  return settings;
}

function clearAndWrite_(sheet, headers, rows) {
  sheet.clear();
  sheet.appendRow(headers);
  if (rows && rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

function syncAccounts(ss, list) {
  list = list || [];
  var sheet = ss.getSheetByName('Accounts') || ss.insertSheet('Accounts');
  var rows = list.map(function (a) {
    return [a.id, a.name, a.type, a.currency, a.balance, a.cardLast4 || '', a.cutoff || 0, a.due || 0, a.limit || 0];
  });
  clearAndWrite_(sheet, ['Account_ID', 'Name', 'Type', 'Currency', 'Balance', 'Card_Last4', 'Cutoff_Day', 'Due_Day', 'Credit_Limit'], rows);
}

function syncTransactions(ss, list) {
  list = list || [];
  var sheet = ss.getSheetByName('Transactions') || ss.insertSheet('Transactions');
  var rows = list.map(function (t) {
    return [t.id, t.date, t.type, t.amount, t.currency || 'AED', t.category, t.accountId, t.destAccountId || '', t.notes || ''];
  });
  clearAndWrite_(sheet, ['Trans_ID', 'Date', 'Type', 'Amount', 'Currency', 'Category', 'Account_ID', 'Dest_Account', 'Notes'], rows);
}

function syncDocuments(ss, list) {
  list = list || [];
  var sheet = ss.getSheetByName('Documents') || ss.insertSheet('Documents');
  var rows = list.map(function (d) {
    return [d.id, d.title, d.category, d.docNumber, d.issuer, d.issueDate, d.expiryDate, d.driveUrl || ''];
  });
  clearAndWrite_(sheet, ['Doc_ID', 'Title', 'Category', 'Doc_Number', 'Issuer', 'Issue_Date', 'Expiry_Date', 'Drive_URL'], rows);
}

function syncCheques(ss, list) {
  list = list || [];
  var sheet = ss.getSheetByName('Rent_Cheques') || ss.insertSheet('Rent_Cheques');
  var rows = list.map(function (c) {
    return [c.id, c.chequeNumber, c.drawnBank, c.payee, c.amount, c.dueDate, !!c.cleared, c.accountId || ''];
  });
  clearAndWrite_(sheet, ['Cheque_ID', 'Cheque_Number', 'Drawn_Bank', 'Payee', 'Amount_AED', 'Due_Date', 'Cleared', 'Account_ID'], rows);
}

function syncRemittances(ss, list) {
  list = list || [];
  var sheet = ss.getSheetByName('Remittances') || ss.insertSheet('Remittances');
  var rows = list.map(function (r) {
    return [r.id, r.date, r.sentAmountAed, r.receivedAmountPhp, r.feeAed, r.effectiveRate, r.provider, r.sourceAccountId, r.destAccountId, r.refNumber || ''];
  });
  clearAndWrite_(sheet, ['Remit_ID', 'Date', 'Sent_AED', 'Received_PHP', 'Fee_AED', 'Effective_FX', 'Provider', 'Source_ACC', 'Dest_ACC', 'MTCN_Ref'], rows);
}

function syncInstallments(ss, list) {
  list = list || [];
  var sheet = ss.getSheetByName('Installments') || ss.insertSheet('Installments');
  var rows = list.map(function (i) {
    return [i.id, i.item, i.currency, i.totalAmt, i.monthlyAmt, i.monthsTotal, i.monthsPaid, i.dueDay, i.chargedTo];
  });
  clearAndWrite_(sheet, ['ID', 'Item', 'Currency', 'Total_Principal', 'Monthly_Amt', 'Months_Total', 'Months_Paid', 'Due_Day', 'Charged_To'], rows);
}

function syncSubscriptions(ss, list) {
  list = list || [];
  var sheet = ss.getSheetByName('Subscriptions') || ss.insertSheet('Subscriptions');
  var rows = list.map(function (s) {
    return [s.id, s.name, s.currency, s.amount, s.dueDay, s.method];
  });
  clearAndWrite_(sheet, ['ID', 'Name', 'Currency', 'Amount', 'Due_Day', 'Payment_Method'], rows);
}

function syncCredentials(ss, list) {
  list = list || [];
  var sheet = ss.getSheetByName('Credentials') || ss.insertSheet('Credentials');
  var rows = list.map(function (c) {
    return [c.id, c.website, c.username, c.encryptedPass, c.setupDate, c.lastSaved, JSON.stringify(c.passHistory || []), c.linkedPhone || ''];
  });
  clearAndWrite_(sheet, ['ID', 'Website', 'Username', 'Encrypted_Password', 'Setup_Date', 'Last_Saved', 'Pass_History', 'Linked_Phone'], rows);
}

function syncPhones(ss, list) {
  list = list || [];
  var sheet = ss.getSheetByName('Phones') || ss.insertSheet('Phones');
  var rows = list.map(function (p) {
    return [p.id, p.number, p.carrier, p.status, p.linkedTo || ''];
  });
  clearAndWrite_(sheet, ['ID', 'Number', 'Carrier', 'Status', 'Linked_To'], rows);
}

function syncLoans(ss, list) {
  list = list || [];
  var sheet = ss.getSheetByName('Loans') || ss.insertSheet('Loans');
  var rows = list.map(function (l) {
    return [
      l.id,
      l.person,
      l.direction,
      l.kind || 'one_time',
      l.currency || 'AED',
      l.principal || 0,
      l.balance || 0,
      l.monthlyAmt || 0,
      l.dueDay || 0,
      l.nextDue || '',
      l.notes || '',
      l.status || 'active',
      JSON.stringify(l.paymentHistory || [])
    ];
  });
  clearAndWrite_(sheet, ['Loan_ID', 'Person', 'Direction', 'Kind', 'Currency', 'Principal', 'Balance', 'Monthly_Amt', 'Due_Day', 'Next_Due', 'Notes', 'Status', 'Payment_History'], rows);
}

function syncBudgets(ss, list) {
  list = list || [];
  var sheet = ss.getSheetByName('Budgets') || ss.insertSheet('Budgets');
  var rows = list.map(function (b) {
    return [b.id, b.category, b.limit || 0, b.currency || 'AED'];
  });
  clearAndWrite_(sheet, ['Budget_ID', 'Category', 'Limit', 'Currency'], rows);
}

function syncGoals(ss, list) {
  list = list || [];
  var sheet = ss.getSheetByName('Goals') || ss.insertSheet('Goals');
  var rows = list.map(function (g) {
    return [
      g.id,
      g.name,
      g.kind || 'other',
      g.target || 0,
      g.saved || 0,
      g.currency || 'AED',
      g.deadline || '',
      g.notes || '',
      g.status || 'active'
    ];
  });
  clearAndWrite_(sheet, ['Goal_ID', 'Name', 'Kind', 'Target', 'Saved', 'Currency', 'Deadline', 'Notes', 'Status'], rows);
}

function syncSettings(ss, settings, baseCurr, fxRate) {
  var sheet = ss.getSheetByName('Settings') || ss.insertSheet('Settings');
  var existingOverview = null;
  var existingDropdowns = null;
  var existingSamples = null;
  try {
    var vals = sheet.getDataRange().getValues();
    for (var i = 0; i < vals.length; i++) {
      if (vals[i][0] === 'overviewPrefs' && vals[i][1]) existingOverview = vals[i][1];
      if (vals[i][0] === 'dropdownsJson' && vals[i][1]) existingDropdowns = vals[i][1];
      if (vals[i][0] === 'sampleProfilesJson' && vals[i][1]) existingSamples = vals[i][1];
    }
  } catch (e) {}
  sheet.clear();
  sheet.appendRow(['Key', 'Value']);
  sheet.appendRow(['baseCurrency', baseCurr || 'AED']);
  sheet.appendRow(['fxRateAedToPhp', (settings && settings.fxRateAedToPhp != null && settings.fxRateAedToPhp !== '') ? settings.fxRateAedToPhp : (fxRate || '')]);
  sheet.appendRow(['fxRateUsdToAed', (settings && settings.fxRateUsdToAed != null && settings.fxRateUsdToAed !== '') ? settings.fxRateUsdToAed : '']);
  sheet.appendRow(['fxRateUsdToPhp', (settings && settings.fxRateUsdToPhp != null && settings.fxRateUsdToPhp !== '') ? settings.fxRateUsdToPhp : '']);
  sheet.appendRow(['driveFolderUrl', (settings && settings.driveFolderUrl) || CONFIG.PHOTOS_FOLDER_URL]);
  sheet.appendRow(['photosFolderUrl', (settings && settings.photosFolderUrl) || CONFIG.PHOTOS_FOLDER_URL]);
  sheet.appendRow(['backupsFolderUrl', (settings && settings.backupsFolderUrl) || CONFIG.BACKUPS_FOLDER_URL]);
  sheet.appendRow(['driveRootUrl', (settings && settings.driveRootUrl) || CONFIG.DRIVE_ROOT_URL]);
  sheet.appendRow(['employmentStartDate', (settings && settings.employmentStartDate) || '']);
  sheet.appendRow(['basicSalaryAed', (settings && settings.basicSalaryAed != null && settings.basicSalaryAed !== '') ? settings.basicSalaryAed : '']);
  sheet.appendRow(['appName', (settings && settings.appName) || 'Personal Command Center']);
  sheet.appendRow(['appTagline', (settings && settings.appTagline) || 'UAE & PH']);
  sheet.appendRow(['appPassword', (settings && settings.appPassword) || '1234']);
  if (settings && settings.dropdowns) {
    sheet.appendRow(['dropdownsJson', JSON.stringify(settings.dropdowns)]);
  } else if (existingDropdowns) {
    sheet.appendRow(['dropdownsJson', existingDropdowns]);
  }
  if (settings && settings.sampleProfiles) {
    sheet.appendRow(['sampleProfilesJson', JSON.stringify(settings.sampleProfiles)]);
  } else if (existingSamples) {
    sheet.appendRow(['sampleProfilesJson', existingSamples]);
  }
  if (settings && settings.overview) {
    sheet.appendRow(['overviewPrefs', JSON.stringify(settings.overview)]);
  } else if (existingOverview) {
    sheet.appendRow(['overviewPrefs', existingOverview]);
  }
}

/**
 * Upload a base64 file (photo/PDF) into the Photos Drive folder.
 * Returns shareable Drive URL.
 */
function uploadDocumentFile(fileName, mimeType, base64Data) {
  try {
    assertAllowedUser_();
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
    var folder = DriveApp.getFolderById(CONFIG.PHOTOS_FOLDER_ID);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
    return {
      success: true,
      fileId: file.getId(),
      url: 'https://drive.google.com/file/d/' + file.getId() + '/view',
      name: file.getName()
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Copy spreadsheet into Backups Drive folder.
 */
function backupCommandCenterSpreadsheet() {
  try {
    assertAllowedUser_();
    var ss = getSpreadsheet_();
    var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm');
    var backupName = 'CommandCenter_Backup_' + dateStr;
    var folder = DriveApp.getFolderById(CONFIG.BACKUPS_FOLDER_ID);
    var copy = DriveApp.getFileById(ss.getId()).makeCopy(backupName, folder);
    return {
      success: true,
      fileId: copy.getId(),
      url: copy.getUrl(),
      name: backupName
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Daily radar: document expiries (<60d) + rent cheques (<7d) + loan dues (<7d).
 */
function dailyComplianceAndDueRadar() {
  var ss = getSpreadsheet_();
  var userEmail = Session.getActiveUser().getEmail();
  var alerts = [];
  var today = new Date();

  var docSheet = ss.getSheetByName('Documents');
  if (docSheet) {
    var docs = docSheet.getDataRange().getValues();
    for (var i = 1; i < docs.length; i++) {
      if (!docs[i][6]) continue;
      var expDate = new Date(docs[i][6]);
      var daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 60 && daysLeft >= 0) {
        alerts.push('DOCUMENT EXPIRY: "' + docs[i][1] + '" (' + docs[i][2] + ') expires in ' + daysLeft + ' days on ' + docs[i][6] + '. Renew to prevent UAE bank freezes.');
      }
    }
  }

  var chqSheet = ss.getSheetByName('Rent_Cheques');
  if (chqSheet) {
    var chqs = chqSheet.getDataRange().getValues();
    for (var j = 1; j < chqs.length; j++) {
      var isCleared = chqs[j][6];
      if (isCleared || !chqs[j][5]) continue;
      var dueDate = new Date(chqs[j][5]);
      var chqDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
      if (chqDays <= 7 && chqDays >= 0) {
        alerts.push('UAE RENT CHEQUE DUE: Cheque #' + chqs[j][1] + ' to "' + chqs[j][3] + '" for AED ' + chqs[j][4] + ' is due in ' + chqDays + ' days. Ensure ' + chqs[j][2] + ' is funded.');
      }
    }
  }

  var loanSheet = ss.getSheetByName('Loans');
  if (loanSheet) {
    var loans = loanSheet.getDataRange().getValues();
    for (var k = 1; k < loans.length; k++) {
      var status = String(loans[k][11] || 'active').toLowerCase();
      if (status === 'settled' || status === 'closed') continue;
      var nextDue = loans[k][9];
      if (!nextDue) continue;
      var loanDue = new Date(nextDue);
      var loanDays = Math.ceil((loanDue - today) / (1000 * 60 * 60 * 24));
      if (loanDays <= 7 && loanDays >= 0) {
        alerts.push('LOAN / SETTLEMENT DUE: ' + loans[k][1] + ' (' + loans[k][2] + ') balance ' + loans[k][4] + ' ' + loans[k][6] + ' due in ' + loanDays + ' days (' + nextDue + ').');
      }
    }
  }

  if (alerts.length > 0) {
    MailApp.sendEmail({
      to: userEmail,
      subject: 'Command Center: Compliance, Cheque & Loan Alerts',
      body: 'Good morning,\n\nYour Personal Command Center alerts:\n\n' + alerts.join('\n\n') + '\n\nOpen your Command Center web app to take action.'
    });
  }

  return { success: true, alertCount: alerts.length };
}

/**
 * One-click: create empty tabs only (no sample rows). Caller must pass app password.
 */
function setupCommandCenter(appPassword) {
  assertAllowedUser_();
  var ss = getSpreadsheet_();
  var settings = getSettingsRecord(ss);
  var expected = (settings && settings.appPassword != null && String(settings.appPassword) !== '')
    ? String(settings.appPassword)
    : '1234';
  if (String(appPassword || '') !== expected) {
    return { success: false, error: 'Wrong password — Setup DB requires your app login password.' };
  }
  var init = initializeDatabase();
  return {
    success: true,
    init: init,
    config: getConfig(),
    message: 'Sheets structure ready. No sample data written.'
  };
}
