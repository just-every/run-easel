/** Easel Google Sheets Editor add-on. Deploy with appsscript.json and Sidebar.html.
 * Custom functions read aggregate results only. Authorized menu/open/time triggers
 * refresh the shared cache and change its explicit formula dependency.
 */
var EASEL_CACHE_ = '_Easel_Data';
var EASEL_PROPERTY_ = 'easel.connection.';
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
  catch (error) { throw new Error('Easel could not be reached. Refresh explicitly after checking the connection; writes are never retried automatically.'); }
  var status = response.getResponseCode();
  if (status !== 200) {
    var reason = 'Easel refused this request (' + status + ')';
    try { reason = JSON.parse(response.getContentText()).error || reason; } catch (ignored) {}
    throw new Error(String(reason).slice(0, 500));
  }
  return JSON.parse(response.getContentText());
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
    var connection = JSON.parse(properties[k]), book = SpreadsheetApp.openById(connection.spreadsheet);
    try {
      var status = request_(connection, 'session');
      if (status.schedule === 'hourly') refreshBook_(book, 'trigger');
    } catch (ignored) { invalidate_(cache_(book)); /* No secret/error body is logged. */ }
  });
}
function easelRefresh() { return refreshBook_(SpreadsheetApp.getActiveSpreadsheet(), 'menu'); }
function cache_(book) {
  var sheet = book.getSheetByName(EASEL_CACHE_) || book.insertSheet(EASEL_CACHE_);
  if (!sheet.isSheetHidden()) sheet.hideSheet();
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
  var cache;
  try {
    cache = cache_(book); invalidate_(cache);
    var connection = requireConnection_(book), bindings = bindings_(book);
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
    if (cache) invalidate_(cache);
    throw error;
  } finally { lock.releaseLock(); }
}
function cached_(key, refresh) {
  if (!refresh) throw new Error('Insert the formula from the Easel sidebar to include its refresh dependency');
  var cache = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EASEL_CACHE_);
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
  var book = SpreadsheetApp.getActiveSpreadsheet(), cache = cache_(book), args;
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
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'easelOpenRefresh' && t.getTriggerSourceId() === book.getId()) ScriptApp.deleteTrigger(t);
  });
  var remaining = Object.keys(PropertiesService.getUserProperties().getProperties()).some(function(k) { return k.indexOf(EASEL_PROPERTY_) === 0; });
  if (!remaining) ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'easelHourlyRefresh') ScriptApp.deleteTrigger(t); });
  invalidate_(cache_(book));
  return { message: 'Local key and this user’s triggers removed. Ask finance to disconnect the Easel key, and remove Google authorization in Google Account → Security → Third-party connections.' };
}
