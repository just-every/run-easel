-- Operational webhook state is installation-bound and excluded from archives.
CREATE TABLE e_automation_events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE,
 type TEXT NOT NULL,
 body TEXT NOT NULL,
 at TEXT NOT NULL
);
CREATE TABLE e_webhook_subscriptions (
 id TEXT PRIMARY KEY,
 label TEXT NOT NULL,
 host TEXT NOT NULL,
 sealed TEXT,
 events TEXT NOT NULL,
 operator_id TEXT NOT NULL,
 operator_version INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 revoked_at TEXT
);
CREATE TABLE e_webhook_deliveries (
 subscription TEXT NOT NULL REFERENCES e_webhook_subscriptions(id),
 event TEXT NOT NULL REFERENCES e_automation_events(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','delivered','failed','uncertain','blocked')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_at TEXT NOT NULL,
 started_at TEXT,
 completed_at TEXT,
 http_status INTEGER,
 PRIMARY KEY(subscription,event)
);
CREATE INDEX e_webhook_due ON e_webhook_deliveries(status,next_at);

-- Registration/revocation must invalidate concurrent model readers and saves.
CREATE TRIGGER e_webhooks_insert AFTER INSERT ON e_webhook_subscriptions BEGIN UPDATE e_meta SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER e_webhooks_update AFTER UPDATE ON e_webhook_subscriptions BEGIN UPDATE e_meta SET revision=revision+1 WHERE id=1; END;
