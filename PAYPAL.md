# PayPal setup

Reference: https://developer.paypal.com/api/rest/ and
https://developer.paypal.com/docs/payouts/

## 1. Create a live app

1. Log into https://developer.paypal.com with your business PayPal account.
2. Go to **Apps & Credentials**, switch to **Live**, and create an app.
3. Copy the **Client ID** and **Secret**.

## 2. Configure GetSawa

```
PAYPAL_CLIENT_ID=your-live-client-id
PAYPAL_CLIENT_SECRET=your-live-secret
PAYPAL_MODE=live
PAYPAL_BASE_URL=https://api-m.paypal.com
```

For development/testing, create a **Sandbox** app instead and use:

```
PAYPAL_MODE=sandbox
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
```

Use `/admin/providers` → **Test connection** to confirm — this creates (but
never captures) a $1.00 test order, which proves your OAuth credentials and
base URL are correct without charging anyone.

## 3. Set up webhooks

1. In the Developer Dashboard, under your app, go to **Webhooks** → **Add
   Webhook**.
2. Set the URL to `https://your-domain.com/api/webhooks/paypal`.
3. Subscribe to at least: `PAYMENT.CAPTURE.COMPLETED`,
   `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`,
   `CUSTOMER.DISPUTE.CREATED`.
4. Copy the **Webhook ID** into your `.env`:

```
PAYPAL_WEBHOOK_ID=your-webhook-id
```

Without `PAYPAL_WEBHOOK_ID` set, the webhook endpoint refuses to process
events (rather than processing unverified ones) — the synchronous capture
flow in checkout still works without it, but you lose the safety net for
delayed captures, refunds, and disputes.

## 4. Payouts (optional — affiliate/referral payouts, Phase 3)

Payouts require your PayPal business account to have Payouts enabled — this
is a separate approval from standard checkout. See
https://developer.paypal.com/docs/payouts/ for eligibility. The
`PayPalProvider.createPayout()` method is implemented and ready once that's
approved; nothing in Phase 1 calls it yet since there's no affiliate program
UI built.

## How money actually flows in this codebase

1. `/api/checkout/create-order` computes the total **entirely server-side**
   from the database and creates a PayPal order for exactly that amount.
2. The customer approves on PayPal's site and is redirected back.
3. `/api/checkout/capture` captures the payment, then **re-verifies the
   captured amount matches the order total** before marking anything paid.
4. Only after that does provisioning run.
5. The webhook handler is a backstop for anything that happens outside that
   synchronous flow (delayed capture, refund, dispute).
