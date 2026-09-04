/**
 * Transactional email sender. Uses SMTP credentials from the environment.
 * If SMTP is not configured, emails are logged (not sent) so the rest of
 * the application can proceed without crashing — but nothing here ever
 * pretends an email was delivered when it wasn't.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export async function sendEmail(message: EmailMessage): Promise<{ sent: boolean; reason?: string }> {
  if (!isEmailConfigured()) {
    console.warn(`[email] SMTP not configured — email to ${message.to} ("${message.subject}") was not sent.`);
    return { sent: false, reason: "SMTP not configured" };
  }

  // Lazy import so the nodemailer dependency is only required when email is
  // actually configured/used.
  const nodemailer = await import("nodemailer").catch(() => null);
  if (!nodemailer) {
    return { sent: false, reason: "Email transport not installed" };
  }

  const transport = nodemailer.default.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });

  await transport.sendMail({
    from: process.env.SMTP_FROM || "GetSawa <no-reply@getsawa.app>",
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });

  return { sent: true };
}

export const emailTemplates = {
  welcome: (firstName: string) => ({
    subject: "Welcome to GetSawa",
    html: `<p>Hi ${escapeHtml(firstName)},</p><p>Your GetSawa account is ready. Start by searching for a domain.</p>`,
  }),
  verifyEmail: (verifyUrl: string) => ({
    subject: "Verify your GetSawa email",
    html: `<p>Confirm your email address to activate your account:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
  }),
  passwordReset: (resetUrl: string) => ({
    subject: "Reset your GetSawa password",
    html: `<p>Reset your password using the link below. If you didn't request this, you can ignore this email.</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
  }),
  orderConfirmation: (orderNumber: string, totalFormatted: string) => ({
    subject: `Order ${orderNumber} confirmed`,
    html: `<p>Thanks for your order. <strong>${orderNumber}</strong> — total ${totalFormatted}.</p>`,
  }),
  domainRegistered: (domain: string, expiresAt: string) => ({
    subject: `${domain} is registered`,
    html: `<p><strong>${escapeHtml(domain)}</strong> has been registered and is active in your dashboard. It expires on ${expiresAt}.</p>`,
  }),
  paymentFailed: (orderNumber: string) => ({
    subject: `Payment issue with order ${orderNumber}`,
    html: `<p>We couldn't confirm payment for order ${orderNumber}. Please try again or contact support.</p>`,
  }),
};

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
