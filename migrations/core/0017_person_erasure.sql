-- A dedicated installation key for irreversible stable pseudonyms; never exported.
CREATE TABLE e_erasure_key (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
