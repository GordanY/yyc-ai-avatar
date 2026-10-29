# YYC AI Avatar

YYC Helper web application based on [Amica](https://github.com/semperai/amica), with a school avatar, Traditional Chinese reception prompt, school knowledge retrieval, voice input/output and gesture controls.

## Install and run

Install Git. If GitHub requests authentication, sign in with an account that has access to the repository. Clone with Git rather than downloading a ZIP, so the large assets can be fetched with Git LFS:

```sh
git clone https://github.com/GordanY/yyc-ai-avatar.git
cd yyc-ai-avatar
```

**macOS — Terminal:**

```sh
bash ./setup-macos.command
```

You can also double-click `setup-macos.command` in Finder.

**Windows — PowerShell or Command Prompt:**

```powershell
.\setup-windows.cmd
```

Or invoke PowerShell directly, with an execution-policy override for that process only:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup-windows.ps1
```

The scripts reuse Node.js 22 or newer, or download a checksum-verified Node 22 runtime into `.tools/`. They install a project-local Git LFS 3.8.1 if needed, fetch the repository's large files, verify the bundled assets, create `.env.local` from `.env.example` if absent, install the locked npm dependencies with `npm ci` (the included `.npmrc` preserves the established legacy peer-dependency resolution), and automatically start the development web server.

Open **[http://localhost:3000](http://localhost:3000)**. Keep the terminal open; press **Ctrl+C** there to stop the server. Setup needs internet access and, if the repository is access-restricted, GitHub authentication; the initial model/PDF download can take time. The server binds to the local computer (`127.0.0.1`).

To install without starting the server:

```sh
# macOS
bash ./setup-macos.command --install-only
```

```powershell
# Windows
.\setup-windows.cmd -InstallOnly
```

Rerunning setup reinstalls npm dependencies and starts the server again. With Node/npm on your `PATH`, subsequent starts can use `npm run dev`. If setup installed Node locally, prepend its directory first:

```sh
# macOS
export PATH="$PWD/.tools/node/bin:$PATH"
npm run dev
```

```powershell
# Windows PowerShell
$env:Path = "$PWD\.tools\node;$env:Path"
npm.cmd run dev
```

## Configure chat and voice

Open Settings from the top-left toolbar. The snapshot retains the current nonsecret YYC preferences, but **API keys are not included**.

- **Chatbot → Claude:** enter your Anthropic API key and use a model available to your account. The key is kept in this browser tab's session storage; re-enter it after closing the tab. School knowledge integration applies to this Claude path.
- **Text-to-Speech:** the saved OpenAI-compatible settings use OpenRouter, model `minimax/speech-2.8-hd` and voice `Chinese (Mandarin)_Male_Announcer`. Enter a valid provider key or choose another supported backend.
- **Speech-to-Text:** the saved OpenAI-compatible settings use OpenRouter and `qwen/qwen3-asr-1.7b`. This remains a candidate configuration; successful authenticated Cantonese transcription from Hong Kong has not been established. Choose a working backend and enter its key before relying on voice input.

Provider accounts, credits, model access and network connectivity are separate requirements. This repository contains the 3D models and school datasets, but no offline language-model weights. Browser speech backends can download their own model files on first use. Microphone recording requires browser permission.

Record keeps pauses and submits the complete recording only after you click **Stop recording**. **Stop voice** silences playback while the reply text continues.

## Included files and context

| Path | Contents |
| --- | --- |
| `src/`, `public/`, `__tests__/` | Application, runtime assets and regression tests |
| `public/vrm/YYC_InfoDay.vrm` | Runtime school avatar |
| `public/animations/yyc/` | Original YYC idle, nod and wave clips |
| `public/animations/*.vrma` | Bundled gesture clips, including all seven numbered motion-pack equivalents |
| `models/yyc-info-day/` | Editable Blender sources, GLB exports, model archive, textures, previews and validation reports |
| `src/config/infoDayPrompt.ts` | Reception role and answer rules |
| `src/server/data/` | Runtime school facts and source chunks |
| `context/source-pdfs/` | Original `1023-0925.pdf`, `YY-0601.pdf` and `YY2-0604.pdf` |
| `context/school-knowledge/` | Extraction package, source text, summaries, retrieval data and supporting tools |
| `context/design/`, `tools/avatar/`, `tools/qa/` | Selected design references, avatar-authoring tools and local QA programs |

See [project context](docs/project-context.md), [school knowledge integration](docs/school-knowledge.md) and [avatar authoring notes](models/yyc-info-day/README.md). The original upstream README is preserved at [docs/upstream-README.md](docs/upstream-README.md).

Dependency/build caches, credentials, runtime conversations in `.amica-data/`, and raw `working/`/`output/` scratch files are excluded. Selected reusable QA source and design references are retained. Historical validation reports describe their recorded runs; they do not certify this installation or another device.

### Bundled gestures

All seven gesture clips are included in GitHub and available from a fresh macOS or Windows clone. No separate motion-pack download is needed. The gesture API preserves IDs 1–7 and maps them to these files in `public/animations/`:

| Gesture ID | Numbered-pack equivalent | Bundled file |
| --- | --- | --- |
| 1 | `VRMA_01.vrma` | `showFullBody.vrma` |
| 2 | `VRMA_02.vrma` | `greeting.vrma` |
| 3 | `VRMA_03.vrma` | `peaceSign.vrma` |
| 4 | `VRMA_04.vrma` | `shoot.vrma` |
| 5 | `VRMA_05.vrma` | `spin.vrma` |
| 6 | `VRMA_06.vrma` | `modelPose.vrma` |
| 7 | `VRMA_07.vrma` | `squat.vrma` |

Animation credits to pixiv Inc.'s VRoid Project. See the [original motion-pack terms](docs/licenses/VRMA_MotionPack_EN.txt). The original YYC idle, nod and wave clips remain in `public/animations/yyc/`.

For each ID, the API first tries an explicitly configured `AMICA_MOTION_PACK_DIR/vrma/VRMA_0N.vrma`, then the bundled file above, then the legacy `~/Downloads/VRMA_MotionPack/vrma/VRMA_0N.vrma` location. `AMICA_MOTION_PACK_DIR` is an optional override, not an installation requirement. Set it in `.env.local` to the directory containing `vrma/`; on Windows use forward slashes, for example `C:/Users/YourName/Downloads/VRMA_MotionPack`. Restart the server after changing it.

To update an existing Windows checkout, stop its server with **Ctrl+C**, then run:

```powershell
git pull
.\setup-windows.cmd
```

Setup already runs `git lfs pull`. When the server is ready, reload the browser tab. This update preserves the clip data and geometry; fresh-device animation appearance still needs visual checking.

The unrelated `AvatarSample_A.vrm` and `toma_b.vrm` remain excluded because their metadata prohibits redistribution. This exclusion is separate from the bundled gesture clips; all YYC model sources and exports are included. Credentials remain excluded.

### Optional asset authoring

Running the web app does not require Python, Blender, Rust or a GPU development toolkit. Editing/rebuilding the avatar uses the included tools, Python 3.9+ and Blender 5.x as described in the [model README](models/yyc-info-day/README.md); the web setup scripts do not install these optional authoring tools. The extraction package also includes historical macOS extraction tooling; the runtime school datasets are already bundled for either platform.

## Verification

After installation, run:

```sh
node scripts/verify-assets.cjs
npm test -- --runInBand
npm run typecheck
```

Inspect the repository's Actions results for platform checks. A running server or passing mocked tests does not establish successful paid-provider requests, microphone behavior on another device, or physical listening/visual acceptance.

## License

Amica application code retains its [MIT license](LICENSE). Models, images and animations retain their respective authors' terms. Preserve the VRoid Project attribution and [source license metadata](models/yyc-info-day/source-license.json); do not assume the code license covers every asset.
