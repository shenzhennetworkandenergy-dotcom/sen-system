"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompletedRecruitmentTerms } from "@/lib/hr/recruitment-job-application-data";
import { MAX_RECRUITMENT_FILE_BYTES, RECRUITMENT_DOCUMENT_BUCKET, validateRecruitmentDraft, validateRecruitmentFile, type RecruitmentDraft } from "@/lib/hr/recruitment-job-application";

const applicationPath = "/employee/hr/recruitment/application";
const reviewPath = `${applicationPath}/review`;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (form: FormData,key:string) => String(form.get(key)??"").trim();
const nullable = (value:string) => value || null;
const parseBoolean = (value:string) => value === "yes" ? true : value === "no" ? false : null;
const safeId = (value:unknown) => typeof value === "string" && uuidPattern.test(value) ? value : randomUUID();
const safeName = (value:string) => value.replace(/[^A-Za-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,120)||"document";

function parseRows<T>(form:FormData,key:string): T[] {
  try { const value=JSON.parse(text(form,key)||"[]"); return Array.isArray(value)?value:[]; } catch { return []; }
}

function parseDraft(form:FormData): RecruitmentDraft {
  return {
    fullName:text(form,"full_name"),fatherName:text(form,"father_name"),motherName:text(form,"mother_name"),dateOfBirth:text(form,"date_of_birth"),
    gender:text(form,"gender"),maritalStatus:text(form,"marital_status"),nationality:text(form,"nationality"),phone:text(form,"phone"),email:text(form,"email"),
    presentAddress:text(form,"present_address"),permanentAddress:text(form,"permanent_address"),emergencyContactName:text(form,"emergency_contact_name"),
    emergencyContactPhone:text(form,"emergency_contact_phone"),emergencyContactRelationship:text(form,"emergency_contact_relationship"),
    spouseName:text(form,"spouse_name"),spouseContactNumber:text(form,"spouse_contact_number"),nidNumber:text(form,"nid_number"),passportNumber:text(form,"passport_number"),
    passportExpiryDate:text(form,"passport_expiry_date"),positionAppliedFor:text(form,"position_applied_for"),joiningDate:text(form,"preferred_joining_date"),
    employmentStatus:text(form,"employment_status"),currentEmployer:text(form,"current_employer"),currentDesignation:text(form,"current_designation"),
    expectedSalary:text(form,"expected_salary"),salaryCurrency:text(form,"salary_currency")||"BDT",introduction:text(form,"introduction"),
    hasExperience:parseBoolean(text(form,"has_experience")),hasQualification:parseBoolean(text(form,"has_qualification")),
    education:parseRows<Record<string,unknown>>(form,"education_json").map((r) => ({id:safeId(r.id),degree:String(r.degree??"").trim(),institution:String(r.institution??"").trim(),subject:String(r.subject??"").trim(),result:String(r.result??"").trim(),completionYear:String(r.completionYear??"").trim()})),
    experience:parseRows<Record<string,unknown>>(form,"experience_json").map((r) => ({id:safeId(r.id),company:String(r.company??"").trim(),designation:String(r.designation??"").trim(),fromDate:String(r.fromDate??"").trim(),toDate:String(r.toDate??"").trim(),currentlyWorking:r.currentlyWorking===true,responsibilities:String(r.responsibilities??"").trim()})),
    qualifications:parseRows<Record<string,unknown>>(form,"qualifications_json").map((r) => ({id:safeId(r.id),name:String(r.name??"").trim(),institution:String(r.institution??"").trim(),subject:String(r.subject??"").trim(),completionYear:String(r.completionYear??"").trim(),details:String(r.details??"").trim()})),
    skills:parseRows<Record<string,unknown>>(form,"skills_json").map((r) => ({id:safeId(r.id),name:String(r.name??"").trim(),proficiency:String(r.proficiency??"").trim(),details:String(r.details??"").trim()})),
  };
}

async function uploadDocuments(form:FormData,applicationId:string,profileId:string,allowedRelations:Set<string>) {
  const db=createSupabaseAdminClient();
  const specs=[
    ["photograph","photograph",null,true],["cv","cv",null,false],["nid_copy","nid_copy",null,false],["passport_copy","passport_copy",null,false],
  ] as const;
  for(const [field,type,related,photo] of specs) await uploadOne(form,field,type,related,photo,applicationId,profileId,db);
  for(const [field,value] of form.entries()) {
    const match=/^(education_certificate|experience_certificate|qualification_certificate):(.+)$/.exec(field);
    if(match && allowedRelations.has(match[2])) await uploadOne(form,field,match[1],match[2],false,applicationId,profileId,db);
    if(field==="other_documents" && value instanceof File && value.size) await uploadOne(form,field,"other",null,false,applicationId,profileId,db,true);
  }
}

async function uploadOne(form:FormData,field:string,type:string,related:string|null,photo:boolean,applicationId:string,profileId:string,db:ReturnType<typeof createSupabaseAdminClient>,multiple=false) {
  const values=multiple?form.getAll(field):[form.get(field)];
  for(const raw of values) {
    if(!(raw instanceof File)||!raw.size) continue;
    const validation=validateRecruitmentFile(raw,photo); if(validation) throw new Error(validation);
    if(raw.size>MAX_RECRUITMENT_FILE_BYTES) throw new Error("Each file must not exceed 10 MB.");
    const path=`${profileId}/${applicationId}/${type}/${randomUUID()}-${safeName(raw.name)}`;
    const upload=await db.storage.from(RECRUITMENT_DOCUMENT_BUCKET).upload(path,await raw.arrayBuffer(),{contentType:raw.type,upsert:false});
    if(upload.error) throw new Error("Unable to upload Recruitment document.");
    if(!multiple) {
      let oldQuery=db.from("hr_recruitment_job_documents").select("id,storage_path").eq("application_id",applicationId).eq("profile_id",profileId).eq("document_type",type);
      oldQuery=related?oldQuery.eq("related_record_id",related):oldQuery.is("related_record_id",null);
      const old=await oldQuery.maybeSingle();
      if(old.data){await db.from("hr_recruitment_job_documents").delete().eq("id",old.data.id).eq("profile_id",profileId);await db.storage.from(RECRUITMENT_DOCUMENT_BUCKET).remove([old.data.storage_path]);}
    }
    const saved=await db.from("hr_recruitment_job_documents").insert({application_id:applicationId,profile_id:profileId,document_type:type,related_record_id:related,title:type==="other"?(text(form,"other_document_title")||raw.name):type.replaceAll("_"," "),storage_path:path,original_name:raw.name.slice(0,255),mime_type:raw.type,size_bytes:raw.size});
    if(saved.error){await db.storage.from(RECRUITMENT_DOCUMENT_BUCKET).remove([path]);throw new Error("Unable to associate Recruitment document.");}
  }
}

async function saveDraft(form:FormData) {
  const context=await requireCompletedRecruitmentTerms(); const db=createSupabaseAdminClient(); const input=parseDraft(form);
  const malformed=validateRecruitmentDraft(input,false); if(Object.keys(malformed).length) throw new Error(Object.values(malformed)[0]);
  const existing=await db.from("hr_recruitment_job_applications").select("id,status").eq("profile_id",context.profile.id).maybeSingle();
  if(existing.error) throw new Error("Unable to load the Job Application draft.");
  if(existing.data?.status==="SUBMITTED") throw new Error("A submitted application is locked.");
  const core={process_id:context.process.id,profile_id:context.profile.id,full_name:nullable(input.fullName),father_name:nullable(input.fatherName),mother_name:nullable(input.motherName),date_of_birth:nullable(input.dateOfBirth),gender:nullable(input.gender),marital_status:nullable(input.maritalStatus),nationality:nullable(input.nationality),phone:nullable(input.phone),email:nullable(input.email),present_address:nullable(input.presentAddress),permanent_address:nullable(input.permanentAddress),emergency_contact_name:nullable(input.emergencyContactName),emergency_contact_phone:nullable(input.emergencyContactPhone),emergency_contact_relationship:nullable(input.emergencyContactRelationship),spouse_name:nullable(input.spouseName),spouse_contact_number:nullable(input.spouseContactNumber),nid_number:nullable(input.nidNumber),passport_number:nullable(input.passportNumber),passport_expiry_date:nullable(input.passportExpiryDate),position_applied_for:nullable(input.positionAppliedFor),preferred_joining_date:nullable(input.joiningDate),employment_status:nullable(input.employmentStatus),current_employer:nullable(input.currentEmployer),current_designation:nullable(input.currentDesignation),expected_salary:input.expectedSalary?Number(input.expectedSalary):null,salary_currency:input.salaryCurrency||"BDT",introduction:nullable(input.introduction),has_experience:input.hasExperience,has_qualification:input.hasQualification,updated_at:new Date().toISOString()};
  const saved=existing.data?await db.from("hr_recruitment_job_applications").update(core).eq("id",existing.data.id).eq("profile_id",context.profile.id).eq("status","DRAFT").select("id").single():await db.from("hr_recruitment_job_applications").insert({...core,status:"DRAFT"}).select("id").single();
  if(saved.error||!saved.data) throw new Error("Unable to save the Job Application draft."); const applicationId=saved.data.id;
  const sets: Array<[string, Array<Record<string, unknown>>]>=[
    ["hr_recruitment_job_education",input.education.map((r,i)=>({id:r.id,application_id:applicationId,profile_id:context.profile.id,degree:nullable(r.degree),institution:nullable(r.institution),subject:nullable(r.subject),result:nullable(r.result),completion_year:r.completionYear?Number(r.completionYear):null,sort_order:i}))],
    ["hr_recruitment_job_experience",input.experience.map((r,i)=>({id:r.id,application_id:applicationId,profile_id:context.profile.id,company:nullable(r.company),designation:nullable(r.designation),from_date:nullable(r.fromDate),to_date:r.currentlyWorking?null:nullable(r.toDate),currently_working:r.currentlyWorking,responsibilities:nullable(r.responsibilities),sort_order:i}))],
    ["hr_recruitment_job_qualifications",input.qualifications.map((r,i)=>({id:r.id,application_id:applicationId,profile_id:context.profile.id,qualification_name:nullable(r.name),institution:nullable(r.institution),subject:nullable(r.subject),completion_year:r.completionYear?Number(r.completionYear):null,details:nullable(r.details),sort_order:i}))],
    ["hr_recruitment_job_skills",input.skills.map((r,i)=>({id:r.id,application_id:applicationId,profile_id:context.profile.id,skill_name:nullable(r.name),proficiency:nullable(r.proficiency),details:nullable(r.details),sort_order:i}))],
  ];
  const keep=new Set([...input.education,...input.experience,...input.qualifications,...input.skills].map((r)=>r.id));
  for(const [table,rows] of sets){const ids=rows.map((row)=>String(row.id));if(!ids.length)continue;const collisions=await db.from(table).select("id,application_id,profile_id").in("id",ids);if(collisions.error)throw new Error("Unable to validate repeatable application records.");if((collisions.data??[]).some((row)=>row.application_id!==applicationId||row.profile_id!==context.profile.id))throw new Error("Application record ownership validation failed.");}
  const removedDocs=await db.from("hr_recruitment_job_documents").select("id,storage_path,related_record_id").eq("application_id",applicationId).eq("profile_id",context.profile.id).not("related_record_id","is",null);
  for(const doc of removedDocs.data??[]) if(doc.related_record_id&&!keep.has(doc.related_record_id)){await db.from("hr_recruitment_job_documents").delete().eq("id",doc.id);await db.storage.from(RECRUITMENT_DOCUMENT_BUCKET).remove([doc.storage_path]);}
  for(const [table,rows] of sets){const ids=rows.map((row)=>String(row.id));let deletion=db.from(table).delete().eq("application_id",applicationId).eq("profile_id",context.profile.id);if(ids.length)deletion=deletion.not("id","in",`(${ids.join(",")})`);const deleted=await deletion;if(deleted.error)throw new Error("Unable to update repeatable application records.");if(rows.length){const upserted=await db.from(table).upsert(rows,{onConflict:"id"});if(upserted.error)throw new Error("Unable to save repeatable application records.");}}
  await uploadDocuments(form,applicationId,context.profile.id,keep);
  return { applicationId,input };
}

function go(path:string,kind:"success"|"error",message:string):never {
  const [pathname,hash]=path.split("#");
  redirect(`${pathname}?${kind}=${encodeURIComponent(message)}${hash?`#${hash}`:""}`);
}

function goToValidation(errors:Record<string,string>):never {
  redirect(`${reviewPath}?validation=${encodeURIComponent(JSON.stringify(errors))}#validation`);
}

export async function saveRecruitmentJobDraftAction(form:FormData) {
  try { await saveDraft(form); }
  catch(error) { go(applicationPath,"error",error instanceof Error?error.message:"Unable to save draft."); }
  revalidatePath(applicationPath);
  go(applicationPath,"success","Draft saved securely.");
}
export async function saveAndReviewRecruitmentJobAction(form:FormData) {
  try { await saveDraft(form); }
  catch(error) { go(applicationPath,"error",error instanceof Error?error.message:"Unable to save draft."); }
  revalidatePath(reviewPath);
  redirect(reviewPath);
}
export async function submitRecruitmentJobApplicationAction(form:FormData) {
  const context=await requireCompletedRecruitmentTerms(); const db=createSupabaseAdminClient();
  const state=await import("@/lib/hr/recruitment-job-application-data").then((m)=>m.getRecruitmentJobApplication());
  if(!state.application||state.application.status!=="DRAFT")go(reviewPath,"error","Only your own draft application may be submitted.");
  const input:RecruitmentDraft={fullName:state.application.full_name??"",fatherName:state.application.father_name??"",motherName:state.application.mother_name??"",dateOfBirth:state.application.date_of_birth??"",gender:state.application.gender??"",maritalStatus:state.application.marital_status??"",nationality:state.application.nationality??"",phone:state.application.phone??"",email:state.application.email??"",presentAddress:state.application.present_address??"",permanentAddress:state.application.permanent_address??"",emergencyContactName:state.application.emergency_contact_name??"",emergencyContactPhone:state.application.emergency_contact_phone??"",emergencyContactRelationship:state.application.emergency_contact_relationship??"",spouseName:state.application.spouse_name??"",spouseContactNumber:state.application.spouse_contact_number??"",nidNumber:state.application.nid_number??"",passportNumber:state.application.passport_number??"",passportExpiryDate:state.application.passport_expiry_date??"",positionAppliedFor:state.application.position_applied_for??"",joiningDate:state.application.preferred_joining_date??"",employmentStatus:state.application.employment_status??"",currentEmployer:state.application.current_employer??"",currentDesignation:state.application.current_designation??"",expectedSalary:String(state.application.expected_salary??""),salaryCurrency:state.application.salary_currency??"BDT",introduction:state.application.introduction??"",hasExperience:state.application.has_experience,hasQualification:state.application.has_qualification,education:state.education.map((r:any)=>({id:r.id,degree:r.degree??"",institution:r.institution??"",subject:r.subject??"",result:r.result??"",completionYear:String(r.completion_year??"")})),experience:state.experience.map((r:any)=>({id:r.id,company:r.company??"",designation:r.designation??"",fromDate:r.from_date??"",toDate:r.to_date??"",currentlyWorking:r.currently_working,responsibilities:r.responsibilities??""})),qualifications:state.qualifications.map((r:any)=>({id:r.id,name:r.qualification_name??"",institution:r.institution??"",subject:r.subject??"",completionYear:String(r.completion_year??""),details:r.details??""})),skills:state.skills.map((r:any)=>({id:r.id,name:r.skill_name??"",proficiency:r.proficiency??"",details:r.details??""}))};
  const documentTypes=new Set(state.documents.map((d:any)=>`${d.document_type}${d.related_record_id?`:${d.related_record_id}`:""}`)); const errors=validateRecruitmentDraft(input,true,documentTypes);
  if(Object.keys(errors).length)goToValidation(errors);
  if(form.get("information_confirmed")!=="yes")go(`${reviewPath}#agreement`,"error","Final confirmation is required.");
  const userDb=await createSupabaseServerClient(); const submitted=await userDb.rpc("submit_hr_recruitment_job_application",{requested_application_id:state.application.id,requested_profile_id:context.profile.id,requested_confirmed:true});
  if(submitted.error||!submitted.data)go(reviewPath,"error",submitted.error?.message??"Unable to submit application."); revalidatePath(applicationPath);redirect(`${applicationPath}?submitted=1`);
}
