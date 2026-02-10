/**
 * TXA (Text Animation) Encoder - Version 2
 *
 * File Format Specification:
 *
 * HEADER (32 bytes):
 *   - Magic:        4 bytes  "TXA\0"
 *   - Version:      1 byte   (current: 2)
 *   - ColorMode:    1 byte   (0=gradient, 1=fullcolor)
 *   - Width:        2 bytes  (grid columns, uint16 LE)
 *   - Height:       2 bytes  (grid rows, uint16 LE)
 *   - FPS:          1 byte   (frames per second)
 *   - TotalFrames:  4 bytes  (uint32 LE)
 *   - CharCount:    1 byte   (number of characters in palette)
 *   - ColorCount:   2 bytes  (number of colors in palette, uint16 LE)
 *   - BgColor:      3 bytes  (RGB)
 *   - ChangeSpeed:  1 byte   (value * 10 for 0.1 precision)
 *   - CanvasRatio:  1 byte   (0=free, 1=16:9, 2=4:3, 3=1:1, 4=9:16, 5=3:4)
 *   - LumBits:      1 byte   (luminance bits: 8=256 levels, 6=64, 5=32, 4=16)
 *   - Reserved:     8 bytes  (for future use)
 *
 * PALETTE (variable):
 *   - Characters:   CharCount bytes (ASCII)
 *   - Colors:       ColorCount * 3 bytes (RGB triplets)
 *
 * FRAMES (variable):
 *   - FrameType:    1 byte   (0=keyframe, 1=delta)
 *   - DataSize:     4 bytes  (uint32 LE, compressed data size)
 *   - Data:         DataSize bytes (Delta + RLE compressed)
 *
 * CELL DATA (per cell, before compression):
 *   - ColorMode 0 (gradient):  1 byte [luminance] (quantized)
 *   - ColorMode 1 (fullcolor): 3 bytes [r, g, b]
 *
 * COMPRESSION: Delta Encoding (row-wise) + RLE
 */

export interface TXAEncoderOptions {
  width?: number;
  height?: number;
  fps?: number;
  colorMode?: number;
  characters?: string;
  keyframeInterval?: number;
  bgColor?: [number, number, number];
  changeSpeed?: number;
  canvasRatio?: number;
  lumBits?: number;
}

export interface EncodedFrame {
  type: 0 | 1;
  data: Uint8Array;
}

export interface EncoderStats {
  totalFrames: number;
  keyframes: number;
  deltaFrames: number;
  uncompressedSize: number;
  compressedSize: number;
  compressionRatio: string;
}

export type GridData = number[][][];

const _TXA_MAGIC = "TXA\0";
const TXA_VERSION = 2;

function deltaEncode(data: Uint8Array): Uint8Array {
  if (data.length === 0) return new Uint8Array(0);

  const result = new Uint8Array(data.length);
  result[0] = data[0];

  for (let i = 1; i < data.length; i++) {
    result[i] = (data[i] - data[i - 1] + 256) & 0xff;
  }

  return result;
}

function rleEncode(data: Uint8Array): Uint8Array {
  const result: number[] = [];
  let i = 0;

  while (i < data.length) {
    const value = data[i];
    let runLength = 1;

    while (i + runLength < data.length && data[i + runLength] === value && runLength < 255) {
      runLength++;
    }

    if (runLength >= 3) {
      result.push(255, runLength, value);
      i += runLength;
    } else {
      const literalStart = i;
      let literalLength = 0;

      while (i + literalLength < data.length && literalLength < 254) {
        const current = data[i + literalLength];
        let nextRunLength = 1;

        while (
          i + literalLength + nextRunLength < data.length &&
          data[i + literalLength + nextRunLength] === current &&
          nextRunLength < 255
        ) {
          nextRunLength++;
        }

        if (nextRunLength >= 3) break;
        literalLength++;
      }

      if (literalLength === 0) literalLength = 1;

      result.push(literalLength);
      for (let j = 0; j < literalLength; j++) {
        result.push(data[literalStart + j]);
      }
      i += literalLength;
    }
  }

  return new Uint8Array(result);
}

function compress(data: Uint8Array): Uint8Array {
  const deltaEncoded = deltaEncode(data);
  return rleEncode(deltaEncoded);
}

function calculateDelta(prevFrame: number[][][], currFrame: number[][][], cellSize: number): number[] {
  const changes: number[] = [];
  const width = prevFrame.length;
  const height = prevFrame[0].length;

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const prev = prevFrame[x][y];
      const curr = currFrame[x][y];

      let changed = false;
      if (cellSize === 1) {
        changed = prev[0] !== curr[0];
      } else {
        changed = prev[0] !== curr[0] || prev[1] !== curr[1] || prev[2] !== curr[2];
      }

      if (changed) {
        changes.push(x, y, ...curr);
      }
    }
  }

  return changes;
}

export class TXAEncoder {
  width: number;
  height: number;
  fps: number;
  colorMode: number;
  characters: string;
  keyframeInterval: number;
  bgColor: [number, number, number];
  changeSpeed: number;
  canvasRatio: number;
  lumBits: number;

  frames: EncodedFrame[];
  colorPalette: number[][];
  lastKeyframe: number[][][] | null;
  frameCount: number;

  constructor(options: TXAEncoderOptions = {}) {
    this.width = options.width || 80;
    this.height = options.height || 45;
    this.fps = options.fps || 30;
    this.colorMode = options.colorMode || 0;
    this.characters = options.characters || " 0123456789ABCDEF";
    this.keyframeInterval = options.keyframeInterval || 30;
    this.bgColor = options.bgColor || [0, 0, 0];
    this.changeSpeed = options.changeSpeed || 2.0;
    this.canvasRatio = options.canvasRatio || 0;
    this.lumBits = options.lumBits || 8;

    this.frames = [];
    this.colorPalette = [];
    this.lastKeyframe = null;
    this.frameCount = 0;
  }

