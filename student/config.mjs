// Teacher configuration. No action/model selector is exposed in the student interface.
export const CONFIG = Object.freeze({
  model: 'tencent/hy4-flash', // Omit reasoning/effort parameters to use provider defaults.
  contextWindow: 1048576,
  replyTokens: 800,
  maxMessages: 50,
  maxWords: 200,
  maxKnowledgeChars: 24000,
  // Classroom convenience only: this static-site password is visible in the bundle.
  adminResetPassword: 'YYC123456',
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
  scholarStill: 'assets/scholar/still.webp',
  scholarActions: {
    idle: {file:'assets/scholar/idle.webp',seconds:4},
    nod: {file:'assets/scholar/nod.webp',seconds:2.4},
    wave: {file:'assets/scholar/wave.webp',seconds:3.8},
    greeting: {file:'assets/scholar/wave.webp',seconds:3.8},
    explain: {file:'assets/scholar/explain.webp',seconds:3.6},
    emphasis: {file:'assets/scholar/emphasis.webp',seconds:2.8},
  },
});
