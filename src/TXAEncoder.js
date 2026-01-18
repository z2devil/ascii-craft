/**
 * TXA (Text Animation) Encoder
 * 
 * File Format Specification:
 * 
 * HEADER (32 bytes):
 *   - Magic:        4 bytes  "TXA\0"
 *   - Version:      1 byte   (current: 1)
 *   - ColorMode:    1 byte   (0=gradient, 1=fullcolor)
 *   - Width:        2 bytes  (grid columns, uint16 LE)
 *   - Height:       2 bytes  (grid rows, uint16 LE)
 *   - FPS:          1 byte   (frames per second)
 *   - TotalFrames:  4 bytes  (uint32 LE)
 *   - CharCount:    1 byte   (number of characters in palette)
 *   - ColorCount:   2 bytes  (number of colors in palette, uint16 LE)
 *   - Reserved:     14 bytes (for future use)
 * 
 * PALETTE (variable):
 *   - Characters:   CharCount bytes (UTF-8 encoded, 1 byte each for ASCII)
 *   - Colors:       ColorCount * 3 bytes (RGB triplets)
 * 
 * FRAMES (variable):
 *   - FrameType:    1 byte   (0=keyframe, 1=delta)
 *   - DataSize:     4 bytes  (uint32 LE, compressed data size)
 *   - Data:         DataSize bytes (RLE compressed)
 * 
 * CELL DATA (per cell):
 *   - ColorMode 0 (gradient):  2 bytes [charIndex, luminance8]
 *   - ColorMode 1 (fullcolor): 4 bytes [charIndex, r, g, b]
 */

const TXA_MAGIC = 'TXA\0'
const TXA_VERSION = 1

/**
 * RLE (Run-Length Encoding) compression
 * Format: [count, ...values] where count=0 means literal run, count>0 means repeat
 */
function rleEncode(data) {
  const result = []
  let i = 0
  
  while (i < data.length) {
    const value = data[i]
    let runLength = 1
    
    // Count consecutive identical values
    while (i + runLength < data.length && 
           data[i + runLength] === value && 
           runLength < 255) {
      runLength++
    }
    
    if (runLength >= 3) {
      // RLE: [255, count, value]
      result.push(255, runLength, value)
      i += runLength
    } else {
      // Literal: collect non-repeating values
      const literalStart = i
      let literalLength = 0
      
      while (i + literalLength < data.length && literalLength < 254) {
        const current = data[i + literalLength]
        let nextRunLength = 1
        
        while (i + literalLength + nextRunLength < data.length &&
               data[i + literalLength + nextRunLength] === current &&
               nextRunLength < 255) {
          nextRunLength++
        }
        
        if (nextRunLength >= 3) break
        literalLength++
      }
      
      if (literalLength === 0) literalLength = 1
      
      // Literal: [count, ...values] where count < 255
      result.push(literalLength)
      for (let j = 0; j < literalLength; j++) {
        result.push(data[literalStart + j])
      }
      i += literalLength
    }
  }
  
  return new Uint8Array(result)
}

/**
 * Calculate delta between two frames
 * Returns array of changed cells: [x, y, ...cellData]
 */
function calculateDelta(prevFrame, currFrame, cellSize) {
  const changes = []
  const width = prevFrame.length
  const height = prevFrame[0].length
  
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const prev = prevFrame[x][y]
      const curr = currFrame[x][y]
      
      let changed = false
      if (cellSize === 2) {
        changed = prev[0] !== curr[0] || prev[1] !== curr[1]
      } else {
        changed = prev[0] !== curr[0] || prev[1] !== curr[1] || 
                  prev[2] !== curr[2] || prev[3] !== curr[3]
      }
      
      if (changed) {
        changes.push(x, y, ...curr)
      }
    }
  }
  
  return changes
}

export class TXAEncoder {
  constructor(options = {}) {
    this.width = options.width || 80
    this.height = options.height || 45
    this.fps = options.fps || 30
    this.colorMode = options.colorMode || 0
    this.characters = options.characters || ' 0123456789ABCDEF'
    this.keyframeInterval = options.keyframeInterval || 30
    this.bgColor = options.bgColor || [0, 0, 0]
    this.changeSpeed = options.changeSpeed || 2.0
    this.canvasRatio = options.canvasRatio || 0
    
    this.frames = []
    this.colorPalette = new Map()
    this.lastKeyframe = null
    this.frameCount = 0
  }
  
  /**
   * Add a frame to the encoder
   * @param {Array} gridData - 2D array [x][y] of cell data
   *   - Gradient mode: [charIndex, luminance (0-255)]
   *   - Fullcolor mode: [charIndex, r, g, b]
   */
  addFrame(gridData) {
    const isKeyframe = this.frameCount % this.keyframeInterval === 0
    const cellSize = this.colorMode === 0 ? 2 : 4
    
    if (isKeyframe || !this.lastKeyframe) {
      // Encode as keyframe (full data)
      const flatData = []
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const cell = gridData[x]?.[y] || (this.colorMode === 0 ? [0, 0] : [0, 0, 0, 0])
          flatData.push(...cell)
        }
      }
      
      const compressed = rleEncode(new Uint8Array(flatData))
      this.frames.push({
        type: 0,  // Keyframe
        data: compressed
      })
      
