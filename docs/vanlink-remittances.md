# VanLink: recipient-first remittances

Confirmed by Luis on 2026-09-16. This is the product definition, not a claim that
the required provider flow is already integrated or approved.

## Core use case

The sender understands technology and holds crypto in VanDeFi. The recipient
does not need to understand wallets, token networks, swaps or blockchain fees.
Example: Luis holds USDT in Mexico and sends money to his girlfriend in Colombia.
He selects **Enviar por VanLink**, prepares the destination and amount, and shares
a link through WhatsApp. She opens a preconfigured off-ramp flow, completes her
own KYC and any required payout-account confirmation, and receives local fiat.

The product's promise is **send crypto; receive local money through a simple link**.
It is not primarily a payment-request link. The sender/recipient are different
people; do not silently implement self-withdrawal or identity impersonation.

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
