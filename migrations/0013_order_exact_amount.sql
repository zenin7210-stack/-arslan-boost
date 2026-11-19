-- Preserve the real product price in payments.amount and invoice.requested_amount.
-- invoices.unique_amount (and historical base_amount) is the exact bank amount,
-- which may be +100, +200... when the original amount is reserved.
-- This changes only the matching condition; authorization, unique event matching,
-- and settlement idempotency remain exactly as in 0008/0009.
DROP TRIGGER IF EXISTS p2p_settle_on_paid;
CREATE TRIGGER p2p_settle_on_paid
AFTER UPDATE OF status ON invoices
WHEN OLD.status <> 'paid' AND NEW.status = 'paid'
BEGIN
    UPDATE payments SET status = 'paid', admin_notice_pending = 1
    WHERE id = NEW.order_payment_id AND kind IN ('order', 'donat') AND status = 'pending'
        AND user_id = NEW.user_id
        AND amount = COALESCE(NEW.requested_amount, NEW.base_amount)
        AND method = NEW.payment_method
        AND NEW.received_amount = NEW.unique_amount;
    SELECT CASE WHEN NEW.order_payment_id IS NOT NULL AND changes() <> 1
        THEN RAISE(ABORT, 'invalid_order_status') END;

    INSERT INTO accounts (user_id, p2p_balance)
    SELECT NEW.user_id, NEW.base_amount WHERE NEW.order_payment_id IS NULL
    ON CONFLICT (user_id) DO UPDATE SET p2p_balance = p2p_balance + excluded.p2p_balance;
    INSERT INTO p2p_notices (invoice_id) VALUES (NEW.id);
END;
