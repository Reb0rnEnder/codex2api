# ChatGPT BasisPoints accounts

Open **Accounts → Add account → ChatGPT BasisPoints**. Choose **Start sign-in**, then **Open ChatGPT sign-in**. This opens the same Office OAuth sign-in route as the PowerPoint extension; it does not use device-code authorization.

After signing in, keep the BasisPoints callback page open without refreshing. The account dialog now offers **Copy console script** and **Copy bookmarklet**:

- Console: open DevTools on the callback page, paste the copied script into the console, run it, and copy the URL from the resulting prompt.
- Bookmarklet: create a bookmark, replace its URL with the copied bookmarklet, and click it while viewing the callback page. Copy the URL from the prompt.

Paste the recovered URL into the account dialog. Each helper checks the callback origin, path, and current session state. It reads the original document URL from the browser's Navigation Timing entry, which can retain the callback query after `history.replaceState` clears the address bar. It makes no network requests and reads no stored tokens. This behavior was checked in headless Edge. Do not reload the callback page before running the helper; some browser policies may prevent bookmarklets or hide navigation details.

The Network-tab fallback remains available: before signing in, open DevTools → Network and enable **Preserve log**. After sign-in, copy the full request URL for `/auth/callback?code=…&state=…`. An Office dialog error on the callback page is expected outside PowerPoint. The server checks the callback origin, path, state, expiry, and single-use session before exchanging the code with its PKCE verifier.

The registered callback belongs to OpenAI, so codex2api cannot receive it directly. These helpers simplify the manual handoff; they do not redirect the callback to another server or make the address-bar URL remain available.

After authorization, the server checks BasisPoints access and discovers the account's available models from `/basispoints/api/responses/access`. Accounts stay in the Codex channel, with a `basispoints` marker distinguishing them from Codex CLI accounts. Chat Completions, Messages, and Responses requests use the existing Responses adapter and stream bridge, connecting to the BasisPoints WebSocket with its bearer subprotocol. Internal BasisPoints control frames are removed from the downstream stream. Requests use the model catalog returned for this account; the catalog is not hardcoded from the development capture.

Refresh tokens are stored as account credentials and renewed with the BasisPoints OAuth client. The existing refresh locks, durable rotation journal, generation checks, and token cache also apply. New access and refresh tokens survive a restart. Codex WHAM usage and model probes do not apply to these accounts. BasisPoints and Codex credentials are kept separate even for the same ChatGPT identity.

This is an experimental adapter based on the supplied HAR and the extension's published JavaScript. Backend access and rate limits remain enforced by BasisPoints. PowerPoint document editing, executor registration, resume/replay, native interruption acknowledgements, and image generation are not implemented. The upstream can supply its own instructions and tools; general chat and client-provided tool behavior require a live compatibility check. This does not guarantee that every free account has access.

Sources inspected:

- [PowerPoint extension](https://bps.openai.com/basispoints/extension/360590d7-f8f9-4d88-bf75-0edfe0a4b9f3/powerpoint/)
- The extension's `auth-config-Dcnc8OAm.js` and `x-square-Bw2ZMIVV.js` assets, retrieved during implementation.
- Local `dev-resources/bps.openai.com.har`; its credentials are not copied into source or fixtures.

Local tests use synthetic credentials and cover callback rejection, the Office login URL, refresh and persistence across reload, identity separation, and WebSocket authentication/request adaptation/control-frame filtering. A live check with the captured access token also verified model discovery and a completed text response through the Go adapter. The capture was not imported as an account and its refresh token was not consumed. A fresh interactive sign-in and live refresh still need to be checked by the user.
