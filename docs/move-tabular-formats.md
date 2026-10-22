`parseTabular(provider, files, options)` reads original Planful, Anaplan, Runway and Pigment exports. It does not assume that customers have identical models or column headings. The buyer's `options.tables` describes each original table; the separate `mapping` chooses Easel destinations. Each fixture package has a `manifest.json` containing both, the original files to upload, and `expected.json` with independently calculated amounts. Manifest and expected files are instructions/evidence, not provider exports to upload.

All identifiers are synthetic `synthetic-easel-<n>` replacements. In particular, Pigment GUID values have intentionally been replaced by these safe synthetic identifiers; the column layout and relationships are retained.

## Planful

`Segment1.csv` is the account chart, `Segment2.csv` is Company, `Segment3.csv` is the buyer's department segment, and `Segment4.csv` is the buyer's intercompany segment. The parser uses the exported Code, Name and ParentCode, with AccountType retained on accounts. Untranslated properties such as Lineage appear in the report. Planful documents CSV segment extracts, including these fields, in its [official REST API documentation](https://developers.planful.com/).

`DLR-MTD.csv` uses Export Data Setup with headings enabled, periods on rows, and the monthly MTD measure. Its Account, Company, ICSegment, Department, Scenario, Fiscal Year, Fiscal Month and Amount headings are source export headings. `measure: "MTD"` is mandatory; explicit `periods` maps fiscal year/month to calendar month. The version catalog is explicitly selected from the Scenario column of this same original file. This captures scenarios actually exported, not unexported scenarios. These settings and configurable header names are documented in [Export Data Setup](https://help.planful.com/v1/docs/why-and-how-should-i-use-export-data-export-data-setup).

`Personnel-Dimension.json` is the **documented Dynamic Planning dimension hierarchy export**, not a claim about the built-in Employee Export's header schema. The fixture customer models Personnel as a dimension with one member per position; its reporting attributes hold Scenario, Home Budget Entity, Salary Account and the compensation assumptions. Export Dimension / Attribute Hierarchy with attributes enabled returns `members`, each with `memberCode`, optional `memberParent`, `rollupOperator`, `memberDisplayLabel`, and `mapping: [{attribute, attributeCode}]`. The parser preserves each attribute's own name and code as raw personnel values. `rowFilter: {rollupOperator: "+"}` explicitly selects this customer's five position members and reports its root as excluded. This exact shape and attribute mappings are available from [Planful's official documentation collection](https://developers.planful.com/api/collections/24600562/2s8YsxvrhD?segregateAuth=true&versionTag=latest), under Dynamic Planning APIs → Master and Analytic Model → Export Dimension / Attribute Hierarchy. `personnel-export-request.json` records its original request settings without credentials. The fixture uses a customer-defined personnel dimension; the unverified built-in Workforce Employee Export route is not required or claimed.

`ApprovalRoleExport.xlsx` preserves the documented User ID, Approval Role, Member Type and Level columns. Its access grant is reported, never installed as an Easel permission. See [Planful approval-role export](https://help.planful.com/v1/docs/approval-role-setup).

## Anaplan

The Accounts, Departments, Regions and Versions files are configurable list exports, with names, codes, parents and customer properties. Versions is this customer's ordinary list dimension, not an assertion that Anaplan's built-in Versions has a Code property. The Regions parent is exported by name and explicitly mapped to its code in the buyer configuration. `FIN01.csv` is a module's flat table output with version, account, department, time and region labels. `EMP01.csv` is a personnel module with line items in columns; its names and assumptions are customer line items. `CAP01.csv` is another module and is reported as an untranslated capital-asset row.

Use row-label headings, code labels where configured, and omit summary items to avoid counting both a parent and its children. Anaplan documents [supported module layouts](https://help.anaplan.com/export-layouts-for-modules-and-dashboards-9277b985-cf76-45cb-becc-5cddc07906f9), [multiple-column table exports and configurable labels](https://help.anaplan.com/export-data-in-a-multiple-column-table-layout-210b8028-b638-4028-b851-ec305f8edcb3), and [list export metadata with Parent, Code and custom properties](https://help.anaplan.com/get-the-export-definitions-for-the-specified-modelid-68cd33fc-55bc-4849-b2e6-05d96a6ece7b). No Anaplan formulas or selective-access rules are claimed to be present in these value-only CSV files.

## Runway

The original filenames follow `<Page> - <Block> - <Layer>.csv`. Accounts, Teams, Markets and Plans are this customer's databases; Positions is a workforce database; Income statement is a monthly driver grid. The manifest explicitly identifies the original columns and months. Capital Assets is another database block and is reported as untranslated.

Runway documents CSV output from models, databases, driver grids and query results, rather than a universal financial schema. Its configured block date window determines the exported months. See [Exporting to CSV](https://runway-docs.cfo.ai/integrations/exporting-csv).

`export-api.json` is an alternative original API response for the financial CSV: `{filename, contents}`. To exercise it, replace the Income statement CSV artifact/table filename with `export-api.json` and set that table's `envelope` to `export-api`. Upload one alternative only. The [Export API](https://runway-docs.cfo.ai/integrations/export-api) documents this response and states that formulas export calculated data, not formula expressions. The parser therefore does not invent formula provenance absent from the source.

## Pigment

The list files place GUID first and then customer list properties. `Positions-List.csv` is this customer's position List, whose properties include its workforce assumptions. `Finance-Table.csv` places Scenario and dimensions before the Payroll, Revenue and Cloud metric columns. Explicit `metrics` maps those source metric headings to the account chart; this is not an invented Account/Amount schema. Asset List is reported as an untranslated modeled row.

The fixture chooses semicolon delimiters and friendly headers. Names, dimension references, source identifiers and monthly labels are selected consistently across the exported blocks. These shapes, configurable fields, scenario selection and delimiters are documented in [Export raw data from a Pigment Block](https://kb.pigment.com/docs/raw-data-block). [View exports](https://kb.pigment.com/docs/export-data-with-apis) also flatten dimensions into row columns and metrics into value columns; a buyer can describe such a view with the same table options. These exports contain values; Pigment formulas and access rights are not reconstructed from them.

## Buyer table options

Each `options.tables` entry has these fields:

| Field | Meaning |
| --- | --- |
| `file` | Exact original upload filename. One original can serve multiple metadata/data roles. |
| `role` | `levels`, `accounts`, `versions`, `dimension`, `data`, `personnel`, or `unmapped`. |
| `columns` | Logical field → original heading. Metadata uses `id`, `name`, optional `parent`/`type`. Data uses `version`, `account`, `level`, `month`, `amount`; fiscal periods use `year` and `period`. Personnel uses `id`, `version`, `level`, `account`. |
| `constants` | Logical field → explicit string, useful when a source export is scoped to a version/account/level. An artifact's explicit `version` is also supported. |
| `dimension` | For a dimension catalog, `{id, name}` identifies the original list/dimension. |
| `dimensions` | Source dimension ID → original data/personnel heading containing its member reference. |
| `months` | Original month heading → `YYYY-MM`, for monthly columns. |
| `metrics` | Original metric heading → source account ID, for flat metric columns. Use either metrics or monthly columns. |
| `monthValues` | Original long-layout month label → `YYYY-MM`; ISO months need no conversion. |
| `periods` | Exact `year/period` string → `YYYY-MM`. Fiscal year conventions are never inferred. |
| `valueMap` | Logical field → source value → replacement string; used, for example, to resolve exported parent names to IDs. |
| `personnelColumns` | Native position command field → raw exported heading. Marks supported personnel columns; the output still retains the raw headings and values. The native destination mapping uses the same `mapping.personnelColumns`. |
| `rowFilter` | Original heading → exact selected source string. Every excluded row is reported. |
| `delimiter` | `,` or `;`, matching the source CSV export settings. |
| `sheet`, `headerRow` | Exact .xlsx worksheet and positive heading-row number. Multiple worksheets require explicit selection. CSV headings must be first. |
| `envelope` | `export-api` for Runway's JSON wrapper; `planful-dimension` for Planful's documented members/attribute-mapping JSON. |
| `reason` | Why an `unmapped` source table cannot be translated. |
| `identityColumns` | Manifest declaration of raw personnel identifier/name headers for the import's identity-retention policy; it does not translate values or change permissions. |

Text and base64 transport both preserve original file bytes. Binary `.xls` is refused; export CSV or `.xlsx` in the provider. Excel reads cached values and records each formula cell as untranslated. Formula text in an amount without an exported calculated value is refused. Missing selected headings, ragged CSV rows, source cell errors, conflicting metadata, unsupported structured attributes and ambiguous month labels are refused. Nonempty unrecognized columns, excluded rows and files without a role are reported with original locations. A blank amount in a wide month/metric export is absent data, not an inferred zero.

The native importer owns money validation, destination permissions, preview, payroll reconciliation, journal, and undo. These parsers do no writes and do not execute source formulas, copy permissions, infer benefit eligibility, infer tax policy, or rescale percentages. The buyer must supply the exact entered compensation units used by the destination command.

## Fixture arithmetic

Every provider carries the same independently specified year: four salary positions at $120,000 and one hourly position at $25 × 160 hours/month. Three have holders and two have empty holder names. All begin in January 2026. One employee receives $200/month benefits, 10% merit effective July 1, and a 10% salary bonus paid in December. On-cost assumptions are explicitly zero.

Engineering holds that employee, the hourly employee, and one planned hire. Its monthly payroll is $24,200 January–June, $25,200 July–November, and $38,400 December. Sales holds one employee and one planned hire, totaling $20,000 each month. The December bonus is $120,000 × 1.10 × 10% = $13,200. Total annual payroll is $549,600, including $2,400 benefits and $6,000 merit. Each financial export also includes monthly subscription revenue and cloud spend, plus a second scenario's revenue. The custom retention column is deliberately untranslated. Source permission files and other modeled rows are included only where their actual documented export shape supports them.
