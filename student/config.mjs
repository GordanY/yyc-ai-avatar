// Teacher configuration. No action/model selector is exposed in the student interface.
export const CONFIG = Object.freeze({
  model: 'openai/gpt-4o-mini',
  contextWindow: 128000,
  replyTokens: 800,
  maxMessages: 50,
  maxWords: 200,
  maxKnowledgeChars: 24000,
  idleLoop: ['idle', 'nod'],
  loopSeconds: 12,
  actions: {
    idle: 'assets/animations/YYC_idle.vrma',
    nod: 'assets/animations/YYC_nod.vrma',
    wave: 'assets/animations/YYC_wave.vrma'
  },
  schoolModel: 'assets/YYC_InfoDay.vrm',
  scholarPreview: 'https://sketchfab.com/models/a75bd588c991496f96f05ef92a23d910/embed?autostart=1&ui_infos=0&ui_watermark_link=0',
});
