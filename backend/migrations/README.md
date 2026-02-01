# Database Migrations

## Migration Files

### 2026-02-01_add_message_metadata.sql
Add `metadata` JSON column to `message` table for storing thinking process, reasoning content, etc.

**Apply to production:**
```bash
psql $DATABASE_URL -f migrations/add_message_metadata.sql
```

**Verify:**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'message';
```
