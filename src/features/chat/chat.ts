import { getClaudeChatResponseStream } from '@/features/chat/claudeChat';
import { playQueuedSpeech } from './playQueuedSpeech';
import { SpeechAlignment, SpeechAudio } from '@/features/avatarMotion/speechPlan';
import { Queue } from "typescript-collections";
import { Message, Role, Screenplay, Talk, textsToScreenplay } from "./messages";
import { Viewer } from "@/features/vrmViewer/viewer";
import { Alert } from "@/features/alert/alert";

import { getEchoChatResponseStream } from "./echoChat";
import {
  getArbiusChatResponseStream,
} from "./arbiusChat";
import {
  getOpenAiChatResponseStream,
  getOpenAiVisionChatResponse,
} from "./openAiChat";
import {
  getLlamaCppChatResponseStream,
  getLlavaCppChatResponse,
} from "./llamaCppChat";
import { getWindowAiChatResponseStream } from "./windowAiChat";
import {
  getOllamaChatResponseStream,
  getOllamaVisionChatResponse,
} from "./ollamaChat";
import { getKoboldAiChatResponseStream } from "./koboldAiChat";
import { getReasoingEngineChatResponseStream } from "./reasoiningEngineChat";

import { rvc } from "@/features/rvc/rvc";
import { coquiLocal } from "@/features/coquiLocal/coquiLocal";
import { piper } from "@/features/piper/piper";
import { elevenlabs } from "@/features/elevenlabs/elevenlabs";
import { speecht5 } from "@/features/speecht5/speecht5";
import { openaiTTS } from "@/features/openaiTTS/openaiTTS";
import { localXTTSTTS } from "@/features/localXTTS/localXTTS";
import { kokoro } from "../kokoro/kokoro";

import { AmicaLife } from "@/features/amicaLife/amicaLife";

import { config, updateConfig } from "@/utils/config";
import { cleanTalk } from "@/utils/cleanTalk";
import { processResponse } from "@/utils/processResponse";
import { ReplyTextStream } from './replyTextStream';
import { wait } from "@/utils/wait";
import isDev from '@/utils/isDev';

import { isCharacterIdle, characterIdleTime, resetIdleTimer } from "@/utils/isIdle";
import { getOpenRouterChatResponseStream } from './openRouterChat';
import { handleUserInput } from '../externalAPI/externalAPI';
import { loadVRMAnimation } from '@/lib/VRMAnimation/loadVRMAnimation';

type Speak = {
  alignment?: SpeechAlignment;
  audioBuffer: ArrayBuffer | null;
  textAlreadyDisplayed?: boolean;
  screenplay: Screenplay;
  streamIdx: number;
};

type TTSJob = {
  textAlreadyDisplayed?: boolean;
  screenplay: Screenplay;
  streamIdx: number;
};

export class Chat {
  public initialized: boolean;

  public amicaLife?: AmicaLife;
  public viewer?: Viewer;
  public alert?: Alert;

  public setChatLog?: (messageLog: Message[]) => void;
  public setUserMessage?: (message: string) => void;
  public setAssistantMessage?: (message: string) => void;
  public setShownMessage?: (role: Role) => void;
  public setChatProcessing?: (processing: boolean) => void;
  public setChatSpeaking?: (speaking: boolean) => void;
  public setVoiceActive?: (active: boolean) => void;
  private voiceStopped = false;
  private voiceGeneration = 0;
  private responsePending = false;
  private pendingTtsGeneration?: number;
  private playingVoiceGeneration?: number;
  public setThoughtMessage?: (message: string) => void;

  // the message from the user that is currently being processed
  // it can be reset
  public stream: ReadableStream<Uint8Array> | null;
  public streams: ReadableStream<Uint8Array>[];
  public reader: ReadableStreamDefaultReader<Uint8Array> | null;
  public readers: ReadableStreamDefaultReader<Uint8Array>[];

  // process these immediately as they come in and add to audioToPlay
  public ttsJobs: Queue<TTSJob>;

