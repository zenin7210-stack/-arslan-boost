ALTER TABLE invoices ADD COLUMN order_payment_id INTEGER REFERENCES payments (id);
CREATE UNIQUE INDEX p2p_one_invoice_per_order ON invoices (order_payment_id)
    WHERE order_payment_id IS NOT NULL;

DROP TRIGGER settle_stars_payment;
CREATE TRIGGER settle_order_payment
AFTER UPDATE OF status ON payments
WHEN OLD.status = 'pending' AND NEW.status = 'paid'
    AND NEW.method IN ('stars', 'uzcard', 'humo')
BEGIN
    UPDATE orders SET status = 'paid'
    WHERE NEW.kind = 'order' AND id = NEW.order_id AND user_id = NEW.user_id AND status = 'pending';
    SELECT CASE WHEN NEW.kind = 'order' AND changes() <> 1 THEN RAISE(ABORT, 'invalid_order_status') END;

    UPDATE donat_orders SET status = 'paid'
    WHERE NEW.kind = 'donat' AND id = NEW.donat_order_id AND user_id = NEW.user_id AND status = 'pending';
    SELECT CASE WHEN NEW.kind = 'donat' AND changes() <> 1 THEN RAISE(ABORT, 'invalid_order_status') END;

    INSERT INTO accounts (user_id, balance, stars_balance)
    SELECT NEW.user_id, NEW.amount, NEW.amount WHERE NEW.kind = 'topup' AND NEW.method = 'stars'
    ON CONFLICT (user_id) DO UPDATE SET
        balance = balance + excluded.balance,
        stars_balance = stars_balance + excluded.stars_balance;
END;

DROP TRIGGER p2p_match_incoming;
CREATE TRIGGER p2p_match_incoming
AFTER INSERT ON p2p_incoming
WHEN NEW.invoice_id IS NOT NULL
BEGIN
    UPDATE invoices
    SET status = 'paid', paid_at = NEW.received_at, paid_ref = NEW.bank_ref, received_amount = NEW.amount
    WHERE id = NEW.invoice_id AND status IN ('pending', 'expired', 'manual_check');
    SELECT CASE WHEN changes() <> 1 THEN RAISE(ABORT, 'p2p_invoice_already_closed') END;
END;

DROP TRIGGER p2p_credit_on_paid;
CREATE TRIGGER p2p_settle_on_paid
AFTER UPDATE OF status ON invoices
WHEN OLD.status <> 'paid' AND NEW.status = 'paid'
BEGIN
    UPDATE payments SET status = 'paid', admin_notice_pending = 1
    WHERE id = NEW.order_payment_id AND kind IN ('order', 'donat') AND status = 'pending'
        AND user_id = NEW.user_id AND amount = NEW.base_amount AND method = NEW.payment_method
        AND NEW.received_amount = NEW.unique_amount;
    SELECT CASE WHEN NEW.order_payment_id IS NOT NULL AND changes() <> 1
        THEN RAISE(ABORT, 'invalid_order_status') END;

    INSERT INTO accounts (user_id, p2p_balance)
    SELECT NEW.user_id, NEW.base_amount WHERE NEW.order_payment_id IS NULL
    ON CONFLICT (user_id) DO UPDATE SET p2p_balance = p2p_balance + excluded.p2p_balance;
    INSERT INTO p2p_notices (invoice_id) VALUES (NEW.id);
END;
