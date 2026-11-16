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

No API-key secret is needed for Pages or CI. The user enters their own OpenRouter key through **示範模式 ↗**. The key stays in page memory, is never written to either browser storage, and is cleared on reload. Calls go directly to https://openrouter.ai/api/v1/chat/completions. Provider/model availability and account balance still apply.

## Teaching configuration

Edit config.mjs:
- model: provider model ID, intentionally absent from the student UI.
- contextWindow: fallback capacity until public OpenRouter metadata supplies actual capacity.
- idleLoop: action IDs to loop, e.g. ['idle','nod','wave']; no student selector.
- loopSeconds: delay before the next loop action.
- actions: only original YYC idle/nod/wave clips are published.
- reduced-motion users see the model without automatic animation.

Greeting text maps to wave; acknowledgements map to nod; other text maps to idle. Both input and reply text trigger this allowlisted mapping.

## Sessions and context

The tab's sessionStorage stores only the submitted-input count (maximum 50); it survives reload, agent edits and conversation clearing. A newly opened tab is another session; browsers can clone sessionStorage when duplicating tabs. Clearing site storage bypasses this classroom/demo limit. This is not server-enforced abuse protection. No unlimited reset button is exposed.

Each submitted input counts once, including a provider failure; assistant replies do not count. Validation prevents over-limit inputs from being counted or sent. Limits: 200 English words / Han characters (each Han ideograph counts as one 字), plus a 4,000-character hard cap. Background knowledge accepts text only, up to 24,000 characters.

Every name/description/personality/tone/knowledge/appearance change aborts pending requests, drops late replies, clears conversation and token usage, and resets the avatar to its initial state. The tab quota is preserved. Profile text is stored locally on the device; conversation history is held in memory. A profile submitted to live chat is sent to OpenRouter.

The token meter includes system settings, background knowledge and both sides of conversation. Before a reply it is labelled **估算**, using a language-aware approximate character count; after a reply **上次實際** uses provider-reported total_tokens. Percentage uses the selected model's context capacity. Estimates are not an exact tokenizer and may differ from provider usage.

## Character status and licensing

- School: actual bundled YYC VRM, including original YYC idle/nod/wave animation. Source/credits remain in ../models/yyc-info-day/source-license.json.
- Ancient scholar: external Sketchfab 3D preview of **AI Generated - Ancient Chinese Scholar** by **OGL / GaryLim**:
  https://sketchfab.com/3d-models/ai-generated-ancient-chinese-scholar-a75bd588c991496f96f05ef92a23d910

**The scholar has NOT been downloaded, redistributed, rigged, or approved visually.** The source download was blocked in this environment. Its appearance can be reviewed in the embedded preview; its license, download and skeletal compatibility must be verified before replacing the preview with an animated local VRM. The UI labels this explicitly. Chat works with either appearance, but only the school VRM receives mapped/looped gestures.

Third-party iframe availability depends on Sketchfab. The seven pixiv motion-pack files are not copied into this Pages build; only the project's original YYC clips are used.

## Verification

```sh
npm test
npm run build
npx playwright install chromium
npx playwright test
```

The browser suite mocks OpenRouter requests with a dummy test key; it does not incur paid requests. Real OpenRouter account connectivity and the scholar model are not certified by these tests.
