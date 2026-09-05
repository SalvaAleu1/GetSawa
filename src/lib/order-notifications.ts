import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

export type OrderNotificationType =
  | "ORDER_PAYMENT_CONFIRMED"
  | "ORDER_PROVISIONING"
  | "ORDER_ACTIVE"
  | "ORDER_FULFILMENT_FAILED";

/**
 * Creates a durable in-app notification once per order/status and optionally
 * sends the corresponding email. Missing email configuration never blocks
 * fulfilment.
 */
export async function notifyOrderLifecycle(params: {
  orderId: string;
  orderNumber: string;
  userId: string;
  email: string;
  type: OrderNotificationType;
  title: string;
  body: string;
  emailSubject: string;
  emailHtml: string;
}): Promise<{ created: boolean; emailSent: boolean }> {
  const existing = await prisma.notification.findFirst({
    where: {
      userId: params.userId,
      type: params.type,
      body: { contains: params.orderNumber },
    },
    select: { id: true },
  });

  if (existing) return { created: false, emailSent: false };

  let created = false;
  try {
    await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
      },
    });
    created = true;
  } catch {
    // A notification outage must not break payment or provisioning. Email is
    // still attempted only when the durable notification was created here.
    return { created: false, emailSent: false };
  }

  try {
    const result = await sendEmail({ to: params.email, subject: params.emailSubject, html: params.emailHtml });
    return { created, emailSent: result.sent };
  } catch {
    return { created, emailSent: false };
  }
}
