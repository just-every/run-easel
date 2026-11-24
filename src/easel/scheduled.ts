// The */15 cron. The runners share one read of the model (a later read costs a
// single e_meta row until something is saved), and each first checks with point
// reads whether its feature is on at all, so a quiet plan costs a few rows a run.
import { runtimeBindings, type Bindings } from '../auth.server'
import { runGaugeSchedule } from './gauge-schedule'
import { runCalendarSchedule } from './calendar-dispatch'
import { runActionChases } from './decision-followup'
import { runOwnerQuestionSchedule } from './agents/owner-question-schedule'
import { runSavedReportSchedules } from './saved-report-dispatch'
import { runCashAlertSchedule } from './cash-alert-schedule'
import { runSheetSchedules } from './sheet-schedule'
import { runBiDrops } from './bi-drops'
import { runMissions } from './agents/missions'
import { runWebhooks } from './webhooks'
import { runHistoryRetention } from './history-retention'
import { sharedReader } from './store'

export async function runScheduled(original: Bindings) {
 const read = sharedReader(runtimeBindings(original).DB)
 await runGaugeSchedule(original, read); await runCalendarSchedule(original, read)
 await runActionChases(original, read); await runOwnerQuestionSchedule(original, read)
 await runSavedReportSchedules(original, read); await runCashAlertSchedule(original, read); await runSheetSchedules(original, read); await runBiDrops(original, read); await runMissions(original, read); await runWebhooks(original, read)
 await runHistoryRetention(original, read)
}
