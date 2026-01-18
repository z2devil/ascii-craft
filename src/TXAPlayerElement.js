import { ASCIIPlayer } from './ASCIIPlayer.js'

class TXAPlayerElement extends HTMLElement {
  static get observedAttributes() {
    return [
      'src',
      'autoplay',
      'loop',
      'render-scale',
      'change-speed',
      'font-family',
      'bg-color',
      'color-dark',
      'color-light',
      'characters',
      'canvas-ratio'
    ]
  }

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          position: relative;
          background: #000;
          overflow: hidden;
        }
        canvas {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
      </style>
      <canvas></canvas>
    `
    
    this._canvas = this.shadowRoot.querySelector('canvas')
    this._player = null
    this._loop = false
    this._autoplay = false
  }

  connectedCallback() {
    this._player = new ASCIIPlayer(this._canvas, {
      onFrameChange: () => {
        this.dispatchEvent(new CustomEvent('timeupdate', {
          detail: {
            currentTime: this._player.currentTime,
            progress: this._player.progress,
            currentFrame: this._player.currentFrame
          }
        }))
      },
      onPlayStateChange: (playing) => {
        this.dispatchEvent(new CustomEvent(playing ? 'play' : 'pause'))
      }
    })

    this._player.onComplete = () => {
      if (this._loop) {
        this._player.seek(0)
        this._player.play()
      } else {
        this.dispatchEvent(new CustomEvent('ended'))
      }
    }

    const originalAnimate = this._player.animate.bind(this._player)
    this._player.animate = () => {
      if (!this._player.isPlaying) return
      
      const now = performance.now()
      const frameTime = 1000 / this._player.decoder.fps
      const elapsed = now - this._player.lastFrameTime
      
      if (elapsed >= frameTime) {
        this._player.lastFrameTime = now - (elapsed % frameTime)
        this._player.charChangeTime = now / 1000
        
        let nextFrame = this._player.currentFrame + 1
        if (nextFrame >= this._player.decoder.totalFrames) {
          if (this._loop) {
            nextFrame = 0
          } else {
            this._player.pause()
            this.dispatchEvent(new CustomEvent('ended'))
            return
          }
        }
        
        this._player.renderFrame(nextFrame)
      } else if (this._player.changeSpeed > 0) {
        this._player.charChangeTime = now / 1000
        this._player.renderFrame(this._player.currentFrame)
      }
      
      this._player.animationId = requestAnimationFrame(() => this._player.animate())
    }

    if (this.hasAttribute('src')) {
      this._loadSrc(this.getAttribute('src'))
    }
  }

  disconnectedCallback() {
    if (this._player) {
      this._player.pause()
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this._player) return
    
    switch (name) {
      case 'src':
        if (newValue) this._loadSrc(newValue)
        break
      case 'autoplay':
        this._autoplay = newValue !== null
        break
      case 'loop':
        this._loop = newValue !== null
        break
      case 'render-scale':
        this._player.setRenderScale(parseFloat(newValue) || 1.0)
        break
      case 'change-speed':
        this._player.setChangeSpeed(parseFloat(newValue) || 2.0)
        break
      case 'font-family':
        this._player.setFontFamily(newValue || 'monospace')
        break
      case 'bg-color':
        this._player.setBgColor(newValue || '#000000')
        break
      case 'color-dark':
      case 'color-light':
        this._updateColors()
        break
      case 'characters':
        if (newValue) this._player.setCharacters(newValue)
        break
      case 'canvas-ratio':
        this._player.setCanvasRatio(parseInt(newValue) || 0)
        break
    }
  }

  _updateColors() {
    const dark = this.getAttribute('color-dark')
    const light = this.getAttribute('color-light')
    if (dark && light) {
      this._player.setColors(dark, light)
    }
  }

  async _loadSrc(src) {
    if (!this._player) return
    
    try {
      this.dispatchEvent(new CustomEvent('loadstart'))
      await this._player.loadFromURL(src)
      this.dispatchEvent(new CustomEvent('loadeddata', {
        detail: {
          duration: this._player.duration,
          totalFrames: this._player.totalFrames,
          fps: this._player.fps,
          width: this._player.width,
          height: this._player.height
        }
      }))
      
      this._applyAttributes()
      
      if (this._autoplay || this.hasAttribute('autoplay')) {
        this._player.play()
      }
    } catch (err) {
      this.dispatchEvent(new CustomEvent('error', { detail: err }))
    }
  }

  _applyAttributes() {
    if (this.hasAttribute('render-scale')) {
      this._player.setRenderScale(parseFloat(this.getAttribute('render-scale')))
    }
    if (this.hasAttribute('change-speed')) {
      this._player.setChangeSpeed(parseFloat(this.getAttribute('change-speed')))
    }
    if (this.hasAttribute('font-family')) {
      this._player.setFontFamily(this.getAttribute('font-family'))
    }
    if (this.hasAttribute('bg-color')) {
      this._player.setBgColor(this.getAttribute('bg-color'))
    }
    if (this.hasAttribute('characters')) {
      this._player.setCharacters(this.getAttribute('characters'))
    }
    if (this.hasAttribute('canvas-ratio')) {
      this._player.setCanvasRatio(parseInt(this.getAttribute('canvas-ratio')))
    }
    this._updateColors()
    this._loop = this.hasAttribute('loop')
    this._autoplay = this.hasAttribute('autoplay')
  }

  play() {
    this._player?.play()
  }

  pause() {
    this._player?.pause()
  }

  stop() {
    this._player?.stop()
  }

  toggle() {
    this._player?.toggle()
  }

  seek(frame) {
    this._player?.seek(frame)
  }

  seekToTime(time) {
    this._player?.seekToTime(time)
  }

  get duration() { return this._player?.duration || 0 }
  get totalFrames() { return this._player?.totalFrames || 0 }
  get fps() { return this._player?.fps || 0 }
  get width() { return this._player?.width || 0 }
  get height() { return this._player?.height || 0 }
  get currentTime() { return this._player?.currentTime || 0 }
  get progress() { return this._player?.progress || 0 }
  get paused() { return !this._player?.isPlaying }
  get ended() { return this._player?.currentFrame >= this._player?.totalFrames - 1 }
  
  get loop() { return this._loop }
  set loop(value) {
    this._loop = value
    if (value) {
      this.setAttribute('loop', '')
    } else {
      this.removeAttribute('loop')
    }
  }

  get src() { return this.getAttribute('src') }
  set src(value) {
    if (value) {
      this.setAttribute('src', value)
    } else {
      this.removeAttribute('src')
    }
  }

  get renderScale() { return this._player?.renderScale || 1.0 }
  set renderScale(value) {
    this.setAttribute('render-scale', value)
  }

  get changeSpeed() { return this._player?.changeSpeed || 2.0 }
  set changeSpeed(value) {
    this.setAttribute('change-speed', value)
  }
}

customElements.define('txa-player', TXAPlayerElement)

export { TXAPlayerElement }
