# 翁祐中學資訊日角色 — Amica VRM

這是運動服角色的第 4 版（VRM 中繼資料版本 0.4.3）：紅白運動上衣、深綠白邊長褲、白鞋、黑髮及黑色虹膜。已重做頭身比例、短髮修形及貼圖、友善面部表情、連續上衣與肩袖蒙皮、較自然的手指姿勢，並加入動漫風布料皺褶、立體袖口與衣腳、約 1 mm 厚的連續摺領、鞋底及立體鞋帶。整個匯出模型經 Amica 載入及幾何清理後有 737,692 個三角形，約為早期 132,574 三角形版本的 5.56 倍。

臉與髮型由 VRoid Project 的可修改男角色底模調整，仍屬原設計的 3D 改編，並非逐點重製三視圖中的原創臉型與髮束。

本次以已確認的三視圖作對照，修窄上衣白色飾邊、修整 V 領開口，並修正上臂牽動軀幹的蒙皮；80 度手臂姿勢的軀幹取樣最大水平偏移為 0.221 mm，褲腳對側骨骼權重檢查為零。`preview-design-comparison.png` 並列 2D 參考與目前 3D 模型；仍應以實際預覽判斷造型吻合程度。

本次修整：身體膚色取自實際臉頰樣本，分別以正確的線性 glTF 色值及 sRGB MToon 色值儲存；降低皮膚描邊、衣腳及腰部的硬邊，重接頸口摺領。腿部改為較直的輕微外展站姿，大腿／膝間靠攏，中段間距約 3 cm；鞋子內側伸展問題已修復。

本次上衣修整：肩袖由較鼓脹的袖筒改為較貼身的輪廓，目前上臂主權重區的袖身前後深度取樣約 9.5 cm；按已確認的 2D 設計重建連續摺領及 V 形開口，移除圓領與獨立方形領片。衣腳向下延長約 3 cm。`preview-collar-comparison.png` 及 `preview-sleeve-comparison.png` 提供對照。

上身表面修整（0.4.3）：先以同光源的素模、貼圖、法線及線框作前／側／四分三視圖比較，修正領口前方壓縮造成的胸口平台，改用連續曲率衣身及袖筒截面，移除袖口內部封板，並重配至 75 度站立手臂的服裝蒙皮參考姿勢。只移除上衣／袖子不合理的上胸水平明暗帶；褲子貼圖保持一致。`upper-body-validation.json` 記錄幾何、法線、動作及保留檢查，`preview-upper-body-comparison.png` 與影片供實際觀察。連續待機、說話時間軸、手勢、手動錄音及現有時序精度限制均保留。

## 使用

模型位於 `public/vrm/YYC_InfoDay.vrm`。Amica → 設定 → 界面 → 角色，選擇 YYC_InfoDay。

新版 Amica checkout 的標準站立預設使用連續待機與說話手勢；這些由程式碼提供，不內嵌於 VRM。若要獨立使用附帶 VRMA，可在「角色動畫」關閉 Procedural Animation，再選擇：

| 檔案 | 功能 |
| --- | --- |
| YYC_idle.vrma | 站立待機與輕微呼吸擺動，4 秒循環 |
| YYC_nod.vrma | 點頭，2.4 秒 |
| YYC_wave.vrma | 手臂靠近身體的輕柔揮手，3.2 秒 |

三個檔案位於 `public/animations/yyc/`。VRM 與 VRMA 是分開的資產；動畫不內嵌於 VRM。點頭和揮手可從 Amica 動畫選單播放，尚未設定為由聊天內容自動觸發。

## 功能與驗證

- VRM 0.x，全身人形骨架，54 個人形骨架映射，保留手指。
- 五組母音口形：aa、ih、ou、ee、oh。
- 雙眼及左右獨立眨眼、笑容和基本表情。
- Amica 現有說話功能以音量驅動 aa 張嘴幅度；不是逐音素的精確口形辨識。
- 使用 Amica 相同的 three-vrm 與 VRMA 載入器，驗證模型、表情權重變化及三個動畫的重新套用與播放；結果記錄於 validation.json。
- Blender 的 preview-face-mouth.png 與 preview-face-blink.png 是實際網格變形渲染。
- preview-front.png、preview-side.png、preview-back.png 供檢查實際幾何；preview-amica.png 與 preview-amica-wave.png 是本機 Amica 實機截圖。
- 已針對附帶的站立、點頭及近身揮手修整服裝；大幅舉臂、深蹲及任意第三方全身動作的變形未驗證。
- 已於本機 Mac 的 Amica 檢查顯示。Windows／RTX 4090 尚未實機測試；不需要手部追蹤或 VR 設備。
- 不包含語音辨識、TTS 或 Claude 帳戶設定；這些由 Amica 分別提供。

