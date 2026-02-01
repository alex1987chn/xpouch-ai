-- Migration: Add extra_data column to message table
-- Date: 2026-02-01
-- Description: Add JSON extra_data column to store thinking, reasoning, etc.
-- Note: Cannot use 'metadata' as it's a SQLAlchemy reserved word

-- For PostgreSQL
ALTER TABLE message ADD COLUMN IF NOT EXISTS extra_data JSONB DEFAULT NULL;

-- Add index for extra_data queries (optional, if you need to query by extra_data fields)
-- CREATE INDEX IF NOT EXISTS idx_message_extra_data ON message USING GIN (extra_data);

-- Verify
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'message';
