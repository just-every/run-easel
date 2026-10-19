-- Provider keys have separate custody and never enter the portable model.
CREATE TABLE e_connection_secrets (
 id TEXT PRIMARY KEY,
 sealed TEXT NOT NULL
);
