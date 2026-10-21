import { requireThat } from './types'

export type Expression = { kind: 'number'; value: string } | { kind: 'string'; value: string } | { kind: 'unary'; op: string; value: Expression } | { kind: 'binary'; op: string; left: Expression; right: Expression } | { kind: 'call'; name: string; args: Expression[]; binding?: Binding }
export type Binding = { origin?: string; line?: string; department?: string; scenario?: string; dimension?: string }
const arities: Record<string, [number, number]> = { DRIVER:[1,2], PRIOR:[1,2], LOOKUP:[3,4], SUM:[1,100], LINE:[2,3], ACTUAL:[2,3], VERSION:[3,4], GROWTH:[2,2], PERIOD:[0,0], MEMBER:[0,0], IF:[3,3], MIN:[1,100], MAX:[1,100], ROUND:[1,2] }
const precedence: Record<string, number> = { '=':1, '<>':1, '<':1, '>':1, '<=':1, '>=':1, '+':2, '-':2, '*':3, '/':3 }

/** A bounded native expression grammar; no JavaScript or workbook arithmetic. */
export function parseExpression(source: string): Expression {
 requireThat(source.length <= 8000, 'Formula must be at most 8000 characters')
 const tokens: {kind:string;value:string}[]=[]
 let at=source.startsWith('=')?1:0
 while(at<source.length) {
  if(/\s/.test(source[at])) {at++;continue}
  if(source[at]==='"' || source[at]==="'") {
   const quote=source[at++]; let value='',done=false
   while(at<source.length) {const c=source[at++];if(c!==quote){value+=c;continue}if(source[at]===quote){value+=quote;at++;continue}done=true;break}
   requireThat(done,'Formula has an unterminated quoted name');tokens.push({kind:'string',value});continue
  }
  const rest=source.slice(at),number=/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})(?![\d.])/.exec(rest),name=/^[A-Za-z_][A-Za-z_0-9]*/.exec(rest),symbol=/^(?:<>|<=|>=|[+\-*/=<>(),])/.exec(rest)
  const match=number??name??symbol;requireThat(match,`Invalid formula near '${rest.slice(0,24)}'`)
  tokens.push({kind:number?'number':name?'name':'symbol',value:match[0]});at+=match[0].length
  requireThat(tokens.length<=1500,'Formula has too many tokens')
 }
 tokens.push({kind:'end',value:''});let cursor=0
 const peek=()=>tokens[cursor],take=()=>tokens[cursor++]
 const expect=(value:string)=>{requireThat(peek().value===value,`Formula expected '${value}'`);take()}
 function primary(depth:number):Expression {
  requireThat(depth<=64,'Formula nesting is too deep');const t=take()
  if(t.kind==='number'||t.kind==='string')return {kind:t.kind,value:t.value}
  if(t.value==='+'||t.value==='-')return {kind:'unary',op:t.value,value:primary(depth+1)}
  if(t.value==='('){const e=expression(0,depth+1);expect(')');return e}
  if(t.kind==='name') {
   const name=t.value.toUpperCase();requireThat(arities[name],`Unknown formula function '${t.value}'`);expect('(')
   const args:Expression[]=[]
   if(peek().value!==')')for(;;){args.push(expression(0,depth+1));if(peek().value!==',')break;take()}
   expect(')');requireThat(args.length>=arities[name][0]&&args.length<=arities[name][1],`${name} expects ${arities[name].join('–')} arguments`)
   return {kind:'call',name,args}
  }
  requireThat(false,`Invalid formula near '${t.value||'end'}'`)
 }
 function expression(min:number,depth:number):Expression {
  let left=primary(depth)
  while(peek().kind==='symbol'&&(precedence[peek().value]??-1)>=min){const op=take().value;left={kind:'binary',op,left,right:expression(precedence[op]+1,depth+1)}}
  return left
 }
 const result=expression(0,0);requireThat(peek().kind==='end',`Invalid formula near '${peek().value}'`);return result
}
export function visitExpression(e:Expression,visit:(node:Extract<Expression,{kind:'call'}>)=>void):void {
 if(e.kind==='call'){visit(e);e.args.forEach(a=>visitExpression(a,visit))}
 else if(e.kind==='binary'){visitExpression(e.left,visit);visitExpression(e.right,visit)}
 else if(e.kind==='unary')visitExpression(e.value,visit)
}
export function quoted(e:Expression|undefined,label:string):string {requireThat(e?.kind==='string',`${label} must be a quoted name`);return e.value}
