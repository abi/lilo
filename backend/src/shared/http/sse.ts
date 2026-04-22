export interface SseStreamEvent {
  event: string;
  data: Record<string, unknown>;
}

export const streamSseEvents = async <T extends SseStreamEvent>(
  writeSSE: (event: { event: string; data: string }) => Promise<void>,
  run: (enqueueEvent: (event: T) => Promise<void>) => Promise<void>,
): Promise<void> => {
  let writeQueue = Promise.resolve();

  const writeEvent = async (event: T) => {
    await writeSSE({
      event: event.event,
      data: JSON.stringify(event.data),
    });
  };

  const enqueueEvent = (event: T) => {
    writeQueue = writeQueue.then(() => writeEvent(event));
    return writeQueue;
  };

  try {
    await run(enqueueEvent);
  } finally {
    await writeQueue;
  }
};
