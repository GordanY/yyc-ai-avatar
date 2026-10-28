import { useEffect, useMemo, useRef } from 'react';

export interface MessageEventHandler { (event: MessageEvent): void; }

/** Lazy channel: a failed worker is recreated only on the next explicit request. */
export function useWorker(workerType: string, messageEventHandler: MessageEventHandler): Pick<Worker, 'postMessage'> {
  const workerRef = useRef<Worker | null>(null);
  const handlerRef = useRef(messageEventHandler);
  const activeRef = useRef(true);
  handlerRef.current = messageEventHandler;

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [workerType]);

  return useMemo(() => ({
    postMessage(message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
      if (!activeRef.current) throw new Error('Speech recognition is no longer active.');
      if (!workerRef.current) {
        if (workerType !== 'whisper') throw new Error('workerType not found');
        const worker = new Worker(new URL('../workers/whisper.js', import.meta.url), { type: 'module' });
        workerRef.current = worker;
        worker.onmessage = event => {
          if (workerRef.current === worker) handlerRef.current(event);
        };
        const fail = (message: string) => {
          if (workerRef.current !== worker) return;
          worker.terminate(); workerRef.current = null;
          handlerRef.current(new MessageEvent('message', { data: { status: 'error', data: { message } } }));
        };
        worker.onerror = event => {
          event.preventDefault();
          fail(event.message || 'The speech recognition worker could not load. Please try recording again.');
        };
        worker.onmessageerror = () => fail('The speech recognition worker returned unreadable data. Please try recording again.');
      }
      const worker = workerRef.current;
      try {
        if (Array.isArray(options)) worker.postMessage(message, options);
        else worker.postMessage(message, options);
      } catch (error) {
        worker.terminate(); workerRef.current = null;
        throw error;
      }
    },
  }), [workerType]);
}
