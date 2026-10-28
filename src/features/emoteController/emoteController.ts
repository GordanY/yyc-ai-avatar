import * as THREE from "three";
import { VRM, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { ExpressionController } from "./expressionController";

/**
 * 感情表現としてExpressionとMotionを操作する為のクラス
 * デモにはExpressionのみが含まれています
 */
export class EmoteController {
  private _expressionController: ExpressionController;

  constructor(vrm: VRM, camera: THREE.Object3D) {
    this._expressionController = new ExpressionController(vrm, camera);
  }

  public playEmotion(preset: VRMExpressionPresetName | string) {
    this._expressionController.playEmotion(preset);
  }

  public lipSync(preset: VRMExpressionPresetName | string, value: number) {
    this._expressionController.lipSync(preset, value);
  }

  public setVisemes(values: Partial<Record<import('../avatarMotion/speechPlan').Vowel, number>>) {
    this._expressionController.setVisemes(values);
  }

  public setSpeaking(speaking: boolean) { this._expressionController.setSpeaking(speaking); }
  public setGesture(frame?: import('../avatarMotion/gestureScheduler').GestureFrame) { this._expressionController.setGesture(frame); }

  public dispose() { this._expressionController.dispose(); }

  public update(delta: number) {
    this._expressionController.update(delta);
  }
}
