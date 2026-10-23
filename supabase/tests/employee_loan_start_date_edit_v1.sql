\set ON_ERROR_STOP on
begin;
-- Match the existing server-only RPC context, without changing any role grant.
select set_config('request.jwt.claims','{"role":"service_role"}',true);

create function pg_temp.check_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'TEST FAILED: %',message; end if; end $$;
create function pg_temp.must_fail(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlerrm not ilike '%'||expected||'%' then raise exception 'Unexpected rejection: %',sqlerrm; end if;
    return;
  end;
  raise exception 'TEST FAILED: operation was not rejected';
end $$;

do $$
declare
  admin_id uuid; employee_id uuid; employee_record uuid; consent uuid; loan uuid;
  pending uuid; version_before bigint; saved_terms jsonb; saved_installments jsonb;
  history jsonb; payroll uuid; operation uuid; result uuid;
begin
  select id into strict admin_id from public.profiles where email='admin.local@sen.test' and role='admin' and status='active' and archived_at is null;
  select id into strict employee_id from public.profiles where email='recruitment.job.employee@sen.test' and role='employee' and status='active';
  select id into strict employee_record from public.hr_employee_records where profile_id=employee_id and archived_at is null;
  insert into public.receivable_employee_loan_consents(employee_profile_id,employee_record_id,consent_version,consent_items)
  values(employee_id,employee_record,'employee-loan-terms-bn-v3',
    '["term_01","term_02","term_03","term_04","term_05","term_06","term_07","term_08","term_09","term_10","term_11","term_12","term_13","term_14","final_guidance","final_repayment","final_authoritative_terms","final_salary_deduction","final_accuracy","final_no_guarantee","final_witness"]') returning id into consent;
  loan:=public.create_employee_loan_application(employee_id,consent,gen_random_uuid(),12000,'SYNTHETIC LOCAL START DATE TEST',3,0,'monthly',4000,'2090-01-05','Synthetic local-only loan test explanation.',null,
    '[{"name":"Synthetic witness one","address":"Local test only","phone":"+12025550111"},{"name":"Synthetic witness two","address":"Local test only","phone":"+12025550112"}]');
  pending:=loan;
  select version into version_before from public.receivable_accounts where id=loan;
  perform public.edit_employee_loan_start_date(admin_id,loan,'2090-02-05',version_before);
  perform pg_temp.check_true((select preferred_start_date='2090-02-05' from public.receivable_employee_loan_details where receivable_account_id=loan),'pending date persisted');
  perform pg_temp.check_true((select first_due_date='2090-02-05' and installment_count is null and requested_amount=12000 and employee_record_id=employee_record from public.receivable_accounts where id=loan),'pending terms preserved');
  -- Explicit synthetic eligibility fixture: the existing application workflow
  -- leaves repayment method unset. The date-edit feature must not change it.
  update public.receivable_accounts set default_repayment_method='salary_deduction' where id=loan;
  perform public.finalize_employee_loan_terms(admin_id,loan,12000,'Three monthly installments',3,4000,'2090-02-05','Synthetic test','Synthetic local-only agreement.',null,'2089-12-01','LOCAL-TEST-'||loan,admin_id);
  perform public.send_employee_loan_agreement(admin_id,loan);
  select version,to_jsonb(a)-array['first_due_date','final_due_date','updated_at','updated_by','version'] into version_before,saved_terms from public.receivable_accounts a where id=loan;
  select jsonb_agg(to_jsonb(i)-'due_date' order by installment_number) into saved_installments from public.receivable_installments i where receivable_account_id=loan;
  perform public.edit_employee_loan_start_date(admin_id,loan,'2090-03-05',version_before);
  perform pg_temp.check_true((select preferred_start_date='2090-03-05' and approved_start_date='2090-03-05' and workflow_stage='agreement_sent' from public.receivable_employee_loan_details where receivable_account_id=loan),'approved dates and workflow preserved');
  perform pg_temp.check_true((select to_jsonb(a)-array['first_due_date','final_due_date','updated_at','updated_by','version']=saved_terms from public.receivable_accounts a where id=loan),'amount, employee and installment terms unchanged');
  perform pg_temp.check_true((select jsonb_agg(to_jsonb(i)-'due_date' order by installment_number)=saved_installments from public.receivable_installments i where receivable_account_id=loan),'installment IDs and amounts unchanged');
  perform pg_temp.check_true((select array_agg(due_date order by installment_number)=array['2090-03-05','2090-04-05','2090-05-05']::date[] from public.receivable_installments where receivable_account_id=loan),'authoritative monthly schedule shifted');
  perform pg_temp.check_true((select not exists(select 1 from public.receivable_installment_status_v where receivable_account_id=loan and due_date<='2090-02-28')),'no deduction is due before new start');
  perform pg_temp.check_true((select count(*)=1 from public.receivable_installment_status_v where receivable_account_id=loan and due_date<='2090-03-31'),'one eligible installment after new start');
  perform pg_temp.check_true((select count(*)=1 from public.audit_logs where entity_id=loan::text and action='receivable.employee_loan_start_date_updated' and old_values->>'preferred_start_date'='2090-02-05' and new_values->>'preferred_start_date'='2090-03-05'),'old/new date audit');
  perform pg_temp.must_fail(format('select public.edit_employee_loan_start_date(%L,%L,%L,%s)',admin_id,loan,'2090-04-05',version_before),'changed');
  select version into version_before from public.receivable_accounts where id=loan;
  perform pg_temp.must_fail(format('select public.edit_employee_loan_start_date(%L,%L,%L,%s)',employee_id,loan,'2090-04-05',version_before),'administrator');
  perform pg_temp.must_fail(format('select public.edit_employee_loan_start_date(%L,%L,null,%s)',admin_id,loan,version_before),'date');
  perform pg_temp.must_fail(format('select public.edit_employee_loan_start_date(%L,%L,%L,%s)',admin_id,loan,'-infinity',version_before),'date');
  perform pg_temp.must_fail(format('select public.edit_employee_loan_start_date(%L,%L,%L,%s)',admin_id,loan,'2020-01-01',version_before),'date');
  perform pg_temp.must_fail(format('update public.receivable_installments set due_date=due_date+1 where receivable_account_id=%L',loan),'immutable');
  perform set_config('app.employee_loan_start_date_account',loan::text,true);
  perform pg_temp.must_fail(format('update public.receivable_installments set amount_due=amount_due+1 where receivable_account_id=%L',loan),'immutable');
  perform set_config('app.employee_loan_start_date_account','',true);
  select version into version_before from public.receivable_accounts where id=loan;
  perform public.edit_employee_loan_start_date(admin_id,loan,'2092-01-31',version_before);
  perform pg_temp.check_true((select array_agg(due_date order by installment_number)=array['2092-01-31','2092-02-29','2092-03-31']::date[] from public.receivable_installments where receivable_account_id=loan),'SQL month-end and leap-year schedule');
  select version into version_before from public.receivable_accounts where id=loan;
  perform public.edit_employee_loan_start_date(admin_id,loan,'2090-03-05',version_before);
  select version into version_before from public.receivable_accounts where id=loan;
  insert into public.hr_payroll_records(employee_record_id,period_start,period_end,base_salary,gross_pay,deductions,net_pay,currency,status,notes,created_by)
  values(employee_record,'2090-02-01','2090-02-28',30000,30000,0,30000,'BDT','draft','SYNTHETIC LOCAL TEST',admin_id) returning id into payroll;
  perform pg_temp.must_fail(format('select public.edit_employee_loan_start_date(%L,%L,%L,%s)',admin_id,loan,'2090-02-05',version_before),'payroll');
  update public.hr_payroll_records set status='cancelled' where id=payroll;
  perform public.record_employee_loan_document(employee_id,loan,'signed_agreement','employee/'||loan||'/synthetic-signed.pdf','synthetic-signed.pdf','application/pdf',10);
  perform pg_temp.must_fail(format('select public.edit_employee_loan_start_date(%L,%L,%L,%s)',admin_id,loan,'2090-04-05',version_before),'signed');
  perform public.final_approve_employee_loan(admin_id,loan);
  perform public.confirm_employee_loan_disbursement(admin_id,loan,gen_random_uuid(),12000,'2089-12-01','bank','LOCAL-SYNTHETIC',null,null,null,null,null,null);
  perform pg_temp.check_true((select status='active' and default_repayment_method='salary_deduction' from public.receivable_accounts where id=loan),'existing approval and disbursement remain compatible');
  insert into public.hr_payroll_records(employee_record_id,period_start,period_end,base_salary,gross_pay,deductions,net_pay,currency,status,notes,created_by)
  values(employee_record,'2090-03-01','2090-03-31',30000,30000,4000,26000,'BDT','draft','SYNTHETIC LOCAL TEST',admin_id) returning id into payroll;
  operation:=gen_random_uuid();
  perform public.prepare_hr_payroll_receivable_plan(admin_id,payroll,jsonb_build_array(jsonb_build_object('receivable_account_id',loan,'amount',4000,'operation_id',operation)),repeat('a',32));
  perform public.approve_hr_payroll_with_receivables(admin_id,payroll,repeat('a',32));
  perform pg_temp.check_true((select count(*)=0 from public.receivable_transactions where receivable_account_id=loan and transaction_type='repayment'),'approval does not repay loan');
  perform public.mark_hr_payroll_paid_with_receivables(admin_id,payroll,gen_random_uuid());
  select jsonb_build_object('transactions',(select jsonb_agg(to_jsonb(t) order by id) from public.receivable_transactions t where receivable_account_id=loan),
    'payroll',(select to_jsonb(p) from public.hr_payroll_records p where id=payroll),
    'links',(select jsonb_agg(to_jsonb(d) order by id) from public.payroll_receivable_deductions d where receivable_account_id=loan)) into history;
  select version into version_before from public.receivable_accounts where id=loan;
  perform pg_temp.must_fail(format('select public.edit_employee_loan_start_date(%L,%L,%L,%s)',admin_id,loan,'2090-04-05',version_before),'processed');
  perform pg_temp.check_true(history=jsonb_build_object('transactions',(select jsonb_agg(to_jsonb(t) order by id) from public.receivable_transactions t where receivable_account_id=loan),
    'payroll',(select to_jsonb(p) from public.hr_payroll_records p where id=payroll),
    'links',(select jsonb_agg(to_jsonb(d) order by id) from public.payroll_receivable_deductions d where receivable_account_id=loan)),'posted history untouched');
  perform pg_temp.check_true(public.receivable_current_outstanding(loan)=8000,'existing salary repayment calculation preserved');
  perform pg_temp.check_true((select count(*)=0 from public.receivable_accounting_postings where receivable_transaction_id in(select id from public.receivable_transactions where receivable_account_id=loan)),'no implicit accounting posting');
  perform pg_temp.check_true(not has_function_privilege('authenticated','public.edit_employee_loan_start_date(uuid,uuid,date,bigint)','EXECUTE'),'authenticated direct RPC cannot impersonate Admin');
  perform pg_temp.check_true(not has_function_privilege('anon','public.edit_employee_loan_start_date(uuid,uuid,date,bigint)','EXECUTE'),'anonymous RPC denied');
  perform pg_temp.check_true(has_function_privilege('service_role','public.edit_employee_loan_start_date(uuid,uuid,date,bigint)','EXECUTE'),'trusted server can call RPC');
  raise notice 'PASS: local database authorization, schedule, audit and workflow assertions';
end $$;
set local role authenticated;
do $$ begin
  begin
    perform public.edit_employee_loan_start_date('b820f386-6332-468f-8a39-cc126a897f1f','00000000-0000-0000-0000-000000000000','2090-03-05',1);
    raise exception 'TEST FAILED: authenticated RPC impersonation was not denied';
  exception when insufficient_privilege then null; end;
  begin
    update public.receivable_installments set due_date='2090-03-05' where receivable_account_id='00000000-0000-0000-0000-000000000000';
    raise exception 'TEST FAILED: direct authenticated schedule write was not denied';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