  // this should be read as soon as they exist
  // and then deleted from the queue
  public speakJobs: Queue<Speak>;

  private currentAssistantMessage: string;
  private currentUserMessage: string;
  private thoughtMessage: string;

  private lastAwake: number;

  public messageList: Message[];

  public currentStreamIdx: number;

  private eventSource: EventSource | null = null

  constructor() {
    this.initialized = false;

    this.stream = null;
    this.reader = null;
    this.streams = [];
    this.readers = [];

    this.ttsJobs = new Queue<TTSJob>();
    this.speakJobs = new Queue<Speak>();

    this.currentAssistantMessage = "";
    this.currentUserMessage = "";
    this.thoughtMessage = "";

    this.messageList = [];
    this.currentStreamIdx = 0;

    this.lastAwake = 0;
  }

  public initialize(
    amicaLife: AmicaLife,
    viewer: Viewer,
    alert: Alert,
    setChatLog: (messageLog: Message[]) => void,
    setUserMessage: (message: string) => void,
    setAssistantMessage: (message: string) => void,
    setThoughtMessage: (message: string) => void,
    setShownMessage: (role: Role) => void,
    setChatProcessing: (processing: boolean) => void,
    setChatSpeaking: (speaking: boolean) => void,
    setVoiceActive?: (active: boolean) => void,
  ) {
    this.amicaLife = amicaLife;
    this.viewer = viewer;
    this.alert = alert;
    this.setChatLog = setChatLog;
    this.setUserMessage = setUserMessage;
    this.setAssistantMessage = setAssistantMessage;
    this.setShownMessage = setShownMessage;
    this.setThoughtMessage = setThoughtMessage;
    this.setChatProcessing = setChatProcessing;
    this.setChatSpeaking = setChatSpeaking;
    this.setVoiceActive = setVoiceActive;

    // these will run forever
    this.processTtsJobs();
    this.processSpeakJobs();

    this.updateAwake();
    this.initialized = true;

    this.initSSE();
  }

  public setMessageList(messages: Message[]) {
    this.messageList = messages;
    this.currentAssistantMessage = "";
    this.currentUserMessage = "";
    this.setChatLog!(this.messageList!);
    this.setAssistantMessage!(this.currentAssistantMessage);
    this.setUserMessage!(this.currentAssistantMessage);
    this.currentStreamIdx++;
  }

  public async handleRvc(audio: any) {
    const rvcModelName = config("rvc_model_name");
    const rvcIndexPath = config("rvc_index_path");
    const rvcF0upKey = parseInt(config("rvc_f0_upkey"));
    const rvcF0Method = config("rvc_f0_method");
    const rvcIndexRate = config("rvc_index_rate");
    const rvcFilterRadius = parseInt(config("rvc_filter_radius"));
    const rvcResampleSr = parseInt(config("rvc_resample_sr"));
    const rvcRmsMixRate = parseInt(config("rvc_rms_mix_rate"));
    const rvcProtect = parseInt(config("rvc_protect"));

    const voice = await rvc(
      audio,
      rvcModelName,
      rvcIndexPath,
      rvcF0upKey,
      rvcF0Method,
      rvcIndexRate,
      rvcFilterRadius,
      rvcResampleSr,
      rvcRmsMixRate,
      rvcProtect,
    );

    return voice.audio;
  }

  public idleTime(): number {
    return characterIdleTime(this.lastAwake);
  }

  public isAwake() {
    return !isCharacterIdle(this.lastAwake);
  }

  public updateAwake() {
    this.lastAwake = new Date().getTime();
    resetIdleTimer();
  }

