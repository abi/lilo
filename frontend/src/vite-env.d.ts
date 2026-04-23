/// <reference types="vite/client" />

declare module "qrcode" {
  interface QrCodeRenderOptions {
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    margin?: number;
    width?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }

  const QRCode: {
    toDataURL(text: string, options?: QrCodeRenderOptions): Promise<string>;
  };

  export default QRCode;
}
