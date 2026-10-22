-- Immutable versions and exact submitted-content captures use their own
-- additive table. Old archives restore it empty; no old record is rewritten.
CREATE TABLE e_approval_captures (
 kind TEXT NOT NULL CHECK(kind IN ('approval-chain-version', 'approval-content')),
 id TEXT NOT NULL,
 revision TEXT NOT NULL,
 value TEXT NOT NULL CHECK(json_valid(value)),
 PRIMARY KEY(kind,id)
);
CREATE TRIGGER e_approval_captures_no_update BEFORE UPDATE ON e_approval_captures
BEGIN SELECT RAISE(ABORT, 'Approval versions and reviewed content are immutable'); END;
CREATE TRIGGER e_approval_captures_no_delete BEFORE DELETE ON e_approval_captures
BEGIN SELECT RAISE(ABORT, 'Approval versions and reviewed content are immutable'); END;