## 可編輯檔與人工微調

`YYC_InfoDay.blend` 包含骨架、蒙皮、形態鍵與服裝材質；開啟即可編輯。骨架覆蓋顯示在預覽中關閉；需要編輯時，可開啟覆蓋顯示並在大綱視圖選擇 Armature。GLB 可供其他建模工具匯入。角色已可程式化產生；若要精準對齊三視圖的髮束、臉型、領口摺疊、手指姿勢或更精細衣褶，需在 Blender／VRoid／Unity 的 VRM 工具中人工修整，之後再驗證蒙皮與表情。

Blender 的一般 glTF 匯出不會保留所有 VRM 專用設定；不要只把 GLB 副檔名改成 VRM。使用 VRM 匯出工具，或沿用專案的重建流程。

## 重建流程（Amica 專案根目錄）

1. `python3 tools/avatar/build_school_avatar.py`：建立底模、比例與材質。
2. 在獨立背景 Blender 執行 `tools/avatar/preview_school_avatar.py`，例如 Mac：`/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --threads 4 --python tools/avatar/preview_school_avatar.py`；它重建來源檔及預覽，不操作開啟中的未儲存文件。
3. `python3 tools/avatar/finalize_uniform.py`：合併 Blender 平滑後的蒙皮服裝並轉換貼圖座標。
4. `python3 tools/avatar/build_motions.py`：產生三個原創基本動作。
5. `node_modules/.bin/esbuild src/lib/VRMAnimation/VRMAnimationLoaderPlugin.ts --bundle --platform=node --format=esm --packages=external --outfile=working/avatar-animation-loader.mjs`
6. `node tools/avatar/validate_avatar.mjs` 及 `node scripts/generate_paths.js`。

## 上身修整驗證

`preview-upper-body-comparison.png` 比較同光源、同相機的實際素模與貼圖渲染；`preview-upper-body-normals.png` 提供法線／線框比較。胸口幾何切線取樣的最大相鄰角度變化由約 2.8–4.8 度降至 0.7–1.9 度。模型在 55、60、75、75.5 度手臂姿勢的內部頂點法線／幾何方向比較未找到反向面積；這不是對任意第三方動作的保證。

`preview-upper-body-motion.mp4` 是實際 Amica 的小幅語意手勢序列，使用本機語音 WAV 測試音訊及模擬 TTS 端點；腳部取樣位移為零，無頁面錯誤。執行期與手動錄音原始碼的雜湊保持一致，50 個執行期測試、TypeScript 及 3 個衣料截面測試通過。語音時序限制保留：供應商提供時間資料時才使用該資料，純音訊後端仍為估計對齊；精確粵語嘴形仍需要音素／viseme 時間資料。

開啟中的 Blender 文件有尚未儲存的修改，因此未重新載入它；本機另存的 `YYC_InfoDay_v0.4.3.blend` 保留本次已驗證的可編輯來源；資產包內的來源檔名仍為 `YYC_InfoDay.blend`。

## 素材來源

骨架、臉、頭髮、皮膚、鞋子幾何及原表情來源：專案內 `public/vrm/AvatarSample_D.vrm`，作者 VRoid Project。來源檔案的中繼資料明示允許修改與再分發；原授權資訊保留於模型及 source-license.json。服裝幾何、衣料貼圖、比例調整與 YYC 動作由此專案製作。

原條件連結：
https://hub.vroid.com/license?allowed_to_use_user=everyone&characterization_allowed_user=everyone&corporate_commercial_use=allow&credit=unnecessary&modification=allow&personal_commercial_use=profit&redistribution=allow&sexual_expression=allow&version=1&violent_expression=allow

不要將底模部分宣稱為全新獨家創作。原模型條件繼續適用。
