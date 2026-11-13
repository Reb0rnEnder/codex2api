# BasisPoints accounts

Open **Accounts > Add account > BasisPoints**, the last sign-in option. Select **Start sign-in**, then **Open ChatGPT sign-in**. This uses the Office extension OAuth route rather than device-code authorization.

After login, ChatGPT may display "Couldn't sign in, please try again" while leaving a URL with `code` and `state` in the address bar. Copy the entire callback URL and paste it into the dialog. No scripts, bookmarklets, or DevTools are needed. The server validates the origin, path, state, expiry, and single-use session before exchanging the code with its PKCE verifier. If the callback URL does not contain a code, restart sign-in.

The login session expires after 30 minutes. After the account is added, access and refresh tokens use the existing durable rotation and token-cache machinery. These credentials stay separate from Codex credentials for the same ChatGPT identity.

Accounts remain in the Codex pool with a BasisPoints marker and presentation icon. Their model list and plan come from BPS `/basispoints/api/responses/access?include_models=true`. Account details include a **BasisPoints subscription and access** panel with an explicit refresh action. Subscription expiry is retained when supplied by the login token. Missing renewal, cancellation, expiry, or quota data is shown as unknown/unavailable; Codex WHAM usage is not substituted.

## Instructions and custom tools

The PowerPoint capture includes an extension-provided developer message. This adapter does not copy that message, extension document contents, or the extension's Office tool definitions. It preserves caller instructions, developer/system messages, function tools, tool choice, function calls, and function-call outputs. Local tests verify this passthrough. It does not execute the caller's tools; return tool results through your client as usual.

BPS may add its own Office-specific instructions or tool context on the server. There is no verified switch to remove that context. The add-account form warns about it. Removing all caller instructions would not remove instructions added by BPS and would discard your own application rules. Live acceptance of client-defined tools still requires verification with a current account.

Chat Completions, Messages, and Responses requests reuse the existing Responses conversions and stream bridge. They connect to the BPS WebSocket using its bearer subprotocol. Internal BPS control frames are removed downstream. Office document editing, executor registration, replay/resume, native interruption acknowledgements, compact requests, and image generation are not implemented. Backend entitlements and limits remain enforced by BPS.

## Validation and sources

Synthetic tests cover callback validation, Office login URLs, refresh persistence, credential isolation, WebSocket authentication, request adaptation, custom tool passthrough, and control frames. An earlier live test using the supplied access token completed a text response and model discovery. No captured account was imported and its refresh token was not consumed. Fresh interactive login, live refresh, and live custom-tool acceptance remain to be checked.

Sources: the public [PowerPoint extension](https://bps.openai.com/basispoints/extension/360590d7-f8f9-4d88-bf75-0edfe0a4b9f3/powerpoint/) assets and the local `dev-resources/bps.openai.com.har`. Captured credentials are excluded from source and public releases.
