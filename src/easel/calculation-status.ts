import type { CalculationJob } from './calculation-jobs'
import { Fault } from './types'

/** A read has no final numbers while its reviewed source change is unfinished. */
export class CalculationPending extends Fault {
 constructor(public scenarios: string[], public job?: CalculationJob) {
  super(425, job ? 'This scenario is recalculating in the background' : 'Continue or undo the workbook import before reading final figures')
 }
}
