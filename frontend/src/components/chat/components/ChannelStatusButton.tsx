import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { API_BASE_URL, fetchJson } from "../../../store/chat/api";

type ChannelState = "configured" | "partial" | "missing";

interface ChannelDetail {
  label: string;
  value: string;
  kind?: "secret" | "value" | "list" | "url";
}

interface ChannelStatus {
  id: "email" | "telegram" | "whatsapp";
  label: string;
  provider: string;
  configured: boolean;
  state: ChannelState;
  missing: string[];
  details: ChannelDetail[];
}

interface ChannelStatusResponse {
  channels: ChannelStatus[];
}

const stateStyles: Record<ChannelState, { label: string; dot: string; badge: string }> = {
  configured: {
    label: "Configured",
    dot: "bg-green-500",
    badge:
      "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400",
  },
  partial: {
    label: "Partial",
    dot: "bg-amber-500",
    badge:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400",
  },
  missing: {
    label: "Missing",
    dot: "bg-neutral-400",
    badge:
      "border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
  },
};

const triggerClassName =
  "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-950 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-white";

export function ChannelStatusButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [channels, setChannels] = useState<ChannelStatus[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || channels) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchJson<ChannelStatusResponse>(`${API_BASE_URL}/api/channels/status`)
      .then((payload) => {
        if (!cancelled) {
          setChannels(payload.channels);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Failed to load channel status",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [channels, isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        title="Channel configuration"
        aria-label="Channel configuration"
        className={triggerClassName}
      >
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 6h16" />
          <path d="M4 12h10" />
          <path d="M4 18h7" />
          <circle cx="18" cy="12" r="2" />
          <circle cx="15" cy="18" r="2" />
        </svg>
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-neutral-700 dark:bg-neutral-900 dark:ring-white/5">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-3 py-3 dark:border-neutral-700">
            <div className="min-w-0">
              <h3 className="font-heading text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Channels
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setChannels(null);
                setError(null);
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              title="Refresh"
              aria-label="Refresh channel configuration"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
                <path d="M3 21v-5h5" />
                <path d="M3 12A9 9 0 0 1 18.5 5.7L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto p-2">
            {loading ? (
              <p className="px-2 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                Checking channels...
              </p>
            ) : null}

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            ) : null}

            {channels?.map((channel) => (
              <ChannelCard key={channel.id} channel={channel} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChannelCard({ channel }: { channel: ChannelStatus }) {
  const styles = stateStyles[channel.state];
  const [showDetails, setShowDetails] = useState(false);
  const primaryDetail = getPrimaryChannelDetail(channel);
  const securityDetail = getSecurityChannelDetail(channel);
  const secondaryDetails = primaryDetail
    ? channel.details.filter(
        (detail) => detail.label !== primaryDetail.label && detail.label !== securityDetail?.label,
      )
    : channel.details;
  const qrPayload = primaryDetail ? getQrPayload(channel, primaryDetail.value) : null;
  const copyValue =
    channel.id === "email" && primaryDetail?.value !== "Missing" ? primaryDetail?.value : null;

  return (
    <section className="mb-2 rounded-lg border border-neutral-200 bg-white p-3 last:mb-0 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ChannelLogo channelId={channel.id} />
          <div className="min-w-0">
            <h4 className="font-heading text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {channel.label}
            </h4>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{channel.provider}</p>
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium ${styles.badge}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
          {styles.label}
        </span>
      </div>

      {primaryDetail ? (
        <div className="mt-3 flex gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800">
          <div className="min-w-0 flex-1">
            <p
              className={`break-words font-heading text-lg font-bold leading-snug ${
                primaryDetail.value === "Missing"
                  ? "text-red-600 dark:text-red-400"
                  : "text-neutral-950 dark:text-neutral-50"
              }`}
            >
              {formatDetailValue(primaryDetail)}
            </p>
          </div>
          {copyValue ? (
            <CopyValueButton value={copyValue} />
          ) : qrPayload ? (
            <QrCodeImage
              payload={qrPayload}
              label={`${channel.label} ${primaryDetail.label}`}
            />
          ) : null}
        </div>
      ) : null}

      {securityDetail ? (
        <SecurityDetail detail={securityDetail} />
      ) : null}

      {secondaryDetails.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowDetails((value) => !value)}
            className="flex items-center gap-1.5 rounded-md px-1 py-1 text-xs font-medium text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            aria-expanded={showDetails}
          >
            <svg
              className={`h-3.5 w-3.5 transition ${showDetails ? "rotate-90" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
            {showDetails ? "Less details" : "More details"}
          </button>

          {showDetails ? (
            <dl className="mt-2 space-y-2">
              {secondaryDetails.map((detail) => (
                <div key={`${channel.id}-${detail.label}`} className="grid grid-cols-[7rem,minmax(0,1fr)] gap-2">
                  <dt className="text-xs text-neutral-500 dark:text-neutral-400">{detail.label}</dt>
                  <dd
                    className={`min-w-0 break-words text-xs ${
                      detail.value === "Missing"
                        ? "font-medium text-red-600 dark:text-red-400"
                        : "text-neutral-800 dark:text-neutral-200"
                    }`}
                  >
                    {formatDetailValue(detail)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}

      {channel.missing.length > 0 ? (
        <p className="mt-3 rounded-md bg-neutral-50 px-2 py-1.5 font-mono text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          Missing: {channel.missing.join(", ")}
        </p>
      ) : null}
    </section>
  );
}

function getPrimaryChannelDetail(channel: ChannelStatus): ChannelDetail | null {
  if (channel.id === "email") {
    return channel.details.find((detail) => detail.label === "Agent address") ?? null;
  }

  if (channel.id === "whatsapp") {
    return channel.details.find((detail) => detail.label === "Agent number") ?? null;
  }

  return null;
}

function getSecurityChannelDetail(channel: ChannelStatus): ChannelDetail | null {
  if (channel.id === "email") {
    return channel.details.find((detail) => detail.label === "Allowed emails") ?? null;
  }

  if (channel.id === "whatsapp") {
    return channel.details.find((detail) => detail.label === "Allowed sender") ?? null;
  }

  return null;
}

function getQrPayload(channel: ChannelStatus, value: string): string | null {
  if (value === "Missing") {
    return null;
  }

  if (channel.id === "email") {
    return null;
  }

  if (channel.id === "whatsapp") {
    const normalized = value
      .trim()
      .replace(/^whatsapp:/i, "")
      .replace(/[^\d+]/g, "");
    if (!normalized) {
      return null;
    }

    return `https://wa.me/${normalized.replace(/^\+/, "")}`;
  }

  return null;
}

function formatDetailValue(detail: ChannelDetail): string {
  if (detail.value === "Missing") {
    return detail.value;
  }

  if (detail.label === "Agent number" || detail.label === "Allowed sender") {
    return formatPhoneValue(detail.value);
  }

  return detail.value;
}

function formatPhoneValue(value: string): string {
  const trimmed = value.trim().replace(/^whatsapp:/i, "");
  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (trimmed.startsWith("+") && digits.length > 0) {
    return `+${digits}`;
  }

  return trimmed;
}

function SecurityDetail({ detail }: { detail: ChannelDetail }) {
  const values = detail.value === "Missing"
    ? []
    : detail.value.split(",").map((value) => value.trim()).filter((value) => value.length > 0);

  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        {detail.label}
      </div>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span
              key={value}
              className="rounded-md bg-white px-2 py-1 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-100 dark:ring-emerald-800"
            >
              {detail.label === "Allowed sender" ? formatPhoneValue(value) : value}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs font-medium text-red-600 dark:text-red-400">Missing</p>
      )}
    </div>
  );
}

function CopyValueButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => {
        void handleCopy();
      }}
      className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-950 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
      title="Copy"
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect width="14" height="14" x="8" y="8" rx="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      </svg>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function QrCodeImage({ payload, label }: { payload: string; label: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 96,
      color: {
        dark: "#111827",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDataUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [payload]);

  if (!dataUrl) {
    return (
      <div className="h-24 w-24 shrink-0 rounded-lg border border-neutral-200 bg-white dark:border-neutral-700" />
    );
  }

  return (
    <img
      src={dataUrl}
      alt={`${label} QR code`}
      className="h-24 w-24 shrink-0 rounded-lg border border-neutral-200 bg-white p-1 dark:border-neutral-700"
    />
  );
}

