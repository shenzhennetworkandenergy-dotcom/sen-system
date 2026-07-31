import { moneyFromForm, wholeNumberFromForm } from "@/lib/validation/numbers";
import { productSlugFromTitle } from "@/lib/inventory/product-editing";

export const productTypes=["simple","variable"] as const; export const productStatuses=["draft","active","archived"] as const;
export function requiredText(form:FormData,key:string,max=200){const value=String(form.get(key)??"").trim();if(!value||value.length>max)throw new Error(`${key} is required and must be under ${max} characters.`);return value;}
export function optionalText(form:FormData,key:string,max=5000){const value=String(form.get(key)??"").trim();if(value.length>max)throw new Error(`${key} is too long.`);return value||null;}
export function optionalNumber(form:FormData,key:string){const raw=String(form.get(key)??"").trim();if(!raw)return null;const value=Number(raw);if(!Number.isFinite(value)||value<0)throw new Error(`${key} must be a nonnegative number.`);return value;}
export function optionalMoney(form:FormData,key:string,label=key){return moneyFromForm(form,key,label);}
export function optionalWholeNumber(form:FormData,key:string,label=key){return wholeNumberFromForm(form,key,label);}
export function checked(form:FormData,key:string){return form.get(key)==="on"||form.get(key)==="true";}
export function slugify(value:string){return productSlugFromTitle(value);}
export function uuidOrNull(value:FormDataEntryValue|null){const text=String(value??"");return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(text)?text:null;}
