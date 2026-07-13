-- Step 2 (record-the-outcome UI): storage reference for an uploaded response/
-- denial letter. There is still no documents table (documents are storage
-- paths), so the evidence lands as a bills-bucket path here;
-- response_document_id (uuid) stays reserved for a future documents table.
alter table public.dispute_outcomes
  add column if not exists response_document_path text;

comment on column public.dispute_outcomes.response_document_path is
  'bills-bucket storage path of the uploaded response/denial letter (evidence only; not parsed). response_document_id remains reserved for a future documents table.';
