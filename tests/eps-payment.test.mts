import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import { EpsClient,EpsError,bdtAmount,epsHash,epsCheckoutUrl,parseEpsVerification,decryptEpsIpn } from "../lib/payments/eps.ts";
const credentials={mode:"sandbox" as const,username:"test-user",password:"test-password",hashKey:"test-key",merchantId:"test-merchant",storeId:"test-store"};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
const success={MerchantTransactionId:"202611230000001",EpsTransactionId:"EPS-TEST-1",Status:"Success",TotalAmount:"120.50",FinancialEntity:"Test wallet"};
test("EPS uses UTF-8 key HMAC-SHA512 in base64",()=>{
  const expected=Buffer.from("b42af09057bac1e2d41708e48a902e09b5ff7f12ab428a4fe86653c73dd248fb82f948a549f7b791a5b41915ee4d1ec3935357e4e2317250d0372afa2ebeeb3a","hex").toString("base64");
  assert.equal(epsHash("The quick brown fox jumps over the lazy dog","key"),expected);
});
test("BDT amounts preserve paisa without accepting floating-point drift",()=>{
  assert.equal(bdtAmount("120.5000"),"120.50");assert.equal(bdtAmount("0001.01"),"1.01");
  for(const value of ["0","-1","1e3","NaN","Infinity","1.001",null,"1.2x"])assert.throws(()=>bdtAmount(value));
});
test("EPS verification binds amount, currency and merchant reference",()=>{
  assert.equal(parseEpsVerification(success,success.MerchantTransactionId,"120.50").status,"success");
  assert.throws(()=>parseEpsVerification(success,"other","120.50"));
  assert.throws(()=>parseEpsVerification({...success,TotalAmount:"120.49"},success.MerchantTransactionId,"120.50"));
  assert.throws(()=>parseEpsVerification({...success,Currency:"USD"},success.MerchantTransactionId,"120.50"));
  assert.throws(()=>parseEpsVerification({...success,ErrorCode:"bad"},success.MerchantTransactionId,"120.50"));
});
test("Only explicit Success is a successful provider response",()=>{
  for(const status of ["processing","paid","unknown",""])assert.equal(parseEpsVerification({...success,Status:status},success.MerchantTransactionId,"120.50").status,"pending");
});
test("Redirect cannot cross environments or leave the exact EPS checkout host",()=>{
  assert.equal(epsCheckoutUrl("https://sandboxpg.eps.com.bd/PG?data=demo","sandbox"),"https://sandboxpg.eps.com.bd/PG?data=demo");
  for(const value of ["http://sandboxpg.eps.com.bd/PG?data=x","https://sandboxpg.eps.com.bd.evil.test/PG?data=x","https://pg.eps.com.bd/PG?data=x","javascript:alert(1)","https://sandboxpg.eps.com.bd:444/PG?data=x","https://a@ sandboxpg.eps.com.bd/PG?data=x"])assert.throws(()=>epsCheckoutUrl(value,"sandbox"));
});
test("Checkout rejects missing, placeholder and duplicate session references",()=>{
  for(const query of ["", "?data=", "?data=null", "?data=undefined", "?data=%20", "?data=Null", "?data=one&data=two"])
    assert.throws(()=>epsCheckoutUrl(`https://sandboxpg.eps.com.bd/PG${query}`,"sandbox"),e=>e instanceof EpsError&&e.code==="invalid_response"&&e.uncertain);
});
test("Official EPS token and status APIs use correct hashes and never redirects",async()=>{
  const calls:{url:string;init:RequestInit}[]=[];
  const client=new EpsClient(credentials,async(url,init)=>{calls.push({url:String(url),init:init!});return calls.length===1?json({token:"fake-token"}):json(success);});
  await client.verify(success.MerchantTransactionId,"120.50");
  assert.equal(calls.length,2);assert.equal(calls[0].url,"https://sandboxpgapi.eps.com.bd/v1/Auth/GetToken");
  assert.deepEqual(JSON.parse(calls[0].init.body as string),{userName:"test-user",password:"test-password"});
  assert.equal((calls[1].init.headers as Record<string,string>).authorization,"Bearer fake-token");
  assert.equal(calls[1].init.method,"GET");assert.equal(calls[1].init.redirect,"error");
});
test("Initialization transmits server amount and customer order with web transaction type",async()=>{
  let payload:Record<string,unknown>={};let calls=0;
  const client=new EpsClient(credentials,async(_url,init)=>{calls++;if(calls===1)return json({token:"fake-token"});payload=JSON.parse(init!.body as string);return json({TransactionId:"init-test",RedirectURL:"https://sandboxpg.eps.com.bd/PG?data=init-test"});});
  await client.initialize({merchantTransactionId:"202611230000001",customerOrderId:"TEST-ORDER",amount:"120.50",successUrl:"http://127.0.0.1/ok",failUrl:"http://127.0.0.1/fail",cancelUrl:"http://127.0.0.1/cancel",customer:{name:"Local Test",email:"test@example.test",phone:"01700000000",address:"Test address",address2:"",city:"Dhaka",state:"Dhaka",postcode:"1200",country:"BD"},products:[{name:"Product",quantity:"1",price:"120.50"}]});
  assert.equal(payload.totalAmount,120.5);assert.equal(payload.transactionTypeId,1);assert.equal(payload.merchantId,"test-merchant");assert.equal(calls,2);
});
test("Ambiguous initialization is never automatically retried",async()=>{
  let calls=0;const client=new EpsClient(credentials,async()=>{calls++;if(calls===1)return json({token:"fake-token"});throw new Error("network lost");});
  await assert.rejects(()=>client.initialize({merchantTransactionId:"202611230000001",customerOrderId:"TEST-ORDER",amount:"120.50",successUrl:"http://127.0.0.1/ok",failUrl:"http://127.0.0.1/fail",cancelUrl:"http://127.0.0.1/cancel",customer:{name:"Local Test",email:"test@example.test",phone:"01700000000",address:"Test address",address2:"",city:"Dhaka",state:"Dhaka",postcode:"1200",country:"BD"},products:[{name:"Product",quantity:"1",price:"120.50"}]}),(e)=>e instanceof EpsError&&e.uncertain);assert.equal(calls,2);
});
test("Provider response text cannot leak secrets through errors",async()=>{
  const client=new EpsClient(credentials,async()=>json({errorMessage:"secret-password-from-provider",errorCode:"x"},400));
  await assert.rejects(()=>client.authenticate(),e=>e instanceof Error&&!e.message.includes("secret-password"));
});
test("IPN decrypts only a notification reference, never authorizes money",()=>{
  const key="12345678901234567890123456789012",iv=Buffer.alloc(16,1),cipher=createCipheriv("aes-256-cbc",key,iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify({merchant_transaction_id:success.MerchantTransactionId,status:"SUCCESS",amount:999999})),cipher.final()]);
  assert.deepEqual(decryptEpsIpn(iv.toString("base64")+":"+ciphertext.toString("base64"),key),{merchantTransactionId:success.MerchantTransactionId});
  assert.throws(()=>decryptEpsIpn("invalid",key));assert.throws(()=>decryptEpsIpn(iv.toString("base64")+":"+ciphertext.toString("base64"),"wrong"));
});
