const DETAILS = [
 ['Proposals', 'Changes bound to one exact revision, promoted or declined.'],
 ['Shared costs', 'Allocated by headcount or fixed shares, every amount named.'],
 ['Private pay', 'Salaries visible only to finance and their own department.'],
 ['Prior forecasts kept', 'Each month’s close keeps the forecast as it stood.'],
 ['Activity', 'Who changed what, with the revision before and after.'],
 ['Export and restore', 'The whole installation, moved anywhere.'],
]

export function Details() {
 return <section className="details" id="details" aria-labelledby="details-title">
  <p className="eyebrow">Also included</p>
  <h2 id="details-title">The quiet details.</h2>
  <ul>{DETAILS.map(([title, line]) => <li key={title}><h3>{title}</h3><p>{line}</p></li>)}</ul>
 </section>
}
