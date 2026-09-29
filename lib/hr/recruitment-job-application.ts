export const RECRUITMENT_DOCUMENT_BUCKET = "hr-recruitment-documents";
export const MAX_RECRUITMENT_FILE_BYTES = 10 * 1024 * 1024;
export const RECRUITMENT_DOCUMENT_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
export const RECRUITMENT_PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

export type RecruitmentApplicationInput = {
  fullName: string; fatherName: string; motherName: string; dateOfBirth: string;
  gender: string; maritalStatus: string; nationality: string; phone: string; email: string;
  presentAddress: string; permanentAddress: string; emergencyContactName: string;
  emergencyContactPhone: string; emergencyContactRelationship: string;
  spouseName: string; spouseContactNumber: string; nidNumber: string; passportNumber: string;
  passportExpiryDate: string; positionAppliedFor: string; joiningDate: string;
  employmentStatus: string; currentEmployer: string; currentDesignation: string;
  expectedSalary: string; salaryCurrency: string; introduction: string;
  hasExperience: boolean | null; hasQualification: boolean | null;
};

export type EducationInput = { id: string; degree: string; institution: string; subject: string; result: string; completionYear: string };
export type ExperienceInput = { id: string; company: string; designation: string; fromDate: string; toDate: string; currentlyWorking: boolean; responsibilities: string };
export type QualificationInput = { id: string; name: string; institution: string; subject: string; completionYear: string; details: string };
export type SkillInput = { id: string; name: string; proficiency: string; details: string };

