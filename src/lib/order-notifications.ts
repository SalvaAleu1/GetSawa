import { deliverCustomerMessage } from "@/lib/messaging";
import { emitDeveloperEvent, type DeveloperWebhookEvent } from "@/lib/developer-platform";

export type OrderNotificationType =
  | "ORDER_PAYMENT_CONFIRMED"
  | "ORDER_PROVISIONING"
  | "ORDER_ACTIVE"
  | "ORDER_FULFILMENT_FAILED"
  | "DOMAIN_RENEWAL_INVOICE"
  | "HOSTING_RENEWAL_INVOICE"
  | "EMAIL_RENEWAL_INVOICE"
  | "SECURITY_RENEWAL_INVOICE";

function webhookEvent(type:OrderNotificationType):DeveloperWebhookEvent{
  if(type==="ORDER_PAYMENT_CONFIRMED")return "order.payment_confirmed";
  if(type==="ORDER_PROVISIONING")return "order.provisioning";
  if(type==="ORDER_ACTIVE")return "order.active";
  if(type==="ORDER_FULFILMENT_FAILED")return "order.fulfilment_failed";
  return "renewal.invoice";
}

export async function notifyOrderLifecycle(params:{orderId:string;orderNumber:string;userId:string;email:string;type:OrderNotificationType;title:string;body:string;emailSubject:string;emailHtml:string;}):Promise<{created:boolean;emailSent:boolean}>{
  const delivery=await deliverCustomerMessage({eventKey:`order:${params.orderId}:${params.type}`,userId:params.userId,type:params.type,title:params.title,body:`${params.body} Order ${params.orderNumber}.`,email:{to:params.email,subject:params.emailSubject,html:params.emailHtml},sourceType:"order",sourceId:params.orderId});
  await emitDeveloperEvent({userId:params.userId,eventType:webhookEvent(params.type),resourceType:"order",resourceId:params.orderId,payload:{orderId:params.orderId,orderNumber:params.orderNumber,lifecycleType:params.type,title:params.title}}).catch((error)=>console.error("[developer-webhooks] could not enqueue order event",error));
  return{created:delivery.inAppCreated,emailSent:delivery.emailSent};
}
