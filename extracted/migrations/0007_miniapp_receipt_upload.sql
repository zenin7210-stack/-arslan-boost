ALTER TABLE invoices ADD COLUMN receipt_upload_hash TEXT;
ALTER TABLE invoices ADD COLUMN receipt_upload_until INTEGER;
CREATE UNIQUE INDEX p2p_receipt_upload_hash ON invoices (receipt_upload_hash)
WHERE receipt_upload_hash IS NOT NULL;
