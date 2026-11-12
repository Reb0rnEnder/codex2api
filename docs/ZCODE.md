# Zcode accounts

Open **Claude accounts → Add account → Zcode**. Start browser sign-in, open the Z.AI authorization link, and keep the account dialog open. The server polls for the result and adds the account when authorization succeeds. Sessions expire after five minutes. You can also import an existing Zcode account JWT; this is different from a Z.AI API key.

Use a **Claude / Anthropic channel** API key for these accounts. They stay distinct from Anthropic accounts with a `zcode` marker and a GLM model allowlist. Requests go directly to `https://zcode.z.ai/api/v1/zcode-plan/anthropic/v1/messages`, not to Anthropic or to a separately running Zcode2Api server.

Supported client endpoints are `/v1/messages`, `/v1/chat/completions`, and `/v1/responses`, with streaming and non-streaming output. The OpenAI endpoints reuse the existing Messages/Responses converters. Text and tool calls use those existing converters; provider-specific fields can have additional limits. Compact, WebSocket ingress, image generation, and hosted tools are not implemented for Zcode.

The account's GLM model list comes from its billing balances. Zcode-specific request headers and system blocks follow the protocol documented in [D3-vin/Zcode2Api](https://github.com/D3-vin/Zcode2Api), inspected at commit `b2bbe39c6fa8e6cd69f13325c14228c6b280def7`. Client system instructions are preserved inside the final Zcode system block. A stable device ID is stored with the account. The upstream token limit is clamped to 131072; model casing, string message content, adaptive thinking, and reasoning effort are normalized for Zcode.

JWT expiration is retained across reloads. The reference login flow returns a JWT rather than a renewable refresh token, so an expired Zcode account requires signing in again. Codex and Anthropic OAuth refresh/probes are not used for it. Existing gateway scheduling and HTTP error handling still apply.

### Claim offered plans

In **Claude accounts**, open a Zcode account's actions menu and choose **Claim offered plans**. The dialog's button fetches `/api/v1/zcode-plan/billing/preview` and submits every distinct offered plan ID to `/billing/claim`, highest priority first. It does not restrict offers by plan name. Already claimed plans are reported separately; one failed plan does not hide the others' results. Billing balances, stored models, runtime model access, and the plan label refresh afterward. Accounts without model entitlements can be added first and claimed from this dialog.

If Zcode returns verification code `3007`, the result reports that verification is required. Complete verification in the official app; the dialog optionally accepts its verification parameter and region. These parameters may be single-use and are never saved. There is no automatic CAPTCHA solver, background plan claiming, or proxy rotation to retry verification. No live plan claim was performed during development.

Local tests cover model discovery, JWT expiration, persisted account state, provider isolation, headers/body conversion, and all three client endpoints. No Zcode account was available for a live login or inference check. The copied system-block fixture retains the reference project's license in [third_party/Zcode2Api.LICENSE](../third_party/Zcode2Api.LICENSE).
