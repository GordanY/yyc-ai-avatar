# Student Agent Studio

A standalone static student interface in Traditional Chinese. It builds independently of the legacy Amica/Next.js app. GitHub Pages publishes only this interface; speech input/output, uploads, provider/model selectors and gesture selectors are not included in its bundle.

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

No API-key secret is needed for Pages or CI. The user enters their own OpenRouter key in **連接你的數字人**, at the bottom of the **設定角色** panel. The eye button shows or hides the entered key; **連接** applies it and **使用示範模式** clears it. The key stays in page memory, is never written to either browser storage, and is cleared on reload. Calls go directly to https://openrouter.ai/api/v1/chat/completions. Provider/model availability and account balance still apply.

## Teaching configuration

Edit config.mjs:

- model: provider model ID, intentionally absent from the student UI.
- contextWindow: fallback capacity until public OpenRouter metadata supplies actual capacity.
- idleLoop: automatic idle gestures; currently nod, wave and greeting (2, 3, 5).
- speakingLoop: gestures during the text reply reveal; currently nod, explain and emphasis (2, 13, 14).
- replyCharactersPerSecond: text reveal speed.
- loopSeconds: delay before the next idle gesture.
- actions: original YYC idle/nod/wave clips; other school gestures use procedural motion.
- scholarStill and scholarActions: locally bundled static and animated WebP files.
- adminResetPassword: the classroom reset password.

Greeting input maps to wave; acknowledgements map to nod; other input maps to idle. While a reply appears, the selected speaking gestures cycle. Turn/spin is excluded. Reduced-motion users see a stationary school model or the scholar's still image.

## Sessions and context

The tab's sessionStorage stores only the submitted-input count (maximum 50); it survives reload, agent edits and conversation clearing. A newly opened tab is another session; browsers can clone sessionStorage when duplicating tabs. Clearing site storage bypasses this classroom/demo limit. This is not server-enforced abuse protection. The top-right **管理員重設** button opens a password dialog. The configured password is **YYC123456**; submitting it resets the quota to zero, clears the conversation and API key, removes saved profile settings and drafts, restores the default school character, and shows the settings panel. Pending requests and reply reveals are cancelled. Only this app's profile/quota storage keys are changed; unrelated browser storage is preserved. The password is included in the static JavaScript bundle, so this is a classroom convenience, not server-side access control.

Each submitted input counts once, including a provider failure; assistant replies do not count. Validation prevents over-limit inputs from being counted or sent. Limits: 200 English words / Han characters (each Han ideograph counts as one 字), plus a 4,000-character hard cap. Background knowledge accepts text only, up to 24,000 characters.

Name, description, personality, tone and background-knowledge edits remain drafts until **更新數字人** is pressed. Updating applies and stores those settings, aborts pending requests, drops late replies, clears conversation and token usage, and resets the avatar. Appearance changes apply immediately with the same conversation reset. These operations preserve the tab quota; hiding settings also preserves drafts and the conversation. Profile text is stored locally on the device; conversation history is held in memory. A profile submitted to live chat is sent to OpenRouter.

The token meter includes system settings, background knowledge and both sides of conversation. Before a reply it is labelled **估算**, using a language-aware approximate character count; after a reply **上次實際** uses provider-reported total_tokens. Percentage uses the selected model's context capacity. Estimates are not an exact tokenizer and may differ from provider usage.

## Character status and licensing

- School: actual bundled YYC VRM, including original YYC idle/nod/wave animation. Source/credits remain in ../models/yyc-info-day/source-license.json.
- Ancient scholar: fixed-view, transparent WebP animations rendered locally from **Scholar Rigged** by **CG-Moon**, with a traditional courtyard backdrop. The original Blender model and texture are not included in the repository or Pages build. Source: [Scholar Rigged on CGTrader](https://www.cgtrader.com/free-3d-models/character/man/scholar-rigged).

The scholar uses rendered idle, nod, wave/greeting, explanation and emphasis animations; it cannot be rotated like the school VRM. Both appearances follow the configured idle/reply gesture groups. The school character uses a classroom backdrop. Backgrounds and scholar renders are served locally; no external model iframe is used.

The scholar source is listed under **Royalty Free License (no AI)**. [CGTrader's terms](https://www.cgtrader.com/pages/terms-and-conditions), sections 21A.2–3 and 21B.1, distinguish permitted incorporated rendered output from redistribution of extractable models and restrict machine-learning use. The source files stay local, and the model is not used for training or sent to an image-generation service. The site's MIT code license does not replace the model's asset terms.

The seven pixiv motion-pack files are not copied into this Pages build; only the project's original YYC clips and procedural school gestures are used. `render-scholar.py` generates PNG animation frames from the separately acquired rig using Blender; the normal website build copies the prepared WebP files and does not require Blender.

To regenerate the scholar renders, extract your separately licensed download into `output/scholar-review/source/`, keeping `textures/` beside `model-rig.blend`. From the repository root, with Blender and FFmpeg (including the `libwebp_anim` encoder) on `PATH`:

```sh
blender --background --factory-startup --disable-autoexec output/scholar-review/source/model-rig.blend --python student/render-scholar.py -- output/scholar-review/frames
python3 -m venv output/scholar-tools
output/scholar-tools/bin/python -m pip install Pillow
output/scholar-tools/bin/python student/assemble-scholar.py output/scholar-review/frames student/assets/scholar
```

On macOS, the Blender executable can instead be `/Applications/Blender.app/Contents/MacOS/Blender`. On Windows, use `output/scholar-tools/Scripts/python.exe` for the virtual-environment commands. The output is 480 × 720 transparent WebP at 15 fps, plus a still image for reduced motion. Keep the source files and PNG intermediates under ignored `output/`; only the rendered WebP files belong in `student/assets/scholar/`.

## Verification

```sh
npm test
npm run build
npx playwright install chromium
npx playwright test
```

The browser suite mocks OpenRouter requests with a dummy test key; it does not incur paid requests. These tests do not certify real OpenRouter account connectivity or access to the original scholar model.
