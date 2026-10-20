The budget is the plan your departments agree to. Finance asks for submissions, departments revise their own numbers, and approval keeps exactly what was approved.

## Request submissions

On the **Budget cycle** tab, finance chooses the departments and an optional due date and presses **Request submissions**. Each department appears in the table with its status: requested, submitted or returned, and the last change with who made it and when.

## Revise and submit

A contributor opens **Plan**, chooses the budget and changes only their own department's revenue, positions and expenses. They can leave a note under **Comments** for finance, then press **Submit Sales**, named for their department.

## Planning calendar and reminders

Under **Planning calendar** on the **Budget cycle** tab, finance adds dated tasks (review headcount, confirm variance explanations or another planning task) with an owner: an active contributor for a department task, or finance for a company-wide one. Requested submissions with a due date appear there too. Owners see only their own tasks and mark them complete.

Turn on **Send reminders and escalations** to email each owner at 09:00 the day before a task is due, in the company's time zone, and to escalate an open task to finance at 09:00 on the first weekday after it was due. Every send is recorded with its scheduled and actual time. Slack and Microsoft Teams incoming webhooks (set `SLACK_WEBHOOK_URL` and `TEAMS_WEBHOOK_URL` when deploying) and one Nook channel (the owner connects it with a Nook integration token) can also get a generic "Easel planning task reminder" with a sign-in link; task details only go by email. Easel shows when a provider accepted a message, never claims it was read, and lets finance retry a refused send.

## Return or approve

Finance can **Return** a submission with a reason, and the department revises it again. When the numbers are right, finance presses **Approve and freeze revision n**. Easel keeps that exact revision, who approved it and when; the approved numbers are never recalculated, even if a rule changes later.

The forecast opens from the approved budget. From then on, [close each month](/docs/monthly-review) against it.
