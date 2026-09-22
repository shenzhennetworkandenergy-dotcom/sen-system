begin;

alter table public.rma_claims
  drop constraint if exists rma_claims_resolution_check;

alter table public.rma_claims
  add constraint rma_claims_resolution_check
  check (
    resolution is null
    or resolution in (
      'repaired',
      'replaced',
      'refund_approved',
      'credit_issued',
      'claim_rejected',
      'no_fault_found',
      'damaged_beyond_repair_retired'
    )
  );

commit;
