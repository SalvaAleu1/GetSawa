import { Navbar } from "@/components/Navbar";

export const metadata = {
  title: "Terms of Service — GetSawa",
  description: "Terms governing the use of GetSawa domain and digital services.",
};

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <article className="prose prose-slate max-w-none">
          <h1>Terms of Service</h1>
          <p className="lead">Last updated: September 4, 2026</p>
          <p>
            These Terms govern your use of GetSawa, including domain search and registration, transfers, renewals,
            DNS management, websites, digital products, support, auctions, premium domains, developer APIs and other
            services made available through the platform. By creating an account or purchasing a service, you agree to
            these Terms.
          </p>

          <h2>1. Accounts</h2>
          <p>You must provide accurate information and keep your login credentials confidential. You are responsible
            for activity performed through your account. GetSawa may suspend an account where required for security,
            fraud prevention, abuse prevention, legal compliance, or non-payment.</p>

          <h2>2. Domain services</h2>
          <p>Domain registrations, transfers and renewals are subject to the rules of the applicable registry and
            registrar. Availability shown during search is not a guarantee until the registration is successfully
            completed. A domain becomes active only after payment is confirmed and provisioning succeeds.</p>
          <p>You agree to provide truthful registrant information and to comply with applicable registry policies,
            dispute procedures and domain-name rules. Some TLDs have additional eligibility or documentation
            requirements.</p>

          <h2>3. Payments and taxes</h2>
          <p>Prices are shown before checkout and may vary by TLD, product, term, promotion, currency and applicable
            taxes. Payment must be successfully authorized before paid services are provisioned. You authorize GetSawa
            and its payment providers to process the amount displayed at checkout.</p>

          <h2>4. Renewals and expiry</h2>
          <p>Customers are responsible for keeping domains renewed. Where auto-renew is enabled, GetSawa may attempt
            renewal using the configured payment method. Failed renewal can result in suspension, expiry or loss of a
            domain according to the applicable registry&apos;s lifecycle rules.</p>

          <h2>5. Acceptable use</h2>
          <p>You may not use GetSawa to facilitate fraud, phishing, malware, unlawful surveillance, intellectual-property
            infringement, abuse of third-party systems, spam, impersonation, or any activity prohibited by applicable
            law or the rules of a relevant registry or service provider.</p>

          <h2>6. Websites and content</h2>
          <p>You retain responsibility for content you publish through GetSawa. You must have the necessary rights to
            use text, images, trademarks, code and other material. AI-generated content is provided as an assistance
            tool and should be reviewed for accuracy, rights, safety and suitability before publication.</p>

          <h2>7. Auctions and premium domains</h2>
          <p>Bids may be binding once accepted under the applicable auction rules. Winning bidders must complete payment
            within the stated deadline. Premium-domain sales are subject to the listing and checkout terms displayed
            for the particular domain.</p>

          <h2>8. Intellectual property</h2>
          <p>GetSawa and its software, branding and platform materials are protected by applicable intellectual-property
            laws. Except for rights expressly granted to you, no ownership rights are transferred to you.</p>

          <h2>9. Third-party services</h2>
          <p>Some services depend on third-party providers such as domain registries, registrars, payment networks,
            email services and AI providers. Their availability and rules may affect service delivery. GetSawa does not
            control third-party outages or policy changes.</p>

          <h2>10. Service availability</h2>
          <p>We aim to keep the platform available and secure, but continuous availability is not guaranteed. We may
            perform maintenance, security work or changes to services. Where a paid service cannot be provisioned,
            GetSawa will record the failure and apply the applicable refund or remediation policy.</p>

          <h2>11. Disclaimers and limitation of liability</h2>
          <p>To the maximum extent permitted by applicable law, GetSawa is not responsible for indirect, incidental,
            special or consequential losses arising from use of the platform, third-party outages, registry decisions,
            domain expiry caused by customer inaction, or content published by customers.</p>

          <h2>12. Changes</h2>
          <p>We may update these Terms when the platform, providers or legal requirements change. The updated version
            will be posted on this page with a new revision date. Continued use after an update constitutes acceptance
            where permitted by law.</p>

          <h2>13. Contact</h2>
          <p>Questions about these Terms should be sent through the support channels provided in your GetSawa account
            or on the public GetSawa website.</p>

          <div className="not-prose mt-10 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm text-ink/70">
            This operational draft is intended to describe the actual platform rules. It should be reviewed and adapted
            by qualified legal counsel for the jurisdictions in which GetSawa will operate before public launch.
          </div>
        </article>
      </main>
    </>
  );
}
