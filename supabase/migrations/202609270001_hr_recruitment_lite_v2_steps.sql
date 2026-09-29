-- Extend only Recruitment Lite Terms progress from seven to nine versioned steps.
alter table public.hr_recruitment_processes
  drop constraint if exists hr_recruitment_processes_current_step_check,
  add constraint hr_recruitment_processes_current_step_check
    check (current_step between 1 and 9);

alter table public.hr_recruitment_term_acceptances
  drop constraint if exists hr_recruitment_term_acceptances_step_number_check,
  add constraint hr_recruitment_term_acceptances_step_number_check
    check (step_number between 1 and 9);

notify pgrst, 'reload schema';
