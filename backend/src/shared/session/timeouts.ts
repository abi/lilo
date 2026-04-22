interface StreamingTimeoutsOptions {
  firstEventTimeoutMs: number;
  promptTimeoutMs: number;
  isStreaming: () => boolean;
  onFirstEventTimeout: () => void;
  onPromptTimeout: () => void;
}

export const createStreamingTimeouts = ({
  firstEventTimeoutMs,
  promptTimeoutMs,
  isStreaming,
  onFirstEventTimeout,
  onPromptTimeout,
}: StreamingTimeoutsOptions) => {
  let sawAnyEvent = false;
  let firstEventTimedOut = false;
  let promptTimedOut = false;

  const firstEventTimeout = setTimeout(() => {
    if (!sawAnyEvent && isStreaming()) {
      firstEventTimedOut = true;
      onFirstEventTimeout();
    }
  }, firstEventTimeoutMs);

  const promptTimeout = setTimeout(() => {
    if (isStreaming()) {
      promptTimedOut = true;
      onPromptTimeout();
    }
  }, promptTimeoutMs);

  return {
    markEventSeen: () => {
      sawAnyEvent = true;
    },
    getState: () => ({
      firstEventTimedOut,
      promptTimedOut,
      sawAnyEvent,
    }),
    clear: () => {
      clearTimeout(firstEventTimeout);
      clearTimeout(promptTimeout);
    },
  };
};
