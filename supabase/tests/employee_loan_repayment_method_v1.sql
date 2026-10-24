\set ON_ERROR_STOP on
begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'TEST FAILED: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.reject(statement text,message text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlerrm not ilike '%'||message||'%' then raise exception 'Unexpected rejection: % (wanted %)',sqlerrm,message; end if;
    raise notice 'PASS: rejected %',message; return;
  end;
  raise exception 'TEST FAILED: expected rejection (%)',message;
end $$;
create function pg_temp.fail_method_audit() returns trigger language plpgsql as $$
begin if new.action='receivable.employee_loan_repayment_method_changed' and current_setting('test.fail_method_audit',true)='yes' then
  raise exception 'Synthetic audit failure'; end if; return new; end $$;
create trigger synthetic_method_audit_failure before insert on public.audit_logs for each row execute function pg_temp.fail_method_audit();

do $$
declare a uuid; e uuid; employee_actor uuid; loan uuid; advance uuid; terminal uuid; p uuid; v bigint; op uuid;
  result jsonb; first_result jsonb; snapshot jsonb; movements jsonb; installments jsonb; paid_snapshot jsonb;
  d date:=timezone('Asia/Dhaka',now())::date; count_before bigint;
begin
  select id into strict a from public.profiles where email='admin.local@sen.test' and role='admin' and status='active' and archived_at is null;
  select id into strict e from public.hr_employee_records where profile_id=a and archived_at is null and job_title='SYNTHETIC LOCAL PAYROLL TEST';
  select id into strict employee_actor from public.profiles where email='recruitment.job.employee@sen.test' and role<>'admin';
  perform pg_temp.ok(not exists(select 1 from public.hr_payroll_records where employee_record_id=e and status in ('draft','approved')),'unchanged synthetic enrollment has no active payroll');
  -- New generic Admin-originated operational loans only: no signed application,
  -- signatures, consent or approval evidence is fabricated. All rows roll back.
  loan:=public.create_receivable_account(a,gen_random_uuid(),'employee_loan','employee',e,null,12000,'BDT',null,3,4000,d-5,null,'SYNTHETIC LOCAL METHOD V1 - rollback only');
  select version into v from public.receivable_accounts where id=loan;
  perform pg_temp.reject(format('select public.edit_employee_loan_repayment_method_v1(%L,%L,%L,%L,%L,%s,gen_random_uuid(),true)',employee_actor,loan,'cash','Synthetic method change',d,v),'administrator');
  perform pg_temp.reject(format('select public.edit_employee_loan_repayment_method_v1(%L,%L,%L,%L,%L,%s,gen_random_uuid(),false)',a,loan,'cash','Synthetic method change',d,v),'confirmation');
  perform pg_temp.reject(format('select public.edit_employee_loan_repayment_method_v1(%L,%L,%L,%L,%L,%s,gen_random_uuid(),true)',a,loan,'unknown','Synthetic method change',d,v),'Unsupported');
  perform pg_temp.reject(format('select public.edit_employee_loan_repayment_method_v1(%L,%L,%L,%L,%L,%s,gen_random_uuid(),true)',a,loan,'cash','short',d,v),'reason');
  perform pg_temp.reject(format('select public.edit_employee_loan_repayment_method_v1(%L,%L,%L,%L,%L,%s,gen_random_uuid(),true)',a,loan,'cash','Synthetic method change',d-1,v),'Dhaka');
  perform pg_temp.reject(format('select public.edit_employee_loan_repayment_method_v1(%L,%L,%L,%L,%L,%s,gen_random_uuid(),true)',a,loan,'cash','Synthetic method change',d+1,v),'Dhaka');
  perform pg_temp.reject(format('update public.receivable_accounts set default_repayment_method=%L where id=%L','cash',loan),'authorized repayment');
  op:=gen_random_uuid();
  result:=public.edit_employee_loan_repayment_method_v1(a,loan,'cash','Synthetic pre-approval change',d,v,op,true);
  first_result:=result;
  perform pg_temp.ok(result->>'method'='cash' and (result->>'version')::bigint=v+1,'pre-approval method/version saved');
  result:=public.edit_employee_loan_repayment_method_v1(a,loan,'cash','Synthetic pre-approval change',d,v,op,true);
  perform pg_temp.ok(result->>'id'=first_result->>'id' and (result->>'replayed')::boolean,'same operation idempotent without extra audit');
  perform pg_temp.ok((select count(*)=1 from public.employee_loan_repayment_method_changes where receivable_account_id=loan),'one policy only after retry');
  perform pg_temp.reject(format('select public.edit_employee_loan_repayment_method_v1(%L,%L,%L,%L,%L,%s,%L,true)',a,loan,'bank','Synthetic pre-approval change',d,v,op),'different request');
  perform pg_temp.reject(format('select public.edit_employee_loan_repayment_method_v1(%L,%L,%L,%L,%L,%s,gen_random_uuid(),true)',a,loan,'bank','Synthetic stale version',d,v),'Refresh');
  perform pg_temp.ok(public.employee_loan_repayment_method_as_of_v1(loan,d-1) is null,'before first change retains original NULL, not current method');
  perform public.transition_receivable_account(a,loan,gen_random_uuid(),'submit_review',null,'Synthetic local review');
  perform public.transition_receivable_account(a,loan,gen_random_uuid(),'approve',12000,'Synthetic local approval');
  select to_jsonb(r),version into snapshot,v from public.receivable_accounts r where id=loan;
  result:=public.edit_employee_loan_repayment_method_v1(a,loan,'salary_deduction','Synthetic post-approval change',d,v,gen_random_uuid(),true);
  perform pg_temp.ok((snapshot-array['default_repayment_method','version','updated_at','updated_by'])=(select to_jsonb(r)-array['default_repayment_method','version','updated_at','updated_by'] from public.receivable_accounts r where id=loan),'approval, amount, terms and employee unchanged');
  perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.hr_payroll_plan_v1(a,e,d,'BDT',null)) x where x->>'account_id'=loan::text),'undisbursed loan remains excluded');
  perform public.confirm_receivable_disbursement(a,loan,gen_random_uuid(),12000,d-10,'bank','SYNTHETIC LOCAL rollback operational disbursement');
  perform public.record_receivable_repayment(a,loan,gen_random_uuid(),1000,d-2,'bank','SYNTHETIC LOCAL rollback past repayment');
  select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into movements from public.receivable_transactions t where receivable_account_id=loan;
  select jsonb_agg(to_jsonb(i) order by i.id) into installments from public.receivable_installments i where receivable_account_id=loan;
  select version into v from public.receivable_accounts where id=loan;
  result:=public.edit_employee_loan_repayment_method_v1(a,loan,'bank','Synthetic after repayment started',d,v,gen_random_uuid(),true);
  perform pg_temp.ok(public.receivable_current_outstanding(loan)=11000,'post-disbursement method change never alters balance');
  perform pg_temp.ok(movements=(select jsonb_agg(to_jsonb(t) order by t.id) from public.receivable_transactions t where receivable_account_id=loan),'historical disbursement and repayment identical');
  perform pg_temp.ok(installments=(select jsonb_agg(to_jsonb(i) order by i.id) from public.receivable_installments i where receivable_account_id=loan),'settled installment allocations and schedule unchanged');
  perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.hr_payroll_plan_v1(a,e,d,'BDT',null)) x where x->>'account_id'=loan::text),'switch away removes future payroll eligibility');
  select version into v from public.receivable_accounts where id=loan;
  select count(*) into count_before from public.employee_loan_repayment_method_changes where receivable_account_id=loan;
  perform set_config('test.fail_method_audit','yes',true);
  perform pg_temp.reject(format('select public.edit_employee_loan_repayment_method_v1(%L,%L,%L,%L,%L,%s,gen_random_uuid(),true)',a,loan,'mfs','Synthetic atomic failure',d,v),'Synthetic audit failure');
  perform set_config('test.fail_method_audit','no',true);
  perform pg_temp.ok((select version=v and default_repayment_method='bank' from public.receivable_accounts where id=loan) and (select count(*)=count_before from public.employee_loan_repayment_method_changes where receivable_account_id=loan),'audit failure atomically rolls back account and policy');
  result:=public.edit_employee_loan_repayment_method_v1(a,loan,'salary_deduction','Synthetic restore payroll eligibility',d,v,gen_random_uuid(),true);
  perform pg_temp.ok(exists(select 1 from jsonb_array_elements(public.hr_payroll_plan_v1(a,e,d,'BDT',null)) x where x->>'account_id'=loan::text and (x->>'amount')::numeric=3000),'date equality and remaining balance cap follow unchanged planner');
  result:=public.hr_payroll_quote_v1(a,e,d,'BDT',30000,0,0,400,null);
  perform pg_temp.ok((result->>'net')::numeric=(result->>'gross')::numeric-(result->>'automatic')::numeric-400,'manual and automatic deductions counted once');
  -- Pick a future unused salary period; payment eligibility still uses d.
  p:=public.save_hr_payroll_draft_v1(a,e,'2042-01-01','2042-01-31',30000,0,0,0,'BDT',d,true,'Synthetic local method reservation test');
  perform pg_temp.ok(exists(select 1 from public.payroll_receivable_deductions where payroll_record_id=p and receivable_account_id=loan and status='draft'),'draft reserves installment');
  select version into v from public.receivable_accounts where id=loan;
  perform pg_temp.reject(format('select public.edit_employee_loan_repayment_method_v1(%L,%L,%L,%L,%L,%s,gen_random_uuid(),true)',a,loan,'cash','Synthetic reservation conflict',d,v),'Active payroll');
  perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.hr_payroll_plan_v1(a,e,d,'BDT',null)) x where x->>'account_id'=loan::text),'reserved installment not duplicated');
  perform public.confirm_hr_payroll_approval_v1(a,p,d,true,(select updated_at from public.hr_payroll_records where id=p));
  perform pg_temp.reject(format('select public.edit_employee_loan_repayment_method_v1(%L,%L,%L,%L,%L,%s,gen_random_uuid(),true)',a,loan,'cash','Synthetic approved payroll conflict',d,v),'Active payroll');
  perform pg_temp.ok(movements=(select jsonb_agg(to_jsonb(t) order by t.id) from public.receivable_transactions t where receivable_account_id=loan),'draft and approval post no repayment');
  perform public.cancel_hr_payroll_v1(a,p);
  perform pg_temp.ok(not exists(select 1 from public.payroll_receivable_deductions where payroll_record_id=p and status in ('draft','approved')),'cancellation releases reservation via existing workflow');
  result:=public.edit_employee_loan_repayment_method_v1(a,loan,null,'Synthetic unset is not forgiveness',d,v,gen_random_uuid(),true);
  perform pg_temp.ok(public.receivable_current_outstanding(loan)=11000,'Not set does not clear balance');
  -- Any employee draft, even no target-loan reservation, blocks a method change.
  p:=public.save_hr_payroll_draft_v1(a,e,'2042-02-01','2042-02-28',30000,0,0,0,'BDT',d,true,'Synthetic zero-loan draft guard');
  select version into v from public.receivable_accounts where id=loan;
  perform pg_temp.reject(format('select public.edit_employee_loan_repayment_method_v1(%L,%L,%L,%L,%L,%s,gen_random_uuid(),true)',a,loan,'cash','Synthetic zero-loan draft',d,v),'Active payroll');
  perform public.cancel_hr_payroll_v1(a,p);
  -- Old payroll effective dates retain the original NULL method despite a later
  -- current value; late-paid old cycles therefore cannot gain a retroactive loan.
  result:=public.edit_employee_loan_repayment_method_v1(a,loan,'salary_deduction','Synthetic final payroll setup',d,v,gen_random_uuid(),true);
  perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.hr_payroll_plan_v1(a,e,d-1,'BDT',null)) x where x->>'account_id'=loan::text),'past payment cycle preserves original NULL policy');
  p:=public.save_hr_payroll_draft_v1(a,e,'2042-03-01','2042-03-31',30000,0,0,0,'BDT',d,true,'Synthetic paid immutability test');
  perform public.confirm_hr_payroll_approval_v1(a,p,d,true,(select updated_at from public.hr_payroll_records where id=p));
  perform public.mark_hr_payroll_paid_with_receivables(a,p,gen_random_uuid());
  select to_jsonb(r) into paid_snapshot from public.hr_payroll_records r where id=p;
  select version into v from public.receivable_accounts where id=loan;
  perform pg_temp.reject(format('select public.edit_employee_loan_repayment_method_v1(%L,%L,%L,%L,%L,%s,gen_random_uuid(),true)',a,loan,'cash','Synthetic paid-cycle conflict',d,v),'Posted financial');
  perform public.mark_hr_payroll_paid_with_receivables(a,p,gen_random_uuid());
  perform pg_temp.ok(paid_snapshot=(select to_jsonb(r) from public.hr_payroll_records r where id=p),'Mark Paid idempotent and finalized payroll immutable');
  perform pg_temp.ok((select count(*)=1 from public.receivable_transactions where payroll_record_id=p and receivable_account_id=loan),'one payroll repayment only');
  perform pg_temp.ok((select count(*)=0 from public.receivable_accounting_postings where receivable_transaction_id in(select id from public.receivable_transactions where receivable_account_id=loan)),'no unintended accounting or cashbook posting');
  perform pg_temp.ok((select count(*) from public.audit_logs where action='receivable.employee_loan_repayment_method_changed' and entity_id=loan::text)=
    (select count(*) from public.employee_loan_repayment_method_changes where receivable_account_id=loan),'one atomic audit per successful configuration');
  perform pg_temp.reject(format('update public.employee_loan_repayment_method_changes set reason=%L where receivable_account_id=%L','tamper attempt',loan),'immutable');
  perform pg_temp.ok(not has_function_privilege('anon','public.edit_employee_loan_repayment_method_v1(uuid,uuid,text,text,date,bigint,uuid,boolean)','EXECUTE')
    and not has_function_privilege('authenticated','public.edit_employee_loan_repayment_method_v1(uuid,uuid,text,text,date,bigint,uuid,boolean)','EXECUTE'),'browser RPC execution revoked even for Admin');
  perform pg_temp.ok(not has_table_privilege('authenticated','public.employee_loan_repayment_method_changes','INSERT') and
    not has_table_privilege('service_role','public.employee_loan_repayment_method_changes','INSERT'),'policy writes only through trusted function');
end $$;
rollback;
