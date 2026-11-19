-- Audit trail for manually verified UZCARD/HUMO transfers.
-- The only app endpoint that writes reviews verifies the Telegram admin ID.
CREATE TABLE p2p_manual_reviews (
  invoice_id INTEGER PRIMARY KEY REFERENCES invoices(id),
  admin_id INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('approved', 'rejected')),
  reviewed_at INTEGER NOT NULL
);
CREATE TABLE p2p_manual_queue (
  invoice_id INTEGER PRIMARY KEY REFERENCES invoices(id),
  notified_at INTEGER,
  lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX p2p_manual_queue_due ON p2p_manual_queue(lease_until) WHERE notified_at IS NULL;

-- Existing P2P topups were stored separately and were not spendable.
UPDATE accounts SET balance = balance + p2p_balance;

DROP TRIGGER debit_wallet_on_insert;
CREATE TRIGGER debit_wallet_on_insert
AFTER INSERT ON payments
WHEN NEW.method = 'balance' AND NEW.status = 'paid'
BEGIN
  UPDATE accounts SET
    balance = balance - NEW.amount,
    p2p_balance = p2p_balance - min(p2p_balance, NEW.amount),
    stars_balance = stars_balance - (NEW.amount - min(p2p_balance, NEW.amount))
  WHERE user_id = NEW.user_id AND balance >= NEW.amount
    AND p2p_balance + stars_balance >= NEW.amount;
  SELECT CASE WHEN changes() <> 1 THEN RAISE(ABORT,'insufficient_balance') END;
END;

DROP TRIGGER p2p_settle_on_paid;
CREATE TRIGGER p2p_settle_on_paid
AFTER UPDATE OF status ON invoices
WHEN OLD.status <> 'paid' AND NEW.status = 'paid'
BEGIN
  UPDATE payments SET status = 'paid', admin_notice_pending = 1
  WHERE id = NEW.order_payment_id AND kind IN ('order','donat') AND status = 'pending'
    AND user_id = NEW.user_id AND amount = NEW.base_amount AND method = NEW.payment_method
    AND NEW.received_amount = NEW.unique_amount;
  SELECT CASE WHEN NEW.order_payment_id IS NOT NULL AND changes() <> 1
    THEN RAISE(ABORT, 'invalid_order_status') END;
  INSERT INTO accounts (user_id, balance, p2p_balance)
  SELECT NEW.user_id, NEW.base_amount, NEW.base_amount WHERE NEW.order_payment_id IS NULL
  ON CONFLICT(user_id) DO UPDATE SET
    balance = balance + excluded.balance,
    p2p_balance = p2p_balance + excluded.p2p_balance;
  INSERT INTO p2p_notices (invoice_id) VALUES (NEW.id);
END;

-- Protect manual and automatic settlement by requiring one audited proof.
DROP TRIGGER p2p_paid_requires_bank_event;
CREATE TRIGGER p2p_paid_requires_bank_event
BEFORE UPDATE OF status ON invoices
WHEN OLD.status <> 'paid' AND NEW.status = 'paid'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM p2p_incoming AS incoming
    WHERE incoming.invoice_id = NEW.id AND incoming.card_id = NEW.card_id
      AND incoming.amount = NEW.unique_amount AND incoming.amount = NEW.received_amount
      AND incoming.bank_ref = NEW.paid_ref AND incoming.received_at = NEW.paid_at
      AND incoming.occurred_at >= OLD.created_at AND incoming.occurred_at < OLD.expires_at
  ) AND NOT EXISTS (
    SELECT 1 FROM p2p_manual_reviews AS review
    WHERE review.invoice_id = NEW.id AND review.decision = 'approved'
      AND review.admin_id = NEW.review_user_id AND review.reviewed_at = NEW.paid_at
      AND NEW.paid_ref = 'manual:' || NEW.id AND NEW.received_amount = NEW.unique_amount
      AND OLD.checked_at IS NOT NULL
  ) THEN RAISE(ABORT, 'p2p_confirmation_required') END;
END;