      // Deep copy for delta calculation
      this.lastKeyframe = gridData.map(col => col.map(cell => [...cell]))
    } else {
      // Encode as delta frame
      const deltaData = calculateDelta(this.lastKeyframe, gridData, cellSize)
      
      if (deltaData.length === 0) {
        // No changes - store empty delta
        this.frames.push({
          type: 1,
          data: new Uint8Array([0, 0])  // 0 changes
        })
      } else {
        // Store change count + changes
        const changeCount = deltaData.length / (2 + cellSize)
        const header = new Uint8Array([
          (changeCount >> 8) & 0xFF,
          changeCount & 0xFF
        ])
        
        const compressed = rleEncode(new Uint8Array(deltaData))
        const combined = new Uint8Array(header.length + compressed.length)
        combined.set(header)
        combined.set(compressed, header.length)
        
        this.frames.push({
          type: 1,  // Delta
          data: combined
        })
      }
      
      for (let x = 0; x < this.width; x++) {
        for (let y = 0; y < this.height; y++) {
          if (gridData[x]?.[y]) {
            this.lastKeyframe[x][y] = [...gridData[x][y]]
          }
        }
      }
    }
    
    this.frameCount++
  }
  
  /**
   * Build color palette for gradient mode
   * Called automatically during encode() if colorMode is 0
   */
  buildColorPalette(colorDark, colorLight) {
    this.colorPalette = []
    
    // Generate 256 colors for full luminance range
    for (let i = 0; i < 256; i++) {
      const t = i / 255
      const r = Math.round(colorDark[0] + (colorLight[0] - colorDark[0]) * t)
      const g = Math.round(colorDark[1] + (colorLight[1] - colorDark[1]) * t)
      const b = Math.round(colorDark[2] + (colorLight[2] - colorDark[2]) * t)
      this.colorPalette.push([r, g, b])
    }
  }
  
  /**
   * Set custom color palette for fullcolor mode
   */
  setColorPalette(colors) {
    this.colorPalette = colors.map(c => [...c])
  }
  
  /**
   * Encode all frames to TXA binary format
   * @returns {ArrayBuffer} - The encoded TXA file
   */
  encode() {
    // Calculate total size
    let totalSize = 32  // Header
    totalSize += this.characters.length  // Character palette
    totalSize += this.colorPalette.length * 3  // Color palette
    
    for (const frame of this.frames) {
      totalSize += 5 + frame.data.length  // Type (1) + Size (4) + Data
    }
    
    const buffer = new ArrayBuffer(totalSize)
    const view = new DataView(buffer)
    const bytes = new Uint8Array(buffer)
    let offset = 0
    
    // Write header
    // Magic "TXA\0"
    bytes[offset++] = 0x54  // T
    bytes[offset++] = 0x58  // X
    bytes[offset++] = 0x41  // A
    bytes[offset++] = 0x00  // \0
    
    // Version
    bytes[offset++] = TXA_VERSION
    
    // ColorMode
    bytes[offset++] = this.colorMode
    
    // Width (uint16 LE)
    view.setUint16(offset, this.width, true)
    offset += 2
    
    // Height (uint16 LE)
    view.setUint16(offset, this.height, true)
    offset += 2
    
    // FPS
    bytes[offset++] = this.fps
    
    // TotalFrames (uint32 LE)
    view.setUint32(offset, this.frames.length, true)
    offset += 4
    
    // CharCount
    bytes[offset++] = this.characters.length
    
    // ColorCount (uint16 LE)
    view.setUint16(offset, this.colorPalette.length, true)
    offset += 2
    
    // BgColor (3 bytes RGB)
    bytes[offset++] = this.bgColor[0]
    bytes[offset++] = this.bgColor[1]
    bytes[offset++] = this.bgColor[2]
    
    // ChangeSpeed (1 byte, 0.1 precision: value * 10)
    bytes[offset++] = Math.round(this.changeSpeed * 10)
    
    // CanvasRatio (1 byte: 0=free, 1=16:9, 2=4:3, 3=1:1, 4=9:16, 5=3:4)
    bytes[offset++] = this.canvasRatio
    
    // Reserved (9 bytes)
    offset += 9
    
    // Write character palette
    for (let i = 0; i < this.characters.length; i++) {
      bytes[offset++] = this.characters.charCodeAt(i)
    }
    
    // Write color palette
    for (const color of this.colorPalette) {
      bytes[offset++] = color[0]
      bytes[offset++] = color[1]
      bytes[offset++] = color[2]
    }
    
    // Write frames
    for (const frame of this.frames) {
      // Frame type
      bytes[offset++] = frame.type
      
      // Data size (uint32 LE)
      view.setUint32(offset, frame.data.length, true)
      offset += 4
      
      // Data
      bytes.set(frame.data, offset)
      offset += frame.data.length
    }
    
    return buffer
  }
  
  /**
   * Reset encoder state for new recording
   */
  reset() {
    this.frames = []
    this.lastKeyframe = null
    this.frameCount = 0
  }
  
  /**
   * Get encoding statistics
   */
  getStats() {
    let totalUncompressed = 0
    let totalCompressed = 0
    let keyframes = 0
    let deltaFrames = 0
    
    const cellSize = this.colorMode === 0 ? 2 : 4
    const frameSize = this.width * this.height * cellSize
    
    for (const frame of this.frames) {
      if (frame.type === 0) {
        keyframes++
        totalUncompressed += frameSize
      } else {
        deltaFrames++
        totalUncompressed += frameSize  // Worst case
      }
      totalCompressed += frame.data.length
    }
    
    return {
      totalFrames: this.frames.length,
      keyframes,
      deltaFrames,
      uncompressedSize: totalUncompressed,
      compressedSize: totalCompressed,
      compressionRatio: totalUncompressed > 0 
        ? ((1 - totalCompressed / totalUncompressed) * 100).toFixed(1) + '%'
        : '0%'
    }
  }
}
