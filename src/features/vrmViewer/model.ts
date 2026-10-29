import * as THREE from "three";
import {
  MToonMaterial,
  MToonMaterialLoaderPlugin,
  VRM,
  VRMLoaderPlugin,
  VRMUtils,
} from "@pixiv/three-vrm";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMAnimation } from "@/lib/VRMAnimation/VRMAnimation";
import { VRMLookAtSmootherLoaderPlugin } from "@/lib/VRMLookAtSmootherLoaderPlugin/VRMLookAtSmootherLoaderPlugin";
import { LipSync } from "@/features/lipSync/lipSync";
import { EmoteController } from "@/features/emoteController/emoteController";
import { ProceduralAnimation } from "@/features/proceduralAnimation/proceduralAnimation";
import { Screenplay } from "@/features/chat/messages";
import { downscaleModelTextures, logTextureInfo } from '@/utils/textureDownscaler';
import { OptimizedGLTFLoader } from '@/utils/gltfOptimizer';
import { GLTFAnalyzer } from '@/utils/gltfAnalyzer';
import { TransparencyOptimizer, checkAndOptimizeTransparency } from '@/utils/transparencyOptimizer';
import { config } from "@/utils/config";
import { buildSpeechPlan, sampleVisemes, SpeechPlan } from "@/features/avatarMotion/speechPlan";
import { createGestureCatalog, parseGestureSelection } from '@/features/avatarMotion/gestureCatalog';
import { GestureScheduler } from '@/features/avatarMotion/gestureScheduler';
import { GestureClipLayer } from '@/features/avatarMotion/gestureClipLayer';
import { ElbowCloth } from '@/features/avatarMotion/elbowCloth';

/**
 * 3Dキャラクターを管理するクラス
 */
export class Model {
  public vrm?: VRM | null;
  public mixer?: THREE.AnimationMixer;
  public emoteController?: EmoteController;
  public proceduralAnimation?: ProceduralAnimation;
  public gestures?: GestureScheduler;
  private gestureClips?: GestureClipLayer;
  private elbowCloth?: ElbowCloth;

  private _lookAtTargetParent: THREE.Object3D;
  public _lipSync?: LipSync;

  public _currentAction?: THREE.AnimationAction;
  private _idleAction?: THREE.AnimationAction;
  private _actionFinished?: (event: { action: THREE.AnimationAction }) => void;
  private _customBase = false;
  private _speechGeneration = 0;
  private _speechPlan?: SpeechPlan;

  public get speechState() {
    return { playing: !!this._lipSync?.isPlaying, time: this._lipSync?.currentTime ?? 0,
      timing: this._speechPlan?.timing, intent: this.proceduralAnimation?.activeIntent ?? null };
  }

  constructor(lookAtTargetParent: THREE.Object3D) {
    this._lookAtTargetParent = lookAtTargetParent;
    this._lipSync = new LipSync(new AudioContext());
  }

