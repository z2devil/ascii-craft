const TXA_MAGIC = "TXA\0";
const TXA_VERSION = 2;

export type RGB = [number, number, number];

export interface TXAHeader {
  version: number;
  colorMode: number;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  charCount: number;
  colorCount: number;
  bgColor: RGB;
  changeSpeed: number;
  canvasRatio: number;
  lumBits: number;
}

export interface TXAFrame {
  type: 0 | 1;
  data: Uint8Array;
}

function deltaDecode(data: Uint8Array): Uint8Array {
  if (data.length === 0) return new Uint8Array(0);

  const result = new Uint8Array(data.length);
  result[0] = data[0];

  for (let i = 1; i < data.length; i++) {
    result[i] = (result[i - 1] + data[i]) & 0xff;
  }

  return result;
}

function rleDecode(data: Uint8Array, expectedSize: number): Uint8Array {
  const result: number[] = [];
  let i = 0;

  while (i < data.length && result.length < expectedSize) {
    const marker = data[i++];

    if (marker === 255) {
      const count = data[i++];
      const value = data[i++];
      for (let j = 0; j < count && result.length < expectedSize; j++) {
        result.push(value);
      }
    } else {
      const literalCount = marker;
      for (let j = 0; j < literalCount && i < data.length && result.length < expectedSize; j++) {
        result.push(data[i++]);
      }
    }
  }

  return new Uint8Array(result);
}

function decompress(data: Uint8Array, expectedSize: number): Uint8Array {
  const rleDecoded = rleDecode(data, expectedSize);
  return deltaDecode(rleDecoded);
}

export class TXADecoder {
  header: TXAHeader | null;
  characters: string;
  colorPalette: RGB[];
  frames: TXAFrame[];
  currentFrameIndex: number;
  currentGrid: number[][][] | null;

  constructor() {
    this.header = null;
    this.characters = "";
    this.colorPalette = [];
    this.frames = [];
    this.currentFrameIndex = 0;
    this.currentGrid = null;
  }

  parse(buffer: ArrayBuffer): TXAHeader {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let offset = 0;

    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic !== TXA_MAGIC) {
      throw new Error("Invalid TXA file: wrong magic number");
    }
    offset = 4;

    const version = bytes[offset++];
    if (version !== TXA_VERSION) {
      throw new Error(`Unsupported TXA version: ${version}, expected ${TXA_VERSION}`);
    }

    this.header = {
      version,
      colorMode: bytes[offset++],
      width: view.getUint16(offset, true),
      height: view.getUint16(offset + 2, true),
      fps: bytes[offset + 4],
      totalFrames: view.getUint32(offset + 5, true),
      charCount: bytes[offset + 9],
      colorCount: view.getUint16(offset + 10, true),
      bgColor: [bytes[offset + 12], bytes[offset + 13], bytes[offset + 14]] as RGB,
      changeSpeed: bytes[offset + 15] / 10,
      canvasRatio: bytes[offset + 16],
      lumBits: bytes[offset + 17],
    };

    offset = 32;

    this.characters = "";
    for (let i = 0; i < this.header.charCount; i++) {
      this.characters += String.fromCharCode(bytes[offset++]);
    }

    this.colorPalette = [];
    for (let i = 0; i < this.header.colorCount; i++) {
      this.colorPalette.push([bytes[offset++], bytes[offset++], bytes[offset++]] as RGB);
    }

    this.frames = [];
    for (let i = 0; i < this.header.totalFrames; i++) {
      const frameType = bytes[offset++] as 0 | 1;
      const dataSize = view.getUint32(offset, true);
      offset += 4;

      const data = bytes.slice(offset, offset + dataSize);
      offset += dataSize;

      this.frames.push({ type: frameType, data });
    }

    this.initGrid();

    return this.header;
  }

  initGrid(): void {
    const { width, height, colorMode } = this.header!;
    const cellSize = colorMode === 0 ? 1 : 3;

    this.currentGrid = [];
    for (let x = 0; x < width; x++) {
      this.currentGrid[x] = [];
      for (let y = 0; y < height; y++) {
        this.currentGrid[x][y] = cellSize === 1 ? [0] : [0, 0, 0];
      }
    }

    this.currentFrameIndex = -1;
  }

  getFrame(index: number): number[][][] | null {
    if (index < 0 || index >= this.frames.length) return null;

    if (index < this.currentFrameIndex) {
      this.initGrid();
    }

    while (this.currentFrameIndex < index) {
      this.currentFrameIndex++;
      this.applyFrame(this.currentFrameIndex);
    }

    return this.currentGrid;
  }

  applyFrame(index: number): void {
    const frame = this.frames[index];
    const { width, height, colorMode } = this.header!;
    const cellSize = colorMode === 0 ? 1 : 3;

    if (frame.type === 0) {
      const expectedSize = width * height * cellSize;
      const decompressed = decompress(frame.data, expectedSize);

      let i = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (cellSize === 1) {
            this.currentGrid![x][y] = [decompressed[i]];
          } else {
            this.currentGrid![x][y] = [decompressed[i], decompressed[i + 1], decompressed[i + 2]];
          }
          i += cellSize;
        }
      }
    } else {
      const changeCount = (frame.data[0] << 8) | frame.data[1];

      if (changeCount === 0) return;

      const deltaData = decompress(frame.data.slice(2), changeCount * (2 + cellSize));

      let i = 0;
      for (let c = 0; c < changeCount; c++) {
        const x = deltaData[i++];
        const y = deltaData[i++];

        if (x < width && y < height) {
          if (cellSize === 1) {
            this.currentGrid![x][y] = [deltaData[i]];
          } else {
            this.currentGrid![x][y] = [deltaData[i], deltaData[i + 1], deltaData[i + 2]];
          }
        }
        i += cellSize;
      }
    }
  }

  getCharacter(index: number): string {
    return this.characters[index] || " ";
  }

  getColor(luminanceOrIndex: number): number[] {
    if (luminanceOrIndex < this.colorPalette.length) {
      return this.colorPalette[luminanceOrIndex];
    }
    return [255, 255, 255];
  }

  get width(): number {
    return this.header?.width || 0;
  }
  get height(): number {
    return this.header?.height || 0;
  }
  get fps(): number {
    return this.header?.fps || 30;
  }
  get totalFrames(): number {
    return this.frames.length;
  }
  get colorMode(): number {
    return this.header?.colorMode || 0;
  }
  get duration(): number {
    return this.totalFrames / this.fps;
  }
  get bgColor(): RGB {
    return this.header?.bgColor || [0, 0, 0];
  }
  get changeSpeed(): number {
    return this.header?.changeSpeed || 2.0;
  }
  get canvasRatio(): number {
    return this.header?.canvasRatio || 0;
  }
}
