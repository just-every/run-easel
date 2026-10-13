The **Plan** tab holds the assumptions behind a scenario. Choose the scenario at the top; finance can edit any working plan, and contributors edit the budget once finance has asked for their department's submission, plus their own proposals.

Every card lists what is there, with **Edit** and **Remove** on each row, and the form to add another under the table.

## Revenue drivers

Each revenue model fills one revenue line for one department, from its start month:

- **Customers × revenue per customer**: starting customers, new customers per month, new customers per ramped hire in a hiring department (with the ramp months), monthly churn and monthly revenue per customer.
- **Volume × rate**: a starting volume, monthly growth and a rate per unit.

**Collected after (months)** sets when the revenue arrives as cash.

## Positions

A position is a role, named or still to be hired, in a department, from a start month to an optional end month. Its monthly cost is the annual salary ÷ 12 × (1 + on-costs). On-costs (superannuation, payroll tax and the like) are your own assumption; Easel does not calculate payroll.

Salary rounding is calculated across the plan horizon. Easel counts the position's active months inside the horizon, including its start and end months, then rounds the prorated total half away from zero to cents: annual salary cents × (10,000 + on-cost basis points) × active months ÷ 120,000. Each month except the last uses the monthly amount from the original annual salary and on-cost rate rounded down to cents; the last active month receives the remainder so the active-month total equals the prorated target. This keeps every monthly salary non-negative, including very small salaries. Months before the horizon and after an end month do not count. Closed months continue to show actuals in the working forecast; if a rounded remainder falls in a closed month, it is not moved into another month.

Salaries are visible only to finance and the department's own contributors.

## Expenses

Expenses are **Recurring monthly** from a start month, or **One-off** in the month they fall in, each on a cost line and a department. Workbook move-ins add **Monthly schedules**, entered month by month, each keeping the sheet and cell it came from.

## Shared costs

An allocation spreads a shared department's costs over the departments you choose, by **Headcount each month** or by **Fixed shares** you enter. Every allocated amount names the rule that moved it.

## Opening cash and timing

Opening cash is either **an estimate** you enter or **imported from actuals** (the rows mapped to the cash balance), and Easel says which. Add opening receivables and payables, and how many months after it is earned revenue is collected and costs are paid. Payroll is paid in its own month.

## Read any number

The **Overview** tab shows the year as a profit and loss by month, the closing cash chart, and monthly cash: opening, collections, payments and closing. Shaded months are actuals. Choose any amount and Easel shows how it was calculated, for example:

> Sales · Subscriptions: 84.00 × $1,200.00 per customer = $100,800.00

If the closing cash chart shows a dashed line, it is the newest working scenario branched from the plan you are reading. **Check these** lists anything Easel could not place, such as a closed month with no accepted actuals.
