ALTER TABLE accounts ADD COLUMN p2p_balance INTEGER NOT NULL DEFAULT 0 CHECK (p2p_balance >= 0);

CREATE TABLE p2p_card_flags (
    card_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1))
);

CREATE TABLE invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    request_id TEXT NOT NULL,
    base_amount INTEGER NOT NULL CHECK (base_amount > 0),
    unique_amount INTEGER NOT NULL CHECK (unique_amount - base_amount BETWEEN 1 AND 99),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('humo', 'uzcard')),
    card_id TEXT NOT NULL,
    card_number TEXT NOT NULL CHECK (length(card_number) = 4),
    card_holder TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'manual_check', 'rejected')),
    receipt_file_id TEXT,
    receipt_unique_id TEXT UNIQUE,
    receipt_chat_id INTEGER,
    receipt_message_id INTEGER,
    review_message_id INTEGER,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL CHECK (expires_at = created_at + 600),
    checked_at INTEGER,
    paid_at INTEGER,
    paid_ref TEXT,
    received_amount INTEGER,
    review_user_id INTEGER,
    lang TEXT NOT NULL CHECK (lang IN ('uz', 'ru')),
    UNIQUE (user_id, request_id),
    UNIQUE (card_id, paid_ref),
    CHECK (status <> 'paid' OR (paid_ref IS NOT NULL AND received_amount >= base_amount AND paid_at IS NOT NULL)),
    CHECK (status <> 'manual_check' OR receipt_file_id IS NOT NULL)
);

CREATE UNIQUE INDEX p2p_unique_pending ON invoices (unique_amount) WHERE status = 'pending';
CREATE UNIQUE INDEX p2p_one_open_invoice ON invoices (user_id) WHERE status = 'pending';
CREATE INDEX p2p_expiry ON invoices (expires_at) WHERE status = 'pending';
CREATE INDEX p2p_card_amount ON invoices (card_id, unique_amount, created_at);
CREATE INDEX p2p_card_rotation ON invoices (card_id, created_at DESC);
CREATE INDEX p2p_user_history ON invoices (user_id, id DESC);

CREATE TABLE p2p_incoming (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('humo', 'uzcard', 'cardxabar')),
    source_event_id TEXT NOT NULL,
    bank_ref TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    occurred_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    invoice_id INTEGER UNIQUE REFERENCES invoices (id),
    UNIQUE (source, source_event_id),
    UNIQUE (card_id, bank_ref)
);

CREATE TABLE p2p_notices (
    invoice_id INTEGER PRIMARY KEY REFERENCES invoices (id),
    lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX p2p_notice_due ON p2p_notices (lease_until, invoice_id);

-- A bank event can link to just one invoice, even when a webhook is retried.
CREATE TRIGGER p2p_match_incoming
AFTER INSERT ON p2p_incoming
WHEN NEW.invoice_id IS NOT NULL
BEGIN
    UPDATE invoices
    SET status = 'paid', paid_at = NEW.received_at, paid_ref = NEW.bank_ref, received_amount = NEW.amount
    WHERE id = NEW.invoice_id AND status IN ('pending', 'manual_check');
    SELECT CASE WHEN changes() <> 1 THEN RAISE(ABORT, 'p2p_invoice_already_closed') END;
END;

CREATE TRIGGER p2p_credit_on_paid
AFTER UPDATE OF status ON invoices
WHEN OLD.status <> 'paid' AND NEW.status = 'paid'
BEGIN
    INSERT INTO accounts (user_id, p2p_balance) VALUES (NEW.user_id, NEW.base_amount)
    ON CONFLICT (user_id) DO UPDATE SET p2p_balance = p2p_balance + excluded.p2p_balance;
    INSERT INTO p2p_notices (invoice_id) VALUES (NEW.id);
END;

CREATE TRIGGER p2p_prevent_reopening
BEFORE UPDATE OF status ON invoices
WHEN OLD.status IN ('paid', 'rejected') AND NEW.status <> OLD.status
BEGIN
    SELECT RAISE(ABORT, 'p2p_invoice_already_closed');
END;
