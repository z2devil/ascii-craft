import * as THREE from 'three'
import { EffectComposer, RenderPass, EffectPass } from 'postprocessing'
import { ASCIIEffect } from './ASCIIEffect.js'
import { ASCIIRecorder } from './ASCIIRecorder.js'
import { ASCIIPlayer } from './ASCIIPlayer.js'

class ASCIICraft {
  constructor() {
    this.container = document.getElementById('canvas-container')
    this.stats = document.getElementById('stats')
    this.dropZone = document.getElementById('drop-zone')
    
    this.frameCount = 0
    this.lastTime = performance.now()
    this.lastRenderTime = 0
    this.targetFPS = 60
    this.currentSource = 'demo'
    
    this.mediaTexture = null
    this.videoElement = null
    this.webcamStream = null
    
    this.recorder = null
    this.player = null
    this.isPlayerMode = false
    
    this.init()
    this.setupControls()
    this.setupRecordingControls()
    this.setupPlayerControls()
    this.setupDragDrop()
    this.animate()
  }
  
  init() {
    const width = window.innerWidth
    const height = window.innerHeight
    
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x000000)
    
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    this.camera.position.z = 1
    
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.container.appendChild(this.renderer.domElement)
    
    this.asciiEffect = new ASCIIEffect({
      backgroundChar: ' ',
      patternChars: '0123456789ABCDEF',
      cellSize: 16,
      fontFamily: 'monospace',
      colorDark: '#003300',
      colorLight: '#00ff00',
      bgColor: '#000000',
      hueShift: 0,
      saturation: 1,
      invert: false,
      colorMode: false,
      changeSpeed: 2.0,
      inputBlack: 0,
      inputWhite: 1,
      gamma: 1,
      contrast: 1
    })
    
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    
    this.effectPass = new EffectPass(this.camera, this.asciiEffect)
    this.composer.addPass(this.effectPass)
    
    this.setupDemoScene()
    
