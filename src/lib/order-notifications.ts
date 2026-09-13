import { deliverCustomerMessage } from "@/lib/messaging";

export type OrderNotificationType =
  | "ORDER_PAYMENT_CONFIRMED"
  | "ORDER_PROVISIONING"
  | "ORDER_ACTIVE"
  | "ORDER_FULFILMENT_FAILED"
  | "DOMAIN_RENEWAL_INVOICE"
  | "HOSTING_RENEWAL_INVOICE"
  | "EMAIL_RENEWAL_INVOICE"
  | "SECURITY_RENEWAL_INVOICE";

export async function notifyOrderLifecycle(params: {
  orderId:string;orderNumber:string;userId:string;email:string;type:OrderNotificationType;
  title:string;body:string;emailSubject:string;emailHtml:string;
}):Promise<{created:boolean;emailSent:boolean}>{
  const delivery=await deliverCustomerMessage({
    eventKey:`order:${params.orderId}:${params.type}`,
    userId:params.userId,
    type:params.type,
    title:params.title,
    body:`${params.body} Order ${params.orderNumber}.`,
    email:{to:params.email,subject:params.emailSubject,html:params.emailHtml},
    sourceType:"order",
    sourceId:params.orderId,
  });
  return{created:delivery.inAppCreated,emailSent:delivery.emailSent};
}
