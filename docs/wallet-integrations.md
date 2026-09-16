# Wallet configuration and release gates

Clerk remains the sole login. The app registers as a public OAuth client of its
own Clerk instance; PKCE S256 and a Turnkey public-key nonce bind authorization
to the signed-in user and the browser's non-extractable P-256 key. This is not a
second login provider. Normal Clerk session tokens must not replace OIDC tokens.

`POST /api/wallet/start` requires Clerk authentication, an exact same-origin
request and a validated device public key. State is HttpOnly, Secure, SameSite
Lax; the five-minute DB record is consumed atomically once by the same user.
The callback verifies JWT signature, issuer, audience, expiry, subject and nonce.
The database locks provisioning per Clerk user and enforces unique user, org,
wallet and address mappings. Interrupted creations are recovered through the
verified OIDC identity. Emails never resolve wallet ownership.

Each user owns the root OAuth identity of their Turnkey sub-org. The parent
server is never added to user wallets as a signer. The browser proves session
access directly with a signed Turnkey whoami request. No wallet/private device
keys are stored by the application. Device credentials are cleared on logout or
account change; provider sessions expire after one hour.

## Production state

- Clerk login, DNS/HTTPS and OAuth application: configured.
- Neon Postgres: isolated `vanlink-production`, migration `0001_wallets.sql`.
- Turnkey's provided credentials validate but belong to the root user.
- A dedicated non-root server user and policy remain blocked by automatic
  approval review; no Turnkey permission changes were made.
- `WALLET_ACTIVATION_ENABLED=false`. No receiving addresses or transfers exposed.
- `TURNKEY_SERVICE_USER_ID` must match whoami and must not be in the root quorum.
- Alchemy, LI.FI and Onramper production credentials still need to be supplied.
- VanLinks remain local drafts; they are not payable invoices.

## Exact Turnkey change awaiting approval

Create one non-root user named `VanLink production wallet service`, with one
P-256 API key. Add one ALLOW policy for that user with condition:

```
activity.type == 'ACTIVITY_TYPE_CREATE_SUB_ORGANIZATION_V8'
```

No signing, transfers, exports, policy administration or root membership.
Turnkey gives org users read access by default; this permission is inherent in
its model. The backend additionally enforces Clerk ownership for every request.
Replace Vercel's two runtime Turnkey API credentials with the service pair and
set `TURNKEY_SERVICE_USER_ID`. Preserve the original root user's access.
No bootstrap script holding a root key is committed to this repository.

Before enabling activation, verify the service's creation permission and the
OIDC login flow on a dedicated test sub-org, including retry after interruption.
Then test a real user on mobile, sign-out and another device. Funds stay disabled
until user-controlled signing, export/recovery, fees and network checks pass.

## Assets and remittance routing

USDC on Base is the primary wallet balance. The exact VanLink model still needs
confirmation from the owner: payment request versus a funded link claimed by
the recipient. Do not implement invoice settlement, escrow or claim-link custody
from the draft UI alone. This release does not alter or enable VanLink payments.
LI.FI's live API confirmed native Bitcoin chain `20000000000001`, asset `bitcoin`,
8 decimals. BTC mainnet gets a separate native SegWit wallet account. It is not
cbBTC, WBTC or Lightning. EVM signing does not implement Bitcoin PSBT/UTXO signing.

USDT always needs an explicit supported chain and contract address. Do not infer
issuer authenticity from the ticker: the LI.FI catalog includes bridged assets
and multiple contracts with the same symbol. Catalog availability is not an
executable quote or an off-ramp guarantee.

For withdrawals: request destination country, fiat, payment method and amount;
obtain the actual Onramper exit options first; compare total fees, limits and
net payout; only then quote the required LI.FI conversion. Use USDT/BTC only when
that exit supports that exact asset/network. Requote expired offers and require
user confirmation. Do not default to BTC for every remittance or promise global
bank withdrawals. A redirect from a provider is not proof of payment.

Onramper remains the only ramp. Its widget must use `buy,sell` modes, never its
additional swap mode. LI.FI remains the only swap integration. A publishable
Onramper API key and a separate URL signing secret are required to prefill a
verified receiving address. Obtain crypto/network IDs from its live catalog.

## Needed configuration

| Variable | Purpose |
| --- | --- |
| `ALCHEMY_API_KEY` | Base Mainnet balances / monitoring |
| `LIFI_API_KEY` | Authenticated routes and quotes |
| `ONRAMPER_API_KEY` | Production widget publishable key |
| `ONRAMPER_SIGNING_SECRET` | Server-side signing of wallet-prefilled URLs |

All values go to production Vercel environment variables, never GitHub or logs.
Names are documented in `.env.example`; presence alone is not a health check.

References:
- https://docs.turnkey.com/features/authentication/social-logins
- https://docs.turnkey.com/features/policies/overview
- https://clerk.com/docs/guides/configure/auth-strategies/oauth/single-sign-on
- https://docs.li.fi/introduction/lifi-architecture/bitcoin-overview
- https://docs.onramper.com/docs/supported-widget-parameters
- https://docs.onramper.com/docs/signing-widget-url
