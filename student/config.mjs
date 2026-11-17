// Teacher configuration. Model selection stays hidden; numbered actions can be previewed.
export const MOVEMENTS = Object.freeze([
  {number:1,id:'idle',label:'自然站立'},
  {number:2,id:'nod',label:'點頭'},
  {number:3,id:'wave',label:'揮手'},
  {number:5,id:'greeting',label:'打招呼（揮手）'},
  {number:13,id:'explain',label:'解說'},
  {number:14,id:'emphasis',label:'強調'},
]);
export const CONFIG = Object.freeze({
  model: 'tencent/hy4-flash', // Omit reasoning/effort parameters to use provider defaults.
  contextWindow: 1048576,
  // Reasoning and visible text share this cap. Leave room for the provider's default thinking.
  replyTokens: 8192,
  responseTimeoutMs: 120000,
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
  scholarModel: 'assets/scholar/character.yyc3d',
});
