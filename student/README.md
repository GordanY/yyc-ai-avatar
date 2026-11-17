# Student Agent Studio

A standalone static student interface in Traditional Chinese. It builds independently of the legacy Amica/Next.js app. GitHub Pages publishes only this interface; speech input/output, uploads and provider/model selectors are not included in its bundle. Students can preview the numbered movements in the character viewport.

## Preview and build

Requires Node 22 and Git LFS.

```sh
git lfs pull --include="public/vrm/YYC_InfoDay.vrm"
cd student
npm install
npm test
npm run build
node serve.mjs
```

Open http://127.0.0.1:4173. Build output is ../_site.

## GitHub Pages

In repository **Settings → Pages → Build and deployment → Source**, select **GitHub Actions** once. The **Student demo and GitHub Pages** workflow builds, checks the quota/context behavior, checks the UI in Chromium, loads the real school VRM, saves desktop/mobile screenshots, and deploys only after checks pass. If Pages is not yet enabled, the deploy job fails with a settings error; enable it and rerun that job.

Expected address after successful deployment: https://gordany.github.io/yyc-ai-avatar/

No API-key secret is needed for Pages or CI. The rightmost header button **連接AI model**, after the admin controls, opens a dialog containing the OpenRouter API-key field, visibility toggle, connection status and **連接** button. Opening the dialog masks the key and focuses its field; the eye button shows or hides the entered key. Common copied forms such as `Bearer …`, `Authorization: Bearer …` and `OPENROUTER_API_KEY="…"` are normalized, including whitespace and invisible copy characters; the app does not guess a required key prefix or length.

**連接** validates the normalized key directly with OpenRouter's [`GET /api/v1/key`](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key) before showing **已驗證 · OpenRouter** and a green dot on the header connection button. Validation does not submit a chat message or consume the classroom quota. Rejected credentials, permission problems and network failures show separate messages. Editing the key field, closing the dialog (including Escape), confirming an admin reset or leaving the page cancels any outstanding key check, so its late result cannot reconnect the page. Closing the dialog masks the field while preserving the existing verified connection, message draft and any typed candidate key. Successful validation applies the key, starts a fresh conversation while preserving the message draft, closes the dialog and focuses the composer.

The header dot is grey when disconnected, green after successful key validation or a valid chat answer, and red after the latest key-validation or chat failure. Closing the popup preserves that state. A failure keeps any existing verified key for a deliberate retry; admin reset or reload clears the key and returns the dot to neutral. The dot never contains key material.

Chat requires a successfully validated OpenRouter connection. Without one, **傳送** is disabled and Enter/programmatic submission is blocked before a message is added or quota is consumed. There are no local sample answers or demo-mode replies. The key stays in page memory, is never written to either browser storage, and is cleared on reload or admin reset. Chat calls go directly to https://openrouter.ai/api/v1/chat/completions. Successful key validation does not guarantee model availability or sufficient account balance.

## Teaching configuration

Edit config.mjs:

- model: provider model ID, intentionally absent from the student UI.
- contextWindow: fallback capacity until public OpenRouter metadata supplies actual capacity.
- idleLoop: automatic idle gestures; currently nod, wave and greeting (2, 3, 5).
- speakingLoop: gestures during the text reply reveal; currently nod, explain and emphasis (2, 13, 14).
- replyTokens: `8192`, the output-token cap sent as `max_tokens`; reasoning and visible answer text share this allowance.
- responseTimeoutMs: `120000`, covering the chat request through reading its JSON body; the later text-reveal animation is outside this deadline.
- replyCharactersPerSecond: text reveal speed.
- loopSeconds: delay before the next idle gesture.
- actions: original YYC idle/nod/wave clips; other school gestures use procedural motion.
- scholarModel: the bundled application resource containing the scholar mesh, texture and baked animation clips.
- adminResetPassword: the password used to enter classroom admin mode.

Greeting input maps to wave; acknowledgements map to nod; other input maps to idle. While a reply appears, the selected speaking gestures cycle. Turn/spin is excluded. Reduced-motion users see either model without automatic animation; orbit and zoom remain available.

