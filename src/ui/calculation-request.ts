type Job = { id: string; scenarios: string[]; status: string; startedAt: string; error?: string }
const announce = (job: Job) => window.dispatchEvent(new CustomEvent('easel-calculation', { detail: job }))

/** Poll only the accepted operation; never repeat a mutation after a lost response. */
export async function waitForCalculation(path: string, body: unknown, initial: { calculationJob: Job }, read: (path: string) => Promise<unknown>): Promise<unknown> {
 const deadline = Date.now() + 150_000
 let job = initial.calculationJob
 announce(job)
 try {
  while (job.status === 'running') {
   if (Date.now() > deadline) throw new Error('The operation outcome is still unknown; reload the plan before taking another action')
   await new Promise(resolve => setTimeout(resolve, 350))
   const response = await fetch(`/api/easel/calculation-jobs/${encodeURIComponent(job.id)}`)
   const value: any = await response.json()
   // A model save may cross a status read's revision fence. The next poll reads
   // the new revision; the original mutation is never submitted again.
   if (response.status === 409) continue
   if (!response.ok) throw new Error(value.error ?? 'The calculation status is unavailable; reload the plan')
   job = value.calculationJob
   if (job.status === 'completed') {
    if (body === undefined) { announce(job); return read(path) }
    if (value.responseStatus === undefined) throw new Error('Your access changed; reload the plan to inspect the operation outcome')
    announce(job)
    return value.result
   }
   if (job.status === 'failed' || job.status === 'interrupted') throw new Error(value.result?.error ?? job.error ?? 'The operation did not complete; reload the plan before taking another action')
  }
  throw new Error('The operation status is unavailable; reload the plan')
 } catch (error) {
  announce({ ...job, status: 'failed', error: (error as Error).message })
  throw error
 }
}
