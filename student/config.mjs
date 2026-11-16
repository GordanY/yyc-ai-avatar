// Teacher configuration. No action/model selector is exposed in the student interface.
export const CONFIG = Object.freeze({
  model: 'tencent/hy4-flash', // Omit reasoning/effort parameters to use provider defaults.
  contextWindow: 1048576,
  replyTokens: 800,
  maxMessages: 50,
  maxWords: 200,
  maxKnowledgeChars: 24000,
  idleLoop: ['nod', 'wave', 'greeting'], // 2, 3, 5
  speakingLoop: ['nod', 'explain', 'emphasis'], // 2, 13, 14
  replyCharactersPerSecond: 60,
  loopSeconds: 12,
  actions: {
    idle: 'assets/animations/YYC_idle.vrma',
    nod: 'assets/animations/YYC_nod.vrma',
    wave: 'assets/animations/YYC_wave.vrma'
  },
  schoolModel: 'assets/YYC_InfoDay.vrm',
  scholarPreview: 'https://sketchfab.com/models/a75bd588c991496f96f05ef92a23d910/embed?autostart=1&ui_infos=0&ui_watermark_link=0',
});
