/** Easel Google Sheets Editor add-on. Deploy with appsscript.json and Sidebar.html.
 * Custom functions read aggregate results only. Authorized menu/open/time triggers
 * refresh the shared cache and change its explicit formula dependency.
 */
var EASEL_CACHE_ = '_Easel_Data';
var EASEL_PROPERTY_ = 'easel.connection.';
var EASEL_HEALTH_ = 'easel.health.';
var EASEL_CACHE_OWNER_ = 'easel.google-sheets.cache';
function onOpen(e) {
  SpreadsheetApp.getUi().createAddonMenu().addItem('Open Easel', 'easelShowSidebar').addItem('Refresh now', 'easelRefresh').addToUi();
}
function onInstall(e) { onOpen(e); }
function easelShowSidebar() {
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('Easel'));
}
function easelSettings() {
  var book = SpreadsheetApp.getActiveSpreadsheet(), connection = connection_(book.getId());
  if (!connection) return { connected: false, spreadsheet: book.getId() };
  flushHealth_(connection);
  var status = request_(connection, 'session');
  return { connected: true, origin: connection.origin, person: status.person, role: status.role, schedule: status.schedule, writeBack: status.writeBack, spreadsheet: book.getId() };
}
function easelConfigure(input) {
  var book = SpreadsheetApp.getActiveSpreadsheet(), origin = String(input.origin || '').replace(/\/$/, '');
  if (!/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(origin)) throw new Error('Enter the trusted HTTPS Easel installation origin, without a path');
  var connection = { origin: origin, key: String(input.key || '').trim(), spreadsheet: book.getId() };
  var status = request_(connection, 'session');
  // UserProperties are private to the effective Google user. No key is stored
  // in DocumentProperties, cache cells, formulas, logs or responses to the UI.
  PropertiesService.getUserProperties().setProperty(EASEL_PROPERTY_ + book.getId(), JSON.stringify(connection));
  PropertiesService.getUserProperties().deleteProperty(EASEL_HEALTH_ + book.getId());
  installTriggers_(book, status);
  return { connected: true, person: status.person, schedule: status.schedule };
}
function easelSyncTriggers() {
  var book = SpreadsheetApp.getActiveSpreadsheet(), connection = requireConnection_(book);
  var status = request_(connection, 'session'); installTriggers_(book, status);
  return { schedule: status.schedule };
}
function connection_(id) {
  var value = PropertiesService.getUserProperties().getProperty(EASEL_PROPERTY_ + id);
  return value ? JSON.parse(value) : null;
}
function requireConnection_(book) {
  var connection = connection_(book.getId());
  if (!connection) throw new Error('Ask finance for a connection key for your Easel person and this spreadsheet, then connect in the sidebar');
  return connection;
}
function request_(connection, operation, body) {
  var options = { method: body === undefined ? 'get' : 'post', muteHttpExceptions: true, followRedirects: false,
    headers: { 'X-Easel-Sheets-Key': connection.key, 'X-Easel-Spreadsheet': connection.spreadsheet }, contentType: 'application/json' };
  if (body !== undefined) options.payload = JSON.stringify(body);
  var response;
  try { response = UrlFetchApp.fetch(connection.origin + '/api/easel/google-sheets/' + operation, options); }
  catch (error) { throw requestFailure_('transport', null, null, 'Easel could not be reached. Refresh explicitly after checking the connection; writes are never retried automatically.'); }
  var status = response.getResponseCode();
  if (status !== 200) {
    var reason = 'Easel refused this request (' + status + ')';
    try { reason = JSON.parse(response.getContentText()).error || reason; } catch (ignored) {}
    reason = String(reason);
    if (connection.key) reason = reason.split(connection.key).join('[redacted]');
    throw requestFailure_('http', status, retryAfter_(response), reason.slice(0, 500));
  }
  try { return JSON.parse(response.getContentText()); }
  catch (error) { throw requestFailure_('response', null, null, 'Easel returned an unreadable response; refresh explicitly after checking the connection.'); }
}
function requestFailure_(failure, status, retryAfter, message) {
  var error = new Error(message);
  error.easelHealth = { failure: failure, status: status, retryAfter: retryAfter };
  return error;
}
function retryAfter_(response) {
  var headers = response.getAllHeaders(), value;
  Object.keys(headers).forEach(function(key) { if (key.toLowerCase() === 'retry-after') value = headers[key]; });
  if (Array.isArray(value)) value = value[0];
  if (value === undefined) return null;
  value = String(value).trim();
  var seconds = /^\d+$/.test(value) ? Number(value) : Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 1000));
  return isFinite(seconds) && seconds >= 0 && seconds <= 2147483647 ? Math.ceil(seconds) : null;
}
function flushHealth_(connection) {
  var properties = PropertiesService.getUserProperties(), name = EASEL_HEALTH_ + connection.spreadsheet;
  var pending = properties.getProperty(name);
  if (!pending) return;
  // This is a separate, sanitized health report, never a replay of a read or
  // write. If Easel is also unreachable here, retain it until next contact.
  try { request_(connection, 'health', JSON.parse(pending)); properties.deleteProperty(name); }
  catch (ignored) { /* No credential, provider response or error body is logged. */ }
}
function reportFailure_(connection, reason, error) {
  var health = error.easelHealth || { failure: 'spreadsheet' };
  PropertiesService.getUserProperties().setProperty(EASEL_HEALTH_ + connection.spreadsheet,
    JSON.stringify({ reason: reason, failure: health.failure, status: health.status, retryAfter: health.retryAfter }));
  flushHealth_(connection);
}
function installTriggers_(book, status) {
  var triggers = ScriptApp.getProjectTriggers();
  if (!triggers.some(function(t) { return t.getHandlerFunction() === 'easelOpenRefresh' && t.getTriggerSourceId() === book.getId(); })) {
    ScriptApp.newTrigger('easelOpenRefresh').forSpreadsheet(book).onOpen().create();
  }
  if (status.schedule === 'hourly' && !triggers.some(function(t) { return t.getHandlerFunction() === 'easelHourlyRefresh'; })) {
    ScriptApp.newTrigger('easelHourlyRefresh').timeBased().everyHours(1).create();
  }
}
// Installable open triggers run with their creator's current Easel identity.
// The simple onOpen only adds a menu, because it cannot make authorized calls.
function easelOpenRefresh(e) {
  if (!e || !e.source || !connection_(e.source.getId())) return;
  refreshBook_(e.source, 'open');
}
// No active spreadsheet is used: this opens saved IDs even with all sheets closed.
function easelHourlyRefresh() {
  var properties = PropertiesService.getUserProperties().getProperties();
  Object.keys(properties).filter(function(k) { return k.indexOf(EASEL_PROPERTY_) === 0; }).forEach(function(k) {
    var connection = JSON.parse(properties[k]), book, status;
    try {
      book = SpreadsheetApp.openById(connection.spreadsheet);
      flushHealth_(connection);
      status = request_(connection, 'session');
    } catch (error) {
      try { var owned = book && cache_(book, false); if (owned) invalidate_(owned); } catch (ignored) {}
      reportFailure_(connection, 'trigger', error);
      return;
    }
    if (status.schedule === 'hourly') {
      try { refreshBook_(book, 'trigger'); } catch (ignored) { /* refreshBook_ already reported the failure. */ }
    }
  });
}
function easelRefresh() { return refreshBook_(SpreadsheetApp.getActiveSpreadsheet(), 'menu'); }
function cache_(book, create) {
  // The reserved name alone proves nothing: never adopt or clear an owner's
  // existing sheet. Metadata persists across users and closed-sheet triggers.
  var owned = book.getSheets().filter(function(sheet) {
    return sheet.getDeveloperMetadata().some(function(entry) { return entry.getKey() === EASEL_CACHE_OWNER_ && entry.getValue() === 'v1'; });
  });
  if (owned.length > 1) throw new Error('Multiple Easel cache sheets found; keep only the intended Easel cache before refreshing');
  if (owned.length) {
    if (owned[0].getName() !== EASEL_CACHE_) throw new Error('The Easel cache was renamed; restore its _Easel_Data name before refreshing');
    return owned[0];
  }
  if (book.getSheetByName(EASEL_CACHE_)) throw new Error('Worksheet _Easel_Data already exists and is not an Easel cache. Rename that sheet before using Easel; its contents have been preserved.');
  if (create === false) return null;
  var sheet = book.insertSheet(EASEL_CACHE_);
  sheet.addDeveloperMetadata(EASEL_CACHE_OWNER_, 'v1');
  sheet.hideSheet();
  return sheet;
}
function invalidate_(cache) {
  cache.clearContents(); cache.getRange(1, 1).setValue(Utilities.getUuid()); SpreadsheetApp.flush();
}
function bindingKey_(binding) {
  return binding.kind === 'value' ? JSON.stringify(['value', binding.line, binding.department, binding.month, binding.scenario])
    : JSON.stringify(['report', binding.report, binding.period, binding.metric]);
}
// Refresh discovers formulas with literal selectors. It never evaluates arbitrary
// code or treats ordinary spreadsheet values as write-back instructions.
function bindings_(book) {
  var found = {};
  book.getSheets().filter(function(sheet) { return sheet.getName() !== EASEL_CACHE_; }).forEach(function(sheet) {
    sheet.getDataRange().getFormulas().forEach(function(row) { row.forEach(function(formula) {
      var match = /^\s*=\s*EASEL_(VALUE|REPORT)\s*\(/i.exec(formula);
      if (!match) return;
      var tail = formula.slice(match[0].length), args = [], literal;
      var count = match[1].toUpperCase() === 'VALUE' ? 4 : 3;
      for (var i = 0; i < count; i++) {
        literal = /^\s*"((?:[^"]|"")*)"\s*[,;]/.exec(tail);
        if (!literal) throw new Error('Easel selectors must be quoted literal strings; use Insert formula in the sidebar');
        args.push(literal[1].replace(/""/g, '"')); tail = tail.slice(literal[0].length);
      }
      if (!/^\s*'_Easel_Data'!\$A\$1\s*\)\s*$/i.test(tail)) throw new Error('Easel formulas need the refresh dependency; insert them from the sidebar');
      var binding = count === 4 ? { kind: 'value', line: args[0], department: args[1], month: args[2], scenario: args[3] }
        : { kind: 'report', report: args[0], period: args[1], metric: args[2] };
      binding.key = bindingKey_(binding); found[binding.key] = binding;
    }); });
  });
  var result = Object.keys(found).map(function(k) { return found[k]; });
  if (result.length > 100) throw new Error('Use at most 100 distinct Easel formulas per spreadsheet');
  return result;
}
function refreshBook_(book, reason) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  var cache, connection;
  try {
    connection = connection_(book.getId());
    cache = cache_(book, false);
    connection = requireConnection_(book); flushHealth_(connection);
    cache = cache || cache_(book); invalidate_(cache);
    var bindings = bindings_(book);
    var result = request_(connection, 'refresh', { reason: reason, bindings: bindings });
    var rows = result.values.map(function(value) {
      var encoded = JSON.stringify(value);
      if (encoded.length > 45000) encoded = JSON.stringify({ unavailable: true, error: 'Report is too large for a Google Sheets cache cell; choose a smaller report' });
      return [value.key, encoded];
    });
    if (rows.length) cache.getRange(2, 1, rows.length, 2).setValues(rows);
    cache.getRange(1, 1).setValue(Utilities.getUuid()); SpreadsheetApp.flush();
    return { refreshedAt: result.refreshedAt, person: result.person, count: rows.length, unavailable: result.values.filter(function(v) { return v.unavailable; }).length };
  } catch (error) {
    try { if (cache) invalidate_(cache); } catch (ignored) { /* Still report a spreadsheet failure if clearing is refused. */ }
    if (connection) reportFailure_(connection, reason, error);
    throw error;
  } finally { lock.releaseLock(); }
}
function cached_(key, refresh) {
  if (!refresh) throw new Error('Insert the formula from the Easel sidebar to include its refresh dependency');
  var cache = cache_(SpreadsheetApp.getActiveSpreadsheet(), false);
  if (!cache) throw new Error('Refresh Easel from the add-on menu');
  var rows = cache.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (rows[i][0] === key) {
    var value = JSON.parse(rows[i][1]);
    if (value.unavailable) throw new Error(value.error || 'Easel value unavailable');
    return value;
  }
  throw new Error('Easel value unavailable; refresh from the add-on menu');
}
/**
 * Returns a live aggregate currency amount.
 * @customfunction
 */
