export function prepareEaselExportTransform(options:{db:D1Database}):Promise<{policy:{exportRow:(table:string,row:any)=>any};metadata:any}>
