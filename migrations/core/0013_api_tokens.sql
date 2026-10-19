-- Product scopes and labels accompany Base's opaque, fenced credentials.
-- Bearers and hashes remain exclusively in Base's credential store.
CREATE TABLE e_api_tokens (
 id TEXT PRIMARY KEY REFERENCES oa_credentials(id),
 label TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('personal','service')),
 scope TEXT NOT NULL CHECK(scope IN ('read','write')),
 issuing_role TEXT NOT NULL,
 departments TEXT NOT NULL CHECK(json_valid(departments)),
 created_at TEXT NOT NULL
);

-- Durable per-credential counters are local security state, excluded from export.
CREATE TABLE e_api_limits (
 token_id TEXT PRIMARY KEY REFERENCES e_api_tokens(id),
 window INTEGER NOT NULL,
 count INTEGER NOT NULL
);
