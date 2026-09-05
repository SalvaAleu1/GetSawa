import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { generateInvoiceNumber } from "@/lib/pricing";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
const schema = z.object({ orderId: z.string() });
type RouteContext = { params: Promise<{ id: string }> };
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser(); const { id } = await params; const { orderId } = schema.parse(await req.json());
    const auction = await prisma.auction.findUnique({ where: { id }, include: { winningBid: true } });
    if (!auction || auction.winningBid?.userId !== user.id) return jsonError("Auction not found.", 404);
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true, user: true } });
    if (!order || order.userId !== user.id) return jsonError("Order not found.", 404);
    if (order.status !== "PENDING_PAYMENT") return jsonOk({ status: order.status });
    const payment = order.payments.find((p) => p.status === "PENDING"); if (!payment?.providerOrderId) return jsonError("No pending payment found.", 400);
    const capture = await PayPalProvider.captureOrder(payment.providerOrderId, `capture-auction-${order.id}`); const captureNode = capture?.purchase_units?.[0]?.payments?.captures?.[0];
    if (capture.status !== "COMPLETED" || captureNode?.status !== "COMPLETED") { await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } }); return jsonError("Payment was not completed.", 402); }
    await prisma.$transaction([
      prisma.payment.update({ where: { id: payment.id }, data: { status: "PAID", providerCaptureId: captureNode.id } }),
      prisma.order.update({ where: { id: order.id }, data: { status: "PAYMENT_CONFIRMED" } }),
      prisma.auction.update({ where: { id: auction.id }, data: { status: "PAID" } }),
      prisma.invoice.create({ data: { invoiceNumber: generateInvoiceNumber((await prisma.invoice.count()) + 1), orderId: order.id, userId: order.userId, subtotalCents: order.totalCents, totalCents: order.totalCents, status: "PAID", paidAt: new Date(), billingName: `${order.user.firstName} ${order.user.lastName}`, billingEmail: order.user.email } }),
    ]);
    let provisioningNote: string | null = null;
    try {
      const ext = auction.domainName.split(".").slice(1).join("."); const tld = await prisma.tld.findUnique({ where: { extension: ext } }); const provider = getDomainProvider();
      if (tld && provider.isConfigured()) {
        const result = await provider.registerDomain({ domain: auction.domainName, years: 1, registrant: { firstName: order.user.firstName, lastName: order.user.lastName, email: order.user.email, phone: order.user.phone || "", address1: "", city: "", zip: "", country: order.user.country || "US" }, idempotencyKey: `auction-${auction.id}` });
        if (result.success) { await prisma.domain.upsert({ where: { name: auction.domainName }, create: { userId: order.userId, tldId: tld.id, name: auction.domainName, status: "ACTIVE", isPremium: true, providerName: provider.name, registeredAt: new Date(), expiresAt: result.expiresAt ? new Date(result.expiresAt) : undefined }, update: { userId: order.userId, status: "ACTIVE" } }); await prisma.order.update({ where: { id: order.id }, data: { status: "ACTIVE" } }); }
        else provisioningNote = result.errorMessage || "Registration failed.";
      } else provisioningNote = "Domain provider not configured — an administrator needs to complete this transfer manually.";
    } catch (err: any) { provisioningNote = err.message; }
    if (provisioningNote) await prisma.order.update({ where: { id: order.id }, data: { status: "PROVISIONING", provisioningError: provisioningNote } });
    await logAudit({ actorId: user.id, action: "auction.paid", resource: "auction", resourceId: auction.id });
    return jsonOk({ status: provisioningNote ? "PROVISIONING" : "ACTIVE", note: provisioningNote });
  } catch (err) { return handleError(err); }
}
