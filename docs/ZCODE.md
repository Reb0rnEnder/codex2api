# Zcode accounts

Open **Accounts > Zcode > Add Zcode account**. Start browser sign-in, open the Z.AI authorization link, and keep the dialog open. The server polls and adds the account when authorization succeeds. Sessions expire after five minutes. You can also import an existing Zcode account JWT; this is different from a Z.AI API key.

Browser sign-in saves the email returned in the authorization result. Token imports use an email claim when present. For an existing account without either source of email, sign in again once to populate it. Connection tests use the account's GLM billing models (including GLM-5.3-Flash), with an editable test prompt in the shared test dialog. Proxy, tags, concurrency, and scheduling priority use the existing account editor.

Use a **Zcode channel** API key for these accounts. They use an independent Zcode provider, account pool, API-key channel, group channel, and GLM model allowlist. Requests go directly to `https://zcode.z.ai/api/v1/zcode-plan/anthropic/v1/messages`, not to Anthropic or to a separately running Zcode2Api server.

Supported client endpoints are `/v1/messages`, `/v1/chat/completions`, and `/v1/responses`, with streaming and non-streaming output. The OpenAI endpoints reuse the existing Messages/Responses converters. Text and tool calls use those existing converters; provider-specific fields can have additional limits. Compact, WebSocket ingress, image generation, and hosted tools are not implemented for Zcode.

The account's GLM model list comes from its billing balances. Zcode-specific request headers and system blocks follow the protocol documented in [D3-vin/Zcode2Api](https://github.com/D3-vin/Zcode2Api), inspected at commit `b2bbe39c6fa8e6cd69f13325c14228c6b280def7`. Client system instructions are preserved inside the final Zcode system block. A stable device ID is stored with the account. The upstream token limit is clamped to 131072; model casing, string message content, adaptive thinking, and reasoning effort are normalized for Zcode.

JWT expiration is retained across reloads when supplied. Tokens without an `exp` claim are accepted after authenticated billing verification and keep an unknown expiry; upstream authentication errors still apply. The reference login flow returns a JWT rather than a renewable refresh token, so an expired Zcode account requires signing in again. Codex and Anthropic OAuth refresh/probes are not used for it. Existing gateway scheduling and HTTP error handling still apply.

### Claim offered plans

In **Accounts > Zcode**, open a Zcode account's actions menu and choose **Claim offered plans**. The dialog's button fetches `/api/v1/zcode-plan/billing/preview` and submits every distinct offered plan ID to `/billing/claim`, highest priority first. It does not restrict offers by plan name. Already claimed plans are reported separately; one failed plan does not hide the others' results. Billing balances, stored models, runtime model access, and the plan label refresh afterward. Accounts without model entitlements can be added first and claimed from this dialog.

Plan claims use the ported Zcode2Api Node CAPTCHA helper (`internal/zcodecaptcha/assets/solver.js`). Each offered plan gets a fresh single-use verification parameter, with one fresh retry for provider code `3007`. The helper reads the public scene/region configuration and falls back from the stale sgp scene to the reference's working cn scene when necessary; the matching region is sent with the result. Missing Node, failed verification, already claimed plans, and individual failures are reported separately. No proxy rotation is used for verification.

The helper script and locked dependencies are embedded in release binaries. **Node.js 22.19+** must be installed on the server (or configured with `ZCODE_NODE_PATH`). An optional `runtime/node.exe` beside the Windows binary is also supported. Docker images include Node. For source builds run `npm ci --prefix internal/zcodecaptcha/assets --ignore-scripts` before compiling Go. The helper receives no account JWT. Explicit manual verification overrides remain available.

A live public-service smoke test returned a complete verification parameter. No authenticated plan claim or live model inference was performed. The provider's current public configuration sets `skip_model_request: true`, matching the reference's inference path without CAPTCHA headers. No account migration is added.

Local tests cover model discovery, JWT expiration, persisted account state, provider isolation, headers/body conversion, and all three client endpoints. No Zcode account was available for a live login or inference check. The copied system-block fixture retains the reference project's license in [third_party/Zcode2Api.LICENSE](../third_party/Zcode2Api.LICENSE).
