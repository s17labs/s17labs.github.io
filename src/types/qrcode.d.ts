declare module 'qrcode' {
  interface QRCodeColor {
    dark: string;
    light: string;
  }

  interface QRCodeOptions {
    width?: number;
    color?: QRCodeColor;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
    scale?: number;
    type?: 'canvas' | 'svg' | 'png' | 'terminal';
  }

  const QRCode: {
    toCanvas(
      canvas: HTMLCanvasElement,
      text: string,
      options?: QRCodeOptions,
    ): Promise<void>;
    toDataURL(
      text: string,
      options?: QRCodeOptions,
    ): Promise<string>;
    toString(
      text: string,
      options: QRCodeOptions,
    ): Promise<string>;
    toFile(
      path: string,
      text: string,
      options?: QRCodeOptions,
    ): Promise<void>;
  };

  export default QRCode;
}