    window.addEventListener('resize', () => this.onResize())
  }
  
  setupDemoScene() {
    this.clearScene()
    
    const ambientLight = new THREE.AmbientLight(0x404040)
    this.scene.add(ambientLight)
    
    const light = new THREE.PointLight(0xffffff, 100)
    light.position.set(5, 5, 5)
    this.scene.add(light)
    
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshPhongMaterial({ color: 0xffffff })
    this.demoCube = new THREE.Mesh(geometry, material)
    this.scene.add(this.demoCube)
    
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100)
    this.camera.position.z = 2
    
    this.composer.passes[0] = new RenderPass(this.scene, this.camera)
    this.effectPass.mainCamera = this.camera
  }
  
  setupMediaScene(texture) {
    this.clearScene()
    
    this.mediaTexture = texture
    const image = texture.image
    const mediaWidth = image.videoWidth || image.width
    const mediaHeight = image.videoHeight || image.height
    
    if (!mediaWidth || !mediaHeight) {
      console.warn('Media dimensions not available yet')
      return
    }
    
    this.updateMediaPlane()
  }
  
  updateMediaPlane() {
    if (!this.mediaTexture) return
    
    const image = this.mediaTexture.image
    const mediaWidth = image.videoWidth || image.width
    const mediaHeight = image.videoHeight || image.height
    
    if (!mediaWidth || !mediaHeight) return
    
    if (this.mediaPlane) {
      this.scene.remove(this.mediaPlane)
      this.mediaPlane.geometry.dispose()
      this.mediaPlane.material.dispose()
    }
    
    const canvasWidth = this.renderer.domElement.width
    const canvasHeight = this.renderer.domElement.height
    
    const mediaRatio = mediaWidth / mediaHeight
    const canvasRatio = canvasWidth / canvasHeight
    
    let planeWidth, planeHeight
    
    if (mediaRatio > canvasRatio) {
      planeWidth = 2
      planeHeight = 2 * canvasRatio / mediaRatio
    } else {
      planeHeight = 2
      planeWidth = 2 * mediaRatio / canvasRatio
    }
    
    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight)
    const material = new THREE.MeshBasicMaterial({ map: this.mediaTexture })
    this.mediaPlane = new THREE.Mesh(geometry, material)
    this.scene.add(this.mediaPlane)
    
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    this.camera.position.z = 1
    
    this.composer.passes[0] = new RenderPass(this.scene, this.camera)
    this.effectPass.mainCamera = this.camera
  }
  
  clearScene() {
    while (this.scene.children.length > 0) {
      const obj = this.scene.children[0]
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose()
        obj.material.dispose()
      }
      this.scene.remove(obj)
    }
    
    this.demoCube = null
    this.mediaPlane = null
    this.mediaTexture = null
  }
  
  loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const loader = new THREE.TextureLoader()
      loader.load(
        url,
        (texture) => {
          URL.revokeObjectURL(url)
          texture.minFilter = THREE.LinearFilter
          texture.magFilter = THREE.LinearFilter
          resolve(texture)
        },
        undefined,
        reject
      )
    })
  }
  
  loadVideo(file) {
    return new Promise((resolve) => {
      if (this.videoElement) {
        this.videoElement.pause()
        this.videoElement.srcObject = null
        this.videoElement.src = ''
      }
      
      this.videoElement = document.createElement('video')
      this.videoElement.playsInline = true
      this.videoElement.muted = true
      this.videoElement.loop = true
      this.videoElement.src = URL.createObjectURL(file)
      
      this.videoElement.addEventListener('loadeddata', () => {
        this.videoElement.play()
        const texture = new THREE.VideoTexture(this.videoElement)
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        resolve(texture)
      })
    })
  }
  
  async startWebcam() {
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(track => track.stop())
    }
    
    try {
      this.webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 1280, height: 720 }
      })
      
      if (!this.videoElement) {
        this.videoElement = document.createElement('video')
      }
      
      this.videoElement.playsInline = true
      this.videoElement.muted = true
      this.videoElement.srcObject = this.webcamStream
      
      return new Promise((resolve) => {
        this.videoElement.addEventListener('loadeddata', () => {
          this.videoElement.play()
          const texture = new THREE.VideoTexture(this.videoElement)
          texture.minFilter = THREE.LinearFilter
          texture.magFilter = THREE.LinearFilter
          resolve(texture)
        })
      })
    } catch (error) {
      console.error('Webcam access denied:', error)
      throw error
    }
  }
  
  stopWebcam() {
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(track => track.stop())
      this.webcamStream = null
    }
  }
  
  stopVideo() {
    if (this.videoElement) {
      this.videoElement.pause()
      if (this.videoElement.src) {
        URL.revokeObjectURL(this.videoElement.src)
      }
      this.videoElement.srcObject = null
      this.videoElement.src = ''
    }
  }
  
  async setSource(source, file = null) {
    this.currentSource = source
    
    this.stopWebcam()
    this.stopVideo()
    
    const fileUpload = document.getElementById('file-upload')
    
    switch (source) {
      case 'demo':
        fileUpload.style.display = 'none'
        this.setupDemoScene()
        break
        
      case 'image':
        fileUpload.style.display = 'block'
        if (file) {
          const texture = await this.loadImage(file)
          this.setupMediaScene(texture)
        }
        break
        
      case 'video':
        fileUpload.style.display = 'block'
        if (file) {
          const texture = await this.loadVideo(file)
          this.setupMediaScene(texture)
        }
        break
        
      case 'webcam':
        fileUpload.style.display = 'none'
        try {
          const texture = await this.startWebcam()
          this.setupMediaScene(texture)
        } catch {
          document.getElementById('source-select').value = 'demo'
          this.setSource('demo')
        }
        break
    }
  }
  
  setupControls() {
    const sourceSelect = document.getElementById('source-select')
    const fileInput = document.getElementById('file-input')
    const targetFpsInput = document.getElementById('target-fps')
    const cellSizeInput = document.getElementById('cell-size')
    const canvasRatioSelect = document.getElementById('canvas-ratio')
    const fontFamilySelect = document.getElementById('font-family')
    const bgCharInput = document.getElementById('bg-char')
    const patternCharsInput = document.getElementById('pattern-chars')
    const changeSpeedInput = document.getElementById('change-speed')
    
    const inputBlackInput = document.getElementById('input-black')
    const inputWhiteInput = document.getElementById('input-white')
    const gammaInput = document.getElementById('gamma')
    const contrastInput = document.getElementById('contrast')
    
    const colorDarkInput = document.getElementById('color-dark')
    const colorLightInput = document.getElementById('color-light')
    const hueShiftInput = document.getElementById('hue-shift')
    const saturationInput = document.getElementById('saturation')
    const bgColorInput = document.getElementById('bg-color')
    
    const invertInput = document.getElementById('invert')
    const colorModeInput = document.getElementById('color-mode')
    
    this.canvasRatio = 0
    
    sourceSelect.addEventListener('change', (e) => {
      this.setSource(e.target.value)
    })
    
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0]
      if (!file) return
      
      const isVideo = file.type.startsWith('video/')
      const source = isVideo ? 'video' : 'image'
      
      sourceSelect.value = source
      await this.setSource(source, file)
    })
    
    targetFpsInput.addEventListener('input', (e) => {
      const value = parseInt(e.target.value)
      this.targetFPS = value
      document.getElementById('target-fps-value').textContent = value
    })
    
    cellSizeInput.addEventListener('input', (e) => {
      const value = parseInt(e.target.value)
      this.asciiEffect.cellSize = value
      document.getElementById('cell-size-value').textContent = value
    })
    
    canvasRatioSelect.addEventListener('change', (e) => {
      this.canvasRatio = parseInt(e.target.value)
      this.applyCanvasRatio()
    })
    
    fontFamilySelect.addEventListener('change', (e) => {
      this.asciiEffect.fontFamily = e.target.value
    })
    
    bgCharInput.addEventListener('change', () => {
      this.asciiEffect.setCharacters(bgCharInput.value, patternCharsInput.value)
    })
    
    patternCharsInput.addEventListener('change', () => {
      this.asciiEffect.setCharacters(bgCharInput.value, patternCharsInput.value)
    })
    
    changeSpeedInput.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value)
      this.asciiEffect.changeSpeed = value
      document.getElementById('change-speed-value').textContent = value.toFixed(1)
    })
    
    inputBlackInput.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value)
      this.asciiEffect.inputBlack = value
      document.getElementById('input-black-value').textContent = value.toFixed(2)
    })
    
    inputWhiteInput.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value)
      this.asciiEffect.inputWhite = value
      document.getElementById('input-white-value').textContent = value.toFixed(2)
    })
    
    gammaInput.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value)
      this.asciiEffect.gamma = value
      document.getElementById('gamma-value').textContent = value.toFixed(2)
    })
    
    contrastInput.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value)
      this.asciiEffect.contrast = value
      document.getElementById('contrast-value').textContent = value.toFixed(2)
    })
    
    colorDarkInput.addEventListener('input', (e) => {
      this.asciiEffect.colorDark = e.target.value
    })
    
    colorLightInput.addEventListener('input', (e) => {
      this.asciiEffect.colorLight = e.target.value
    })
    
    hueShiftInput.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value)
      this.asciiEffect.hueShift = value
      document.getElementById('hue-shift-value').textContent = value.toFixed(2)
    })
    
    saturationInput.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value)
      this.asciiEffect.saturation = value
      document.getElementById('saturation-value').textContent = value.toFixed(2)
    })
    
    bgColorInput.addEventListener('input', (e) => {
      this.asciiEffect.bgColor = e.target.value
    })
    
    invertInput.addEventListener('change', (e) => {
      this.asciiEffect.invert = e.target.checked
    })
    
    colorModeInput.addEventListener('change', (e) => {
      this.asciiEffect.colorMode = e.target.checked
    })
  }
  
  setupRecordingControls() {
    const recordFpsInput = document.getElementById('record-fps')
    const recordMaxFramesInput = document.getElementById('record-max-frames')
    const lumBitsSelect = document.getElementById('lum-bits')
    const recordBtn = document.getElementById('record-btn')
    const recordStatus = document.getElementById('record-status')
    const recordTime = document.getElementById('record-time')
    const recordFrames = document.getElementById('record-frames')
    const recordMaxDisplay = document.getElementById('record-max-display')
    const durationPreview = document.getElementById('record-duration-preview')
    
    let recordFps = 30
    let maxFrames = 300
    let lumBits = 8
    
    const updateDurationPreview = () => {
      const duration = maxFrames / recordFps
      durationPreview.textContent = duration.toFixed(1) + 's'
    }
    
    recordFpsInput.addEventListener('input', (e) => {
      recordFps = parseInt(e.target.value)
      document.getElementById('record-fps-value').textContent = recordFps
      updateDurationPreview()
    })
    
    recordMaxFramesInput.addEventListener('input', (e) => {
      maxFrames = parseInt(e.target.value)
      document.getElementById('record-max-frames-value').textContent = maxFrames
      updateDurationPreview()
    })
    
    if (lumBitsSelect) {
      lumBitsSelect.addEventListener('change', (e) => {
        lumBits = parseInt(e.target.value)
      })
    }
    
    recordBtn.addEventListener('click', () => {
      if (this.recorder && this.recorder.isRecording) {
        const stats = this.recorder.downloadTXA(`ascii-${Date.now()}.txa`)
        recordBtn.textContent = 'Start Recording'
        recordStatus.style.display = 'none'
        console.log('Recording stats:', stats)
      } else {
        recordMaxDisplay.textContent = maxFrames
        
        this.recorder = new ASCIIRecorder({
          renderer: this.renderer,
          asciiEffect: this.asciiEffect,
          scene: this.scene,
          camera: this.camera,
          fps: recordFps,
          maxFrames: maxFrames,
          colorMode: this.asciiEffect.colorMode ? 1 : 0,
          changeSpeed: this.asciiEffect.changeSpeed,
          canvasRatio: this.canvasRatio,
          lumBits: lumBits,
          onFrame: ({ frame, elapsed }) => {
            recordTime.textContent = (elapsed / 1000).toFixed(1) + 's'
            recordFrames.textContent = frame
          },
          onComplete: () => {
            const stats = this.recorder.downloadTXA(`ascii-${Date.now()}.txa`)
            recordBtn.textContent = 'Start Recording'
            recordStatus.style.display = 'none'
            console.log('Recording stats:', stats)
          }
        })
        
        this.recorder.start()
        recordBtn.textContent = 'Stop & Download'
        recordStatus.style.display = 'block'
      }
    })
  }
  
  setupPlayerControls() {
    const txaInput = document.getElementById('txa-input')
    const playerCanvas = document.getElementById('player-canvas')
    const playerControls = document.getElementById('player-controls')
    const playerSeek = document.getElementById('player-seek')
    const playerTime = document.getElementById('player-time')
    const playerPlayBtn = document.getElementById('player-play')
    const playerStopBtn = document.getElementById('player-stop')
    const playerCloseBtn = document.getElementById('player-close')
    
    this.player = new ASCIIPlayer(playerCanvas, {
      cellSize: this.asciiEffect.cellSize,
      fontFamily: this.asciiEffect._fontFamily,
      bgColor: '#000000',
      onFrameChange: (frame) => {
        const current = this.player.currentTime
        const total = this.player.duration
        playerSeek.value = this.player.progress * 100
        playerTime.textContent = `${this.formatTime(current)} / ${this.formatTime(total)}`
      },
      onPlayStateChange: (playing) => {
        playerPlayBtn.textContent = playing ? 'Pause' : 'Play'
      }
    })
    
    txaInput.addEventListener('change', async (e) => {
      const file = e.target.files[0]
      if (!file) return
      
      await this.player.loadFromFile(file)
      this.showPlayer()
    })
    
    playerSeek.addEventListener('input', (e) => {
      const progress = parseFloat(e.target.value) / 100
      const frame = Math.floor(progress * this.player.totalFrames)
      this.player.seek(frame)
    })
    
    playerPlayBtn.addEventListener('click', () => {
      this.player.toggle()
    })
    
    playerStopBtn.addEventListener('click', () => {
      this.player.stop()
    })
    
    playerCloseBtn.addEventListener('click', () => {
      this.hidePlayer()
    })
  }
  
  showPlayer() {
    const playerCanvas = document.getElementById('player-canvas')
    const playerControls = document.getElementById('player-controls')
    
    playerCanvas.style.display = 'block'
    playerControls.style.display = 'block'
    this.isPlayerMode = true
    this.player.play()
  }
  
  hidePlayer() {
    const playerCanvas = document.getElementById('player-canvas')
    const playerControls = document.getElementById('player-controls')
    
    this.player.stop()
    playerCanvas.style.display = 'none'
    playerControls.style.display = 'none'
    this.isPlayerMode = false
  }
  
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  
  setupDragDrop() {
    document.addEventListener('dragover', (e) => {
      e.preventDefault()
      this.dropZone.classList.add('active')
    })
    
    document.addEventListener('dragleave', (e) => {
      if (e.relatedTarget === null) {
        this.dropZone.classList.remove('active')
      }
    })
    
    document.addEventListener('drop', async (e) => {
      e.preventDefault()
      this.dropZone.classList.remove('active')
      
      const file = e.dataTransfer.files[0]
      if (!file) return
      
      const isVideo = file.type.startsWith('video/')
      const isImage = file.type.startsWith('image/')
      
      if (!isVideo && !isImage) return
      
      const source = isVideo ? 'video' : 'image'
      document.getElementById('source-select').value = source
      await this.setSource(source, file)
    })
  }
  
  onResize() {
    this.applyCanvasRatio()
  }
  
  applyCanvasRatio() {
    const maxWidth = window.innerWidth
    const maxHeight = window.innerHeight
    
    let width = maxWidth
    let height = maxHeight
    
    const ratios = {
      0: null,
      1: 16 / 9,
      2: 4 / 3,
      3: 1,
      4: 9 / 16,
      5: 3 / 4
    }
    
    const targetRatio = ratios[this.canvasRatio]
    
    if (targetRatio) {
      const currentRatio = maxWidth / maxHeight
      if (currentRatio > targetRatio) {
        width = Math.floor(maxHeight * targetRatio)
        height = maxHeight
      } else {
        width = maxWidth
        height = Math.floor(maxWidth / targetRatio)
      }
    }
    
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = width / height
      this.camera.updateProjectionMatrix()
    }
    
    this.renderer.setSize(width, height)
    this.composer.setSize(width, height)
    
    this.container.style.width = width + 'px'
    this.container.style.height = height + 'px'
    this.container.style.left = ((maxWidth - width) / 2) + 'px'
    this.container.style.top = ((maxHeight - height) / 2) + 'px'
    
    if (this.mediaTexture) {
      this.updateMediaPlane()
    }
  }
  
  updateFPS() {
    this.frameCount++
    const now = performance.now()
    const delta = now - this.lastTime
    
    if (delta >= 1000) {
      const fps = Math.round((this.frameCount * 1000) / delta)
      this.stats.textContent = `FPS: ${fps}`
      this.frameCount = 0
      this.lastTime = now
    }
  }
  
  animate() {
    requestAnimationFrame(() => this.animate())
    
    const now = performance.now()
    const frameInterval = 1000 / this.targetFPS
    const elapsed = now - this.lastRenderTime
    
    if (elapsed < frameInterval) {
      return
    }
    
    this.lastRenderTime = now - (elapsed % frameInterval)
    
    if (this.demoCube) {
      this.demoCube.rotation.x += 0.01
      this.demoCube.rotation.y += 0.01
    }
    
    this.composer.render()
    this.updateFPS()
  }
}

window.app = new ASCIICraft()
