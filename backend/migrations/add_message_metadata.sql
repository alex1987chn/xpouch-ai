-- Migration: Add metadata column to message table
-- Date: 2026-02-01
-- Description: Add JSON metadata column to store thinking, reasoning, etc.

-- For PostgreSQL
ALTER TABLE message ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Add index for metadata queries (optional, if you need to query by metadata fields)
-- CREATE INDEX IF NOT EXISTS idx_message_metadata ON message USING GIN (metadata);

-- Verify
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'message';
