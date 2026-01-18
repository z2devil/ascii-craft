import { TXADecoder } from './TXADecoder.js'

export class ASCIIPlayer {
  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.decoder = new TXADecoder()
    
    this.cellSize = options.cellSize || 16
    this.renderScale = options.renderScale || 1.0
    this.fontFamily = options.fontFamily || 'monospace'
    this.bgColor = options.bgColor || '#000000'
    this.changeSpeed = options.changeSpeed || 2.0
    this.canvasRatio = options.canvasRatio || 0
    
    this.coverOffsetX = 0
    this.coverOffsetY = 0
    this.coverScale = 1.0
    
    this.isPlaying = false
    this.isLoaded = false
    this.currentFrame = 0
    this.lastFrameTime = 0
    this.animationId = null
    this.charChangeTime = 0
    
    this.charAtlas = null
    this.atlasCanvas = null
    this.coloredAtlasCache = new Map()
    this.customCharacters = null
    
    this.colorOverride = false
    this.overrideColorDark = [0, 51, 0]
    this.overrideColorLight = [0, 255, 0]
    
    this.onFrameChange = options.onFrameChange || (() => {})
    this.onPlayStateChange = options.onPlayStateChange || (() => {})
  }

  async load(buffer) {
    this.decoder.parse(buffer)
    
    const bg = this.decoder.bgColor
    this.bgColor = `rgb(${bg[0]},${bg[1]},${bg[2]})`
    this.changeSpeed = this.decoder.changeSpeed
    this.canvasRatio = this.decoder.canvasRatio
    
    this.buildCharacterAtlas()
    this.resizeCanvas()
    this.coloredAtlasCache.clear()
    this.isLoaded = true
    this.currentFrame = 0
    this.renderFrame(0)
  }

  async loadFromFile(file) {
    const buffer = await file.arrayBuffer()
    await this.load(buffer)
  }

  async loadFromURL(url) {
    const response = await fetch(url)
    const buffer = await response.arrayBuffer()
    await this.load(buffer)
  }

  buildCharacterAtlas() {
    const chars = this.customCharacters || this.decoder.characters
    if (!chars || chars.length === 0) {
      console.error('No characters available')
      return
    }
    
    const size = Math.max(this.cellSize * 2, 32)
    
    this.atlasCanvas = document.createElement('canvas')
    this.atlasCanvas.width = size * chars.length
    this.atlasCanvas.height = size
    
    const ctx = this.atlasCanvas.getContext('2d')
    ctx.clearRect(0, 0, this.atlasCanvas.width, this.atlasCanvas.height)
    
    ctx.font = `bold ${size * 0.85}px ${this.fontFamily}`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], i * size + size / 2, size / 2)
    }
    
    this.charAtlas = {
      canvas: this.atlasCanvas,
      charWidth: size,
      charHeight: size,
      charCount: chars.length
    }
  }

  resizeCanvas() {
    const baseCellSize = 16
    this.cellSize = Math.round(baseCellSize * this.renderScale)
    
    const contentWidth = this.decoder.width * this.cellSize
    const contentHeight = this.decoder.height * this.cellSize
    
    const RATIOS = [0, 16/9, 4/3, 1, 9/16, 3/4]
    const targetRatio = RATIOS[this.canvasRatio] || 0
    
    if (targetRatio === 0) {
      this.canvas.width = contentWidth
      this.canvas.height = contentHeight
      this.coverOffsetX = 0
      this.coverOffsetY = 0
      this.coverScale = 1.0
    } else {
      const contentRatio = contentWidth / contentHeight
      let canvasWidth, canvasHeight
      
      if (contentRatio > targetRatio) {
        canvasWidth = contentWidth
        canvasHeight = Math.round(contentWidth / targetRatio)
      } else {
        canvasHeight = contentHeight
        canvasWidth = Math.round(contentHeight * targetRatio)
      }
      
      this.canvas.width = canvasWidth
      this.canvas.height = canvasHeight
      
      this.coverOffsetX = (canvasWidth - contentWidth) / 2
      this.coverOffsetY = (canvasHeight - contentHeight) / 2
      this.coverScale = 1.0
    }
  }

  getColoredAtlas(r, g, b) {
    const key = (r << 16) | (g << 8) | b
    
    if (this.coloredAtlasCache.has(key)) {
      return this.coloredAtlasCache.get(key)
    }
    
    const { canvas: atlas } = this.charAtlas
    
    const coloredCanvas = document.createElement('canvas')
    coloredCanvas.width = atlas.width
    coloredCanvas.height = atlas.height
    const coloredCtx = coloredCanvas.getContext('2d')
    
    coloredCtx.drawImage(atlas, 0, 0)
    
    coloredCtx.globalCompositeOperation = 'source-in'
    coloredCtx.fillStyle = `rgb(${r},${g},${b})`
    coloredCtx.fillRect(0, 0, coloredCanvas.width, coloredCanvas.height)
    coloredCtx.globalCompositeOperation = 'source-over'
    
    if (this.coloredAtlasCache.size > 256) {
      const firstKey = this.coloredAtlasCache.keys().next().value
      this.coloredAtlasCache.delete(firstKey)
    }
    
    this.coloredAtlasCache.set(key, coloredCanvas)
    return coloredCanvas
  }

  renderFrame(frameIndex) {
    if (!this.isLoaded) return
    
    const grid = this.decoder.getFrame(frameIndex)
    if (!grid) return
    
    const ctx = this.ctx
    const { width, height, colorMode, version } = this.decoder
    const cellSize = this.cellSize * this.coverScale
    const { charWidth, charHeight, charCount } = this.charAtlas
    const offsetX = this.coverOffsetX
    const offsetY = this.coverOffsetY
    
    ctx.fillStyle = this.bgColor
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    
    const chars = this.customCharacters || this.decoder.characters
    const numChars = chars.length
    
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const drawX = offsetX + x * cellSize
        const drawY = offsetY + y * cellSize
        
        if (drawX + cellSize < 0 || drawX > this.canvas.width ||
            drawY + cellSize < 0 || drawY > this.canvas.height) {
          continue
        }
        
        const cell = grid[x][y]
        
        let r, g, b, alpha, luminance
        
        if (version >= 2) {
          if (colorMode === 0) {
            luminance = cell[0]
            const overrideColor = this.getOverrideColor(luminance)
            if (overrideColor) {
              r = overrideColor[0]
              g = overrideColor[1]
              b = overrideColor[2]
            } else {
              const color = this.decoder.getColor(luminance)
              r = color[0]
              g = color[1]
              b = color[2]
            }
            alpha = luminance / 255
          } else {
            r = cell[0]
            g = cell[1]
            b = cell[2]
            luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
            alpha = luminance / 255
          }
        } else {
          if (colorMode === 0) {
            luminance = cell[1]
            const overrideColor = this.getOverrideColor(luminance)
            if (overrideColor) {
              r = overrideColor[0]
              g = overrideColor[1]
              b = overrideColor[2]
            } else {
              const color = this.decoder.getColor(luminance)
              r = color[0]
              g = color[1]
              b = color[2]
            }
            alpha = luminance / 255
          } else {
            r = cell[1]
            g = cell[2]
            b = cell[3]
            luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
            alpha = luminance / 255
          }
        }
        
        if (alpha < 0.05) continue
        
        let charIndex = 0
        if (luminance > 12 && numChars > 1) {
          const timeStep = Math.floor(this.charChangeTime * this.changeSpeed)
          const cellSeed = (x * 78.233 + y * 12.9898) % 1000
          const randVal = Math.abs(Math.sin(cellSeed + timeStep) * 43758.5453) % 1
          const patternCount = numChars - 1
          charIndex = 1 + Math.floor(randVal * patternCount)
        }
        
        const coloredAtlas = this.getColoredAtlas(r, g, b)
        
        ctx.globalAlpha = alpha
        ctx.drawImage(
          coloredAtlas,
          charIndex * charWidth, 0, charWidth, charHeight,
          drawX, drawY, cellSize, cellSize
        )
      }
    }
    
    ctx.globalAlpha = 1
    this.currentFrame = frameIndex
    this.onFrameChange(frameIndex)
  }

  play() {
    if (!this.isLoaded || this.isPlaying) return
    
    this.isPlaying = true
    this.lastFrameTime = performance.now()
    this.onPlayStateChange(true)
    
    this.animate()
  }

  pause() {
    this.isPlaying = false
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
    
    this.onPlayStateChange(false)
  }

  stop() {
    this.pause()
    this.currentFrame = 0
    this.renderFrame(0)
  }

  toggle() {
    if (this.isPlaying) {
      this.pause()
    } else {
      this.play()
    }
  }

  seek(frameIndex) {
    const clampedFrame = Math.max(0, Math.min(frameIndex, this.decoder.totalFrames - 1))
    this.renderFrame(clampedFrame)
  }

  seekToTime(time) {
    const frame = Math.floor(time * this.decoder.fps)
    this.seek(frame)
  }

  animate() {
    if (!this.isPlaying) return
    
    const now = performance.now()
    const frameTime = 1000 / this.decoder.fps
    const elapsed = now - this.lastFrameTime
    
    if (elapsed >= frameTime) {
      this.lastFrameTime = now - (elapsed % frameTime)
      this.charChangeTime = now / 1000
      
      let nextFrame = this.currentFrame + 1
      if (nextFrame >= this.decoder.totalFrames) {
        nextFrame = 0
      }
      
      this.renderFrame(nextFrame)
    } else if (this.changeSpeed > 0) {
      this.charChangeTime = now / 1000
      this.renderFrame(this.currentFrame)
    }
    
    this.animationId = requestAnimationFrame(() => this.animate())
  }

  setCellSize(size) {
    this.cellSize = size
    if (this.isLoaded) {
      this.buildCharacterAtlas()
      this.coloredAtlasCache.clear()
      this.resizeCanvas()
      this.renderFrame(this.currentFrame)
    }
  }

  setRenderScale(scale) {
    this.renderScale = scale
    if (this.isLoaded) {
      this.buildCharacterAtlas()
      this.coloredAtlasCache.clear()
      this.resizeCanvas()
      this.renderFrame(this.currentFrame)
    }
  }

  setChangeSpeed(speed) {
    this.changeSpeed = speed
    if (this.isLoaded && !this.isPlaying) {
      this.renderFrame(this.currentFrame)
    }
  }

  setCanvasRatio(ratio) {
    this.canvasRatio = ratio
    if (this.isLoaded) {
      this.resizeCanvas()
      this.renderFrame(this.currentFrame)
    }
  }

  setFontFamily(fontFamily) {
    this.fontFamily = fontFamily
    if (this.isLoaded) {
      this.buildCharacterAtlas()
      this.coloredAtlasCache.clear()
      this.renderFrame(this.currentFrame)
    }
  }

  setBgColor(color) {
    this.bgColor = color
    if (this.isLoaded) {
      this.renderFrame(this.currentFrame)
    }
  }

  setColors(colorDark, colorLight) {
    this.colorOverride = true
    this.overrideColorDark = this.hexToRgb(colorDark)
    this.overrideColorLight = this.hexToRgb(colorLight)
    this.coloredAtlasCache.clear()
    if (this.isLoaded) {
      this.renderFrame(this.currentFrame)
    }
  }

  setCharacters(chars) {
    if (!chars || chars.length === 0) return
    this.customCharacters = chars
    if (this.isLoaded) {
      this.buildCharacterAtlas()
      this.coloredAtlasCache.clear()
      this.renderFrame(this.currentFrame)
    }
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : [0, 0, 0]
  }

  getOverrideColor(luminance) {
    if (!this.colorOverride) return null
    const t = luminance / 255
    return [
      Math.round(this.overrideColorDark[0] + (this.overrideColorLight[0] - this.overrideColorDark[0]) * t),
      Math.round(this.overrideColorDark[1] + (this.overrideColorLight[1] - this.overrideColorDark[1]) * t),
      Math.round(this.overrideColorDark[2] + (this.overrideColorLight[2] - this.overrideColorDark[2]) * t)
    ]
  }

  get duration() { return this.decoder.duration }
  get totalFrames() { return this.decoder.totalFrames }
  get fps() { return this.decoder.fps }
  get width() { return this.decoder.width }
  get height() { return this.decoder.height }
  get currentTime() { return this.currentFrame / this.decoder.fps }
  get progress() { return this.totalFrames > 0 ? this.currentFrame / this.totalFrames : 0 }
}