function EASEL_VALUE(line, department, month, scenario, refresh) {
  var value = cached_(JSON.stringify(['value', String(line), String(department), String(month), String(scenario)]), refresh);
  return value.amount / 100;
}
/**
 * Returns a role-filtered saved-report table.
 * @customfunction
 */
function EASEL_REPORT(report, period, metric, refresh) {
  return cached_(JSON.stringify(['report', String(report), String(period), String(metric)]), refresh).table;
}
function easelInsert(input) {
  var book = SpreadsheetApp.getActiveSpreadsheet(); requireConnection_(book);
  var cache = cache_(book), args;
  if (!cache.getRange(1, 1).getValue()) cache.getRange(1, 1).setValue(Utilities.getUuid());
  if (input.kind === 'report') args = [input.report, input.period, input.metric || 'budget'];
  else args = [input.line, input.department, input.month, input.scenario];
  if (args.some(function(arg) { return !arg || String(arg).length > 200; })) throw new Error('Complete every formula selector');
  var quote = function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; };
  var range = book.getActiveRange();
  if (!range || range.getSheet().getName() === EASEL_CACHE_) throw new Error('Select a cell in your planning sheet');
  range.getCell(1, 1).setFormula('=EASEL_' + (input.kind === 'report' ? 'REPORT' : 'VALUE') + '(' + args.map(quote).join(',') + ",'_Easel_Data'!$A$1)");
  return easelRefresh();
}
function easelWrite(input) {
  var book = SpreadsheetApp.getActiveSpreadsheet(), connection = requireConnection_(book);
  var result = request_(connection, 'write', { scenario: input.scenario, revision: input.revision, schedule: input.schedule, month: input.month, value: input.value });
  return { mode: result.mode, revision: result.scenario ? result.scenario.revision : result.targetRevision,
    proposal: result.proposal ? result.proposal.id : null, proposalRevision: result.proposal ? result.proposal.revision : null };
}
function easelDisconnect() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getUserProperties().deleteProperty(EASEL_PROPERTY_ + book.getId());
  PropertiesService.getUserProperties().deleteProperty(EASEL_HEALTH_ + book.getId());
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'easelOpenRefresh' && t.getTriggerSourceId() === book.getId()) ScriptApp.deleteTrigger(t);
  });
  var remaining = Object.keys(PropertiesService.getUserProperties().getProperties()).some(function(k) { return k.indexOf(EASEL_PROPERTY_) === 0; });
  if (!remaining) ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'easelHourlyRefresh') ScriptApp.deleteTrigger(t); });
  try { var cache = cache_(book, false); if (cache) invalidate_(cache); } catch (ignored) { /* Unowned or renamed sheets are preserved. */ }
  return { message: 'Local key and this user’s triggers removed. Ask finance to disconnect the Easel key, and remove Google authorization in Google Account → Security → Third-party connections.' };
}
