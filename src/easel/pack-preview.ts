// REPORT-003: a draft pack's current numbers, shown live until it is
// published. `stale` says the numbers moved since the pack was last generated
// or refreshed (for example after a late adjustment). Commentary lives with
// each variance explanation, so a refresh never touches it.
import { requireCapability } from './access'
import type { Context } from './context'
import { packNumbers, templateBody } from './pack-body'
import { PACK_SECTIONS } from './pack-template'
import { get, requireThat } from './types'

export async function packPreview(c: Context, id: string) {
 requireCapability(c.x, 'publishing', c.s)
 const pack = get(c.s, 'pack', id, 'pack')
 requireThat(pack.status === 'draft', 'A published pack is read from its snapshot', 409)
 const { numbers, fingerprint } = await packNumbers(c, pack)
 return { pack, fingerprint, stale: fingerprint !== pack.generated?.fingerprint, body: templateBody(numbers, pack.sections ?? [...PACK_SECTIONS]) }
}