  public async loadVRM(
    url: string,
    setLoadingProgress: (progress: string) => void,
  ): Promise<void> {
    if (!this._lipSync || this._lipSync.audio.state === 'closed') this._lipSync = new LipSync(new AudioContext());
    const loader = new GLTFLoader();
    /*
    const loader = new OptimizedGLTFLoader({
      // Texture optimizations
      skipTextures: true,          // Skip loading textures completely
      maxTextureSize: 512,         // Maximum texture size
      generateMipmaps: false,      // Disable mipmaps
      
      // Geometry optimizations
      skipDraco: true,            // Skip Draco decoder setup
      preserveIndices: false,     // Remove index buffers
      
      // Animation/Material optimizations
      skipAnimations: true,       // Skip loading animations
      simplifyMaterials: true,    // Use simplified materials
      disableNormalMaps: true,    // Disable normal maps
      
      // Performance optimizations
      disposeSourceData: true,    // Clear source data after load
      
      // Optional callbacks for fine-tuning
      onMesh: (mesh) => {
        // Custom mesh optimizations
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      },
      onMaterial: (material) => {
        // Custom material optimizations
        if (material instanceof THREE.MeshStandardMaterial) {
          material.envMapIntensity = 0;
        }
      },
      onTexture: (texture) => {
        // Custom texture optimizations
        texture.encoding = THREE.LinearEncoding;
      },
    });
    */

    // used for debug rendering
    const helperRoot = new THREE.Group();
    helperRoot.renderOrder = 10000;

    // the type of material to use
    // should usually be MToonMaterial
    let materialType: any;
    switch (config("mtoon_material_type")) {
      case "mtoon":
        materialType = MToonMaterial;
        break;
      case "mtoon_node":
        // @ts-ignore
        const { MToonNodeMaterial } = await import("@pixiv/three-vrm/nodes");
        materialType = MToonNodeMaterial;
        break;
      case "meshtoon":
        materialType = THREE.MeshToonMaterial;
        break;
      case "basic":
        materialType = THREE.MeshBasicMaterial;
        break;
      case "depth":
        materialType = THREE.MeshDepthMaterial;
        break;
      case "normal":
        materialType = THREE.MeshNormalMaterial;
        break;
      default:
        console.error("mtoon_material_type not found");
        break;
    }

    if (config("use_webgpu") === "true") {
      // create a WebGPU compatible MToonMaterialLoaderPlugin
      // @ts-ignore
      // TODO currently MToonNodeMaterial is broken in amica
      // materialType = MTonNodeMaterial;
    }

    loader.register((parser) => {
      const options: any = {
        lookAtPlugin: new VRMLookAtSmootherLoaderPlugin(parser),
        mtoonMaterialPlugin: new MToonMaterialLoaderPlugin(parser, {
          materialType,
        }),
      };

      if (config("debug_gfx") === "true") {
        options.helperRoot = helperRoot;
      }

      return new VRMLoaderPlugin(parser, options);
    });

    return new Promise((resolve, reject) => {
      loader.load(
        url,
        async (gltf) => {
          // Temp Disable : WebXR
          // setLoadingProgress("Processing VRM");

          /*
          {
            const analyzer = new GLTFAnalyzer();
            const stats = analyzer.analyzeModel(gltf);
            console.log('Model Statistics:', stats);
            const suggestions = analyzer.suggestOptimizations(stats);
            console.log('Optimization Suggestions:', suggestions);
          }
          {
            // Or for more control:
            const optimizer = new TransparencyOptimizer();
            const stats = optimizer.analyzeTransparency(gltf);
            console.log('Transparency analysis:', stats);
            // Check for issues
            const issues = optimizer.logTransparencyIssues();
            console.log('Transparency issues:', issues);

            // Apply optimizations
            optimizer.optimizeTransparency(gltf, {
              disableTransparency: true,     // Completely disable all transparency
              minAlphaThreshold: 0.9,        // Convert nearly opaque materials to fully opaque
              convertToAlphaTest: false,      // Convert transparency to alphaTest where possible
              alphaTestThreshold: 0.5        // Threshold for alphaTest conversion
            });
          }
          */

          const vrm = (this.vrm = gltf.userData.vrm);
          vrm.scene.name = "VRMRoot";

          VRMUtils.removeUnnecessaryVertices(gltf.scene);
          VRMUtils.removeUnnecessaryJoints(gltf.scene);

          // await downscaleModelTextures(gltf, 128);

          const mtoonDebugMode = config("mtoon_debug_mode");
          vrm.scene.traverse((obj: any) => {
            obj.frustumCulled = false;

            if (mtoonDebugMode !== "none") {
              if (obj.material) {
                if (Array.isArray(obj.material)) {
                  obj.material.forEach((mat: any) => {
                    if (mat.isMToonMaterial) {
                      mat.debugMode = mtoonDebugMode;
                    }
                  });
                } else {
                  if (obj.material.isMToonMaterial) {
                    obj.material.debugMode = mtoonDebugMode;
                  }
                }
              }
            }
          });

          // this.setTransparency(0.5);

          if (config("debug_gfx") === "true") {
            vrm.scene.add(helperRoot);
          }

          // TODO this causes helperRoot to be rendered to side
          // VRMUtils.rotateVRM0(vrm);
          // hacky fix
          if (vrm.meta?.metaVersion === "0") {
            vrm.scene.rotation.y = Math.PI;
            helperRoot.rotation.y = Math.PI;
          }

          this.mixer = new THREE.AnimationMixer(vrm.scene);
          this._idleAction = this.mixer.clipAction(new THREE.AnimationClip('NaturalIdle', 1, []));
          this._currentAction = this._idleAction;
          this._idleAction.play();

          this.emoteController = new EmoteController(
            vrm,
            this._lookAtTargetParent,
          );

          this.proceduralAnimation = new ProceduralAnimation(vrm);
          this.proceduralAnimation.update(0);
          vrm.update(0);

          let localMotions: number[] = [];
          try { const response = await fetch('/api/localMotions'); if (response.ok) localMotions = (await response.json()).motions ?? []; } catch { /* Presenter actions remain available if bundled clips cannot be listed. */ }
          this.gestures = new GestureScheduler(createGestureCatalog(Object.keys(vrm.expressionManager?.expressionMap ?? {}), localMotions));
          this.gestures.configure(config('random_gestures_enabled') === 'true', parseGestureSelection(config('random_gestures_selected')));
          this.gestureClips = new GestureClipLayer(vrm);
          this.elbowCloth = new ElbowCloth(vrm);

          resolve();
        },
        (xhr) => {
          // Temp Disable : WebXR
          // setLoadingProgress(
          //   `${Math.floor((xhr.loaded / xhr.total) * 10000) / 100}% loaded`,
          // );
        },
        (error) => {
          reject(error);
        },
      );
    });
  }