  quantizeLuminance(lum: number): number {
    if (this.lumBits >= 8) return lum;
    const levels = 1 << this.lumBits;
    const step = 256 / levels;
    const quantized = Math.floor(lum / step);
    return Math.round(quantized * step + step / 2);
  }

  addFrame(gridData: GridData): void {
    const isKeyframe = this.frameCount % this.keyframeInterval === 0;
    const cellSize = this.colorMode === 0 ? 1 : 3;

    const processedGrid = gridData.map((col) =>
      col.map((cell) => {
        if (this.colorMode === 0) {
          return [this.quantizeLuminance(cell[0])];
        } else {
          return [cell[0], cell[1], cell[2]];
        }
      }),
    );

    if (isKeyframe || !this.lastKeyframe) {
      const flatData: number[] = [];
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const cell = processedGrid[x]?.[y] || (this.colorMode === 0 ? [0] : [0, 0, 0]);
          flatData.push(...cell);
        }
      }

      const compressed = compress(new Uint8Array(flatData));
      this.frames.push({
        type: 0,
        data: compressed,
      });

      this.lastKeyframe = processedGrid.map((col) => col.map((cell) => [...cell]));
    } else {
      const deltaData = calculateDelta(this.lastKeyframe, processedGrid, cellSize);

      if (deltaData.length === 0) {
        this.frames.push({
          type: 1,
          data: new Uint8Array([0, 0]),
        });
      } else {
        const changeCount = deltaData.length / (2 + cellSize);
        const header = new Uint8Array([(changeCount >> 8) & 0xff, changeCount & 0xff]);

        const compressed = compress(new Uint8Array(deltaData));
        const combined = new Uint8Array(header.length + compressed.length);
        combined.set(header);
        combined.set(compressed, header.length);

        this.frames.push({
          type: 1,
          data: combined,
        });
      }

      for (let x = 0; x < this.width; x++) {
        for (let y = 0; y < this.height; y++) {
          if (processedGrid[x]?.[y]) {
            this.lastKeyframe[x][y] = [...processedGrid[x][y]];
          }
        }
      }
    }

    this.frameCount++;
  }

  buildColorPalette(colorDark: [number, number, number], colorLight: [number, number, number]): void {
    this.colorPalette = [];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const r = Math.round(colorDark[0] + (colorLight[0] - colorDark[0]) * t);
      const g = Math.round(colorDark[1] + (colorLight[1] - colorDark[1]) * t);
      const b = Math.round(colorDark[2] + (colorLight[2] - colorDark[2]) * t);
      this.colorPalette.push([r, g, b]);
    }
  }

  setColorPalette(colors: number[][]): void {
    this.colorPalette = colors.map((c) => [...c]);
  }

  encode(): ArrayBuffer {
    let totalSize = 32;
    totalSize += this.characters.length;
    totalSize += this.colorPalette.length * 3;

    for (const frame of this.frames) {
      totalSize += 5 + frame.data.length;
    }

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let offset = 0;

    bytes[offset++] = 0x54;
    bytes[offset++] = 0x58;
    bytes[offset++] = 0x41;
    bytes[offset++] = 0x00;

    bytes[offset++] = TXA_VERSION;
    bytes[offset++] = this.colorMode;

    view.setUint16(offset, this.width, true);
    offset += 2;

    view.setUint16(offset, this.height, true);
    offset += 2;

    bytes[offset++] = this.fps;

    view.setUint32(offset, this.frames.length, true);
    offset += 4;

    bytes[offset++] = this.characters.length;

    view.setUint16(offset, this.colorPalette.length, true);
    offset += 2;

    bytes[offset++] = this.bgColor[0];
    bytes[offset++] = this.bgColor[1];
    bytes[offset++] = this.bgColor[2];

    bytes[offset++] = Math.round(this.changeSpeed * 10);
    bytes[offset++] = this.canvasRatio;
    bytes[offset++] = this.lumBits;

    offset += 8;

    for (let i = 0; i < this.characters.length; i++) {
      bytes[offset++] = this.characters.charCodeAt(i);
    }

    for (const color of this.colorPalette) {
      bytes[offset++] = color[0];
      bytes[offset++] = color[1];
      bytes[offset++] = color[2];
    }

    for (const frame of this.frames) {
      bytes[offset++] = frame.type;

      view.setUint32(offset, frame.data.length, true);
      offset += 4;

      bytes.set(frame.data, offset);
      offset += frame.data.length;
    }

    return buffer;
  }

  reset(): void {
    this.frames = [];
    this.lastKeyframe = null;
    this.frameCount = 0;
  }

  getStats(): EncoderStats {
    let totalUncompressed = 0;
    let totalCompressed = 0;
    let keyframes = 0;
    let deltaFrames = 0;

    const cellSize = this.colorMode === 0 ? 1 : 3;
    const frameSize = this.width * this.height * cellSize;

    for (const frame of this.frames) {
      if (frame.type === 0) {
        keyframes++;
        totalUncompressed += frameSize;
      } else {
        deltaFrames++;
        totalUncompressed += frameSize;
      }
      totalCompressed += frame.data.length;
    }

    return {
      totalFrames: this.frames.length,
      keyframes,
      deltaFrames,
      uncompressedSize: totalUncompressed,
      compressedSize: totalCompressed,
      compressionRatio:
        totalUncompressed > 0 ? `${((1 - totalCompressed / totalUncompressed) * 100).toFixed(1)}%` : "0%",
    };
  }
}