function ChannelLogo({ channelId }: { channelId: ChannelStatus["id"] }) {
  if (channelId === "email") {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 ring-1 ring-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900">
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect width="18" height="14" x="3" y="5" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      </span>
    );
  }

  if (channelId === "telegram") {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#229ED9]/10 text-[#229ED9] ring-1 ring-[#229ED9]/20">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M21.8 4.6 18.5 20c-.2 1-.8 1.2-1.6.8l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L6.1 13.4l-5-1.6c-1.1-.3-1.1-1.1.2-1.6L20.7 2.7c.9-.3 1.7.2 1.1 1.9Z" />
        </svg>
      </span>
    );
  }

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#25D366]/10 text-[#1DA851] ring-1 ring-[#25D366]/20">
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M19.1 4.9A9.8 9.8 0 0 0 3.7 16.7L2.5 21l4.4-1.2A9.8 9.8 0 0 0 19.1 4.9Zm-7.3 14a8 8 0 0 1-4.1-1.1l-.3-.2-2.6.7.7-2.5-.2-.3a8 8 0 1 1 6.5 3.4Zm4.4-6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.6.1-.2.3-.7.8-.8 1-.2.2-.3.2-.6.1-.2-.1-1-.4-2-1.2-.7-.6-1.2-1.4-1.4-1.6-.1-.2 0-.4.1-.5l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.7-1.6c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.1 0 1.2.9 2.4 1 2.5.1.2 1.8 2.8 4.4 3.9.6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1 0-.2-.2-.2-.5-.3Z" />
      </svg>
    </span>
  );
}