  public setTransparency(opacity: number) {
    if (! this.vrm) {
      return;
    }

    this.vrm.scene.traverse((obj: any) => {
      obj.frustumCulled = false;

      if (obj.isMesh) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((mat: any) => {
            mat.transparent = true;
            mat.opacity = opacity;
            mat.alphaTest = 0;
          });
        } else if (obj.material) {
          obj.material.transparent = true;
          obj.material.opacity = opacity;
          obj.material.alphaTest = 0;
        }
      }
    });
  }

  public unLoadVrm() {
    this.stopSpeaking();
    this.gestureClips?.prepareFrame();
    this.gestures = undefined;
    this.gestureClips = undefined;
    this.elbowCloth = undefined;
    this._lipSync?.dispose();
    this.emoteController?.dispose();
    this.mixer?.stopAllAction();
    if (this._actionFinished) this.mixer?.removeEventListener('finished', this._actionFinished);
    if (this.vrm) {
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
    }
  }

  /**
   * VRMアニメーションを読み込む
   *
   * https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm_animation-1.0/README.ja.md
   */
  public async loadAnimation(
    animation: VRMAnimation | THREE.AnimationClip,
    asDefaultIdle = false,
  ): Promise<void> {
    const { vrm, mixer } = this;
    this.gestures?.interrupt(true);
    this.gestureClips?.prepareFrame();
    if (vrm == null || mixer == null) {
      throw new Error("You have to load VRM first");
    }

    const clip =
      animation instanceof THREE.AnimationClip
        ? animation
        : animation.createAnimationClip(vrm);
    this.proceduralAnimation?.prepareFrame();
    mixer.stopAllAction();
    if (this._actionFinished) mixer.removeEventListener('finished', this._actionFinished);
    this._customBase = !asDefaultIdle;
    this.proceduralAnimation?.setStandingBase(asDefaultIdle);
    this.proceduralAnimation?.setManualAnimation(!asDefaultIdle);
    // The default idle is continuous and non-looping. Explicitly selected
    // custom clips remain available as the animation base.
    this._currentAction = mixer.clipAction(asDefaultIdle ? new THREE.AnimationClip('NaturalIdle', 1, []) : clip);
    this._idleAction = this._currentAction;
    this._currentAction.play();
  }

  private async fadeToAction(
    destAction: THREE.AnimationAction,
    duration: number,
  ) {
    let previousAction = this._currentAction;
    this._currentAction = destAction;

    if (previousAction !== this._currentAction) {
      previousAction?.fadeOut(duration);
    }

    this._currentAction
      .reset()
      .setEffectiveTimeScale(1)
      .setEffectiveWeight(1)
      .fadeIn(0.5)
      .play();
  }

  private async modifyAnimationPosition(
    clip: THREE.AnimationClip,
    weight: { [key: string]: number },
  ) {
    const { vrm } = this;
    if (vrm == null) {
      throw new Error("You have to load VRM first");
    }

    // Find the hips bone
    const hipsBone = vrm.humanoid.getNormalizedBoneNode("hips");

    if (!hipsBone) {
      throw new Error("Bone not found in VRM model");
    }

    // Use the current hips bone position as the start position
    const currentHipsPosition = hipsBone!.getWorldPosition(new THREE.Vector3());

    // Extract the start position from the animation clip
    let clipStartPositionHips: THREE.Vector3 | null = null;

    for (const track of clip.tracks) {
      if (track.name.endsWith(".position") && track.name.includes("Hips")) {
        const values = (track as THREE.VectorKeyframeTrack).values;
        clipStartPositionHips = new THREE.Vector3(
          values[0],
          values[1],
          values[2],
        );
        break;
      }
    }

    if (clipStartPositionHips) {
      // Calculate the offset
      const offsetHipsPosition = currentHipsPosition
        .clone()
        .sub(clipStartPositionHips);

      // Apply the offset to all keyframes
      for (const track of clip.tracks) {
        if (track.name.endsWith(".position") && track.name.includes("Hips")) {
          const values = (track as THREE.VectorKeyframeTrack).values;
          for (let i = 0; i < values.length; i += 3) {
            values[i] -= offsetHipsPosition.x / weight.x;
            values[i + 1] += offsetHipsPosition.y * weight.y;
            values[i + 2] += offsetHipsPosition.z * weight.z;
          }
        }
      }
    } else {
      console.warn("Could not determine start position from animation clip.");
    }
  }

  public async playAnimation(
    animation: VRMAnimation | THREE.AnimationClip,
    name: string,
  ): Promise<number> {
    const { vrm, mixer } = this;
    this.gestures?.interrupt(true);
    this.gestureClips?.prepareFrame();
    this.proceduralAnimation?.prepareFrame();
    if (vrm == null || mixer == null) {
      throw new Error("You have to load VRM first");
    }

    const clip =
      animation instanceof THREE.AnimationClip
        ? animation
        : animation.createAnimationClip(vrm);

    // modify the initial position of the VRMA animation to be sync with idle animation
    let weight: { [key: string]: number } = { x: 1, y: 1, z: 1 };

    if (!(name === "idle_loop.vrma" || name === "greeting.vrma")) {
      if (name === "dance.vrma") {
        weight = { x: 2, y: 1.25, z: 1.5 };
      } else {
        weight = { x: 1, y: 1, z: 0 };
      }
      this.modifyAnimationPosition(clip, weight);
    }

    const idleAction = this._idleAction ?? this._currentAction;
    if (!idleAction) return 0;
    if (this._actionFinished) mixer.removeEventListener('finished', this._actionFinished);
    this.proceduralAnimation?.setManualAnimation(true);
    const VRMAaction = mixer.clipAction(clip);
    VRMAaction.clampWhenFinished = true;
    VRMAaction.loop = THREE.LoopOnce;
    this.fadeToAction(VRMAaction, 1);

    const restoreState = (event: { action: THREE.AnimationAction }) => {
      if (event.action !== VRMAaction) return;
      mixer.removeEventListener('finished', restoreState);
      this.proceduralAnimation?.setManualAnimation(this._customBase);
      void this.fadeToAction(idleAction, .5);
    };
    this._actionFinished = restoreState;

    mixer.addEventListener("finished", restoreState);
    return clip.duration + 1 + 0.5; // 1 = fade out time, 0.5 = fade in time
  }

  public async playEmotion(expression: string) {
    this.emoteController?.playEmotion(expression);
  }

  /**
   * 音声を再生し、リップシンクを行う
   */
  public stopSpeaking(interruptGestures = true) {
    if (interruptGestures) this.gestures?.interrupt();
    this._speechGeneration++;
    this._lipSync?.stop();
    this._speechPlan = undefined;
    this.proceduralAnimation?.stopSpeech();
    this.emoteController?.setVisemes({});
    this.emoteController?.setSpeaking(false);
    this.emoteController?.playEmotion('neutral');
  }

  public async speak(buffer: ArrayBuffer, screenplay: Screenplay, onAudible?: () => void) {
    this.stopSpeaking(false);
    const generation = this._speechGeneration;
    if (!this._lipSync) return;
    try {
      await this._lipSync.playFromArrayBuffer(buffer, undefined, ({ duration, envelope }) => {
        if (generation !== this._speechGeneration) return;
        const plan = buildSpeechPlan(screenplay.talk.message, duration, screenplay.alignment, envelope);
        this._speechPlan = plan;
        this.emoteController?.setSpeaking(true);
        this.proceduralAnimation?.startSpeech(plan);
        this.emoteController?.playEmotion(screenplay.expression !== 'neutral' ? screenplay.expression : plan.expression);
      }, () => {
        if (generation === this._speechGeneration) onAudible?.();
      });
    } finally {
      if (generation === this._speechGeneration) {
        this._speechPlan = undefined;
        this.proceduralAnimation?.stopSpeech();
        this.emoteController?.setVisemes({});
        this.emoteController?.setSpeaking(false);
        this.emoteController?.playEmotion('neutral');
      }
    }
  }

  public update(delta: number): void {
    const dt = Math.min(.1, Math.max(0, delta));
    // Base clip -> upper-body layers -> gaze/face/lips -> normalized-to-raw rig.
    // None of the idle or speech layers touches root translation or the legs.
    this.gestureClips?.prepareFrame();
    this.proceduralAnimation?.prepareFrame();
    this.mixer?.update(dt);
    const playback = this._lipSync;
    const volume = playback?.update().volume ?? 0;
    const busy = !!playback?.isPlaying || this._customBase || this._currentAction !== this._idleAction;
    this.gestures?.update(dt, busy, this.gestureClips?.isReady);
    const gesture = this.gestures?.frame;
    if (gesture?.action.clipUrl && this.gestureClips && !this.gestureClips.isReady(gesture.action)) {
      const scheduler = this.gestures;
      void this.gestureClips.load(gesture.action).catch(() => scheduler?.fail(gesture.action.id, 'Could not load this gesture. Re-run setup and restart the server.'));
    }
    this.proceduralAnimation?.setGesture(gesture);
    this.emoteController?.setGesture(gesture);
    if (this._speechPlan && playback?.isPlaying) {
      this.emoteController?.setVisemes(sampleVisemes(this._speechPlan, playback.currentTime, volume));
    } else {
      this.emoteController?.setVisemes({});
    }
    this.proceduralAnimation?.update(dt, playback?.isPlaying ? playback.currentTime : undefined);
    this.gestureClips?.apply(gesture);
    this.emoteController?.update(dt);
    this.vrm?.update(dt);
    this.elbowCloth?.update();
  }
}