  public async processTtsJobs() {
    while (true) {
      do {
        const ttsJob = this.ttsJobs.dequeue();
        if (!ttsJob) {
          break;
        }

        if (ttsJob.streamIdx !== this.currentStreamIdx || this.voiceStopped) {
          console.log("skipping tts for streamIdx");
          continue;
        }

        const voiceGeneration = this.voiceGeneration;
        this.pendingTtsGeneration = voiceGeneration;
        this.updateVoiceActive();
        const spokenTalk = cleanTalk(ttsJob.screenplay.talk);
        const speech = await this.fetchAudio(spokenTalk);
        if (this.pendingTtsGeneration === voiceGeneration) this.pendingTtsGeneration = undefined;
        if (ttsJob.streamIdx !== this.currentStreamIdx || voiceGeneration !== this.voiceGeneration || this.voiceStopped) {
          this.updateVoiceActive();
          continue;
        }
        this.speakJobs.enqueue({
          audioBuffer: speech?.audio ?? null,
          alignment: speech?.alignment,
          textAlreadyDisplayed: ttsJob.textAlreadyDisplayed,
          screenplay: { ...ttsJob.screenplay, talk: spokenTalk },
          streamIdx: ttsJob.streamIdx,
        });
        this.updateVoiceActive();
      } while (this.ttsJobs.size() > 0);
      await wait(50);
    }
  }

  public async processSpeakJobs() {
    while (true) {
      do {
        const speak = this.speakJobs.dequeue();
        if (!speak) {
          break;
        }
        if (speak.streamIdx !== this.currentStreamIdx || this.voiceStopped) {
          console.log("skipping speak for streamIdx");
          continue;
        }

        const voiceGeneration = this.voiceGeneration;
        this.playingVoiceGeneration = voiceGeneration;
        this.updateVoiceActive();
        await playQueuedSpeech(speak, {
          speaker: this.viewer?.model,
          isCurrent: () => speak.streamIdx === this.currentStreamIdx && voiceGeneration === this.voiceGeneration && !this.voiceStopped,
          showText: text => this.bubbleMessage('assistant', text),
          setSpeaking: speaking => this.setChatSpeaking?.(speaking),
          onError: error => this.alert?.error('Audio playback failed', error instanceof Error ? error.message : 'Unable to play speech'),
          onPresented: () => {
            const tracker = (window as any).chatvrm_latency_tracker;
            if (tracker?.active) {
              console.log('performance_latency', Date.now() - tracker.start);
              tracker.active = false;
            }
          },
        });
        if (this.playingVoiceGeneration === voiceGeneration) this.playingVoiceGeneration = undefined;
        this.updateVoiceActive();
        if (speak.streamIdx === this.currentStreamIdx && this.isAwake()) this.updateAwake();

      } while (this.speakJobs.size() > 0);
      await wait(50);
    }
  }

  public thoughtBubbleMessage(isThinking: boolean, thought: string) {
    // if not thinking, we should clear the thought bubble 
    if (!isThinking) {
      this.thoughtMessage = "";
      this.setThoughtMessage!("");
      return;
    }

    if (this.thoughtMessage !== "") {
      this.thoughtMessage += " ";
    }
    this.thoughtMessage += thought;
    this.setThoughtMessage!(this.thoughtMessage);
  }

  public bubbleMessage(role: Role, text: string) {
    // TODO: currentUser & Assistant message should be contain the message with emotion in it

    if (role === "user") {
      // add space if there is already a partial message
      if (this.currentUserMessage !== "") {
        this.currentUserMessage += " ";
      }
      this.currentUserMessage += text;
      this.setUserMessage!(this.currentUserMessage);
      this.setAssistantMessage!("");

      if (this.currentAssistantMessage !== "") {
        this.messageList!.push({
          role: "assistant",
          content: this.currentAssistantMessage,
        });

        this.currentAssistantMessage = "";
      }

      this.setChatLog!([
        ...this.messageList!,
        { role: "user", content: this.currentUserMessage },
      ]);
    }

    if (role === "assistant") {
      if (
        this.currentAssistantMessage != "" &&
        !this.isAwake() &&
        config("amica_life_enabled") === "true"
      ) {
        this.messageList!.push({
          role: "assistant",
          content: this.currentAssistantMessage,
        });

        this.currentAssistantMessage = text;
        this.setAssistantMessage!(this.currentAssistantMessage);
      } else if (config("chatbot_backend") === "moshi") {
        if (this.currentAssistantMessage !== "") {
          this.messageList!.push({
            role: "assistant",
            content: this.currentAssistantMessage,
          });
        }
        this.currentAssistantMessage = text;
        this.setAssistantMessage!(this.currentAssistantMessage);
        this.setUserMessage!("");

      } else {
        this.currentAssistantMessage += text;
        this.setUserMessage!("");
        this.setAssistantMessage!(this.currentAssistantMessage);
      }

      if (this.currentUserMessage !== "") {
        this.messageList!.push({
          role: "user",
          content: this.currentUserMessage,
        });

        this.currentUserMessage = "";
      }

      this.setChatLog!([
        ...this.messageList!,
        { role: "assistant", content: this.currentAssistantMessage },
      ]);
    }

    this.setShownMessage!(role);
  }

