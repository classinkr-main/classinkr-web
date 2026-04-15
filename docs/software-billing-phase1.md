# Software Billing Phase 1

## Scope

- Provider: Toss Payments widget
- Payment methods: card, Naver Pay
- Product scope: software only
- Sales scope kept separate: enterprise, hardware, partner-led deals

## Implemented flow

1. Public user enters checkout information on `/checkout`
2. Server creates a pending order in `software_checkout_orders`
3. Toss widget opens payment window
4. Toss redirects to `/checkout/success` or `/checkout/fail`
5. Success page calls `/api/billing/checkout/confirm`
6. Server confirms the payment with Toss and marks the order as `paid`
7. Failure page marks the order as `failed`

## Required env

```bash
NEXT_PUBLIC_SW_CHECKOUT_ENABLED=true
NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY=...
TOSS_SECRET_KEY=...
NEXT_PUBLIC_BILLING_STANDARD_MONTHLY_KRW=79000
NEXT_PUBLIC_BILLING_STANDARD_YEARLY_KRW=790000
NEXT_PUBLIC_BILLING_PLUS_MONTHLY_KRW=149000
NEXT_PUBLIC_BILLING_PLUS_YEARLY_KRW=1490000
```

## Notes

- This phase intentionally keeps public software checkout separate from the existing hardware/partner portal domain.
- Enterprise remains contact-led.
- Webhook-driven reconciliation and recurring billing should be added in the next phase before broad production rollout.
