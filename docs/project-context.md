# YYC Helper project context

This private repository packages the local Amica customization as of 28 October 2026. Its upstream checkout was based on `semperai/amica` commit `ca2415c77d20ec41dd4fcf917dbb0e97961ddf08`; the snapshot includes the local customized source and assets rather than assuming they were already committed upstream.

## Application and data flow

The web app uses Next.js, React, three.js and `@pixiv/three-vrm`. `npm run dev` generates asset URLs, bundles the mesh-BVH worker and starts Next on `127.0.0.1`. The root setup scripts install the web dependencies and start this command. The Tauri wrapper and avatar-authoring tools are optional and are not part of web-server setup.

The reception prompt lives in `src/config/infoDayPrompt.ts`. The Claude client in `src/features/chat/claudeChat.ts` posts to `/api/claude/`; `src/pages/api/claude.ts` builds the school system prompt, calls Anthropic, collects the complete reply and filters it with `src/features/chat/schoolAnswer.ts` before returning visitor-visible text. `src/server/schoolContext.ts` supplies the qualified summary and bounded keyword retrieval. Other chatbot backends and the optional reasoning-engine path do not receive this same school-prompt integration.

The runtime corpus contains 47 topics, 228 summary facts and 888 source chunks across 448 physical PDF pages. Its authorities are the three school PDFs in `context/source-pdfs/`; the runtime JSON is in `src/server/data/`, and the fuller extraction package is retained in `context/school-knowledge/`. Historical original paths recorded in metadata are provenance, not runtime dependencies. There is no runtime requirement for files in the original Mac's Downloads folder.

## Reception behavior to preserve

- Replies use Traditional Chinese and natural Hong Kong phrasing, normally two to four short sentences, with an initial internal `[happy]` or `[neutral]` expression tag.
- School claims must remain grounded in the qualified school summary and relevant source excerpts. Preserve dates, scope, uncertainties and conflicts; do not turn historical examples into current guarantees.
- Unsupported questions or arrangements requiring current confirmation use the exact referral: **想了解更多，歡迎向在場老師查詢。**
- Source filenames, PDF pages and internal citations are for internal checking and must not appear in visitor-visible answers or speech. The separate extraction package's generic `AI_USAGE.txt` is historical dataset guidance; the application reception prompt and answer filter govern this visitor experience.
- Manual microphone recording retains pauses and ends on explicit **Stop recording**. `src/features/manualRecording/` provides MediaRecorder capture and a PCM fallback for empty/undecodable encoded audio.
- `Chat.stopVoice()` silences playback and clears voice queues while leaving reply text generation running. The text stream and speech parsing are separate.

Relevant implementation is in `src/config/infoDayPrompt.ts`, `src/pages/api/claude.ts`, `src/server/schoolContext.ts`, `src/features/chat/schoolAnswer.ts`, `src/features/manualRecording/`, `src/features/chat/chat.ts` and `src/features/chat/replyTextStream.ts`.

## Avatar and motion

The runtime model is `public/vrm/YYC_InfoDay.vrm`. Editable `.blend` files, GLB exports, source geometry, textures and historical comparisons live in `models/yyc-info-day/`; authoring code is in `tools/avatar/`. Preserve the source license metadata and VRoid Project attribution.

Original YYC clips in `public/animations/yyc/` are bundled. The separately licensed numbered motion pack is read in place by `src/pages/api/localMotions.ts` from `~/Downloads/VRMA_MotionPack`, or `AMICA_MOTION_PACK_DIR`. It is not copied into this repository because its license prohibits extractable redistribution. The app can list whichever of its seven expected files are installed.

## Settings and credentials

`src/features/externalAPI/dataHandlerStorage/config.json` contains a sanitized seed of the current YYC preferences, including exact provider/model identifiers. On first launch, `src/features/externalAPI/dataHelper.ts` seeds `.amica-data/` from these source defaults. Existing `.amica-data/` settings take precedence on subsequent runs.

API keys and runtime conversations are excluded. The Claude key is entered in Settings and stored in the browser tab's session storage. Other provider keys must also be entered on the new machine. `.env.local` is created from `.env.example` only when absent. Keep credentials and local runtime files out of Git even though this repository is private.

Current saved voice preferences are OpenRouter `minimax/speech-2.8-hd`, voice `Chinese (Mandarin)_Male_Announcer`, and STT candidate `qwen/qwen3-asr-1.7b`. These identifiers are preserved configuration, not a guarantee of provider availability. Authenticated Cantonese transcription from Hong Kong remains to be established. The server's Claude transport supports proxy environment variables for networks that require them.

## Packaging and evidence boundaries

The snapshot preserves application source, tests, shipped assets, editable model sources, original school PDFs, extraction context, selected design references and reusable QA programs. It excludes regenerable dependency/build caches, credentials, `.amica-data/` conversations and raw `working/`/`output/` scratch state. Some copied historical documentation and QA programs refer to paths from the original development machine; treat them as development records, not portable install commands.

Use the root README's scripts for installation on macOS or Windows. They fetch Git LFS objects and verify bundled assets before npm installation. The web runtime does not need Blender/Python; those optional authoring tools have separate setup requirements.

Saved validation JSON, previews and earlier documentation show what was checked at their recorded stage. They do not establish fresh-clone installation, Windows behavior, successful live provider calls, physical microphone/speaker acceptance, or final visual acceptance on a different device. Record those outcomes separately when testing this snapshot.