  private updateVoiceActive() {
    this.setVoiceActive?.(!this.voiceStopped && (
      this.responsePending || !!this.reader || this.ttsJobs.size() > 0 || this.speakJobs.size() > 0 ||
      this.pendingTtsGeneration === this.voiceGeneration || this.playingVoiceGeneration === this.voiceGeneration
    ));
  }

  /** Silence this reply while its text stream continues normally. */
  public stopVoice() {
    this.voiceStopped = true;
    this.voiceGeneration++;
    this.viewer?.model?.stopSpeaking();
    this.setChatSpeaking?.(false);
    this.ttsJobs.clear();
    this.speakJobs.clear();
    this.updateVoiceActive();
  }

  public async interrupt() {
    this.currentStreamIdx++;
    this.stopVoice();
    this.responsePending = false;
    this.setChatProcessing?.(false);
    const reader = this.reader;
    this.reader = null;
    this.stream = null;
    // Cancellation can involve a slow/uncooperative network source. The user
    // must be able to submit a new message without waiting for its acknowledgement.
    if (reader) void reader.cancel().catch(error => console.debug('Cancelled stream:', error));

  }

  // this happens either from text or from voice / whisper completion
  public async receiveMessageFromUser(message: string, amicaLife: boolean) {
    if (message === null || message === "") {
      return;
    }

    console.time("performance_interrupting");
    console.debug("interrupting...");
    await this.interrupt();
    console.timeEnd("performance_interrupting");
    await wait(0);
    console.debug("wait complete");

    if (!amicaLife) {
      console.log("receiveMessageFromUser", message);

      // For external API
      await handleUserInput(message);

      this.amicaLife?.receiveMessageFromUser(message);

      if (!/\[.*?\]/.test(message)) {
        message = `[neutral] ${message}`;
      }

      this.updateAwake();
      this.bubbleMessage("user", message);
    }

    // make new stream
    const messages: Message[] = [
      { role: "system", content: config("system_prompt") },
      ...this.messageList!,
      { role: "user", content: amicaLife ? message : this.currentUserMessage },
    ];
    // console.debug('messages', messages);

    await this.makeAndHandleStream(messages);
  }

