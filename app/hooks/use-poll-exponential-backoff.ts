import { backOff } from "exponential-backoff";
import { useRef, useState, useEffect } from "react";

export function useBackoffCallback<T = any>(
  callback: () => Promise<T> | T,
  shouldStart: boolean = false,
  options: {
    numOfAttempts?: number;
    startingDelay?: number;
    timeMultiple?: number;
    maxDelay?: number;
  } = {}
) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastError, setLastError] = useState<any>(null);
  const [lastResult, setLastResult] = useState<[string, Awaited<T>] | null>(null);
  
  // Following Dan Abramov's pattern: use ref to always get fresh callback
  const savedCallback = useRef(callback);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Always save the latest callback
  savedCallback.current = callback;

  const {
    numOfAttempts = 3,
    startingDelay = 1000,
    timeMultiple = 2,
    maxDelay = 10000,
  } = options;

  useEffect(() => {
    if (!shouldStart || isExecuting) {
      return;
    }

    const startExecution = async () => {
      // Cancel any previous execution
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      setIsExecuting(true);
      setLastError(null);

      try {
        const result = await backOff(
          async () => {
            // Check if we should abort
            if (abortControllerRef.current?.signal.aborted) {
              return ['aborted', null];
            }

            // Use the fresh callback from ref
            const data = await savedCallback.current();
            return ['success', data];
          },
          {
            numOfAttempts,
            startingDelay,
            timeMultiple,
            maxDelay,
            retry: (error: any, attemptNumber: number) => {
              if (abortControllerRef.current?.signal.aborted) {
                return false;
              }
              return true;
            },
          }
        );

        setLastResult(result as [string, Awaited<T>]);
      } catch (error) {
        console.error('Error in backoff callback', error);
        setLastError(error);
      } finally {
        abortControllerRef.current = null;
      }
    };

    startExecution();

    // Cleanup function
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setIsExecuting(false);
    };
  }, [shouldStart, numOfAttempts, startingDelay, timeMultiple, maxDelay]);

  return {
    isExecuting,
    lastError,
    lastResult,
  };
}