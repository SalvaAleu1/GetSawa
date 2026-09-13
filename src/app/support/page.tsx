import Link from "next/link";
import { Navbar } from "@/components/Navbar";

export const metadata = {
  title: "Support — GetSawa",
  description: "Get help with domains, billing, security, hosting, email and other GetSawa services.",
};

const topics = [
  { title: "Domains", text: "Search, registration, renewal, transfer and DNS guidance.", href: "/domains", action: "Domain help" },
  { title: "Orders & billing", text: "Review orders, invoices, payment status and service delivery from your account.", href: "/dashboard/orders", action: "View orders" },
  { title: "Account security", text: "Manage sign-in, MFA and account-security settings from your dashboard.", href: "/dashboard/security", action: "Security settings" },
  { title: "Refunds & cancellations", text: "Understand how failed provisioning, domains, renewals and refunds are handled.", href: "/legal/refund", action: "Refund policy" },
  { title: "Developer API", text: "Read the API documentation and integration guidance for GetSawa developer features.", href: "/developers", action: "Developer docs" },
  { title: "Service management", text: "Manage active hosting, email, security and website services from your account.", href: "/dashboard/services", action: "My services" },
];

export default function SupportPage() {
  const supportEmail = process.env.SUPPORT_EMAIL?.trim();

  return (
    <>
      <Navbar />
      <main className="shell-container py-12 sm:py-16">
        <section className="mx-auto max-w-5xl">
          <p className="eyebrow">Help centre</p>
          <h1 className="mt-2 text-3xl font-bold text-ink sm:text-4xl">How can we help?</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/60 sm:text-base">
            Start with the service area below. For account-specific issues, include the relevant order number, domain or service identifier and never send passwords, full card numbers, MFA codes or authentication secrets.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((topic) => (
              <article key={topic.title} className="card flex flex-col p-5">
                <h2 className="text-lg font-bold text-ink">{topic.title}</h2>
                <p className="mt-2 flex-1 text-sm leading-6 text-ink/60">{topic.text}</p>
                <Link className="btn-secondary mt-5" href={topic.href}>{topic.action}</Link>
              </article>
            ))}
          </div>

          <section className="card mt-8 p-6 sm:p-8" aria-labelledby="contact-support">
            <h2 id="contact-support" className="text-xl font-bold text-ink">Account-specific support</h2>
            {supportEmail ? (
              <>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">
                  If the self-service options do not resolve the issue, contact GetSawa support from the email address on your account whenever possible. Include only the information needed to identify the affected service.
                </p>
                <a className="btn-primary mt-5" href={`mailto:${supportEmail}`}>Contact support</a>
              </>
            ) : (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60" role="status">
                Direct support contact is not currently published. Self-service account and policy resources remain available while the official support channel is being configured.
              </p>
            )}
          </section>

          <div className="mt-8 flex flex-wrap gap-3 text-sm">
            <Link className="btn-ghost" href="/legal/terms">Terms of Service</Link>
            <Link className="btn-ghost" href="/legal/privacy">Privacy Policy</Link>
            <Link className="btn-ghost" href="/legal/refund">Refund Policy</Link>
          </div>
        </section>
      </main>
    </>
  );
}
