import { useEffect, useRef } from "react";

// Module-level AudioContext so we reuse a single instance across renders.
// The context is created lazily on first use — by the time a response
// completes the user has already interacted with the page (they sent a
// message), so the browser's autoplay policy allows playback.
let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (sharedAudioContext) {
    return sharedAudioContext;
  }

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!Ctor) {
    return null;
  }

  sharedAudioContext = new Ctor();
  return sharedAudioContext;
}

function playCompletionBeep(): void {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }

  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  const now = ctx.currentTime;
  // A short two-tone chime: A5 → E6. Brief, pleasant, unobtrusive.
  const tones: Array<{ frequency: number; start: number; duration: number }> = [
    { frequency: 880, start: 0, duration: 0.12 },
    { frequency: 1318.51, start: 0.1, duration: 0.16 },
  ];

  for (const { frequency, start, duration } of tones) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now + start);

    // Quick fade in / out to avoid audible clicks at the envelope edges.
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(0.15, now + start + 0.01);
    gain.gain.linearRampToValueAtTime(0, now + start + duration);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now + start);
    oscillator.stop(now + start + duration);
  }
}

export function useCompletionSound(anyChatBusy: boolean): void {
  const wasBusyRef = useRef(false);

  useEffect(() => {
    if (!anyChatBusy && wasBusyRef.current) {
      playCompletionBeep();
    }
    wasBusyRef.current = anyChatBusy;
  }, [anyChatBusy]);
}
