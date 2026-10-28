import { useContext, useEffect, useRef, useState } from "react";
import { ManualRecorder, RecordingState } from "@/features/manualRecording/manualRecorder";
import { IconButton } from "./iconButton";
import { useTranscriber } from "@/hooks/useTranscriber";
import { cleanTranscript, cleanFromPunctuation, cleanFromWakeWord } from "@/utils/stringProcessing";
import { hasOnScreenKeyboard } from "@/utils/hasOnScreenKeyboard";
import { AlertContext } from "@/features/alert/alertContext";
import { ChatContext } from "@/features/chat/chatContext";
import { openaiWhisper  } from "@/features/openaiWhisper/openaiWhisper";
import { whispercpp  } from "@/features/whispercpp/whispercpp";
import { config } from "@/utils/config";
import { WaveFile } from "wavefile";
import { AmicaLifeContext } from "@/features/amicaLife/amicaLifeContext";
import { AudioControlsContext } from "@/features/moshi/components/audioControlsContext";
import { TypingIndicator } from './typingIndicator';


export default function MessageInput({
  userMessage,
  setUserMessage,
  isChatProcessing,
  isVoiceActive,
  onChangeUserMessage,
}: {
  userMessage: string;
  setUserMessage: (message: string) => void;
  isChatProcessing: boolean;
  isVoiceActive: boolean;
  onChangeUserMessage: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
}) {
  const transcriber = useTranscriber();
  const inputRef = useRef<HTMLInputElement>(null);
  const focusAfterStopRef = useRef(false);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingError, setRecordingError] = useState('');
  const recorderRef = useRef<ManualRecorder>();
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const recordingBackendRef = useRef('');
  const lastBrowserOutput = useRef<unknown>();
  const browserWasBusy = useRef(false);
  const browserGenerationRef = useRef(-1);
  const seenErrorRef = useRef('');
  const { chat: bot } = useContext(ChatContext);
  const { alert } = useContext(AlertContext);
  const { amicaLife } = useContext(AmicaLifeContext);
  const { audioControls: moshi } = useContext(AudioControlsContext);
  const [ moshiMuted, setMoshiMuted] = useState(moshi.isMuted());

  const isMoshi = config("chatbot_backend") === "moshi";
  const recording = recordingState === 'recording';
  const microphoneBusy = recordingState === 'requesting' || recordingState === 'processing' || isTranscribing || transcriber.isBusy || transcriber.isModelLoading;

  useEffect(() => {
    if (!isVoiceActive && focusAfterStopRef.current) {
      focusAfterStopRef.current = false;
      inputRef.current?.focus();
    }
  }, [isVoiceActive]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current++;
      recorderRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    if (isMoshi) {
      generationRef.current++;
      recorderRef.current?.cancel();
      setIsTranscribing(false);
    }
  }, [isMoshi]);

  function showRecordingError(reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    if (!mountedRef.current) return;
    setIsTranscribing(false);
    if (seenErrorRef.current !== message) {
      seenErrorRef.current = message;
      setRecordingError(message);
      alert.error('Microphone recording', message);
    }
  }

  async function toggleRecording() {
    if (!recorderRef.current) {
      recorderRef.current = new ManualRecorder(
        state => { if (mountedRef.current) setRecordingState(state); },
        showRecordingError,
      );
    }
    const recorder = recorderRef.current;
    if (recorder.state === 'recording') {
      const generation = generationRef.current;
      setIsTranscribing(true);
      try {
        const audio = await recorder.stop();
        if (!audio || !mountedRef.current || generation !== generationRef.current) return;
        (window as any).chatvrm_latency_tracker = { start: Date.now(), active: true };
        const backend = recordingBackendRef.current;
        if (backend === 'whisper_browser') {
          // The complete, untrimmed recording is now 16 kHz mono.
          browserGenerationRef.current = generation;
          await transcriber.start(audio);
          return;
        }
        const wav = new WaveFile();
        wav.fromScratch(1, 16000, '32f', audio.getChannelData(0));
        wav.toBitDepth('16');
        const bytes = new Uint8Array(wav.toBuffer());
        const file = new File([bytes.buffer], 'input.wav', { type: 'audio/wav' });
        const output = backend === 'whisper_openai' ? await openaiWhisper(file) : await whispercpp(file);
        if (mountedRef.current && generation === generationRef.current) handleTranscriptionResult(output.text);
      } catch (error) {
        if (generation === generationRef.current) showRecordingError(error);
      } finally {
        if (mountedRef.current && generation === generationRef.current && recordingBackendRef.current !== 'whisper_browser') setIsTranscribing(false);
      }
    } else if (recorder.state === 'idle' && !microphoneBusy) {
      generationRef.current++;
      recordingBackendRef.current = config('stt_backend');
      setRecordingError('');
      seenErrorRef.current = '';
      transcriber.onInputChange();
      browserWasBusy.current = false;
      await recorder.start();
    }
  }

  function handleTranscriptionResult(preprocessed: string) {
    const cleanText = cleanTranscript(preprocessed);
    const wakeWordEnabled = config("wake_word_enabled") === 'true';
    const textStartsWithWakeWord = wakeWordEnabled && cleanFromPunctuation(cleanText).startsWith(cleanFromPunctuation(config("wake_word")));
    const text = wakeWordEnabled && textStartsWithWakeWord ? cleanFromWakeWord(cleanText, config("wake_word")) : cleanText;

    if (wakeWordEnabled) {
      // Text start with wake word
      if (textStartsWithWakeWord) {
        // Pause amicaLife and update bot's awake status when speaking
        if (config("amica_life_enabled") === "true") {
          amicaLife.pause();
        }
        bot.updateAwake();
      // Case text doesn't start with wake word and not receive trigger message in amica life
      } else {
        if (config("amica_life_enabled") === "true" && amicaLife.triggerMessage !== true && !bot.isAwake()) {
          bot.updateAwake();
        }
      }
    } else {
      // If wake word off, update bot's awake when speaking
      if (config("amica_life_enabled") === "true") {
        amicaLife.pause();
        bot.updateAwake();
      }
    }


    if (text === "") {
      return;
    }


    if (config("autosend_from_mic") === 'true') {
      if (!wakeWordEnabled || bot.isAwake()) {
        bot.receiveMessageFromUser(text,false);
      } 
    } else {
      setUserMessage(text);
    }

  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    onChangeUserMessage(event); 
  
    // Pause amicaLife and update bot's awake status when typing
    if (config("amica_life_enabled") === "true") {
      amicaLife.pause();
      bot.updateAwake();
    }
  }

  useEffect(() => {
    if (transcriber.error && !isMoshi && browserGenerationRef.current === generationRef.current) showRecordingError(transcriber.error);
  }, [transcriber.error, isMoshi]);

  // Deliver only the worker's final result, once per recording. Partial
  // transcript updates are never treated as another recording boundary.
  useEffect(() => {
    if (transcriber.isBusy) browserWasBusy.current = true;
    if (recordingBackendRef.current !== 'whisper_browser' || browserGenerationRef.current !== generationRef.current || isMoshi) return;
    const output = transcriber.output;
    if (output && !output.isBusy && !transcriber.isBusy && output !== lastBrowserOutput.current) {
      lastBrowserOutput.current = output;
      setIsTranscribing(false);
      handleTranscriptionResult(output.text);
    } else if (browserWasBusy.current && !transcriber.isBusy) {
      setIsTranscribing(false);
    }
  }, [transcriber.output, transcriber.isBusy, isMoshi]);

  function clickedSendButton() {
    bot.receiveMessageFromUser(userMessage,false);
    if (!recording) {
      if (! hasOnScreenKeyboard()) {
        inputRef.current?.focus();
      }
    }
    setUserMessage("");
  }

  function stopVoice() {
    focusAfterStopRef.current = true;
    bot.stopVoice();
  }

  return (
    <div className="fixed bottom-2 z-20 w-full">
      <div className="mx-auto max-w-4xl p-2 backdrop-blur-lg border-0 rounded-lg">
        <p id="manual-recording-help" className="sr-only">Recording continues through pauses until you click Stop. Your text autosend setting is applied after transcription.</p>
        {!isMoshi && (recordingState !== 'idle' || isTranscribing || transcriber.isBusy || recordingError) && (
          <p role={recordingError ? 'alert' : 'status'} aria-live="polite" className="mb-2 w-fit max-w-full break-words rounded-md bg-gray-900/95 px-3 py-1.5 text-sm text-white">
            {recordingError || (recordingState === 'requesting' ? 'Allow microphone access to start recording.' : recording ? 'Recording — pauses are kept. Click Stop when finished.' : 'Transcribing the complete recording…')}
          </p>
        )}
        <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] gap-[8px]">
          <div>
            <div className='flex flex-col justify-center items-center'>
              {config("chatbot_backend") === "moshi" ? (
                <IconButton
                aria-label={moshiMuted ? "Unmute microphone" : "Mute microphone"}
                iconName={!moshiMuted ? "24/PauseAlt" : "24/Microphone"}
                className="bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled"
                isProcessing={moshiMuted && moshi.getRecorder() != null}
                disabled={!moshi.getRecorder()}
                onClick={() => {
                  moshi.toggleMute();
                  setMoshiMuted(!moshiMuted);
                }}
              />
              ) : (
                <button
                  type="button"
                  aria-label={recording ? 'Stop recording' : 'Start recording'}
                  aria-describedby="manual-recording-help"
                  aria-busy={microphoneBusy}
                  title={recording ? 'Stop and transcribe the whole recording' : 'Start microphone recording'}
                  disabled={!recording && (config('stt_backend') === 'none' || microphoneBusy)}
                  onClick={() => { void toggleRecording(); }}
                  className="h-11 w-11 bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled text-gray-900 rounded-lg inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                >
                  {recording ? <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg> : <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 10v2a6 6 0 0 0 12 0v-2M12 18v3M9 21h6" /></svg>}
                </button>
              )}
            </div>
          </div>

          <div className="relative min-w-0">
          <input
            aria-label="Message"
            type="text"
            ref={inputRef}
            placeholder={isMoshi ? "Disabled in moshi chatbot" : isVoiceActive ? '' : "Write message here..."}
            title={isVoiceActive ? (isChatProcessing ? 'AI is responding. Click Stop to type a new message.' : 'AI is speaking. Click Stop to type a new message.') : undefined}
            aria-busy={isVoiceActive}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (hasOnScreenKeyboard()) {
                  inputRef.current?.blur();
                }

                if (userMessage === "" || recording || microphoneBusy || isVoiceActive || isMoshi) {
                  return false;
                }

                clickedSendButton();
              }
            }}
            disabled={isMoshi || isVoiceActive}

            className="block h-11 min-w-0 w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-1 focus:ring-inset focus:ring-gray-400 disabled:bg-white disabled:opacity-100 sm:text-sm sm:leading-6"
            value={isVoiceActive ? '' : userMessage}
            autoComplete="off"
          />
          {isVoiceActive && !isMoshi && <TypingIndicator />}
          </div>

          <button
            type="button"
            aria-label={isVoiceActive ? 'Stop voice' : 'Send message'}
            title={isVoiceActive ? 'Stop voice playback; keep the reply text' : 'Send message'}
            onClick={isVoiceActive ? stopVoice : clickedSendButton}
            disabled={isMoshi || (!isVoiceActive && (!userMessage || microphoneBusy || recording))}
            className="h-11 w-11 bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled text-gray-900 rounded-lg inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
          >
            {isVoiceActive ? <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg> : <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m4 4 17 8-17 8 3-8-3-8ZM7 12h14" /></svg>}
          </button>
        </div>
      </div>
    </div>
  );
}
