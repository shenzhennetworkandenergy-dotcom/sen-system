\set ON_ERROR_STOP on
begin;
-- Match the trusted server's existing service_role context for operational RPCs.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create function pg_temp.ok(value boolean, label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'TEST FAILED: %',label; end if; end $$;
create function pg_temp.reject(statement text, message text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlerrm not ilike '%'||message||'%' then raise exception 'Unexpected rejection: %',sqlerrm; end if;
    return;
  end;
  raise exception 'TEST FAILED: expected rejection (%)',message;
end $$;
-- An injected second-account failure proves that no first-account repayment,
-- link transition or audit entry can escape a failed atomic Paid operation.
create function pg_temp.inject_payroll_post_failure() returns trigger language plpgsql as $$
begin
  if new.source='payroll' and new.receivable_account_id::text=current_setting('test.payroll_fail_account',true) then
    raise exception 'Synthetic second repayment failure';
  end if;
  return new;
end $$;
create trigger synthetic_payroll_post_failure after insert on public.receivable_transactions
  for each row execute function pg_temp.inject_payroll_post_failure();
select pg_temp.ok(public.hr_payroll_next_period_v1('2024-02-01','[]')->>'period_end'='2024-02-29','leap-year February');
select pg_temp.ok(public.hr_payroll_next_period_v1('2025-02-01','[]')->>'period_end'='2025-02-28','non-leap February');
select pg_temp.ok(public.hr_payroll_next_period_v1('2026-12-01','[{"period_start":"2026-12-01","period_end":"2026-12-31","status":"paid"}]')->>'period_start'='2027-01-01','year rollover');
select pg_temp.ok(public.hr_payroll_next_period_v1('2026-08-01','[{"period_start":"2026-09-01","period_end":"2026-09-30","status":"paid"}]')->>'review_reason' is not null,'history gap review');
select pg_temp.ok(public.hr_payroll_next_period_v1('2026-08-01','[{"period_start":"2026-08-01","period_end":"2026-09-01","status":"paid"}]')->>'review_reason' is not null,'overlap or partial period review');
select pg_temp.ok(public.hr_payroll_next_period_v1('2026-09-01','[{"period_start":"2026-09-01","period_end":"2026-09-30","status":"cancelled"}]')->>'period_start'='2026-09-01','cancelled is not paid coverage');
do $$
declare a uuid; e uuid; actor_employee uuid; p uuid; p2 uuid; loan uuid; advance uuid; result jsonb; h jsonb; tx integer; version timestamptz;
begin
  select id into strict a from public.profiles where email='admin.local@sen.test' and role='admin' and status='active' and archived_at is null;
  select id into strict actor_employee from public.profiles where email='recruitment.job.employee@sen.test';
  select id into strict e from public.hr_employee_records where profile_id=actor_employee and archived_at is null;
  -- Only transactional synthetic fixture changes; everything rolls back.
  update public.hr_employee_records set hire_date='2026-09-01',base_salary=30000,salary_currency='BDT' where id=e;
  result:=public.hr_payroll_autofill_v1(a,e);
  perform pg_temp.ok(result->>'base_salary'='30000.00' and result->>'period_start'='2026-09-01','enrolled salary and first eligible month');
  perform pg_temp.reject(format('select public.hr_payroll_autofill_v1(%L,%L)',actor_employee,e),'administrator');
  perform pg_temp.reject(format('select public.save_hr_payroll_draft_v1(%L,%L,%L,%L,30000,0,0,0,%L,%L,true,null)',actor_employee,e,'2026-09-01','2026-09-30','BDT','2026-10-01'),'administrator');
  perform pg_temp.reject(format('select public.save_hr_payroll_draft_v1(%L,%L,%L,%L,30000,0,0,0,%L,%L,true,null)',a,e,'2026-09-01','2026-09-30','BDT','infinity'),'valid');
  perform pg_temp.reject(format('select public.save_hr_payroll_draft_v1(%L,%L,%L,%L,30000,0,0,0,%L,null,false,null)',a,e,'2026-09-01','2026-09-30','BDT'),'confirm');
  p:=public.save_hr_payroll_draft_v1(a,e,'2026-09-01','2026-09-30',30000,0,0,0,'BDT','2026-10-01',true,null);
  perform set_config('app.payroll_v1_id',p::text,true);
  insert into public.hr_payroll_components(payroll_record_id,component_type,name,amount) values(p,'earning','Legacy custom adjustment',1);
  perform set_config('app.payroll_v1_id','',true);
  select updated_at into version from public.hr_payroll_records where id=p;
  perform pg_temp.reject(format('select public.save_hr_payroll_draft_v1(%L,%L,%L,%L,30000,0,0,0,%L,%L,true,null,%L,%L)',a,e,'2026-09-01','2026-09-30','BDT','2026-10-01',p,version),'Unrecognized');
  perform set_config('app.payroll_v1_id',p::text,true);
  delete from public.hr_payroll_components where payroll_record_id=p and name='Legacy custom adjustment';
  perform set_config('app.payroll_v1_id','',true);
  perform pg_temp.reject(format('select public.save_hr_payroll_draft_v1(%L,%L,%L,%L,30000,0,0,0,%L,%L,true,null)',a,e,'2026-09-15','2026-10-15','BDT','2026-10-15'),'overlap');
  perform pg_temp.reject(format('select public.confirm_hr_payroll_approval_v1(%L,%L,%L,false,null)',a,p,'2026-10-01'),'confirm');
  perform pg_temp.reject(format('select public.confirm_hr_payroll_approval_v1(%L,%L,%L,true,null)',a,p,'2026-10-01'),'changed');
  perform public.confirm_hr_payroll_approval_v1(a,p,'2026-10-01',true,(select updated_at from public.hr_payroll_records where id=p));
  perform public.mark_hr_payroll_paid_with_receivables(a,p,gen_random_uuid());
  result:=public.hr_payroll_autofill_v1(a,e);
  perform pg_temp.ok(result->>'period_start'='2026-10-01' and result->>'period_end'='2026-10-31','September paid selects October');
  select to_jsonb(r) into h from public.hr_payroll_records r where id=p;
  perform public.mark_hr_payroll_paid_with_receivables(a,p,gen_random_uuid());
  perform pg_temp.ok(h=(select to_jsonb(r) from public.hr_payroll_records r where id=p),'idempotent Paid preserves history');
  perform pg_temp.reject(format('update public.hr_payroll_records set net_pay=1 where id=%L',p),'immutable');
  perform pg_temp.reject(format('select public.cancel_hr_payroll_v1(%L,%L)',a,p),'final');
  -- A scheduled loan and advance use the existing operational ledger.
  insert into public.receivable_accounts(receivable_number,category,borrower_type,employee_record_id,borrower_display_name_snapshot,requested_amount,original_amount,operation_id,operation_hash,currency,status,installment_count,installment_amount,first_due_date,default_repayment_method,created_by)
  values('LOCAL-PAYROLL-LOAN-'||gen_random_uuid(),'employee_loan','employee',e,'SYNTHETIC LOCAL',8000,8000,gen_random_uuid(),repeat('a',32),'BDT','requested',2,4000,'2026-11-01','salary_deduction',a) returning id into loan;
  perform public.rebuild_receivable_installments(loan,8000,2,4000,'2026-11-01',a);
  update public.receivable_accounts set status='approved',approved_amount=8000,approved_by=a,approved_at=now() where id=loan;
  perform pg_temp.ok(public.hr_payroll_plan_v1(a,e,'2026-11-01','BDT',null)='[]'::jsonb,'approved undisbursed excluded');
  perform public.confirm_receivable_disbursement(a,loan,gen_random_uuid(),8000,'2026-10-01','bank','Synthetic local test');
  insert into public.receivable_accounts(receivable_number,category,borrower_type,employee_record_id,borrower_display_name_snapshot,requested_amount,original_amount,operation_id,operation_hash,currency,status,installment_count,installment_amount,first_due_date,default_repayment_method,created_by)
  values('LOCAL-PAYROLL-ADVANCE-'||gen_random_uuid(),'salary_advance','employee',e,'SYNTHETIC LOCAL',1000,1000,gen_random_uuid(),repeat('a',32),'BDT','requested',1,1000,'2026-11-01','salary_deduction',a) returning id into advance;
  perform public.rebuild_receivable_installments(advance,1000,1,1000,'2026-11-01',a);
  update public.receivable_accounts set status='approved',approved_amount=1000,approved_by=a,approved_at=now() where id=advance;
  perform public.confirm_receivable_disbursement(a,advance,gen_random_uuid(),1000,'2026-10-01','bank','Synthetic local test');
  perform public.record_receivable_repayment(a,advance,gen_random_uuid(),750.005,'2026-10-02','bank','Synthetic partial repayment');
  perform pg_temp.ok(public.hr_payroll_plan_v1(a,e,'2026-10-31','BDT',null)='[]'::jsonb,'preferred start prevents premature deduction');
  result:=public.hr_payroll_plan_v1(a,e,'2026-11-01','BDT',null);
  perform pg_temp.ok(jsonb_array_length(result)=2,'multiple loans included');
  perform pg_temp.ok((select (item->>'amount')::numeric=249.99 from jsonb_array_elements(result) item where item->>'account_id'=advance::text),'cent floor never exceeds partial remaining balance');
  p2:=public.save_hr_payroll_draft_v1(a,e,'2026-10-01','2026-10-31',30000,500,100,50,'BDT','2026-11-01',true,null);
  perform pg_temp.ok((select deductions=4299.99 and net_pay=26300.01 and payment_effective_date='2026-11-01' from public.hr_payroll_records where id=p2),'October salary paid November with separate manual deduction');
  perform pg_temp.ok(public.hr_payroll_plan_v1(a,e,'2026-11-01','BDT',null)='[]'::jsonb,'active reservation prevents duplicate installment');
  select count(*) into tx from public.receivable_transactions where receivable_account_id in(loan,advance);
  select updated_at into version from public.hr_payroll_records where id=p2;
  perform public.save_hr_payroll_draft_v1(a,e,'2026-10-01','2026-10-31',30000,500,100,50,'BDT','2026-10-31',true,null,p2,version);
  perform pg_temp.ok((select deductions=50 from public.hr_payroll_records where id=p2),'effective date change replans draft');
  select updated_at into version from public.hr_payroll_records where id=p2;
  perform public.save_hr_payroll_draft_v1(a,e,'2026-10-01','2026-10-31',30000,500,100,50,'BDT','2026-11-01',true,null,p2,version);
  perform public.confirm_hr_payroll_approval_v1(a,p2,'2026-11-01',true,(select updated_at from public.hr_payroll_records where id=p2));
  perform pg_temp.ok(tx=(select count(*) from public.receivable_transactions where receivable_account_id in(loan,advance)),'Draft and Approval do not post repayment');
  perform public.record_receivable_repayment(a,loan,gen_random_uuid(),1000,'2026-10-03','bank','Synthetic intervening repayment');
  perform pg_temp.reject(format('select public.mark_hr_payroll_paid_with_receivables(%L,%L,gen_random_uuid())',a,p2),'changed');
  perform pg_temp.ok((select count(*)=0 from public.receivable_transactions where payroll_record_id=p2),'stale plan rejects before repayment posting');
  perform public.cancel_hr_payroll_v1(a,p2);
  perform pg_temp.ok((select bool_and(status='voided') from public.payroll_receivable_deductions where payroll_record_id=p2),'Cancel releases reservations');
  -- Cancelled exact period is reusable; pay an earlier synthetic date to exercise posting now.
  p2:=public.save_hr_payroll_draft_v1(a,e,'2026-10-01','2026-10-31',30000,0,0,0,'BDT','2026-11-01',true,null);
  perform public.confirm_hr_payroll_approval_v1(a,p2,'2026-11-01',true,(select updated_at from public.hr_payroll_records where id=p2));
  perform pg_temp.reject(format('select public.mark_hr_payroll_paid_with_receivables(%L,%L,gen_random_uuid())',actor_employee,p2),'administrator');
  perform pg_temp.reject(format('select public.cancel_hr_payroll_v1(%L,%L)',actor_employee,p2),'administrator');
  perform pg_temp.reject(format('select public.confirm_hr_payroll_approval_v1(%L,%L,%L,true,null)',actor_employee,p2,'2026-11-01'),'administrator');
  perform set_config('test.payroll_fail_account',greatest(loan::text,advance::text),true);
  perform pg_temp.reject(format('select public.mark_hr_payroll_paid_with_receivables(%L,%L,gen_random_uuid())',a,p2),'Synthetic second repayment failure');
  perform pg_temp.ok((select count(*)=0 from public.receivable_transactions where payroll_record_id=p2),'failed second repayment rolls back first repayment');
  perform pg_temp.ok((select status='approved' from public.hr_payroll_records where id=p2),'failed payment keeps approved payroll');
  perform pg_temp.ok((select bool_and(status='approved') from public.payroll_receivable_deductions where payroll_record_id=p2),'failed payment keeps all reservations');
  perform set_config('test.payroll_fail_account','',true);
  perform public.mark_hr_payroll_paid_with_receivables(a,p2,gen_random_uuid());
  perform public.mark_hr_payroll_paid_with_receivables(a,p2,gen_random_uuid());
  perform pg_temp.ok((select count(*)=2 and bool_and(effective_date='2026-11-01') from public.receivable_transactions where payroll_record_id=p2),'atomic Paid posts once per reserved installment at confirmed date');
  perform pg_temp.ok((select paid_at is not null and payment_effective_date='2026-11-01' from public.hr_payroll_records where id=p2),'posting audit timestamp remains separate');
  perform pg_temp.ok(h=(select to_jsonb(r) from public.hr_payroll_records r where id=p),'other paid payroll untouched');
  perform pg_temp.ok((select count(*)=0 from public.receivable_accounting_postings where receivable_transaction_id in(select id from public.receivable_transactions where payroll_record_id=p2)),'no second accounting ledger');
  update public.hr_employee_records set base_salary=null where id=e;
  perform pg_temp.ok(public.hr_payroll_autofill_v1(a,e)->'base_salary'='null'::jsonb,'NULL salary not invented');
  perform pg_temp.reject(format('select public.save_hr_payroll_draft_v1(%L,%L,%L,%L,30000,0,0,0,%L,%L,true,null)',a,e,'2026-11-01','2026-11-30','BDT','2026-12-01'),'No enrolled base salary');
  update public.hr_employee_records set hire_date='2026-09-27' where id=e;
  perform pg_temp.ok(public.hr_payroll_autofill_v1(a,e)->>'review_reason' is not null,'partial employment requires manual review');
  update public.hr_employee_records set base_salary=30000,hire_date='2026-09-01',termination_date='2026-10-31',employment_status='terminated' where id=e;
  perform pg_temp.ok(public.hr_payroll_autofill_v1(a,e)->>'review_reason' like 'Employment has ended%','terminated employment is not extrapolated');
  perform pg_temp.reject(format('select public.save_hr_payroll_draft_v1(%L,%L,%L,%L,30000,0,0,0,%L,%L,true,null)',a,e,'2026-11-01','2026-11-30','BDT','2026-12-01'),'employment end');
  perform pg_temp.ok(not has_function_privilege('authenticated','public.save_hr_payroll_draft_v1(uuid,uuid,date,date,numeric,numeric,numeric,numeric,text,date,boolean,text,uuid,timestamp with time zone)','EXECUTE'),'direct client cannot impersonate Admin');
  raise notice 'PASS: payroll autofill, effective-date, reservation, cancellation, authorization, posting and history invariants';
end $$;
rollback;
