/** Provider account and numeric transaction identity are the only URL inputs. */
export function netsuiteTransactionUrl(realm:unknown,_type:unknown,id:unknown){
 if(typeof realm!=='string'||! /^[A-Za-z0-9]+(?:_(?:SB|RP)\d+)?$/.test(realm)||typeof id!=='string'||! /^[1-9]\d{0,14}$/.test(id))return null
 return `https://${realm.toLowerCase().replaceAll('_','-')}.app.netsuite.com/app/accounting/transactions/transaction.nl?id=${id}`
}
