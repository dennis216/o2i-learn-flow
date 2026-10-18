-- Commit this migration BEFORE the following publication migration.
-- PostgreSQL cannot use an enum value added in the same transaction.
ALTER TYPE public.question_status ADD VALUE 'unpublished';
