CREATE TABLE partners (
    user_id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','suspended')),
    code TEXT UNIQUE
);
CREATE TABLE partner_buyers (
    buyer INTEGER PRIMARY KEY,
    partner INTEGER NOT NULL REFERENCES partners(user_id),
    joined_at TEXT NOT NULL,
    CHECK (buyer <> partner)
);
CREATE INDEX partner_buyers_partner ON partner_buyers(partner);
CREATE TABLE partner_earnings (
    kind TEXT NOT NULL,
    order_id INTEGER NOT NULL,
    partner INTEGER NOT NULL REFERENCES partners(user_id),
    commission INTEGER NOT NULL CHECK (commission >= 0),
    available_at TEXT NOT NULL,
    PRIMARY KEY (kind, order_id)
);
CREATE INDEX partner_earnings_partner ON partner_earnings(partner, available_at);
CREATE TABLE partner_payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner INTEGER NOT NULL REFERENCES partners(user_id),
    amount INTEGER NOT NULL CHECK (amount >= 10000),
    destination TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','rejected'))
);
CREATE INDEX partner_payouts_partner ON partner_payouts(partner, status);
