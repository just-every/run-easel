-- Easel planning model. One installation plans one entity.
-- e_records holds the editable model (workspace, people, departments, lines,
-- mappings, scenarios and their inputs, submissions, proposals, packs).
-- destination is 'main' for records people create; a move-in kit writes its
-- own destination so its journal can undo exactly what it wrote.
CREATE TABLE e_meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0);
INSERT INTO e_meta VALUES(1,0);
CREATE TABLE e_records (
 destination TEXT NOT NULL DEFAULT 'main', kind TEXT NOT NULL, id TEXT NOT NULL, revision TEXT NOT NULL,
 value TEXT NOT NULL CHECK(json_valid(value)), PRIMARY KEY(kind,id)
);
CREATE INDEX e_records_destination ON e_records(destination);
CREATE TRIGGER e_records_insert AFTER INSERT ON e_records BEGIN UPDATE e_meta SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER e_records_update AFTER UPDATE ON e_records BEGIN UPDATE e_meta SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER e_records_delete AFTER DELETE ON e_records BEGIN UPDATE e_meta SET revision=revision+1 WHERE id=1; END;

-- Accepted actuals rows, written only by the CSV actuals kit (destination
-- 'actuals:<batch>'). amount is integer minor units, debit positive.
CREATE TABLE e_actuals (
 destination TEXT NOT NULL, id TEXT NOT NULL, revision TEXT NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)),
 period TEXT NOT NULL CHECK(period GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'), account TEXT NOT NULL, department TEXT NOT NULL,
 amount INTEGER NOT NULL, fingerprint TEXT NOT NULL, row_no INTEGER NOT NULL,
 PRIMARY KEY(destination,id)
);
CREATE INDEX e_actuals_period ON e_actuals(period, account, department);
CREATE INDEX e_actuals_fingerprint ON e_actuals(fingerprint);
CREATE TRIGGER e_actuals_insert AFTER INSERT ON e_actuals BEGIN UPDATE e_meta SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER e_actuals_delete AFTER DELETE ON e_actuals BEGIN UPDATE e_meta SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER e_actuals_update AFTER UPDATE ON e_actuals BEGIN UPDATE e_meta SET revision=revision+1 WHERE id=1; END;

-- Approved budgets, prior forecasts and published review packs. Rows are
-- immutable once written: what was approved stays exactly what was approved.
CREATE TABLE e_snapshots (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('approval','forecast','pack')), scenario TEXT NOT NULL,
 label TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, sha256 TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body))
);
CREATE TRIGGER e_snapshots_immutable_update BEFORE UPDATE ON e_snapshots BEGIN SELECT RAISE(ABORT, 'snapshots are immutable'); END;
CREATE TRIGGER e_snapshots_immutable_delete BEFORE DELETE ON e_snapshots BEGIN SELECT RAISE(ABORT, 'snapshots are immutable'); END;

-- Append-only activity: who changed what, with the scenario revision before and after.
CREATE TABLE e_activity (
 seq INTEGER PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
 record TEXT NOT NULL, scenario TEXT, before_revision INTEGER, after_revision INTEGER, detail TEXT NOT NULL CHECK(json_valid(detail))
);
CREATE TRIGGER e_activity_append_only_update BEFORE UPDATE ON e_activity BEGIN SELECT RAISE(ABORT, 'activity is append-only'); END;
CREATE TRIGGER e_activity_append_only_delete BEFORE DELETE ON e_activity BEGIN SELECT RAISE(ABORT, 'activity is append-only'); END;

CREATE TABLE e_guard (ok INTEGER NOT NULL CHECK(ok=1));
