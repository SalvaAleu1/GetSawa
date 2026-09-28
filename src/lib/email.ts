/**
 * Transactional email sender. Uses SMTP credentials from the environment.
 * If SMTP is not configured, emails are logged and reported as unsent.
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

async function createEmailTransport() {
  if (!isEmailConfigured()) throw new Error("SMTP is not configured.");
  const nodemailer = await import("nodemailer").catch(() => null);
  if (!nodemailer) throw new Error("Email transport is not installed.");

  return nodemailer.default.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
}

/**
 * Performs a live SMTP handshake/authentication check without sending mail.
 * Used by the launch-provider health gate.
 */
export async function verifyEmailTransport(): Promise<{ ok: boolean; message: string }> {
  if (!isEmailConfigured()) return { ok: false, message: "SMTP_HOST / SMTP_USER / SMTP_PASSWORD are not set." };
  try {
    const transport = await createEmailTransport();
    await transport.verify();
    return { ok: true, message: "SMTP connection and authentication verified successfully." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "SMTP verification failed.",
    };
  }
}

export async function sendEmail(message: EmailMessage): Promise<{ sent: boolean; reason?: string }> {
  if (!isEmailConfigured()) {
    console.warn(`[email] SMTP not configured — email to ${message.to} ("${message.subject}") was not sent.`);
    return { sent: false, reason: "SMTP not configured" };
  }

  let transport;
  try {
    transport = await createEmailTransport();
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "Email transport unavailable" };
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM || "CloudSawa <no-reply@cloudsawa.com>",
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
  return { sent: true };
}

export const emailTemplates = {
  welcome: (firstName: string) => ({
    subject: "Welcome to CloudSawa",
    html: `<p>Hi ${escapeHtml(firstName)},</p><p>Your CloudSawa account is ready. Start by searching for a domain.</p>`,
  }),
  verifyEmail: (verifyUrl: string) => ({
    subject: "Verify your CloudSawa email",
    html: `<p>Confirm your email address to activate your account:</p><p><a href="${escapeHtml(verifyUrl)}">${escapeHtml(verifyUrl)}</a></p>`,
  }),
  passwordReset: (resetUrl: string) => ({
    subject: "Reset your CloudSawa password",
    html: `<p>Reset your password using the link below. If you didn't request this, you can ignore this email.</p><p><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>`,
  }),
  orderConfirmation: (orderNumber: string, totalFormatted: string) => ({
    subject: `Order ${orderNumber} confirmed`,
    html: `<p>Thanks for your order. <strong>${escapeHtml(orderNumber)}</strong> — total ${escapeHtml(totalFormatted)}.</p>`,
  }),
  domainRegistered: (domain: string, expiresAt: string) => ({
    subject: `${domain} is registered`,
    html: `<p><strong>${escapeHtml(domain)}</strong> has been registered and is active in your dashboard. It expires on ${escapeHtml(expiresAt)}.</p>`,
  }),
  domainRenewalReminder: (domain: string, expiresAt: string) => ({
    subject: `Renew ${domain} before it expires`,
    html: `<p>Your domain <strong>${escapeHtml(domain)}</strong> expires on ${escapeHtml(expiresAt)}.</p><p>Renew it before the expiration date to avoid interruption to your website, DNS and email services.</p>`,
  }),
  paymentFailed: (orderNumber: string) => ({
    subject: `Payment issue with order ${orderNumber}`,
    html: `<p>We couldn't confirm payment for order ${escapeHtml(orderNumber)}. Please try again or contact support.</p>`,
  }),
};

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
