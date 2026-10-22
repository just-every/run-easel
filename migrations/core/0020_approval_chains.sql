-- Ordered chain definitions and exact submitted-content captures live in the
-- existing fenced, audited e_records model and therefore travel in archives.
-- Retained versions and content are append-only; new saves use new IDs.
CREATE TRIGGER e_approval_versions_no_update BEFORE UPDATE ON e_records
WHEN OLD.kind IN ('approval-chain-version', 'approval-content')
BEGIN SELECT RAISE(ABORT, 'Approval versions and reviewed content are immutable'); END;
CREATE TRIGGER e_approval_versions_no_delete BEFORE DELETE ON e_records
WHEN OLD.kind IN ('approval-chain-version', 'approval-content')
BEGIN SELECT RAISE(ABORT, 'Approval versions and reviewed content are immutable'); END;
