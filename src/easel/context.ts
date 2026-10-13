import type { Activity, Snapshot } from './store'
import type { ActualCell } from './engine'
import type { Access, Data, State } from './types'

/** Everything one command may read or record. The command mutates `s`; the API saves it atomically. */
export type Context = {
 s: State
 x: Access
 db: D1Database
 activity: Activity[]
 snapshots: Snapshot[]
 /** Accepted actuals mapped to lines and departments. */
 actuals: () => Promise<ActualCell[]>
 now: string
}

export type Command = (c: Context, op: string, b: Data) => Promise<Data | undefined> | Data | undefined

/** A move-in step: the command records intent, the kit writes its journal, then the outcome is recorded. */
export type KitStep = { result: Data; kit?: () => Promise<any>; record?: (c: Context, outcome: any) => Data; failed?: (c: Context, error: Error) => Promise<void> }
