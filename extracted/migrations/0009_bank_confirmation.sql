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
    ) THEN RAISE(ABORT, 'p2p_bank_confirmation_required') END;
END;