The chat request leaves `reasoning` and `reasoning_effort` unset, preserving provider defaults. [Tencent documents Hy4-flash](https://cloud.tencent.com/document/product/1823/131208) with thinking enabled and default `high` effort. [OpenRouter documents](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) that Chat Completions reasoning shares `max_tokens` with visible text; exhausting that budget can yield `finish_reason: "length"` and empty content. The larger allowance leaves room for this default thinking without disabling it.

The **動作預覽** selector sits inside the upper-right corner of the character viewport. It offers **1 自然站立**, **2 點頭**, **3 揮手**, **5 打招呼（揮手）**, **13 解說** and **14 強調**; the adjacent **↻** button replays the selected movement. These are temporary previews for either character: they do not change saved settings or the automatic `idleLoop`/`speakingLoop` groups. Explicit previews also play with reduced motion enabled, then return to stationary idle.

## Sessions and context

The tab's sessionStorage stores only the submitted-input count (maximum 50); it survives reload, agent edits and conversation clearing. A newly opened tab is another session; browsers can clone sessionStorage when duplicating tabs. Clearing site storage bypasses this classroom/demo limit. This is not server-enforced abuse protection.

The top-right **進入管理員模式** button opens a password dialog. Entering the configured password **YYC123456** reveals **重設全部** and **離開管理員模式**; entering admin mode does not reset any data. **重設全部** opens a separate confirmation dialog. Confirming resets the quota to zero, clears the conversation and API key, removes saved profile settings and drafts, clears the template selection, restores the default school character, and shows the settings panel. Pending chat requests, reply reveals and key checks are cancelled. Only this app's profile/quota storage keys are changed; unrelated browser storage is preserved.

Admin mode is held only in page memory: reload or **離開管理員模式** leaves it, while completing a reset keeps it active. Exiting admin mode does not reset the current work. The password is included in the static JavaScript bundle, so this is a classroom convenience, not server-side access control.

Each submitted input counts once, including a provider failure; assistant replies do not count. Validation prevents over-limit inputs from being counted or sent. Limits: 200 English words / Han characters (each Han ideograph counts as one 字), plus a 4,000-character hard cap. Background knowledge accepts text only, up to 24,000 characters.

Name, description, personality, tone and background-knowledge edits remain drafts until **更新數字人** is pressed. Updating applies and stores those settings, aborts pending requests, drops late replies, clears conversation and token usage, and resets the avatar. Appearance changes apply immediately with the same conversation reset. These operations preserve the tab quota. The header button **隱藏角色設定** hides the settings panel and becomes **顯示角色設定**; toggling it preserves drafts, the conversation and quota, and the header connection button remains available. Profile text is stored locally on the device; conversation history is held in memory. A profile submitted to live chat is sent to OpenRouter.

The **角色範本** chooser includes **岳飛**. Selecting it alone does not change the active character or form. Press **刷新 ↻** to apply and save the template's name, description, personalities, tone, background knowledge and ancient-scholar appearance. Refreshing replaces any drafts, cancels pending chat/reply display and clears the conversation; it preserves the active OpenRouter connection and submitted-input count. No additional **更新數字人** click is needed to apply a refreshed template.

`templates.mjs` contains the template's historical background, an original classroom persona and links to the National Museum of China and National Palace Museum collections. **背景資料來源** below the chooser exposes those links after loading the template. Its loyalty, bravery, patience and teaching voice are classroom role-play choices, not claims to reproduce Yue Fei's historical psychology; the background explicitly separates historical evidence from later stories and fictional dialogue.

One active pair of short suggested questions appears in two adjacent boxes above the composer, initially using profile/template-aware starters (including 岳飛's `starterQuestions`). Clicking a question only fills and focuses the message draft; it does not submit or use quota. The pair hides while a reply is pending or appearing, then is replaced after that reply finishes. Clearing or changing the active character restores the appropriate starters, and cancelled replies cannot restore their old suggestions.

`followups.mjs` requests the normal answer followed by a `[[FOLLOW_UP_QUESTIONS]]` marker and a two-string JSON array in the same chat completion. The client removes this metadata before displaying and storing the assistant answer; only the answer prose enters later conversation history. Missing/malformed metadata, overlong entries or duplicate questions are filled out with short fallback choices. The reply and submitted question guide the English/Chinese fallback, including a numeric-only answer. Suggested questions require no additional API request or quota use; submitting one later counts as an ordinary message.

The token meter includes system settings, background knowledge and both sides of conversation. Before a reply it is labelled **估算**, using a language-aware approximate character count; after a reply **上次實際** uses provider-reported total_tokens. Percentage uses the selected model's context capacity. Estimates are not an exact tokenizer and may differ from provider usage. Failed-request usage does not replace the meter's estimate of the retained conversation.

`chat-completion.mjs` reads plain text or supported text-part arrays and uses a provider refusal as visible text when no answer text is present. Failures distinguish reasoning-only responses, an exhausted output cap, empty responses, provider errors and follow-up metadata with no answer prose. When response diagnostics are available, the collapsed **回覆診斷** disclosure shows only allowlisted finish reason/content type and output/reasoning token counts. It does not display private reasoning, the raw provider payload or the API key. These fields support diagnosis of a new failure without treating every empty response as token exhaustion.

The app sends one chat request per submitted input and performs no automatic paid retry. A failed input still consumes its one classroom submission; the draft is restored for the user to retry deliberately. The existing verified key remains available after a chat failure.

## Character status and licensing

- School: actual bundled YYC VRM, including original YYC idle/nod/wave animation. Source/credits remain in ../models/yyc-info-day/source-license.json.
- Ancient scholar: an interactive 3D character based on **Scholar Rigged** by **CG-Moon**, with baked idle, nod, wave/greeting, explanation and emphasis clips. Source: [Scholar Rigged on CGTrader](https://www.cgtrader.com/free-3d-models/character/man/scholar-rigged).

Both appearances use the same Three.js `AvatarStage`, `OrbitControls` and `AnimationMixer`: drag to orbit, scroll/pinch to zoom, and reset to restore the initial camera. Both follow the configured idle/reply gesture groups. The school character uses a classroom backdrop; the scholar uses a traditional courtyard. Models and backgrounds load from the site without an external model iframe.

The scholar source is listed under **Royalty Free License (no AI)**. [CGTrader's terms](https://www.cgtrader.com/pages/terms-and-conditions), section 21A.2, cover incorporated applications as well as rendered output; section 21A.3 lists proprietary resources and encryption among possible safeguards for software use. This application packages the converted model as an AES-256-GCM `character.yyc3d` resource. The original Blender files, raw GLB and standalone texture intermediates stay under ignored `output/`, rather than being published as source assets.

The viewer and decoder material in `scholar-asset-key.mjs` are public. This packaging deters direct reuse of a standalone model file; it does not make the model unextractable or provide server-side security or a DRM guarantee. The site's MIT code license does not replace the model's asset terms. Section 21B.1 restricts machine-learning use; the avatar geometry and textures are not sent to OpenRouter or used for model training.

The seven pixiv motion-pack files are not copied into this Pages build; school gestures use the project's original YYC clips and procedural motion. Scholar gestures are baked from its separately acquired rig by `export-scholar.py`. The normal website build copies the prepared application resource and does not require Blender.

To regenerate the scholar resource, extract your separately licensed download into `output/scholar-review/source/`, keeping `textures/` beside `model-rig.blend`. From the repository root, with Blender on `PATH`:

```sh
blender --background --factory-startup --disable-autoexec output/scholar-review/source/model-rig.blend --python student/export-scholar.py -- output/scholar-review/scholar.glb
node student/pack-scholar.mjs output/scholar-review/scholar.glb
```

On macOS, the Blender executable can instead be `/Applications/Blender.app/Contents/MacOS/Blender`. The export bakes the rig's clips into the local GLB; packaging writes `student/assets/scholar/character.yyc3d` and matching public decoder material in `student/scholar-asset-key.mjs`. Keep those two generated files together when updating the resource. The source, GLB and texture intermediates remain under ignored `output/`.

## Verification

```sh
npm test
npm run build
npx playwright install chromium
npx playwright test
```

The browser suite mocks OpenRouter requests with a dummy test key; it does not incur paid requests. These tests do not certify a real user's OpenRouter credentials, account balance or provider availability.
