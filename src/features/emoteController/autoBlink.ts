import { VRMExpressionManager } from '@pixiv/three-vrm';

export class AutoBlink {
  private enabled = true;
  private untilBlink = 3.5 + Math.random() * 3.5;
  private blinkTime = -1;
  constructor(private manager: VRMExpressionManager) {}
  setEnable(enabled: boolean) { this.enabled = enabled; return this.blinkTime >= 0 ? Math.max(0, .19 - this.blinkTime) : 0; }
  update(delta: number, heldClosure = 0, suppress = false) {
    // Held smiling eyes and authored eyelid poses own the same channel. Reset
    // the natural blink timer instead of adding a second eyelid deformation.
    if (heldClosure > 0 || suppress) {
      this.blinkTime = -1;
      this.untilBlink = 3.2 + Math.random() * 4.2;
      this.manager.setValue('blink', suppress ? 0 : Math.min(1, heldClosure));
      return;
    }
    if (this.blinkTime < 0) {
      this.untilBlink -= delta;
      if (this.enabled && this.untilBlink <= 0) this.blinkTime = 0;
    }
    let value = 0;
    if (this.blinkTime >= 0) {
      this.blinkTime += delta;
      value = this.blinkTime < .075 ? this.blinkTime / .075 : 1 - (this.blinkTime - .075) / .115;
      if (this.blinkTime >= .19) { this.blinkTime = -1; this.untilBlink = 3.2 + Math.random() * 4.2; value = 0; }
    }
    this.manager.setValue('blink', Math.max(0, Math.min(1, value)));
  }
}
