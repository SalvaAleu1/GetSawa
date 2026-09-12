"use client";

import { FormEvent, useEffect, useState } from "react";

interface User {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  company: string | null;
  country: string | null;
  emailVerifiedAt: string | null;
  mfaEnabled: boolean;
  createdAt: string;
}

interface Session {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  readAt: string | null;
  createdAt: string;
}

interface LoginEvent {
  id: string;
  success: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  reason: string | null;
  createdAt: string;
}

interface Overview {
  security: {
    emailVerified: boolean;
    mfaEnabled: boolean;
    activeSessions: number;
    recentFailedLogins: number;
  };
  onboarding: {
    completed: number;
    total: number;
    percent: number;
    checklist: Array<{ key: string; label: string; complete: boolean }>;
  };
  loginEvents: LoginEvent[];
}

interface MfaSetup {
  secret: string;
  otpAuthUri: string;
}

type Message = { type: "success" | "error"; text: string } | null;

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [unread, setUnread] = useState(0);
  const [message, setMessage] = useState<Message>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", company: "", country: "" });
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "" });
  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);
  const [mfaToken, setMfaToken] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [profileResponse, sessionsResponse, notificationsResponse, overviewResponse] = await Promise.all([
        fetch("/api/dashboard/profile"),
        fetch("/api/dashboard/security/sessions"),
        fetch("/api/dashboard/notifications"),
        fetch("/api/dashboard/security/overview"),
      ]);
      const [profileData, sessionsData, notificationsData, overviewData] = await Promise.all([
        profileResponse.json(), sessionsResponse.json(), notificationsResponse.json(), overviewResponse.json(),
      ]);

      if (!profileResponse.ok) throw new Error(profileData.error || "Could not load account profile.");
      if (profileData.user) {
        setUser(profileData.user);
        setForm({
          firstName: profileData.user.firstName,
          lastName: profileData.user.lastName,
          phone: profileData.user.phone || "",
          company: profileData.user.company || "",
          country: profileData.user.country || "",
        });
      }
      setSessions(sessionsResponse.ok ? sessionsData.sessions || [] : []);
      setNotifications(notificationsResponse.ok ? notificationsData.notifications || [] : []);
      setUnread(notificationsResponse.ok ? notificationsData.unreadCount || 0 : 0);
      setOverview(overviewResponse.ok ? overviewData : null);
    } catch (cause: unknown) {
      setMessage({ type: "error", text: cause instanceof Error ? cause.message : "Could not load account settings." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/dashboard/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save profile.");
      setUser((current) => current ? { ...current, ...data.user } : current);
      setMessage({ type: "success", text: "Profile updated." });
      await load();
    } catch (cause: unknown) {
      setMessage({ type: "error", text: cause instanceof Error ? cause.message : "Could not save profile." });
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/dashboard/security/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(password),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not change password.");
      setPassword({ currentPassword: "", newPassword: "" });
      setMessage({ type: "success", text: "Password changed. Existing sessions were revoked; sign in again if this session ends." });
    } catch (cause: unknown) {
      setMessage({ type: "error", text: cause instanceof Error ? cause.message : "Could not change password." });
    } finally {
      setSaving(false);
    }
  }

  async function revoke(sessionId: string) {
    const response = await fetch("/api/dashboard/security/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    if (!response.ok) {
      const data = await response.json();
      setMessage({ type: "error", text: data.error || "Could not revoke session." });
      return;
    }
    await load();
  }

  async function revokeAll() {
    const response = await fetch("/api/dashboard/security/sessions", { method: "PATCH" });
    if (response.ok) window.location.href = "/login";
    else setMessage({ type: "error", text: "Could not sign out all sessions." });
  }

  async function markNotification(id?: string) {
    await fetch("/api/dashboard/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : { all: true }),
    });
    await load();
  }

  async function beginMfa() {
    setMessage(null);
    const response = await fetch("/api/auth/mfa/setup", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      setMessage({ type: "error", text: data.error || "Could not start two-factor setup." });
      return;
    }
    setMfaSetup(data);
    setMfaToken("");
  }

  async function verifyMfa() {
    const response = await fetch("/api/auth/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: mfaToken }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage({ type: "error", text: data.error || "Invalid authentication code." });
      return;
    }
    setMfaSetup(null);
    setMfaToken("");
    setMessage({ type: "success", text: "Two-factor authentication is enabled." });
    await load();
  }

  async function disableMfa() {
    const response = await fetch("/api/auth/mfa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: mfaToken }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage({ type: "error", text: data.error || "Could not disable two-factor authentication." });
      return;
    }
    setMfaToken("");
    setMessage({ type: "success", text: "Two-factor authentication is disabled." });
    await load();
  }

  if (loading && !user) return <div className="panel p-8 text-sm text-ink/55">Loading account and security settings…</div>;
  if (!user) return <div className="panel p-8 text-sm text-danger">Account information could not be loaded.</div>;

  return (
    <div className="page-stack max-w-6xl">
      <div>
        <p className="eyebrow">Account center</p>
        <h1 className="page-heading mt-2">Account & Security</h1>
        <p className="page-subtitle">Manage your profile, authentication, active devices, login activity, and important account notifications.</p>
      </div>

      {message ? (
        <div className={message.type === "success" ? "rounded-2xl border border-success/20 bg-success/5 p-4 text-sm text-success" : "rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger"}>{message.text}</div>
      ) : null}

      {overview ? (
        <section className="grid gap-4 md:grid-cols-4">
          <div className="metric-card"><p className="text-xs font-semibold text-ink/45">Onboarding</p><p className="mt-2 text-2xl font-bold">{overview.onboarding.percent}%</p><p className="mt-1 text-xs text-ink/45">{overview.onboarding.completed} of {overview.onboarding.total} complete</p></div>
          <div className="metric-card"><p className="text-xs font-semibold text-ink/45">Email</p><p className="mt-2 text-lg font-bold">{overview.security.emailVerified ? "Verified" : "Not verified"}</p><span className={overview.security.emailVerified ? "badge-success mt-2" : "badge-warning mt-2"}>{overview.security.emailVerified ? "Protected" : "Action needed"}</span></div>
          <div className="metric-card"><p className="text-xs font-semibold text-ink/45">Two-factor</p><p className="mt-2 text-lg font-bold">{overview.security.mfaEnabled ? "Enabled" : "Disabled"}</p><span className={overview.security.mfaEnabled ? "badge-success mt-2" : "badge-warning mt-2"}>{overview.security.mfaEnabled ? "Extra protection" : "Recommended"}</span></div>
          <div className="metric-card"><p className="text-xs font-semibold text-ink/45">Active sessions</p><p className="mt-2 text-2xl font-bold">{overview.security.activeSessions}</p><p className="mt-1 text-xs text-ink/45">{overview.security.recentFailedLogins} recent failed login{overview.security.recentFailedLogins === 1 ? "" : "s"}</p></div>
        </section>
      ) : null}

      {overview ? (
        <section className="panel p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="section-heading">Account setup</h2><p className="mt-1 text-sm text-ink/50">Complete these steps before relying on the account for production services.</p></div>
            <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-brand-500" style={{ width: `${overview.onboarding.percent}%` }} /></div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {overview.onboarding.checklist.map((item) => <div key={item.key} className="flex items-center gap-3 rounded-xl border border-border p-3"><span className={item.complete ? "flex h-7 w-7 items-center justify-center rounded-full bg-success/10 text-xs font-black text-success" : "flex h-7 w-7 items-center justify-center rounded-full bg-amber-400/15 text-xs font-black text-amber-600"}>{item.complete ? "✓" : "!"}</span><span className="text-sm font-semibold">{item.label}</span></div>)}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="section-heading">Profile & business identity</h2>
        <form onSubmit={saveProfile} className="card mt-3 grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <div><label className="label">Email</label><input className="input bg-paper" value={user.email} readOnly /><p className="help-text">Email changes require a dedicated verification flow and cannot be changed from this form.</p></div>
          <div><label className="label">Account created</label><input className="input bg-paper" value={new Date(user.createdAt).toLocaleDateString()} readOnly /></div>
          {([['firstName','First name'],['lastName','Last name'],['phone','Phone'],['company','Company / organization'],['country','Country']] as const).map(([key, label]) => <div key={key}><label className="label">{label}</label><input className="input" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></div>)}
          <div className="sm:col-span-2"><button disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save profile"}</button></div>
        </form>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={changePassword} className="card p-5 sm:p-6">
          <h2 className="section-heading">Password</h2>
          <p className="mt-1 text-sm text-ink/50">Changing your password invalidates existing sessions as a defensive measure.</p>
          <div className="mt-5 space-y-4">
            <div><label className="label">Current password</label><input className="input" type="password" autoComplete="current-password" required value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} /></div>
            <div><label className="label">New password</label><input className="input" type="password" autoComplete="new-password" minLength={10} required value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} /><p className="help-text">Use at least 10 characters and avoid reusing passwords from other services.</p></div>
            <button disabled={saving} className="btn-primary">Change password</button>
          </div>
        </form>

        <div className="card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><h2 className="section-heading">Two-factor authentication</h2><p className="mt-1 text-sm text-ink/50">Use a TOTP authenticator app for a second sign-in factor.</p></div><span className={user.mfaEnabled ? "badge-success" : "badge-warning"}>{user.mfaEnabled ? "Enabled" : "Recommended"}</span></div>

          {!user.mfaEnabled && !mfaSetup ? <button type="button" onClick={beginMfa} className="btn-primary mt-5">Set up two-factor authentication</button> : null}
          {!user.mfaEnabled && mfaSetup ? (
            <div className="mt-5 space-y-4 rounded-xl border border-border bg-paper p-4">
              <div><p className="text-sm font-bold">1. Add GetSawa to your authenticator app</p><p className="mt-1 break-all font-mono text-xs text-ink/60">Secret: {mfaSetup.secret}</p><a href={mfaSetup.otpAuthUri} className="mt-2 inline-block text-sm font-semibold text-brand-600 hover:underline">Open authenticator link</a></div>
              <div><label className="label">2. Enter the 6-digit code</label><input className="input max-w-52 font-mono" inputMode="numeric" maxLength={6} value={mfaToken} onChange={(event) => setMfaToken(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" /></div>
              <button type="button" disabled={mfaToken.length !== 6} onClick={verifyMfa} className="btn-primary">Verify and enable</button>
            </div>
          ) : null}
          {user.mfaEnabled ? <div className="mt-5"><label className="label">Disable with current 6-digit code</label><div className="flex max-w-sm gap-2"><input className="input font-mono" inputMode="numeric" maxLength={6} value={mfaToken} onChange={(event) => setMfaToken(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" /><button type="button" disabled={mfaToken.length !== 6} onClick={disableMfa} className="btn-danger shrink-0">Disable</button></div></div> : null}
        </div>
      </section>

      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="section-heading">Active sessions</h2><p className="mt-1 text-sm text-ink/50">Review browsers and devices that currently hold an active GetSawa session.</p></div><button onClick={revokeAll} className="btn-danger">Sign out everywhere</button></div>
        <div className="card mt-3 divide-y divide-border">
          {sessions.map((session) => <div key={session.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{session.isCurrent ? "This device" : "Active session"}</p>{session.isCurrent ? <span className="badge-success">Current</span> : null}{session.ipAddress ? <span className="text-xs text-ink/45">{session.ipAddress}</span> : null}</div><p className="mt-1 break-words text-xs leading-5 text-ink/45">{session.userAgent || "Unknown browser"}</p><p className="text-xs text-ink/40">Started {new Date(session.createdAt).toLocaleString()} · expires {new Date(session.expiresAt).toLocaleString()}</p></div>{!session.isCurrent ? <button onClick={() => revoke(session.id)} className="btn-secondary shrink-0">Revoke</button> : null}</div>)}
          {sessions.length === 0 ? <p className="p-5 text-sm text-ink/55">No active sessions.</p> : null}
        </div>
      </section>

      <section>
        <h2 className="section-heading">Recent sign-in activity</h2>
        <p className="mt-1 text-sm text-ink/50">Use this history to spot unfamiliar successful or failed login attempts.</p>
        <div className="table-shell mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm"><thead className="bg-paper text-xs uppercase tracking-wide text-ink/40"><tr><th className="px-4 py-3">Result</th><th className="px-4 py-3">Time</th><th className="px-4 py-3">IP</th><th className="px-4 py-3">Device</th><th className="px-4 py-3">Reason</th></tr></thead><tbody className="divide-y divide-border">{overview?.loginEvents.map((event) => <tr key={event.id}><td className="px-4 py-3"><span className={event.success ? "badge-success" : "badge-danger"}>{event.success ? "Success" : "Failed"}</span></td><td className="px-4 py-3 whitespace-nowrap">{new Date(event.createdAt).toLocaleString()}</td><td className="px-4 py-3">{event.ipAddress || "—"}</td><td className="max-w-sm px-4 py-3 text-xs text-ink/50">{event.userAgent || "Unknown"}</td><td className="px-4 py-3 text-xs text-ink/50">{event.reason || "—"}</td></tr>)}</tbody></table>
          {overview && overview.loginEvents.length === 0 ? <p className="p-5 text-sm text-ink/55">No login activity has been recorded yet.</p> : null}
        </div>
      </section>

      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="section-heading">Notifications {unread > 0 ? <span className="badge-warning ml-2">{unread} unread</span> : null}</h2><p className="mt-1 text-sm text-ink/50">Account, domain, payment, billing, and operational events that need your attention.</p></div>{unread > 0 ? <button onClick={() => markNotification()} className="btn-secondary">Mark all read</button> : null}</div>
        <div className="card mt-3 divide-y divide-border">{notifications.map((notification) => <button key={notification.id} onClick={() => markNotification(notification.id)} className={`block w-full p-4 text-left transition hover:bg-paper ${notification.readAt ? "opacity-60" : ""}`}><div className="flex flex-col gap-1 sm:flex-row sm:justify-between"><span className="font-semibold">{notification.title}</span><span className="text-xs text-ink/40">{new Date(notification.createdAt).toLocaleString()}</span></div><p className="mt-1 text-sm text-ink/55">{notification.body}</p></button>)}{notifications.length === 0 ? <p className="p-5 text-sm text-ink/55">No notifications.</p> : null}</div>
      </section>
    </div>
  );
}
