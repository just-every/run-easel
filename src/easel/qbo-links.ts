// Intuit's shipped transaction navigation and registry define these destinations:
// https://plugin.intuitcdn.net/sbg-web-shell-ui/11.24.0/shell/boot.js
// https://plugin.intuitcdn.net/sbg-web-shell-ui/11.24.0/shell/qbo-shell/appRegistry.js
const routes:Record<string,string>={
 journalentry:'journal', invoice:'invoice', payment:'recvpayment',
 bill:'bill', billpayment:'billpayment', billpaymentcheck:'billpayment', billpaymentcreditcard:'billpayment',
 check:'check', deposit:'deposit', salesreceipt:'salesreceipt',
 expense:'expense', cashexpense:'cashexpense', creditcardexpense:'creditcardexpense',
 creditmemo:'creditmemo', transfer:'transfer', vendorcredit:'vendorcredit', creditcardcredit:'creditcardcredit',
 refundreceipt:'refundreceipt', refund:'refundreceipt', creditcardpayment:'creditcardpayment',
 inventoryqtyadjust:'inventory_quantity_adj', inventoryquantityadjustment:'inventory_quantity_adj', inventoryadjustment:'inventory_quantity_adj',
 taxpayment:'viewtaxpayment', salestaxpayment:['tax','payment'].join('/')
}

/** Provider destinations are fixed; source data can supply only a transaction identifier. */
export function qboTransactionUrl(environment:unknown,type:unknown,id:unknown){
 if(!['sandbox','production'].includes(String(environment))||typeof id!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(id)||typeof type!=='string')return null
 const route=routes[type.toLowerCase().replace(/[^a-z]/g,'')]
 return route?`https://${environment==='sandbox'?'app.sandbox.qbo.intuit.com':'qbo.intuit.com'}/app/${route}?txnId=${encodeURIComponent(id)}`:null
}
