CREATE TABLE IF NOT EXISTS accounts (
    user_id INTEGER PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    stars_balance INTEGER NOT NULL DEFAULT 0 CHECK (stars_balance BETWEEN 0 AND balance),
    game_id TEXT NOT NULL DEFAULT '',
    lang TEXT NOT NULL DEFAULT 'uz'
);

CREATE TABLE IF NOT EXISTS boost_schedule (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    min_hours INTEGER NOT NULL,
    max_hours INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL,
    current_rank INTEGER NOT NULL,
    target_rank INTEGER NOT NULL,
    game_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    card TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    request_key TEXT,
    lang TEXT NOT NULL DEFAULT 'uz',
    eta_min_hours INTEGER,
    eta_max_hours INTEGER,
    UNIQUE (user_id, request_key)
);

CREATE TABLE IF NOT EXISTS donat_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    product TEXT NOT NULL,
    option_code TEXT NOT NULL,
    option_label TEXT NOT NULL,
    detail TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    method TEXT NOT NULL,
    lang TEXT NOT NULL DEFAULT 'uz',
    status TEXT NOT NULL,
    request_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, request_key)
);

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    order_id INTEGER UNIQUE REFERENCES orders (id),
    donat_order_id INTEGER UNIQUE REFERENCES donat_orders (id),
    kind TEXT NOT NULL CHECK (kind IN ('order', 'donat', 'topup')),
    method TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    stars INTEGER NOT NULL DEFAULT 0 CHECK (stars >= 0),
    status TEXT NOT NULL DEFAULT 'pending',
    request_key TEXT NOT NULL,
    telegram_charge_id TEXT UNIQUE,
    created_at TEXT NOT NULL,
    checkout_query_id TEXT,
    checkout_reserved_at INTEGER,
    admin_notice_pending INTEGER NOT NULL DEFAULT 0,
    notice_lease_until INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, request_key),
    CHECK (
        (kind = 'order' AND order_id IS NOT NULL AND donat_order_id IS NULL)
        OR (kind = 'donat' AND donat_order_id IS NOT NULL AND order_id IS NULL)
        OR (kind = 'topup' AND order_id IS NULL AND donat_order_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS orders_history ON orders (user_id, id DESC);
CREATE INDEX IF NOT EXISTS donat_history ON donat_orders (user_id, id DESC);
CREATE INDEX IF NOT EXISTS payment_history ON payments (user_id, id DESC);
CREATE INDEX IF NOT EXISTS payment_notices ON payments (notice_lease_until, id) WHERE admin_notice_pending = 1;

CREATE TABLE IF NOT EXISTS payment_exceptions (
    charge_id TEXT PRIMARY KEY,
    payment_id INTEGER,
    user_id INTEGER NOT NULL,
    currency TEXT NOT NULL,
    total_amount INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS save_boost_profile
AFTER INSERT ON orders
BEGIN
    INSERT INTO accounts (user_id, game_id, lang) VALUES (NEW.user_id, NEW.game_id, NEW.lang)
    ON CONFLICT (user_id) DO UPDATE SET game_id = excluded.game_id, lang = excluded.lang;
END;

-- Runs only when a new balance payment was inserted. A replay does not debit again.
CREATE TRIGGER IF NOT EXISTS debit_wallet_on_insert
AFTER INSERT ON payments
WHEN NEW.method = 'balance' AND NEW.status = 'paid'
BEGIN
    UPDATE accounts
    SET balance = balance - NEW.amount, stars_balance = stars_balance - NEW.amount
    WHERE user_id = NEW.user_id AND stars_balance >= NEW.amount;
    SELECT CASE WHEN changes() <> 1 THEN RAISE(ABORT, 'insufficient_balance') END;
END;

-- Each ledger change is part of the same transaction as the Stars charge.
CREATE TRIGGER IF NOT EXISTS settle_stars_payment
AFTER UPDATE OF status ON payments
WHEN OLD.status = 'pending' AND NEW.status = 'paid' AND NEW.method = 'stars'
BEGIN
    UPDATE orders SET status = 'paid'
    WHERE NEW.kind = 'order' AND id = NEW.order_id AND user_id = NEW.user_id AND status = 'pending';
    SELECT CASE WHEN NEW.kind = 'order' AND changes() <> 1 THEN RAISE(ABORT, 'invalid_order_status') END;

    UPDATE donat_orders SET status = 'paid'
    WHERE NEW.kind = 'donat' AND id = NEW.donat_order_id AND user_id = NEW.user_id AND status = 'pending';
    SELECT CASE WHEN NEW.kind = 'donat' AND changes() <> 1 THEN RAISE(ABORT, 'invalid_order_status') END;

    INSERT INTO accounts (user_id, balance, stars_balance)
    SELECT NEW.user_id, NEW.amount, NEW.amount WHERE NEW.kind = 'topup'
    ON CONFLICT (user_id) DO UPDATE SET
        balance = balance + excluded.balance,
        stars_balance = stars_balance + excluded.stars_balance;
END;
