-- Named frozen reforecasts share the append-only snapshot boundary. Rebuild
-- only the kind constraint, retaining every existing snapshot body and digest.
CREATE TABLE e_snapshots_reforecasts (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('approval','forecast','pack','reforecast')), scenario TEXT NOT NULL,
 label TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, sha256 TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body))
);
INSERT INTO e_snapshots_reforecasts(id,kind,scenario,label,actor,at,sha256,body)
 SELECT id,kind,scenario,label,actor,at,sha256,body FROM e_snapshots ORDER BY rowid;
DROP TABLE e_snapshots;
ALTER TABLE e_snapshots_reforecasts RENAME TO e_snapshots;
CREATE TRIGGER e_snapshots_immutable_update BEFORE UPDATE ON e_snapshots BEGIN SELECT RAISE(ABORT, 'snapshots are immutable'); END;
CREATE TRIGGER e_snapshots_immutable_delete BEFORE DELETE ON e_snapshots BEGIN SELECT RAISE(ABORT, 'snapshots are immutable'); END;
