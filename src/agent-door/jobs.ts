import { ToolRefusal, type ToolContext } from '../modules/agent-door/index.ts'
import { backgroundScenario } from '../easel/calculation-dispatch'
import { startCalculationJob, type CalculationJobEnvelope } from '../easel/calculation-jobs'
import { Fault, type Data } from '../easel/types'
import { admits, nativeAction, nativeContext, type NativeAdmission } from './native.ts'

export type Defer = (work: Promise<unknown>) => void

/** A change above MODEL-007's inline size runs as the native background
 * calculation. The admitted call records the job handle as its outcome; the job
 * performs the one native effect with the call's authority, key and revision. */
export async function queuedAction(name: string, args: Data, ctx: ToolContext, admission: NativeAdmission, defer: Defer): Promise<CalculationJobEnvelope | null> {
 const c = await nativeContext(ctx)
 try {
  const scenario = backgroundScenario(c.s, name, args)
  if (!scenario) return null
  if (!admits(c, admission)) throw new Fault(409, 'The native plan or authority changed')
  return await startCalculationJob(c, [scenario], async id => {
   try { return Response.json((await nativeAction(name, args, ctx, true, admission, false, id)).result) }
   catch (e) { if (e instanceof ToolRefusal) return Response.json({ error: e.code }, { status: e.code === 'forbidden' ? 403 : e.code === 'resource_unavailable' ? 404 : 409 }); throw e }
  }, defer)
 } catch (e) {
  if (!(e instanceof Fault)) throw e
  if (e.status === 409) throw new ToolRefusal('revision_conflict', e.message, { current_revision: c.revision })
  throw new ToolRefusal(e.status === 403 ? 'forbidden' : e.status === 404 ? 'resource_unavailable' : 'invalid_arguments', e.message)
 }
}
