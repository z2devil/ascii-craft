import { TXAEncoder } from './TXAEncoder.js'
import { WebGLRenderTarget, LinearFilter, RGBAFormat } from 'three'

export class ASCIIRecorder {
  constructor(options = {}) {
    this.renderer = options.renderer
    this.asciiEffect = options.asciiEffect
    this.scene = options.scene
    this.camera = options.camera
    this.fps = options.fps || 30
    this.maxFrames = options.maxFrames || 0
    this.colorMode = options.colorMode || 0
    this.changeSpeed = options.changeSpeed || 2.0
    this.canvasRatio = options.canvasRatio || 0
    
    this.encoder = null
    this.isRecording = false
    this.frameInterval = null
    this.recordedFrames = 0
    this.startTime = 0
    
    this.captureTarget = null
    
    this.onFrame = options.onFrame || (() => {})
    this.onComplete = options.onComplete || (() => {})
  }

  start() {
    if (this.isRecording) return
    
    const canvas = this.renderer.domElement
    const cellSize = this.asciiEffect.cellSize
    
    const width = Math.floor(canvas.width / cellSize)
    const height = Math.floor(canvas.height / cellSize)
    
    this.captureTarget = new WebGLRenderTarget(canvas.width, canvas.height, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      format: RGBAFormat
    })
    
    const colors = this.buildColorPalette()
    const bgColor = this.asciiEffect.uniforms.get('uBgColor').value
    
    this.encoder = new TXAEncoder({
      width,
      height,
      fps: this.fps,
      colorMode: this.colorMode,
      characters: this.asciiEffect._backgroundChar + this.asciiEffect._patternChars,
      keyframeInterval: this.fps,
      bgColor: [
        Math.round(bgColor.r * 255),
        Math.round(bgColor.g * 255),
        Math.round(bgColor.b * 255)
      ],
      changeSpeed: this.changeSpeed,
      canvasRatio: this.canvasRatio
    })
    
    if (this.colorMode === 0) {
      this.encoder.colorPalette = colors
    } else {
      this.encoder.setColorPalette(colors)
    }
    
    this.isRecording = true
    this.recordedFrames = 0
    this.startTime = performance.now()
    
    const frameTime = 1000 / this.fps
    this.frameInterval = setInterval(() => this.captureFrame(), frameTime)
  }

  stop() {
    if (!this.isRecording) return null
    
    this.isRecording = false
    
    if (this.frameInterval) {
      clearInterval(this.frameInterval)
      this.frameInterval = null
    }
    
    if (this.captureTarget) {
      this.captureTarget.dispose()
      this.captureTarget = null
    }
    
    const buffer = this.encoder.encode()
    const stats = this.encoder.getStats()
    
    this.onComplete({ buffer, stats })
    
    return { buffer, stats }
  }

  captureFrame() {
    if (!this.isRecording || !this.scene || !this.camera) return
    
    const canvas = this.renderer.domElement
    const cellSize = this.asciiEffect.cellSize
    
    const width = Math.floor(canvas.width / cellSize)
    const height = Math.floor(canvas.height / cellSize)
    
    this.renderer.setRenderTarget(this.captureTarget)
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)
    
    const pixelData = new Uint8Array(canvas.width * canvas.height * 4)
    this.renderer.readRenderTargetPixels(this.captureTarget, 0, 0, canvas.width, canvas.height, pixelData)
    
    const gridData = this.extractGridData(pixelData, canvas.width, canvas.height, width, height, cellSize)
    
    this.encoder.addFrame(gridData)
    this.recordedFrames++
    
    this.onFrame({
      frame: this.recordedFrames,
      elapsed: performance.now() - this.startTime
    })
    
    if (this.maxFrames > 0 && this.recordedFrames >= this.maxFrames) {
      this.onComplete()
    }
  }

  extractGridData(pixelData, canvasWidth, canvasHeight, gridWidth, gridHeight, cellSize) {
    const grid = []
    const allChars = this.asciiEffect._backgroundChar + this.asciiEffect._patternChars
    
    for (let gx = 0; gx < gridWidth; gx++) {
      grid[gx] = []
      
      for (let gy = 0; gy < gridHeight; gy++) {
        const centerX = Math.floor(gx * cellSize + cellSize / 2)
        const centerY = Math.floor(gy * cellSize + cellSize / 2)
        
        const flippedY = canvasHeight - 1 - centerY
        const pixelIndex = (flippedY * canvasWidth + centerX) * 4
        
        const r = pixelData[pixelIndex]
        const g = pixelData[pixelIndex + 1]
        const b = pixelData[pixelIndex + 2]
        
        const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
        
        let charIndex = 0
        if (luminance > 12) {
          const patternCount = allChars.length - 1
          if (patternCount > 0) {
            charIndex = 1 + Math.floor(Math.random() * patternCount)
          }
        }
        
        if (this.colorMode === 0) {
          grid[gx][gy] = [charIndex, luminance]
        } else {
          grid[gx][gy] = [charIndex, r, g, b]
        }
      }
    }
    
    return grid
  }

  buildColorPalette() {
    const colorDark = this.asciiEffect.uniforms.get('uColorDark').value
    const colorLight = this.asciiEffect.uniforms.get('uColorLight').value
    
    const colors = []
    for (let i = 0; i < 256; i++) {
      const t = i / 255
      colors.push([
        Math.round(colorDark.r * 255 + (colorLight.r - colorDark.r) * 255 * t),
        Math.round(colorDark.g * 255 + (colorLight.g - colorDark.g) * 255 * t),
        Math.round(colorDark.b * 255 + (colorLight.b - colorDark.b) * 255 * t)
      ])
    }
    return colors
  }

  downloadTXA(filename = 'animation.txa') {
    const result = this.stop()
    if (!result) return
    
    const blob = new Blob([result.buffer], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    
    URL.revokeObjectURL(url)
    
    return result.stats
  }

  get duration() {
    return this.recordedFrames / this.fps
  }

  get frameCount() {
    return this.recordedFrames
  }
}
