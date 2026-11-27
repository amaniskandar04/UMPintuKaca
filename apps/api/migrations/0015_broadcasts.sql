-- Admin broadcasts: a message queued once, then delivered in small batches so a
-- large audience cannot exceed Worker subrequest limits or Telegram's rate limit.

CREATE TABLE broadcasts (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'queued',
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX broadcasts_status_idx ON broadcasts(status, created_at);

CREATE TABLE broadcast_recipients (
  broadcast_id TEXT NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (broadcast_id, user_id)
);

CREATE INDEX broadcast_recipients_status_idx ON broadcast_recipients(broadcast_id, status);
