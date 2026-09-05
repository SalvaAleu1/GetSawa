"use client";

import { useEffect, useState } from "react";

interface Subscription { id:string; domainId:string|null; status:string; billingCycle:string; amountCents:number; currency:string; currentPeriodEnd:string; nextBillingAt:string; autoRenew:boolean; failedPaymentCount:number; }
interface Renewal { id:string; status:string; order_id:string|null; domain_name:string|null; scheduled_at:string; period_end:string; }

function money(cents:number,currency:string){return new Intl.NumberFormat(undefined,{style:"currency",currency}).format(cents/100);}
function date(value:string){return new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(new Date(value));}

export default function BillingPage(){
 const [data,setData]=useState<{subscriptions:Subscription[];renewals:Renewal[]}|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState("");const [busy,setBusy]=useState("");
 async function load(){setLoading(true);try{const res=await fetch("/api/dashboard/billing",{cache:"no-store"});const body=await res.json();if(!res.ok)throw new Error(body.error||"Unable to load billing.");setData(body.data??body);}catch(e){setError(e instanceof Error?e.message:"Unable to load billing.");}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 async function toggle(id:string,enabled:boolean){setBusy(id);setError("");try{const res=await fetch(`/api/dashboard/billing/domains/${id}/auto-renew`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled})});const body=await res.json();if(!res.ok)throw new Error(body.error||"Unable to update auto-renewal.");await load();}catch(e){setError(e instanceof Error?e.message:"Unable to update auto-renewal.");}finally{setBusy("");}}
 async function pay(orderId:string){setBusy(orderId);setError("");try{const res=await fetch(`/api/dashboard/billing/orders/${orderId}/pay`,{method:"POST"});const body=await res.json();if(!res.ok)throw new Error(body.error||"Unable to start payment.");if(body.data?.approveUrl)window.location.href=body.data.approveUrl;else throw new Error("PayPal did not return an approval URL.");}catch(e){setError(e instanceof Error?e.message:"Unable to start payment.");setBusy("");}}
 if(loading)return <main className="mx-auto max-w-6xl p-6"><p>Loading billing...</p></main>;
 if(error&&!data)return <main className="mx-auto max-w-6xl p-6"><div className="rounded-lg border p-4 text-sm">{error}</div></main>;
 const subscriptions=data?.subscriptions??[];const renewals=data?.renewals??[];
 return <main className="mx-auto max-w-6xl space-y-8 p-6">
  <header><p className="text-sm font-medium">Account</p><h1 className="text-3xl font-bold">Billing & renewals</h1><p className="mt-2 text-sm text-gray-600">Manage domain auto-renewal, upcoming renewal invoices and payment history.</p></header>
  {error&&<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
  <section className="space-y-3"><h2 className="text-xl font-semibold">Recurring services</h2>{subscriptions.length===0?<div className="rounded-xl border p-6 text-sm text-gray-600">No recurring services are currently attached to your account.</div>:<div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="border-b bg-gray-50"><tr><th className="p-4">Service</th><th className="p-4">Renewal price</th><th className="p-4">Period ends</th><th className="p-4">Next billing</th><th className="p-4">Auto-renew</th></tr></thead><tbody>{subscriptions.map(s=><tr key={s.id} className="border-b last:border-0"><td className="p-4 font-medium">{s.domainId??"Service"}<div className="text-xs font-normal text-gray-500">{s.status}</div></td><td className="p-4">{money(s.amountCents,s.currency)} / year</td><td className="p-4">{date(s.currentPeriodEnd)}</td><td className="p-4">{date(s.nextBillingAt)}</td><td className="p-4">{s.domainId?<button disabled={busy===s.domainId} onClick={()=>void toggle(s.domainId!,!s.autoRenew)} className="rounded-md border px-3 py-1.5 font-medium disabled:opacity-50">{busy===s.domainId?"Saving...":s.autoRenew?"Enabled":"Disabled"}</button>:"Managed by provider"}</td></tr>)}</tbody></table></div>}</section>
  <section className="space-y-3"><h2 className="text-xl font-semibold">Renewal invoices</h2>{renewals.length===0?<div className="rounded-xl border p-6 text-sm text-gray-600">No renewal invoices have been generated.</div>:<div className="space-y-3">{renewals.map(r=><div key={r.id} className="flex flex-col gap-4 rounded-xl border p-5 md:flex-row md:items-center md:justify-between"><div><p className="font-semibold">{r.domain_name??"Renewal"}</p><p className="text-sm text-gray-600">Period end: {date(r.period_end)} · {r.status}</p></div>{r.order_id&&["ORDER_CREATED","FAILED"].includes(r.status)&&<button disabled={busy===r.order_id} onClick={()=>void pay(r.order_id!)} className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy===r.order_id?"Starting...":"Pay renewal"}</button>}</div>)}</div>}</section>
 </main>;
}
