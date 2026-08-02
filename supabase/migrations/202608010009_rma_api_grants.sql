-- Expose RMA data through PostgREST while keeping row-level security active.
-- Customers may read only rows allowed by the policies from migration 008;
-- all application mutations continue to use the server-only service role.

grant select on table
  public.warranty_coverages,
  public.rma_claims,
  public.rma_events,
  public.rma_attachments
to authenticated;

grant all on table
  public.warranty_coverages,
  public.rma_claims,
  public.rma_events,
  public.rma_attachments
to service_role;

grant usage, select on sequence
  public.warranty_coverage_number_seq,
  public.rma_claim_number_seq
to service_role;

revoke execute on function public.refresh_warranty_coverages(uuid)
from public, anon, authenticated;

grant execute on function public.refresh_warranty_coverages(uuid)
to service_role;
