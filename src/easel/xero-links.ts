/** Fixed Xero journal destination; provider data can supply only its identifier. */
export function xeroTransactionUrl(_environment:unknown,type:unknown,id:unknown){
 return type==='Journal'&&typeof id==='string'&&/^[A-Za-z0-9-]{1,120}$/.test(id)?`https://go.xero.com/Journal/View.aspx?JournalID=${encodeURIComponent(id)}`:null
}
