# VanLink: recipient-first remittances

Confirmed by Luis on 2026-09-16. This is the product definition, not a claim that
the required provider flow is already integrated or approved.

## Core use case

The sender understands technology and holds crypto in VanDeFi. The recipient
does not need to understand wallets, token networks, swaps or blockchain fees.
Example: Luis holds USDT in Mexico and sends money to his girlfriend in Colombia.
He selects **Enviar por VanLink**, prepares the destination and amount, and shares
a link through WhatsApp. She opens a preconfigured payout flow, completes the
provider-required identity and payout-account steps, and receives local fiat.
Luis subsequently clarified that the historical flow might have used his KYC
and a separate beneficiary. Do not assume which identity model is supported.

The product's promise is **send crypto; receive local money through a simple link**.
It is not primarily a payment-request link. The sender/recipient are different
people; do not silently implement self-withdrawal or identity impersonation.

## Historical implementation recovered on 2026-09-16

Read-only review of `turbillon50/vandefi-origin` at commit
`302101d7132907b566be72222ae7eea63ef9fed8` found:

- `server/routes.ts`, `POST /api/clerk/vanlink/create`: the sender supplied an
  amount, USDC/BTC currency and recipient phone. The backend checked a stored
  balance, inserted a pending `vanlink_transfers` row and generated a random
  32-byte claim token expiring after two hours. It returned a WhatsApp message
  directing the recipient to choose a bank and complete verification.
- That handler described funds as reserved but contained no actual funds hold.
  Its 4% fee was hardcoded. Neither behavior should be carried forward as a
  verified funding mechanism or current commercial pricing.
- `GET /api/vanlink/verify/:token` checked the row and expiry. In the inspected
  source, references to `vanlinkTransfers` only insert, read and expire the row;
  no settlement callback marking that transfer paid was found.
- `/api/onramper/signed-url` accepted optional identity fields and constructed a
  sell URL. This proves an attempt to prefill a widget, not verified acceptance
  of a distinct beneficiary or completed bank payout. Some legacy parameters
  are absent from the current documented widget parameter list.
- A separate older `/api/wallet/claim` flow assigned pending wallets and created
  legacy sessions. It is a different mechanism, not evidence that sender KYC
  covered a beneficiary. The new app retains Clerk as its sole authentication.

These findings do not disprove a past successful payment in another version.
No historical provider order or bank settlement receipt was accessed. The old
repositories were not modified, and their credentials were not reused.

## Identity decision: cleanest supported route

| Model | Sender | Recipient | Required provider evidence |
| --- | --- | --- | --- |
| Remittance with separate beneficiary | Verified originator funds the order | Named beneficiary confirms the receiving account and any required verification | Explicit support for third-party beneficiaries, sender-funded payouts and the Mexico-to-Colombia corridor |
| Recipient-owned sale | Sends assets to a recipient-owned wallet through an approved flow | Verifies as seller and withdraws to their own account | Acceptance of the ownership/funding sequence, asset/network and local payout method |

Prefer the first model if Onramper can supply an eligible remittance flow: it
matches the intended product most directly. Otherwise assess the second model
without promising that a wallet handoff alone satisfies the provider. Sender
KYC cannot silently substitute for the recipient's identity in a self-withdrawal
flow. Additional recipient checks depend on the selected provider and corridor.

The documented Transak retail terms, for example, describe sale proceeds paid
to the customer's verified bank account and restrict other-person wallets.
This illustrates why generic sell widgets are insufficient evidence; it does
not establish rules for every Onramper provider or prove Colombia coverage.

Transak separately advertises a business remittance API with stablecoins and
local payouts. That is evidence that a distinct remittance product exists, not
that this business flow is exposed through Onramper or enabled for VanDeFi.
Do not add a second ramp integration without an explicit scope decision.

Questions to resolve with Onramper before building funding:

1. Which enabled provider supports a verified sender in Mexico, a different
   recipient in Colombia, and COP payout to that recipient's bank account?
