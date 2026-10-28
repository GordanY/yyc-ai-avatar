import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorker } from "./useWorker";
import { updateFileProgress } from "@/utils/progress";

interface ProgressItem {
  file: string;
  loaded: number;
  progress: number;
  total: number;
  name: string;
  status: string;
}

interface TranscriberUpdateData {
  data: [
    string,
    { chunks: { text: string; timestamp: [number, number | null] }[] },
  ];
  text: string;
}

interface TranscriberCompleteData {
  data: {
    text: string;
    chunks: { text: string; timestamp: [number, number | null] }[];
  };
}

export interface TranscriberData {
  isBusy: boolean;
  text: string;
  chunks: { text: string; timestamp: [number, number | null] }[];
}

export interface Transcriber {
  onInputChange: () => void;
  isBusy: boolean;
  isModelLoading: boolean;
  start: (audioData: AudioBuffer | undefined) => Promise<void>;
  error?: string;
  output?: TranscriberData;
}

export function useTranscriber(): Transcriber {
  const [transcript, setTranscript] = useState<TranscriberData | undefined>(
    undefined,
  );
  const [isBusy, setIsBusy] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [error, setError] = useState<string>();
  const loadingFiles = useRef(new Set<string>());
  const clearLoadingFiles = useCallback(() => {
    for (const file of loadingFiles.current) updateFileProgress(file, 100);
    loadingFiles.current.clear();
  }, []);
  useEffect(() => clearLoadingFiles, [clearLoadingFiles]);


  const webWorker = useWorker("whisper", (event) => {
    const message = event.data;
    // Update the state with the result
    switch (message.status) {
      case "progress":
        // Model file progress: update one of the progress items.
        if (typeof message.file === 'string') {
          loadingFiles.current.add(message.file);
          updateFileProgress(message.file, message.progress);
        }
        break;
      case "update":
        // Received partial update
        // console.log("update", message);
        // eslint-disable-next-line no-case-declarations
        const updateMessage = message as TranscriberUpdateData;
        setTranscript({
          isBusy: true,
          text: updateMessage.data[0],
          chunks: updateMessage.data[1].chunks,
        });
        break;
      case "complete":
        clearLoadingFiles();
        // Received complete transcript
        console.log("useTranscriber complete", message);
        // eslint-disable-next-line no-case-declarations
        const completeMessage = message as TranscriberCompleteData;
        setTranscript({
          isBusy: false,
          text: completeMessage.data.text,
          chunks: completeMessage.data.chunks,
        });
        setIsBusy(false);
        setIsModelLoading(false);
        setError(undefined);
        break;

      case "initiate":
        // Model file start load: add a new progress item to the list.
        setIsModelLoading(true);
        break;
      case "ready":
        clearLoadingFiles();
        setIsModelLoading(false);
        break;
      case "error":
        clearLoadingFiles();
        setIsBusy(false);
        setIsModelLoading(false);
        setTranscript(undefined);
        setError(message.data?.message || 'Speech recognition failed. Please try recording again.');
        break;
      case "done":
        // Model file loaded: remove the progress item from the list.
        updateFileProgress(message.file, 100);
        loadingFiles.current.delete(message.file);
        break;

      default:
        // initiate/download/done
        break;
    }
  });

  const onInputChange = useCallback(() => {
    setTranscript(undefined);
    setError(undefined);
  }, []);

  const postRequest = useCallback(
    async (audioData: AudioBuffer | undefined) => {
      if (audioData) {
        setTranscript(undefined);
        setError(undefined);
        setIsBusy(true);

        let audio;
        if (audioData.numberOfChannels === 2) {
          const SCALING_FACTOR = Math.sqrt(2);

          let left = audioData.getChannelData(0);
          let right = audioData.getChannelData(1);

          audio = new Float32Array(left.length);
          for (let i = 0; i < audioData.length; ++i) {
              audio[i] = SCALING_FACTOR * (left[i] + right[i]) / 2;
          }
        } else {
          // If the audio is not stereo, we can just use the first channel:
          audio = audioData.getChannelData(0);
        }

        try {
          webWorker.postMessage({ audio });
        } catch (reason) {
          clearLoadingFiles();
          setIsBusy(false);
          setIsModelLoading(false);
          setError(reason instanceof Error ? reason.message : String(reason));
          throw reason;
        }
      }
    },
    [webWorker, clearLoadingFiles],
  );

  const transcriber = useMemo(() => {
    return {
      onInputChange,
      isBusy,
      isModelLoading,
      start: postRequest,
      output: transcript,
      error,
    };
  }, [
    isBusy,
    isModelLoading,
    postRequest,
    transcript,
    error,
  ]);

  return transcriber;
}
