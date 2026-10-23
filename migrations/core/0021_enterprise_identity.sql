-- Installation-local security and provisioning associations. Base portability
-- excludes oa_%: identities, correlations and provisioning custody never restore
-- into a destination's native directory. Planning memberships remain e_records.
CREATE TABLE oa_enterprise_saml_transactions (
 relay_hash TEXT PRIMARY KEY, binding_hash TEXT NOT NULL, config_hash TEXT NOT NULL,
 request_id TEXT NOT NULL UNIQUE, requested_at TEXT NOT NULL,
 return_to TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX oa_enterprise_saml_expiry ON oa_enterprise_saml_transactions(expires_at);
CREATE TABLE oa_enterprise_scim_users (
 operator_id TEXT PRIMARY KEY REFERENCES oa_operators(id),
 owner_id TEXT NOT NULL REFERENCES oa_operators(id),
 external_id TEXT UNIQUE
);
CREATE TABLE oa_enterprise_scim_groups (
 group_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES oa_operators(id),
 external_id TEXT UNIQUE
);
-- Erasure changes the native email in its revision-fenced transaction. Remove
-- provider identifiers at that same boundary, including externalId, rather than
-- keeping another plaintext identity directory beyond the erasure map.
CREATE TRIGGER oa_enterprise_erasure_user AFTER UPDATE OF email ON oa_operators
 WHEN OLD.email != NEW.email BEGIN
 DELETE FROM oa_enterprise_scim_users WHERE operator_id=NEW.id;
 DELETE FROM oa_provider_sessions WHERE session_id IN (SELECT id FROM oa_sessions WHERE operator_id=NEW.id);
END;

CREATE TRIGGER oa_enterprise_deleted_native_group AFTER DELETE ON e_records
 WHEN OLD.kind='access-group' BEGIN
 DELETE FROM oa_enterprise_scim_groups WHERE group_id=OLD.id;
END;
