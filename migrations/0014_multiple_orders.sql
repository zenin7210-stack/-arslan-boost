-- Remove the global "one unfinished order per customer" constraint.
-- Customers may place multiple BOOST/DONAT orders independently.
-- Invoice uniqueness (one pending bank transfer per customer), request-key
-- idempotency, bank event verification, and payment settlement triggers remain.
-- Only these two overbroad triggers are dropped.
DROP TRIGGER IF EXISTS arslan_one_active_boost;
DROP TRIGGER IF EXISTS arslan_one_active_donat;
