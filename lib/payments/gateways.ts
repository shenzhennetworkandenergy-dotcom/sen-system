import "server-only";
type Gateway={code:string;adapter:"uddoktapay"|"eps"|"manual";test_mode:boolean;public_config:Record<string,unknown>;secret_env_prefix:string};
type Checkout={transactionId:string;checkoutUrl:string};
export async function createGatewayCheckout(gateway:Gateway,input:{orderId:string;orderNumber:string;amount:number;currency:string;customerName:string;customerEmail:string;customerPhone?:string|null;returnUrl:string;cancelUrl:string}):Promise<Checkout|null>{
  if(gateway.adapter==="manual")return null;
  const prefix=gateway.secret_env_prefix,base=process.env[`${prefix}_BASE_URL`],apiKey=process.env[`${prefix}_API_KEY`];
  if(!base||!apiKey)throw new Error(`${gateway.code} is enabled but its server credentials are not configured.`);
  const path=String(gateway.public_config.checkout_path??(gateway.adapter==="uddoktapay"?"/api/checkout-v2":"/checkout"));
  const payload=gateway.adapter==="uddoktapay"?{full_name:input.customerName,email:input.customerEmail,amount:String(input.amount),metadata:{order_id:input.orderId,order_number:input.orderNumber},redirect_url:input.returnUrl,cancel_url:input.cancelUrl,webhook_url:input.returnUrl.replace("/return","/webhook")}:{orderId:input.orderNumber,amount:input.amount,currency:input.currency,customer:{name:input.customerName,email:input.customerEmail,phone:input.customerPhone},successUrl:input.returnUrl,cancelUrl:input.cancelUrl};
  const response=await fetch(new URL(path,base),{method:"POST",headers:{"content-type":"application/json",...(gateway.adapter==="uddoktapay"?{"RT-UDDOKTAPAY-API-KEY":apiKey}:{authorization:`Bearer ${apiKey}`})},body:JSON.stringify(payload),cache:"no-store"});
  const result=await response.json().catch(()=>({})) as Record<string,unknown>;
  if(!response.ok)throw new Error("Payment provider rejected the checkout request.");
  const checkoutUrl=String(result.payment_url??result.checkout_url??result.redirectUrl??""),transactionId=String(result.invoice_id??result.transaction_id??result.id??crypto.randomUUID());
  if(!checkoutUrl.startsWith("http"))throw new Error("Payment provider did not return a valid checkout URL.");
  return{transactionId,checkoutUrl};
}
