# Linked Office reporting

In Easel → Reports, build a saved report with the source version, through month, lines and audience you want. The Office card uses that report's current permitted aggregate view. It offers tables, charts and single numbers for a chosen period and value. Individual compensation inputs are never included.

Download the PowerPoint or Word manifest from the Office card on **your installation**. In a supported Microsoft 365 Office client, sideload that XML using My Add-ins → Upload My Add-in (or your organization's trusted add-in catalog). PowerPoint requires PowerPointApi 1.8; Word requires WordApi 1.3. The installation needs trusted HTTPS; local HTTP is only for loopback development. No AppSource registration or Microsoft tenant credential is needed to sideload. Your Office administrator may restrict sideloading.

The manifest opens this installation's ordinary Reports page in the task pane. Sign in there with your native Easel account. Office webviews must permit that installation's session cookies; a browser that blocks those cookies cannot refresh, and Easel does not replace your identity with a shared account or put credentials in the document. A signed-out read is refused. Setup and sign-in stay under the existing native authentication rules.

Choose the saved report, period, content type and value, review the preview, and explicitly approve putting the aggregate values into this document. Insert adds content to the selected PowerPoint slide or Word selection. Charts are labeled image snapshots. Save the document to retain its link selectors and object identifiers.

Refresh linked content reads every link using your current Easel authority before changing the document. It retains the source version and report horizon selected at insertion. A deleted or unavailable report, changed source/horizon, removed row, revoked audience or missing/duplicated document object refuses refresh. An existing table whose row shape changes also needs deliberate reinsertion. Refresh changes content in place; it does not create replacements for missing objects or change other slide/memo content. Save afterward to keep refreshed values.

The linked report Excel download uses the existing live report formulas and availability labels. Missing values are unavailable, never invented zeroes. Hierarchy totals include their descendants and must not be summed with child rows.

Office owns the resulting deck or memo and its sharing. Previously exported values cannot be recalled by a later Easel revocation or erasure. Document metadata contains selectors, not an API token, native cookie or authorization grant. Opening someone else's document grants no Easel access. No background refresh or outbound document upload runs.

Implementation proof: `tests/saved-reports.test.mjs` — “Linked Office reports insert a native table and number into a pptx and refresh in place under live report authority”; `tests/office-report-flow.mjs` uses the production adapter against the contract's Office.js test host and inspects the resulting `.pptx`. `tests/office-reports-browser.mjs` covers the native report task pane at desktop and phone widths.
