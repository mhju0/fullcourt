---
name: fullcourt-migration
description: Schema change workflow for FullCourt's Supabase Postgres. Use whenever a task requires a new table, column, index, or grant change.
---

# FullCourt schema change

## Rules
- Claude Code only WRITES the .sql file. It NEVER applies it (the human runs it in
  the Supabase SQL editor) and NEVER runs drizzle-kit push/generate.
- File: drizzle/00XX_<name>.sql. Determine XX by reading the highest number ON DISK.
  Note: some migrations were applied manually in Supabase and may NOT exist as files
  on disk — if the next number is ambiguous, ESCALATE and ask the human to confirm it.
- Every new public table MUST include, in the same file:
  - ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
  - Policy "Allow public read" FOR SELECT USING (true)
  - Policy "Allow service role all" FOR ALL USING (auth.role() = 'service_role')
  - grant select ... to anon;  and
    grant select, insert, update, delete ... to service_role;
- ML-output tables follow the shot_grid precedent: NOT added to schema.ts, read via
  raw SQL. If unsure which side a table belongs on -> ESCALATE, don't guess.

## Definition of done
- .sql file with RLS + grants + comments
- Report includes: apply instructions, a post-apply verification query the human
  can run, and a rollback note
