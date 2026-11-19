-- Preserve the user's chosen amount separately from the exact amount transferred.
-- Existing invoices keep requested_amount=NULL and continue using base_amount.
-- New wallet top-ups may reserve base_amount=unique_amount > requested_amount.
-- This requires no table rebuild, no changes to settlement triggers, and no balance migration.
ALTER TABLE invoices
  ADD COLUMN requested_amount INTEGER
  CHECK (requested_amount IS NULL OR requested_amount > 0);
