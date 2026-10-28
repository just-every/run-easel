import { netsuiteHost } from './netsuite-auth'
const paths:Record<string,string>={Journal:'journal',CustInvc:'custinvc',CustCred:'custcred',CustPymt:'custpymt',VendBill:'vendbill',VendCred:'vendcred',VendPymt:'vendpymt',Check:'check',Deposit:'deposit',Transfer:'transfer',CashSale:'cashsale',CashRfnd:'cashrfnd',ExpRept:'exprept',CardChrg:'cardchrg',CardRfnd:'cardrfnd',InvAdjst:'invadjst'}
export function netsuiteTransactionUrl(realm:unknown,type:unknown,id:unknown) {
 if(typeof realm!=='string'||typeof type!=='string'||typeof id!=='string'||!paths[type]||!/^\d{1,20}$/.test(id))return null
 try{return `https://${netsuiteHost(realm).replace('.suitetalk.api.','.app.')}/app/accounting/transactions/${paths[type]}.nl?id=${id}`}catch{return null}
}
