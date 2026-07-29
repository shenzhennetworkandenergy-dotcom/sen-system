"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { wholeNumberFromForm } from "@/lib/validation/numbers";

const uuid=(value:unknown)=>{const id=String(value??"");if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error("Invalid product.");return id;};
async function addProductToCart(productId:string,form:FormData){
  const {profile}=await requireProfile(["customer","admin"]),db=createSupabaseAdminClient();let quantity:number;try{quantity=wholeNumberFromForm(form,"quantity","Quantity",{required:true,minimum:1,maximum:99})!;}catch(error){redirect(`/products?error=${encodeURIComponent(error instanceof Error?error.message:"Quantity is invalid.")}`);}
  const requestedVariation=String(form.get("variation_id")??"").trim();
  const {data:product}=await db.from("products").select("id,product_type,allow_backorders,status,public_catalogue_visible").eq("id",uuid(productId)).maybeSingle();
  if(!product||product.status!=="active"||!product.public_catalogue_visible)redirect("/products?error=Product%20is%20not%20available.");
  let variationId:string|null=null;
  let allowBackorders=product.allow_backorders;
  if(product.product_type==="variable"){
    if(!requestedVariation)redirect(`/products?error=${encodeURIComponent("Select a product configuration first.")}`);
    const {data:variation}=await db.from("product_variations").select("id,allow_backorders,status").eq("id",uuid(requestedVariation)).eq("product_id",productId).eq("status","active").maybeSingle();
    if(!variation)redirect(`/products?error=${encodeURIComponent("The selected configuration is not available.")}`);
    variationId=variation.id;
    allowBackorders=variation.allow_backorders;
  }else if(requestedVariation){
    redirect(`/products?error=${encodeURIComponent("This product does not use configurations.")}`);
  }
  let balanceQuery=db.from("inventory_balances").select("available").eq("product_id",productId);
  balanceQuery=variationId?balanceQuery.eq("variation_id",variationId):balanceQuery.is("variation_id",null);
  const {data:balance}=await balanceQuery;
  const available=(balance??[]).reduce((sum,row)=>sum+Number(row.available),0);
  if(available<quantity&&!allowBackorders)redirect(`/products?error=${encodeURIComponent("This configuration is out of stock. Request a quotation instead.")}`);
  let {data:cart}=await db.from("shopping_carts").select("id").eq("profile_id",profile.id).eq("status","active").maybeSingle();
  if(!cart){const created=await db.from("shopping_carts").insert({profile_id:profile.id,currency:"BDT"}).select("id").single();if(created.error||!created.data)redirect("/products?error=Unable%20to%20create%20cart.");cart=created.data;}
  let existingQuery=db.from("shopping_cart_items").select("id,quantity").eq("cart_id",cart.id).eq("product_id",productId);
  existingQuery=variationId?existingQuery.eq("variation_id",variationId):existingQuery.is("variation_id",null);
  const {data:existing}=await existingQuery.maybeSingle();
  const result=existing?await db.from("shopping_cart_items").update({quantity:Math.min(99,Number(existing.quantity)+quantity),updated_at:new Date().toISOString()}).eq("id",existing.id):await db.from("shopping_cart_items").insert({cart_id:cart.id,product_id:productId,variation_id:variationId,quantity});
  if(result.error)redirect("/products?error=Unable%20to%20add%20this%20product.");
  revalidatePath("/cart");revalidatePath("/");
}
export async function addToCartAction(productId:string,productSlug:string,form:FormData){
  await addProductToCart(productId,form);
  redirect(`/products/${encodeURIComponent(productSlug)}?success=Product%20added%20to%20cart.`);
}
export async function orderNowAction(productId:string,form:FormData){
  await addProductToCart(productId,form);
  redirect("/cart?success=Review%20your%20order%20and%20confirm%20checkout.");
}
export async function updateCartAction(form:FormData){
  const {profile}=await requireProfile(["customer","admin"]),db=createSupabaseAdminClient(),itemId=uuid(form.get("item_id"));let quantity:number;try{quantity=wholeNumberFromForm(form,"quantity","Quantity",{required:true,minimum:0,maximum:99})!;}catch(error){redirect(`/cart?error=${encodeURIComponent(error instanceof Error?error.message:"Quantity is invalid.")}`);}
  const {data:cart}=await db.from("shopping_carts").select("id").eq("profile_id",profile.id).eq("status","active").maybeSingle();if(!cart)redirect("/cart");
  const result=quantity===0?await db.from("shopping_cart_items").delete().eq("id",itemId).eq("cart_id",cart.id):await db.from("shopping_cart_items").update({quantity,updated_at:new Date().toISOString()}).eq("id",itemId).eq("cart_id",cart.id);
  if(result.error)redirect("/cart?error=Unable%20to%20update%20cart.");revalidatePath("/cart");redirect("/cart?success=Cart%20updated.");
}
export async function checkoutAction(form:FormData){
  const {profile}=await requireProfile(["customer","admin"]),db=await createSupabaseServerClient(),addressId=uuid(form.get("address_id"));
  const email=String(form.get("billing_email")??"").trim().toLowerCase().slice(0,254);
  const phone=String(form.get("billing_phone")??"").trim().slice(0,40);
  const normalizedPhone=phone.replace(/[()\s.-]/g,"");
  const validEmail=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  const validPhone=/^\+8801[3-9]\d{8}$/.test(normalizedPhone)||/^01[3-9]\d{8}$/.test(normalizedPhone)||/^\+[1-9]\d{6,14}$/.test(normalizedPhone);
  if(form.get("confirmed")!=="yes"||form.get("payment_method")!=="cash_on_delivery")redirect("/cart?error=Review%20and%20confirm%20your%20billing%20information.");
  if(!validEmail)redirect("/cart?error=Enter%20a%20valid%20billing%20email.");
  if(!validPhone)redirect("/cart?error=Enter%20a%20valid%20contact%20phone%20number.");
  const {data:orderId,error}=await db.rpc("customer_checkout_cart_cod",{actor_profile_id:profile.id,requested_address_id:addressId,requested_notes:String(form.get("notes")??"").slice(0,4000),requested_email:email,requested_phone:phone});
  if(error||!orderId){
    console.error("COD checkout failed",{code:error?.code,message:error?.message});
    redirect(`/cart?error=${encodeURIComponent(error?.message&&/stock|address|warehouse|cart|email|phone|payment/i.test(error.message)?error.message:"Unable to place order. Please verify your information and try again.")}`);
  }
  revalidatePath("/cart");revalidatePath("/account/orders");redirect(`/account/orders/${orderId}?success=Order%20placed.`);
}