2. Is this an explicit beneficiary/remittance API, or a recipient-owned sale?
   Who must complete KYC, and may funds come directly from the sender's wallet?
3. Which recipient/bank fields can be prefilled, confirmed and securely stored?
4. What are the exact asset/network, limits, fees, payout methods, quote expiry,
   order-funding sequence, webhook verification and failure/refund behavior?

Until resolved, the link is an invitation to receive; it is not proof of funds
sent or reserved. Never reuse the sender's browser session as recipient KYC.

## Minimal experience

Sender: recipient + country → amount and estimated net payout → review total
cost and conditions → authorize the transfer → share VanLink → track outcome.

Recipient: **Luis te envía dinero** → view expected local-currency amount and
sender → **Verificarme y recibir** → complete the provider's identity and payout
steps → track processing and confirmed delivery. No crypto trading interface.
The exact fiat amount is a quote, not a guarantee before it is locked/executed.

A link points to an opaque, revocable server-side remittance intent. It must not
contain identity documents, bank details, private keys or provider secrets.
WhatsApp link previews must not consume the link. Bind access to the intended
recipient before exposing private data or paying; a forwarded link is not proof
of recipient identity. WhatsApp sharing is user initiated, not an automatic send.

## Provider capability that must be confirmed

Onramper is the sole ramp. Its docs confirm buy/sell modes and widget parameters,
but we have not verified support for a separate sender and beneficiary, Colombia
COP payout availability for this account, or complete prefill of each provider's
KYC/payout fields. Verify these with Onramper and the selected underlying provider
before promising this flow. Do not bypass third-party funding restrictions.

If a provider requires the crypto seller and payout recipient to be the same
person, determine whether an approved recipient-owned wallet flow is supported.
Do not assume a hidden sub-wallet bypasses provider restrictions or makes funds
non-custodial. Keep the recipient's ownership, consent and identity explicit.

## Funding and state design remain to be validated

A prefilled URL is not a funded transaction. For a sender to authorize once and
then go offline, we need a supported funding/order lifecycle: a provider-funded
order, an appropriate audited holding mechanism, or an explicitly bounded user
authorization accepted by the wallet/provider. No such mechanism is implemented.
Otherwise the sender may need a second authorization after recipient verification;
that limitation must be shown, not hidden behind a premature “money sent” state.

Suggested states: draft, awaiting recipient, verifying recipient, ready to fund,
funding submitted, conversion processing, payout processing, delivered, expired,
cancelled, failed, refund pending, refunded. “Delivered” requires verified provider
confirmation; visiting a success URL never settles a transfer. Handle duplicate
webhooks and retries idempotently. Decide when cancellation remains possible.

A denied/incomplete KYC, expired quote or failed payout needs a defined recovery
path based on whether funds actually moved. Do not invent instant free refunds.

## Role of LI.FI and assets

The sender's input may be USDT, USDC or BTC on an explicitly supported network.
Choose a route only after checking the destination off-ramp's accepted asset and
network, limits and net payout. LI.FI performs a conversion if needed. Native BTC
is one option, not a mandatory intermediate asset or a promise of global coverage.
Base USDC remains the initial wallet default without forcing all remittances to
settle through it. Preserve the single Clerk / Turnkey / Alchemy / LI.FI /
Onramper / Postgres stack until Luis explicitly changes scope.

## Evidence

- Historical source: https://github.com/turbillon50/vandefi-origin/blob/302101d7132907b566be72222ae7eea63ef9fed8/server/routes.ts
- Current widget parameters: https://docs.onramper.com/docs/supported-widget-parameters
- URL signing: https://docs.onramper.com/docs/signing-widget-url
- Provider retail example, not universal policy: https://transak.com/terms-of-service
- Separate business remittance offering: https://transak.com/remittance
- Example order lifecycle: https://support.moonpay.com/en/articles/384277-how-do-i-sell-cryptocurrency-with-moonpay
