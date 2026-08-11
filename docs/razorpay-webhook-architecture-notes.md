# Razorpay Webhook Architecture Notes

**Official sources consulted on 2026-08-11:**

1. [Razorpay — About Webhooks](https://razorpay.com/docs/webhooks/)
2. [Razorpay — Subscription Webhook Events](https://razorpay.com/docs/webhooks/subscriptions/)
3. [Razorpay — Payment Webhook Events](https://razorpay.com/docs/webhooks/payments/)

## Verified provider capabilities

Razorpay supports server-to-server HTTP POST webhook notifications for payment and subscription events. Razorpay's documentation identifies webhooks as the primary mechanism for asynchronous payment automation; client-side checkout success is not a substitute for webhook confirmation.

## Provider requirements

- Set separate Live and Test webhook URLs in the Razorpay dashboard.
- Webhook URLs must use ports 80 or 443.
- Verify the Razorpay signature using the **raw request body**. Razorpay warns not to parse or cast the request body before verification.
- Handle retries idempotently: persist provider event IDs and never issue credits twice for the same event.
- `payment.captured` and `order.paid` represent captured payment. Never issue credits merely from a client redirect or an unverified browser success claim.
- Subscription event payloads contain the subscription entity and can include payment information.
- When rotating webhook secrets, older retry deliveries can require verification against the previous secret.

## VVServices implementation decision

- Build a provider-neutral `PaymentProvider` boundary with a Razorpay adapter.
- Persist normalized provider payment and webhook-event records before issuing subscription allocations or top-up credits.
- Keep live provider calls disabled until `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` are supplied through secure project secrets.
- Capture raw webhook body before global JSON parsing for Razorpay signature validation.
- Issue `V◈` credits only after a verified successful webhook event and idempotency check.

## Recurring subscription activation

Razorpay's official subscriptions flow is plan-based: create one monthly plan, then create a customer subscription against that plan. Razorpay manages recurring charges and provides webhook events for status changes and payment cycles.

For VVServices, the live activation sequence will be:

1. Create or configure a Razorpay monthly plan for **₹9,999** (`999900` paise), one-month interval.
2. Create a Razorpay subscription linked to that plan for the jeweller and persist its `sub_...` identifier in `jewellerSubscriptions.providerSubscriptionId`.
3. Use the Razorpay-created `short_url` or Checkout authorisation flow to obtain the customer mandate.
4. Allocate 500 V◈ only from a verified successful subscription/payment webhook, never from the authorisation redirect.
5. Use `subscription.charged` for later monthly allocations and `subscription.halted` / `subscription.cancelled` to block credit spending and apply the top-up-expiry rule.

Official sources: [Razorpay Subscriptions overview](https://razorpay.com/docs/payments/subscriptions/), [Create Plan API](https://razorpay.com/docs/api/payments/subscriptions/create-plan/), and [Create Subscription API](https://razorpay.com/docs/api/payments/subscriptions/create-subscription/).