  public initSSE() {
    if (!isDev || config("external_api_enabled") !== "true") {
      return;
    }  
    // Close existing SSE connection if it exists
    this.closeSSE();

    this.eventSource = new EventSource('/api/amicaHandler/');
    const source = this.eventSource;
    let connectionWarningShown = false;
    source.onopen = () => { connectionWarningShown = false; };

    // Listen for incoming messages from the server
    this.eventSource.onmessage = async (event) => {
      try {
        // Parse the incoming JSON message
        const message = JSON.parse(event.data);

        console.log(message);

        // Destructure to get the message type and data
        const { type, data } = message;

        // Handle the message based on its type
        switch (type) {
          case 'normal':
            console.log('Normal message received:', data);
            const messages: Message[] = [
              { role: "system", content: config("system_prompt") },
              ...this.messageList!,
              { role: "user", content: data},
            ];
            let stream = await getEchoChatResponseStream(messages);
            this.streams.push(stream);
            this.handleChatResponseStream();
            break;
          
          case 'animation':
            console.log('Animation data received:', data);
            const animation = await loadVRMAnimation(`/animations/${data}`);
            if (!animation) {
              throw new Error("Loading animation failed");
            }
            this.viewer?.model?.playAnimation(animation,data);
            requestAnimationFrame(() => { this.viewer?.resetCameraLerp(); });
            break;

          case 'playback':
            console.log('Playback flag received:', data);
            this.viewer?.startRecording();
            // Automatically stop recording after 10 seconds
            setTimeout(() => {
              this.viewer?.stopRecording((videoBlob) => {
                // Log video blob to console
                console.log("Video recording finished", videoBlob);

                // Create a download link for the video file
                const url = URL.createObjectURL(videoBlob!);
                const a = document.createElement("a");
                a.href = url;
                a.download = "recording.webm"; // Set the file name for download
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                // Revoke the URL to free up memory
                URL.revokeObjectURL(url);
              });
            }, data); // Stop recording after 10 seconds
            break;

          case 'systemPrompt':
            console.log('System Prompt data received:', data);
            updateConfig("system_prompt",data);
            break;

          default:
            console.warn('Unknown message type:', type);
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };


    this.eventSource.addEventListener('end', () => {
      console.log('SSE session ended');
      this.eventSource?.close();
    });

    source.onerror = () => {
      // EventSource retries automatically. A temporary disconnect is not a
      // runtime exception and must not start competing reconnect timers.
      if (!connectionWarningShown) {
        connectionWarningShown = true;
        console.warn('External control disconnected; reconnecting automatically.');
      }
    };
  }

  public closeSSE() {
    if (this.eventSource) {
        this.eventSource.onopen = null;
        this.eventSource.onerror = null;
        this.eventSource.onmessage = null;
        this.eventSource.close();
        this.eventSource = null;
    }
}

  public async makeAndHandleStream(messages: Message[]) {
    const requestIdx = this.currentStreamIdx;
    this.voiceStopped = false;
    this.responsePending = true;
    this.updateVoiceActive();
    this.setChatProcessing?.(true);
    try {
      const stream = await this.getChatResponseStream(messages);
      // A new message may supersede this request before headers arrive.
      if (requestIdx !== this.currentStreamIdx) {
        if (stream) void stream.cancel().catch(() => {});
        return;
      }
      this.streams.push(stream);
    } catch (e: any) {
      if (requestIdx !== this.currentStreamIdx) return;
      this.responsePending = false;
      this.updateVoiceActive();
      this.setChatProcessing?.(false);
      const errMsg = e.toString();
      console.error(errMsg);
      this.alert?.error("Failed to get chat response", errMsg);
      return errMsg;
    }

    if (this.streams[this.streams.length - 1] == null) {
      this.responsePending = false;
      this.updateVoiceActive();
      this.setChatProcessing?.(false);
      const errMsg = "Error: Null stream encountered.";
      console.error(errMsg);
      this.alert?.error("Null stream encountered", errMsg);
      return errMsg;
    }

    return await this.handleChatResponseStream();
  }

  public async handleChatResponseStream() {
    if (this.streams.length === 0) {
      console.log("no stream!");
      return;
    }

    this.currentStreamIdx++;
    const streamIdx = this.currentStreamIdx;
    this.setChatProcessing!(true);

    console.time("chat stream processing");
    const reader = this.streams[this.streams.length - 1].getReader();
    this.reader = reader;
    this.readers.push(reader);
    this.updateVoiceActive();
    const visibleText = new ReplyTextStream();
    const decoder = new TextDecoder();
    let sentences = new Array<string>();

    let aiTextLog = "";
    let tag = "";
    let isThinking = false;
    let rolePlay = "";
    let receivedMessage = "";

    let firstTokenEncountered = false;
    let firstSentenceEncountered = false;
    console.time("performance_time_to_first_token");
    console.time("performance_time_to_first_sentence");

    try {
      while (true) {
        if (this.currentStreamIdx !== streamIdx) {
          console.log("wrong stream idx");
          break;
        }
        const { done, value } = await reader.read();
        if (streamIdx !== this.currentStreamIdx) break;
        if (!firstTokenEncountered) {
          console.timeEnd("performance_time_to_first_token");
          firstTokenEncountered = true;
        }
        const text = typeof value === 'string' ? value : decoder.decode(value, { stream: !done });
        const visible = visibleText.push(text, done);
        if (visible) this.bubbleMessage('assistant', visible);

        receivedMessage += text;
        receivedMessage = receivedMessage.trimStart();

        const proc = processResponse({
          sentences,
          aiTextLog,
          receivedMessage,
          tag,
          isThinking,
          rolePlay,
          final: done,
          callback: (aiTalks: Screenplay[], responseState: { isThinking: boolean }): boolean => {
            // Generate & play audio for each sentence, display responses
            if (streamIdx !== this.currentStreamIdx) {
              console.log("wrong stream idx");
              return true; // should break
            }

            if (!responseState.isThinking && !this.voiceStopped) {
              this.ttsJobs.enqueue({
                textAlreadyDisplayed: true,
                screenplay: aiTalks[0],
                streamIdx: streamIdx,
              });
              this.updateVoiceActive();
            } 

            // thought bubble
            this.thoughtBubbleMessage(responseState.isThinking, aiTalks[0].text);
            
            if (!firstSentenceEncountered) {
              console.timeEnd("performance_time_to_first_sentence");
              firstSentenceEncountered = true;
            }

            return false; // normal processing
          },
        });

        sentences = proc.sentences;
        aiTextLog = proc.aiTextLog;
        receivedMessage = proc.receivedMessage;
        tag = proc.tag;
        isThinking = proc.isThinking;
        rolePlay = proc.rolePlay;
        if (proc.shouldBreak || done) {
          break;
        }
      }
    } catch (e: any) {
      const errMsg = e.toString();
      if (streamIdx === this.currentStreamIdx) {
        this.bubbleMessage!("assistant", errMsg);
        console.error(errMsg);
      }
    } finally {
      try { reader.releaseLock(); } catch { /* cancelled or already released */ }
      this.readers = this.readers.filter(active => active !== reader);
      if (this.reader === reader) this.reader = null;
      console.timeEnd("chat stream processing");
      if (streamIdx === this.currentStreamIdx) {
        this.responsePending = false;
        this.setChatProcessing!(false);
        this.updateVoiceActive();
      }
    }

    return aiTextLog;
  }

  async fetchAudio(talk: Talk): Promise<SpeechAudio | null> {
    // TODO we should remove non-speakable characters
    // since this depends on the tts backend, we should do it
    // in their respective functions
    // this is just a simple solution for now
    talk = cleanTalk(talk);
    if (talk.message.trim() === "" || config("tts_muted") === "true") {
      return null;
    }

    const rvcEnabled = config("rvc_enabled") === "true";

    try {
      switch (config("tts_backend")) {
        case "none": {
          return null;
        }
        case "elevenlabs": {
          const voiceId = config("elevenlabs_voiceid");
          const voice = await elevenlabs(talk.message, voiceId, talk.style);
          if (rvcEnabled) {
            return { audio: await this.handleRvc(voice.audio) }; // RVC may change timing; realign to the resulting waveform.
          }
          return voice;
        }
        case "speecht5": {
          const speakerEmbeddingUrl = config("speecht5_speaker_embedding_url");
          const voice = await speecht5(talk.message, speakerEmbeddingUrl);
          if (rvcEnabled) {
            return { audio: await this.handleRvc(voice.audio) }; // RVC may change timing; realign to the resulting waveform.
          }
          return voice;
        }
        case "openai_tts": {
          const voice = await openaiTTS(talk.message);
          if (rvcEnabled) {
            return { audio: await this.handleRvc(voice.audio) }; // RVC may change timing; realign to the resulting waveform.
          }
          return voice;
        }
        case "localXTTS": {
          const voice = await localXTTSTTS(talk.message);
          if (rvcEnabled) {
            return { audio: await this.handleRvc(voice.audio) }; // RVC may change timing; realign to the resulting waveform.
          }
          return voice;
        }
        case "piper": {
          const voice = await piper(talk.message);
          if (rvcEnabled) {
            return { audio: await this.handleRvc(voice.audio) }; // RVC may change timing; realign to the resulting waveform.
          }
          return voice;
        }
        case "coquiLocal": {
          const voice = await coquiLocal(talk.message);
          return voice;
        }
        case "kokoro": {
          const voice = await kokoro(talk.message);
          return voice;
        }
      }
    } catch (e: any) {
      console.error(e.toString());
      this.alert?.error("Failed to get TTS response", e.toString());
    }

    return null;
  }

  public async getChatResponseStream(messages: Message[]) {
    console.debug("getChatResponseStream", messages);
    const chatbotBackend = config("chatbot_backend");

    // Extract the system prompt and convo messages
    const systemPrompt = messages.find((msg) => msg.role === "system")!;
    const conversationMessages = messages.filter((msg) => msg.role !== "system");

    if (config("reasoning_engine_enabled") === "true") {
      return getReasoingEngineChatResponseStream(systemPrompt, conversationMessages)
    } 

    switch (chatbotBackend) {
      case "claude":
        return getClaudeChatResponseStream(messages);
      case "arbius_llm":
        return getArbiusChatResponseStream(messages);
      case "chatgpt":
        return getOpenAiChatResponseStream(messages);
      case "llamacpp":
        return getLlamaCppChatResponseStream(messages);
      case "windowai":
        return getWindowAiChatResponseStream(messages);
      case "ollama":
        return getOllamaChatResponseStream(messages);
      case "koboldai":
        return getKoboldAiChatResponseStream(messages);
      case 'openrouter':
        return getOpenRouterChatResponseStream(messages);
    }

    return getEchoChatResponseStream(messages);
  }

  public async getVisionResponse(imageData: string) {
    try {
      const visionBackend = config("vision_backend");

      console.debug("vision_backend", visionBackend);

      let res = "";
      if (visionBackend === "vision_llamacpp") {
        const messages: Message[] = [
          { role: "system", content: config("vision_system_prompt") },
          ...this.messageList!,
          {
            role: "user",
            content: "Describe the image as accurately as possible",
          },
        ];

        res = await getLlavaCppChatResponse(messages, imageData);
      } else if (visionBackend === "vision_ollama") {
        const messages: Message[] = [
          { role: "system", content: config("vision_system_prompt") },
          ...this.messageList!,
          {
            role: "user",
            content: "Describe the image as accurately as possible",
          },
        ];

        res = await getOllamaVisionChatResponse(messages, imageData);
      } else if (visionBackend === "vision_openai") {
        const messages: Message[] = [
          { role: "user", content: config("vision_system_prompt") },
          ...this.messageList! as any[],
          {
            role: "user",
            // @ts-ignore normally this is a string
            content: [
              {
                type: "text",
                text: "Describe the image as accurately as possible",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageData}`,
                },
              },
            ],
          },
        ];

        res = await getOpenAiVisionChatResponse(messages);
      } else {
        console.warn("vision_backend not supported", visionBackend);
        return;
      }

      await this.makeAndHandleStream([
        { role: "system", content: config("system_prompt") },
        ...this.messageList!,
        {
          role: "user",
          content: `This is a picture I just took from my webcam (described between [[ and ]] ): [[${res}]] Please respond accordingly and as if it were just sent and as though you can see it.`,
        },
      ]);
    } catch (e: any) {
      console.error("getVisionResponse", e.toString());
      this.alert?.error("Failed to get vision response", e.toString());
    }
  }
}
