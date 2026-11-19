-- Additive only. Keep previous records and their statuses intact.
ALTER TABLE invoices ADD COLUMN cancelled_at INTEGER;
CREATE TABLE p2p_invoice_cancellations (
  invoice_id INTEGER PRIMARY KEY REFERENCES invoices(id),
  user_id INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK(reason = 'not_sent_change_details'),
  cancelled_at INTEGER NOT NULL
);
CREATE INDEX p2p_cancel_audit_user ON p2p_invoice_cancellations(user_id,cancelled_at DESC);

-- Two purchases cannot run concurrently, including across BOOST and DONAT SHOP.
-- A paid order remains active until fulfilled; cancelled and rejected are terminal.
CREATE TRIGGER arslan_one_active_boost BEFORE INSERT ON orders
WHEN EXISTS (SELECT 1 FROM orders WHERE user_id = NEW.user_id AND status NOT IN ('fulfilled','cancelled','rejected'))
 OR EXISTS (SELECT 1 FROM donat_orders WHERE user_id = NEW.user_id AND status NOT IN ('fulfilled','cancelled','rejected'))
BEGIN SELECT RAISE(ABORT,'order_already_active'); END;
CREATE TRIGGER arslan_one_active_donat BEFORE INSERT ON donat_orders
WHEN EXISTS (SELECT 1 FROM orders WHERE user_id = NEW.user_id AND status NOT IN ('fulfilled','cancelled','rejected'))
 OR EXISTS (SELECT 1 FROM donat_orders WHERE user_id = NEW.user_id AND status NOT IN ('fulfilled','cancelled','rejected'))
BEGIN SELECT RAISE(ABORT,'order_already_active'); END;

CREATE TABLE order_claims (
  kind TEXT NOT NULL CHECK (kind IN ('order','donat')),
  order_id INTEGER NOT NULL,
  admin_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted','paused','done')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(kind, order_id)
);
CREATE INDEX order_claims_admin ON order_claims(admin_id,status,updated_at DESC);
-- Ensure no new entitlement exists from a cancelled invoice; a late arrival is unmatched.

CREATE TABLE order_admin_notices (
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  admin_id INTEGER NOT NULL,
  message_id INTEGER,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY(payment_id,admin_id)
);

-- Reliable, per-admin review notifications for mismatches and unverified claims.
CREATE TABLE p2p_review_alerts (
  kind TEXT NOT NULL CHECK (kind IN ('invoice','incoming')),
  reference_id INTEGER NOT NULL,
  admin_id INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0,
  delivered_at INTEGER,
  PRIMARY KEY (kind, reference_id, admin_id)
);
CREATE INDEX p2p_review_due ON p2p_review_alerts (lease_until) WHERE delivered_at IS NULL;

CREATE TABLE order_id_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('order','donat')),
  order_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  previous_value TEXT NOT NULL,
  updated_value TEXT NOT NULL,
  changed_at INTEGER NOT NULL
);
CREATE INDEX order_id_edits_order ON order_id_edits(kind,order_id,changed_at);
