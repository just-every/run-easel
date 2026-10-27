// Office.js boundary only. Dependency arithmetic here is a harness simulation,
// never qualification of Microsoft's host calculation or installation behavior.
export function installExcelHost() {
 const formulas = {}, values = {}, invocations = {}
 let selection = 'Plan!A1', sum = 0, calculations = 0, startup
 class CellError { constructor(code, message) { this.code = code; this.message = message } }
 window.Office = {
  onReady: async () => ({ host: 'Excel' }), context: { host: 'Excel', requirements: { isSetSupported: () => true } },
  actions: { associate: (name, action) => { actions[name] = action } },
  addin: { setStartupBehavior: async value => { startup = value } }, StartupBehavior: { load: 'load' },
 }
 const actions = {}
 window.CustomFunctions = { associate: (name, action) => { formulas[name] = action }, Error: CellError, ErrorCode: { notAvailable: 'unavailable' } }
 window.Excel = { run: async action => action({ workbook: {
  getSelectedRange: () => ({ address: selection, load() {} }),
  application: { calculate: () => { calculations++; sum = ['A1', 'B1'].some(id => typeof values[id] !== 'number') ? 'unavailable' : values.A1 + values.B1 } },
 }, sync: async () => {} }) }
 window.excelHost = {
  cell(id, fn, args) {
   invocations[id]?.onCanceled?.()
   const invocation = { address: `Plan!${id}`, setResult: value => { values[id] = value } }
   invocations[id] = invocation; formulas[fn](...args, invocation)
  },
  select(address) { selection = address },
  command: name => new Promise(resolve => actions[name]({ completed: resolve })),
  snapshot: () => ({ values, sum, calculations, startup }),
 }
}
