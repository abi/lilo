import { useEffect, useRef, useState } from "react";

const isLocalhost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

const getFaviconHref = (name: "idle" | "working" | "done"): string => {
  const suffix = isLocalhost ? "-local" : "";

  if (name === "working") {
    return `/favicon-working${suffix}.svg`;
  }

  if (name === "done") {
    return `/favicon${suffix}.svg`;
  }

  return `/favicon${suffix}.svg`;
};

const setFavicon = (href: string) => {
  const faviconLink = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (faviconLink) {
    faviconLink.href = href;
    return;
  }

  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/svg+xml";
  link.href = href;
  document.head.appendChild(link);
};

export function useAgentActivity(anyChatBusy: boolean) {
  const [hasCompletedWork, setHasCompletedWork] = useState(false);
  const wasBusyRef = useRef(false);

  useEffect(() => {
    if (anyChatBusy) {
      setHasCompletedWork(false);
    } else if (wasBusyRef.current) {
      setHasCompletedWork(true);
    }

    wasBusyRef.current = anyChatBusy;
  }, [anyChatBusy]);

  useEffect(() => {
    if (!hasCompletedWork || anyChatBusy) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHasCompletedWork(false);
    }, 10_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [anyChatBusy, hasCompletedWork]);

  useEffect(() => {
    if (anyChatBusy) {
      document.title = "Lilo - Agent working";
      setFavicon(getFaviconHref("working"));
      return;
    }

    if (hasCompletedWork) {
      document.title = "Lilo - Agent done";
      setFavicon(getFaviconHref("done"));
      return;
    }

    document.title = "Lilo";
    setFavicon(getFaviconHref("idle"));
  }, [anyChatBusy, hasCompletedWork]);
}
