/**
 * TXA (Text Animation) Decoder
 * See TXAEncoder.js for file format specification
 */

const TXA_MAGIC = 'TXA\0'

function rleDecode(data, expectedSize) {
  const result = []
  let i = 0
  
  while (i < data.length && result.length < expectedSize) {
    const marker = data[i++]
    
    if (marker === 255) {
      const count = data[i++]
      const value = data[i++]
      for (let j = 0; j < count && result.length < expectedSize; j++) {
        result.push(value)
      }
    } else {
      const literalCount = marker
      for (let j = 0; j < literalCount && i < data.length && result.length < expectedSize; j++) {
        result.push(data[i++])
      }
    }
  }
  
  return new Uint8Array(result)
}

export class TXADecoder {
  constructor() {
    this.header = null
    this.characters = ''
    this.colorPalette = []
    this.frames = []
    this.currentFrameIndex = 0
    this.currentGrid = null
  }

  parse(buffer) {
    const view = new DataView(buffer)
    const bytes = new Uint8Array(buffer)
    let offset = 0

    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
    if (magic !== TXA_MAGIC) {
      throw new Error('Invalid TXA file: wrong magic number')
    }
    offset = 4

    this.header = {
      version: bytes[offset++],
      colorMode: bytes[offset++],
      width: view.getUint16(offset, true),
      height: view.getUint16(offset + 2, true),
      fps: bytes[offset + 4],
      totalFrames: view.getUint32(offset + 5, true),
      charCount: bytes[offset + 9],
      colorCount: view.getUint16(offset + 10, true),
      bgColor: [bytes[offset + 12], bytes[offset + 13], bytes[offset + 14]],
      changeSpeed: bytes[offset + 15] / 10,
      canvasRatio: bytes[offset + 16]
    }
    offset += 12 + 14

    this.characters = ''
    for (let i = 0; i < this.header.charCount; i++) {
      this.characters += String.fromCharCode(bytes[offset++])
    }

    this.colorPalette = []
    for (let i = 0; i < this.header.colorCount; i++) {
      this.colorPalette.push([
        bytes[offset++],
        bytes[offset++],
        bytes[offset++]
      ])
    }

    this.frames = []
    for (let i = 0; i < this.header.totalFrames; i++) {
      const frameType = bytes[offset++]
      const dataSize = view.getUint32(offset, true)
      offset += 4
      
      const data = bytes.slice(offset, offset + dataSize)
      offset += dataSize
      
      this.frames.push({ type: frameType, data })
    }

    this.initGrid()
    
    return this.header
  }

  initGrid() {
    const { width, height, colorMode } = this.header
    const cellSize = colorMode === 0 ? 2 : 4
    
    this.currentGrid = []
    for (let x = 0; x < width; x++) {
      this.currentGrid[x] = []
      for (let y = 0; y < height; y++) {
        this.currentGrid[x][y] = cellSize === 2 ? [0, 0] : [0, 0, 0, 0]
      }
    }
    
    this.currentFrameIndex = -1
  }

  getFrame(index) {
    if (index < 0 || index >= this.frames.length) return null
    
    if (index < this.currentFrameIndex) {
      this.initGrid()
    }

    while (this.currentFrameIndex < index) {
      this.currentFrameIndex++
      this.applyFrame(this.currentFrameIndex)
    }
    
    return this.currentGrid
  }

  applyFrame(index) {
    const frame = this.frames[index]
    const { width, height, colorMode } = this.header
    const cellSize = colorMode === 0 ? 2 : 4
    
    if (frame.type === 0) {
      const expectedSize = width * height * cellSize
      const decompressed = rleDecode(frame.data, expectedSize)
      
      let i = 0
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (cellSize === 2) {
            this.currentGrid[x][y] = [decompressed[i], decompressed[i + 1]]
          } else {
            this.currentGrid[x][y] = [
              decompressed[i], decompressed[i + 1],
              decompressed[i + 2], decompressed[i + 3]
            ]
          }
          i += cellSize
        }
      }
    } else {
      const changeCount = (frame.data[0] << 8) | frame.data[1]
      
      if (changeCount === 0) return
      
      const deltaData = rleDecode(
        frame.data.slice(2),
        changeCount * (2 + cellSize)
      )
      
      let i = 0
      for (let c = 0; c < changeCount; c++) {
        const x = deltaData[i++]
        const y = deltaData[i++]
        
        if (x < width && y < height) {
          if (cellSize === 2) {
            this.currentGrid[x][y] = [deltaData[i], deltaData[i + 1]]
          } else {
            this.currentGrid[x][y] = [
              deltaData[i], deltaData[i + 1],
              deltaData[i + 2], deltaData[i + 3]
            ]
          }
        }
        i += cellSize
      }
    }
  }

  getCharacter(index) {
    return this.characters[index] || ' '
  }

  getColor(luminanceOrIndex) {
    if (luminanceOrIndex < this.colorPalette.length) {
      return this.colorPalette[luminanceOrIndex]
    }
    return [255, 255, 255]
  }

  get width() { return this.header?.width || 0 }
  get height() { return this.header?.height || 0 }
  get fps() { return this.header?.fps || 30 }
  get totalFrames() { return this.frames.length }
  get colorMode() { return this.header?.colorMode || 0 }
  get duration() { return this.totalFrames / this.fps }
  get bgColor() { return this.header?.bgColor || [0, 0, 0] }
  get changeSpeed() { return this.header?.changeSpeed || 2.0 }
  get canvasRatio() { return this.header?.canvasRatio || 0 }
}
