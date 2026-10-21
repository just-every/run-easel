-- Operation receipts, separate from editable model records and calculation caches.
-- Results are published only once all bounded chunks have been written.
CREATE TABLE e_calculation_jobs (
 id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL,
 authority_digest TEXT NOT NULL,
 scenarios TEXT NOT NULL CHECK(json_valid(scenarios) AND json_type(scenarios)='array'),
 source_revision INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('running','completed','failed','interrupted')),
 started_at TEXT NOT NULL,
 deadline_at INTEGER NOT NULL,
 completed_at TEXT,
 error TEXT,
 response_status INTEGER,
 result_chunks INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX e_calculation_jobs_running ON e_calculation_jobs(status,deadline_at);

CREATE TABLE e_calculation_job_chunks (
 job_id TEXT NOT NULL REFERENCES e_calculation_jobs(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL,
 body TEXT NOT NULL CHECK(length(CAST(body AS BLOB))<=524288),
 PRIMARY KEY(job_id,ordinal)
);
