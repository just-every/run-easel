This adapter reads uploaded originals; it makes no provider request. The Easel
upload bundle identifies each original by `name`, exactly one `text` or `base64`,
and optional `call`, `version`, and `sheet`. This wrapper is Easel transport, not
an Adaptive export format. Keep the originals in the import journal.

`fixtures/adaptive-planning/manifest.json` lists every fixture original and the
parser options. Load each listed file's bytes into the corresponding artifact.
The companion `personnel.csv` makes the CDATA payload readable; it is not a
second import artifact. All identities are synthetic. Validation is synthetic
only; no customer export or held-key provider run is claimed.

## Source shapes

Saved metadata XML has `response/output` containing `levels`, `accounts`,
`dimensions`, `attributes`, or `versions`. Level/account/version elements nest.
Dimension members nest as `dimensionValue`; attribute values nest as
`attributeValue`. Version folders are containers, not scenarios. Unknown account
properties and attribute hierarchies remain in the original and are reported
for mapping. Source IDs remain source IDs; native identity belongs to the kit.

- [exportLevels](https://doc.workday.com/adaptive-planning/en-us/workday-adaptive-planning-documentation/integration/managing-data-integration/api-documentation/metadata-and-data-create-update-and-read-methods/eaj1623708609527.html)
- [exportAccounts](https://doc.workday.com/adaptive-planning/en-us/workday-adaptive-planning-documentation/integration/managing-data-integration/api-documentation/metadata-and-data-create-update-and-read-methods/xlk1623709204009.html)
- [exportDimensions](https://doc.workday.com/adaptive-planning/en-us/workday-adaptive-planning-documentation/integration/managing-data-integration/api-documentation/metadata-and-data-create-update-and-read-methods/fpd1623708607387.html)
- [exportAttributes](https://doc.workday.com/adaptive-planning/en-us/workday-adaptive-planning-documentation/integration/managing-data-integration/api-documentation/metadata-and-data-create-update-and-read-methods/qdp1623708606028.html)
- [exportVersions](https://doc.workday.com/adaptive-planning/en-us/workday-adaptive-planning-documentation/integration/managing-data-integration/api-documentation/metadata-and-data-create-update-and-read-methods/drf1623709230196.html)

[exportData](https://doc.workday.com/adaptive-planning/en-us/workday-adaptive-planning-documentation/integration/managing-data-integration/api-documentation/metadata-and-data-create-update-and-read-methods/mdn1623709213322.html)
contains CSV in `output` CDATA. `dataColumns.account` and `.level` default to
`Account Code` and `Level Name`. Monthly headings may use MM/YYYY, YYYY-MM or
English month names. Optional `dimensionColumns` maps a dimension ID/name to its
CSV heading. Version context is required on each artifact because it is not a
CSV column. Account codes and level names resolve against exported metadata.
Summary periods and other nonmapped columns are reported, not added to totals.

[exportConfigurableModelData](https://doc.workday.com/adaptive-planning/en-us/workday-adaptive-planning-documentation/integration/managing-data-integration/api-documentation/metadata-and-data-create-update-and-read-methods/pmf1623709214213.html)
contains CSV in `output/data` CDATA. Set `personnelSheet` to the artifact's sheet
name. Every column is retained in `personnel.values`; no customer column name
is guessed. `InternalID` is required. `personnelLevelColumn` defaults to `Level`;
`personnelAccountColumn` defaults to `Account`, or `personnelAccount` explicitly
supplies the source payroll account. `personnelColumns` in the manifest maps
native command fields to buyer-selected headings for the generic mapper.
Other modeled-sheet rows are listed as unmapped. Split rows require explicit
consolidation and are refused. Use a complete `isGetAllRows` export; paged exports
declaring more than one page are refused. Completion flags/counts are checked.

Sheet XLSX originals are read for row/cell evidence and formulas; they do not
create duplicate schedules alongside `exportData`. Workday documents Excel
sheet download; its layout depends on the sheet. The synthetic sheet fixture
represents the same customer-defined personnel columns, not a universal layout.

The fixture has five positions, three holders, two to be hired and one hourly
position. The first employee has annual salary 120000, 10% merit effective
2026-07-01 and a 10% December bonus of 13200. Payroll totals are 19000 January–June,
24000 July–September, 27000 October–November and 40200 December: annual 280200.
Benefits, match and on-costs are explicitly zero; no tax policy is supplied.
The generic preview must calculate these positions with existing PEOPLE-004
semantics and compare payroll-account totals before any acceptance. It must also
report `Custom Column`, apply server-side pay filtering even in preview, and
include every created native record in fingerprinted commit and journal undo.
