import { Navbar } from "@/components/Navbar";

export const metadata = {
  title: "Refund Policy — GetSawa",
  description: "Refund and cancellation rules for GetSawa services.",
};

export default function RefundPolicyPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <article className="prose prose-slate max-w-none">
          <h1>Refund & Cancellation Policy</h1>
          <p className="lead">Last updated: September 4, 2026</p>
          <p>This policy explains how GetSawa handles cancellations, failed provisioning, refunds and domain-related
            purchases. Product-specific terms shown at checkout also apply.</p>

          <h2>1. Domain registrations</h2>
          <p>Once a domain registration has been successfully submitted to and accepted by the applicable registry,
            registration fees are generally non-refundable because the registry service has already been consumed. A
            customer should verify the domain and registration period before confirming payment.</p>

          <h2>2. Failed registration or provisioning</h2>
          <p>If payment succeeds but GetSawa cannot provision a paid service, the order is recorded as failed rather than
            being falsely marked active. GetSawa will investigate the failure and, where the service was not delivered,
            provide an appropriate refund or remediation subject to the payment provider, registry rules and the specific
            product terms.</p>

          <h2>3. Domain transfers</h2>
          <p>Transfer fees may become non-refundable once a transfer has been submitted to the registrar or registry,
            depending on the provider&apos;s rules. If a transfer fails before the service is consumed, GetSawa may refund
            the applicable fee or allow a resubmission where supported.</p>

          <h2>4. Renewals</h2>
          <p>Successful domain renewals are generally non-refundable once the renewal has been submitted and accepted by
            the registry. Customers are responsible for disabling auto-renew before a renewal attempt where they no
            longer want the domain.</p>

          <h2>5. Premium domains</h2>
          <p>Premium-domain purchases are subject to the terms displayed for the specific listing. A completed transfer
            or registration of a premium domain is generally treated as a completed registry transaction.</p>

          <h2>6. Digital and website services</h2>
          <p>For digital services that have not yet been provisioned, a cancellation may be possible before work begins.
            Once a service has been generated, provisioned or materially delivered, refunds may be limited to the
            undelivered portion, subject to the applicable product terms and law.</p>

          <h2>7. Duplicate or erroneous charges</h2>
          <p>GetSawa uses server-side pricing and payment idempotency to reduce duplicate charges. If you believe you were
            charged twice for the same order, contact support promptly with the order number. We will reconcile the
            payment records with the payment provider and refund a confirmed duplicate charge.</p>

          <h2>8. Chargebacks and disputes</h2>
          <p>Please contact GetSawa support first when a payment or service issue can be resolved directly. Unauthorized
            transactions should also be reported to your payment provider immediately. GetSawa may suspend affected
            services while a payment dispute is investigated.</p>

          <h2>9. How to request a refund</h2>
          <p>Submit a support request with your order number, the service concerned, the reason for the request and any
            relevant evidence. Never send a password, full card number or security code. Approved refunds are returned
            through the payment method or process available for the original transaction whenever possible.</p>

          <h2>10. Policy changes</h2>
          <p>We may update this policy when provider rules, products or legal requirements change. The revision date at
            the top of this page will be updated when changes are published.</p>

          <div className="not-prose mt-10 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm text-ink/70">
            This operational policy should be reviewed by qualified legal counsel and reconciled with the final NameSilo,
            PayPal and other provider terms before public launch.
          </div>
        </article>
      </main>
    </>
  );
}