export type RecruitmentDraft = RecruitmentApplicationInput & {
  education: EducationInput[]; experience: ExperienceInput[];
  qualifications: QualificationInput[]; skills: SkillInput[];
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const yearPattern = /^(19|20)\d{2}$/;
const proficiency = new Set(["", "Basic", "Intermediate", "Advanced", "Expert"]);
const employmentStatuses = new Set(["Employed", "Unemployed", "Self-employed", "Student", "Other"]);
const maritalStatuses = new Set(["Single", "Married", "Other"]);

export function validateRecruitmentDraft(input: RecruitmentDraft, final: boolean, documentTypes = new Set<string>()) {
  const errors: Record<string, string> = {};
  const required = (key: keyof RecruitmentApplicationInput, label: string) => {
    if (!String(input[key] ?? "").trim()) errors[key] = `${label} is required.`;
  };
  if (input.email && !emailPattern.test(input.email)) errors.email = "Enter a valid email address.";
  if (input.dateOfBirth && new Date(`${input.dateOfBirth}T00:00:00Z`).getTime() > Date.now()) errors.dateOfBirth = "Date of birth cannot be in the future.";
  if (input.maritalStatus && !maritalStatuses.has(input.maritalStatus)) errors.maritalStatus = "Select a valid marital status.";
  if (input.employmentStatus && !employmentStatuses.has(input.employmentStatus)) errors.employmentStatus = "Select a valid employment status.";
  if (input.passportNumber && !input.passportExpiryDate) errors.passportExpiryDate = "Passport expiry date is required.";
  if (input.expectedSalary && !input.salaryCurrency) errors.salaryCurrency = "Salary currency is required.";
  input.education.forEach((row, index) => {
    if (row.completionYear && !yearPattern.test(row.completionYear)) errors[`education.${index}.completionYear`] = "Enter a valid completion year.";
  });
  input.experience.forEach((row, index) => {
    if (row.fromDate && !row.currentlyWorking && row.toDate && row.toDate < row.fromDate) errors[`experience.${index}.toDate`] = "To Date cannot be before From Date.";
  });
  input.skills.forEach((row, index) => { if (!proficiency.has(row.proficiency)) errors[`skills.${index}.proficiency`] = "Select a valid proficiency."; });
  if (input.expectedSalary && (!Number.isFinite(Number(input.expectedSalary)) || Number(input.expectedSalary) < 0)) errors.expectedSalary = "Expected Salary must be a valid non-negative amount.";
  if (!final) return errors;

  ([['fullName','Full Name'],['fatherName',"Father's Name"],['motherName',"Mother's Name"],['dateOfBirth','Date of Birth'],['gender','Gender'],['maritalStatus','Marital Status'],['nationality','Nationality'],['phone','Phone'],['email','Email'],['presentAddress','Present Address'],['permanentAddress','Permanent Address'],['emergencyContactName','Emergency Contact Name'],['emergencyContactPhone','Emergency Contact Phone'],['emergencyContactRelationship','Emergency Contact Relationship'],['nidNumber','NID Number'],['positionAppliedFor','Position Applied For'],['joiningDate','Preferred / Available Joining Date'],['employmentStatus','Current Employment Status'],['introduction','Short Introduction / Reason for Applying']] as [keyof RecruitmentApplicationInput,string][]).forEach(([key,label]) => required(key,label));
  if (input.maritalStatus === "Married") { required("spouseName", "Spouse Name"); required("spouseContactNumber", "Spouse Contact Number"); }
  if (input.passportNumber && !documentTypes.has("passport_copy")) errors.passportCopy = "Please upload your passport copy.";
  if (input.employmentStatus === "Employed") { required("currentEmployer", "Current Employer"); required("currentDesignation", "Current Designation"); }
  if (input.introduction.trim().length < 100 || input.introduction.trim().length > 2000) errors.introduction = "Introduction must be between 100 and 2000 characters.";
  if (input.hasExperience === null) errors.hasExperience = "Select whether you have previous work experience.";
  if (input.hasQualification === null) errors.hasQualification = "Select whether you have professional qualifications or training.";
  if (!input.education.length) errors.education = "Please add at least one education record.";
  input.education.forEach((row,index) => {
    if (!row.degree.trim()) errors[`education.${index}.degree`] = "Degree / Certificate is required.";
    if (!row.institution.trim()) errors[`education.${index}.institution`] = "Institution Name is required.";
    if (!row.subject.trim()) errors[`education.${index}.subject`] = "Subject / Group / Major is required.";
    if (!row.completionYear.trim()) errors[`education.${index}.completionYear`] = "Passing / Completion Year is required.";
    if (!documentTypes.has(`education_certificate:${row.id}`)) errors[`education.${index}.certificate`] = "Please upload the certificate for this education record.";
  });
  if (input.hasExperience && !input.experience.length) errors.experience = "Please add at least one work experience record.";
  input.experience.forEach((row,index) => {
    if (!row.company.trim()) errors[`experience.${index}.company`] = "Company / Organization is required.";
    if (!row.designation.trim()) errors[`experience.${index}.designation`] = "Designation is required.";
    if (!row.fromDate) errors[`experience.${index}.fromDate`] = "From Date is required.";
    if (!row.currentlyWorking && !row.toDate) errors[`experience.${index}.toDate`] = "To Date is required.";
    if (!row.responsibilities.trim()) errors[`experience.${index}.responsibilities`] = "Responsibilities / Experience Summary is required.";
  });
  if (input.hasQualification && !input.qualifications.length) errors.qualifications = "Please add at least one qualification or training record.";
  input.qualifications.forEach((row,index) => {
    if (!row.name.trim()) errors[`qualifications.${index}.name`] = "Qualification / Training Name is required.";
    if (!row.institution.trim()) errors[`qualifications.${index}.institution`] = "Institution / Issuing Organization is required.";
    if (!row.completionYear.trim()) errors[`qualifications.${index}.completionYear`] = "Completion Year is required.";
  });
  input.skills.forEach((row,index) => { if (!row.name.trim()) errors[`skills.${index}.name`] = "Skill Name is required."; });
  if (!documentTypes.has("photograph")) errors.photograph = "Recent Photograph is required.";
  if (!documentTypes.has("cv")) errors.cv = "CV/Resume is required.";
  if (!documentTypes.has("nid_copy")) errors.nidCopy = "Please upload your NID copy.";
  return errors;
}

export function validateRecruitmentFile(file: { size: number; type: string }, photograph = false) {
  if (file.size < 1) return "Choose a file.";
  if (file.size > MAX_RECRUITMENT_FILE_BYTES) return "Each file must not exceed 10 MB.";
  if (!(photograph ? RECRUITMENT_PHOTO_MIME_TYPES : RECRUITMENT_DOCUMENT_MIME_TYPES).has(file.type)) return photograph ? "Photograph must be JPG, JPEG or PNG." : "File must be PDF, JPG, JPEG or PNG.";
  return null;
}

export function recruitmentApplicationNumberIsValid(value: string) { return /^JOB-\d{4}-\d{4}$/.test(value); }
