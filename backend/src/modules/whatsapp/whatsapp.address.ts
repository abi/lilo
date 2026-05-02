const WHATSAPP_PREFIX = /^whatsapp:/i;

export const normalizeWhatsAppPhoneNumber = (value: string): string => {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .replace(WHATSAPP_PREFIX, "")
    .replace(/[^\d+]/g, "")
    .replace(/(?!^)\+/g, "");

  if (!normalized) {
    return "";
  }

  return normalized.startsWith("+") ? normalized : `+${normalized}`;
};

export const normalizeWhatsAppAddress = (value: string): string => {
  const phoneNumber = normalizeWhatsAppPhoneNumber(value);
  return phoneNumber ? `whatsapp:${phoneNumber}` : "";
};
