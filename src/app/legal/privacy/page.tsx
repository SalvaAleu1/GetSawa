import { Navbar } from "@/components/Navbar";

export const metadata = {
  title: "Privacy Policy — GetSawa",
  description: "How GetSawa collects, uses, protects and retains customer information.",
};

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <article className="prose prose-slate max-w-none">
          <h1>Privacy Policy</h1>
          <p className="lead">Last updated: September 4, 2026</p>
          <p>This policy explains how GetSawa handles information when you create an account, purchase or manage a
            service, contact support, use our API, or browse the public website.</p>

          <h2>1. Information we collect</h2>
          <ul>
            <li><strong>Account information:</strong> name, email address, phone number, company and country.</li>
            <li><strong>Domain information:</strong> domain names, registration details, nameservers, DNS records,
              renewal settings and other information needed to provide domain services.</li>
            <li><strong>Transaction information:</strong> orders, invoices, payment status, provider transaction IDs,
              refunds and related accounting records. Full payment-card credentials are handled by the payment provider,
              not stored as raw card data by GetSawa.</li>
            <li><strong>Security information:</strong> password hashes, session identifiers, login events, IP address,
              user-agent information, verification/reset tokens and audit records.</li>
            <li><strong>Support and content:</strong> support messages, website content, blog submissions and other
              information you choose to provide.</li>
            <li><strong>Technical information:</strong> request metadata and logs needed to operate, secure and debug
              the platform.</li>
          </ul>

          <h2>2. How we use information</h2>
          <p>We use information to authenticate users, provide and provision services, process payments, manage domains,
            prevent fraud and abuse, send transactional notices, respond to support requests, maintain audit trails,
            improve reliability and comply with legal obligations.</p>

          <h2>3. Domain-registration data</h2>
          <p>Domain registration may require registrant information to be transmitted to the relevant registrar or
            registry. The information and disclosure requirements depend on the TLD and applicable registry policy.
            Customers are responsible for providing accurate registration information.</p>

          <h2>4. AI services</h2>
          <p>When you use an AI-powered feature, the inputs necessary to generate your requested result may be sent to
            the configured AI provider. Generated website content is stored as part of your project when you save or
            publish it. Do not submit confidential information to an AI feature unless you have determined that doing so
            is appropriate.</p>

          <h2>5. Cookies and sessions</h2>
          <p>GetSawa uses essential cookies or equivalent session mechanisms to maintain authenticated sessions and
            security. Referral tracking may use a short-lived cookie when a visitor follows a referral link. We do not
            require advertising cookies for core account or checkout functionality.</p>

          <h2>6. Sharing</h2>
          <p>We share information only as needed to provide requested services or meet legal and security obligations.
            This can include domain registrars and registries, payment processors, email/hosting providers, AI
            providers, infrastructure providers, professional advisers and competent authorities where legally required.</p>

          <h2>7. Security</h2>
          <p>Passwords are stored as one-way hashes. Sensitive session and reset flows are designed to be revocable,
            and domain-transfer authorization codes are encrypted at rest. We use access controls, validation,
            rate-limiting and audit logging appropriate to the service. No internet service can guarantee absolute
            security.</p>

          <h2>8. Retention</h2>
          <p>We retain information for as long as necessary to provide services, maintain financial and audit records,
            resolve disputes, enforce agreements and satisfy legal obligations. Retention periods can vary by data type
            and jurisdiction.</p>

          <h2>9. Your choices and rights</h2>
          <p>Depending on your location, you may have rights to access, correct, delete, restrict or object to certain
            processing of your personal information. Some records must be retained for legal or accounting reasons.
            Requests can be made through GetSawa support.</p>

          <h2>10. Children</h2>
          <p>GetSawa is not directed to children who are not legally able to enter the relevant service agreements. We do
            not knowingly request unnecessary personal information from children.</p>

          <h2>11. International processing</h2>
          <p>GetSawa and its service providers may process information in countries different from your country of
            residence. Where required, appropriate contractual or legal safeguards should be used for such transfers.</p>

          <h2>12. Changes</h2>
          <p>We may update this policy when our services or legal obligations change. The revision date at the top of this
            page will be updated when material changes are published.</p>

          <h2>13. Contact</h2>
          <p>For privacy requests or questions, use the support channels published by GetSawa. Please do not include
            passwords, payment-card numbers or other unnecessary secrets in a support request.</p>

          <div className="not-prose mt-10 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm text-ink/70">
            This policy describes the platform&apos;s current technical data flows. Qualified legal counsel should review
            it for the jurisdictions and privacy regimes applicable to GetSawa before public launch.
          </div>
        </article>
      </main>
    </>
  );
}
