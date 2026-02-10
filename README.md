# ASCII Craft

Real-time ASCII art animation editor and player. Convert images, videos, webcam feeds, and 3D scenes into ASCII character animations, with recording and export to the compact TXA binary format.

[**中文文档**](./README_CN.md)

## Features

- **Real-time ASCII rendering** via WebGL shaders (Three.js + postprocessing)
- **Multiple input sources**: images, videos, webcam, 3D scenes
- **Full-featured editor**: cell size, fonts, color gradients, hue/saturation, levels (black/white points, gamma, contrast), invert, full-color mode
- **TXA recording & export**: record animations to a compact binary format with delta encoding + RLE compression
- **Lightweight TXA player**: canvas-based playback component
- **`<txa-player>` Web Component**: drop-in custom element, works like `<video>`
- **Customizable character sets, colors, and fonts**

## Quick Start

```bash
npm install
npm run dev
```

- Editor: `http://localhost:3000`
- Player: `http://localhost:3000/player.html`
- Web Component demo: `http://localhost:3000/webcomponent-demo.html`

## Project Structure

```
ascii-craft/
├── index.html              # Editor page
├── player.html             # Standalone TXA player page
├── webcomponent-demo.html  # <txa-player> web component demo
├── src/
│   ├── main.js             # Editor app entry point
│   ├── ASCIIEffect.js      # WebGL ASCII post-processing effect (Three.js)
│   ├── ASCIIRecorder.js    # TXA recorder (captures frames from renderer)
│   ├── ASCIIPlayer.js      # Canvas-based TXA playback engine
│   ├── TXAPlayerElement.js # <txa-player> Web Component wrapper
│   ├── TXAEncoder.js       # TXA binary encoder
│   └── TXADecoder.js       # TXA binary decoder
├── vite.config.js
└── package.json
```

---

## `<txa-player>` Web Component

A standard Web Component for embedding TXA animations, similar to using a `<video>` tag.

### Basic Usage

```html
<script type="module" src="./src/TXAPlayerElement.js"></script>

<txa-player src="/animation.txa" autoplay loop></txa-player>
```

### Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `src` | string | TXA file URL |
| `autoplay` | boolean | Auto-play on load |
| `loop` | boolean | Loop playback |
| `render-scale` | number | Render scale factor (default `1.0`) |
| `change-speed` | number | Character change speed (default `2.0`) |
| `font-family` | string | Font (default `monospace`) |
| `bg-color` | string | Background color (default `#000000`) |
| `color-dark` | string | Gradient dark color |
| `color-light` | string | Gradient light color |
| `characters` | string | Custom character set |
| `canvas-ratio` | number | Canvas aspect ratio (0–5, see below) |

### Methods

```javascript
const player = document.querySelector('txa-player')

player.play()           // Play
player.pause()          // Pause
player.stop()           // Stop (reset to frame 0)
player.toggle()         // Toggle play/pause
player.seek(100)        // Seek to frame 100
player.seekToTime(5.5)  // Seek to 5.5 seconds
```

### Read-only Properties

```javascript
player.duration      // Duration in seconds
player.totalFrames   // Total frame count
player.fps           // Frame rate
player.width         // Grid width (columns)
player.height        // Grid height (rows)
player.currentTime   // Current playback time
player.progress      // Playback progress (0–1)
player.paused        // Whether paused
player.ended         // Whether playback ended
```

### Events

| Event | Description |
|-------|-------------|
| `loadstart` | Loading started |
| `loadeddata` | Load complete. `event.detail` contains file info |
| `play` | Playback started |
| `pause` | Paused |
| `ended` | Playback ended |
| `timeupdate` | Time updated. `event.detail` contains `currentTime` and `progress` |
| `error` | Load error |

### Full Example

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    txa-player {
      width: 800px;
      height: 600px;
      border: 1px solid #333;
    }
    .controls { margin-top: 10px; }
  </style>
</head>
<body>
  <txa-player
    id="player"
    src="/animation.txa"
    render-scale="1.5"
    change-speed="3"
    color-dark="#001100"
    color-light="#00ff00"
    loop
  ></txa-player>

  <div class="controls">
    <button id="play-btn">Play</button>
    <span id="time">0:00 / 0:00</span>
  </div>

  <script type="module">
    import './src/TXAPlayerElement.js'

    const player = document.getElementById('player')
    const playBtn = document.getElementById('play-btn')
    const timeDisplay = document.getElementById('time')

    function formatTime(sec) {
      const m = Math.floor(sec / 60)
      const s = Math.floor(sec % 60)
      return `${m}:${s.toString().padStart(2, '0')}`
    }

    player.addEventListener('loadeddata', (e) => {
      console.log('Loaded:', e.detail)
    })

    player.addEventListener('timeupdate', (e) => {
      timeDisplay.textContent =
        `${formatTime(e.detail.currentTime)} / ${formatTime(player.duration)}`
    })

    player.addEventListener('play', () => playBtn.textContent = 'Pause')
    player.addEventListener('pause', () => playBtn.textContent = 'Play')

    playBtn.addEventListener('click', () => player.toggle())
  </script>
</body>
</html>
```

### Dynamic Attribute Changes

```javascript
const player = document.querySelector('txa-player')

// Via properties
player.src = '/another.txa'
player.loop = true
player.renderScale = 2.0
player.changeSpeed = 5.0

// Via setAttribute
player.setAttribute('color-dark', '#000033')
player.setAttribute('color-light', '#3399ff')
player.setAttribute('characters', ' .:*#@')
```

---

## ASCIIPlayer API

`ASCIIPlayer` is the underlying playback engine. It renders TXA animations onto any canvas element.

### Basic Usage

```html
<canvas id="player"></canvas>
<script type="module">
  import { ASCIIPlayer } from './src/ASCIIPlayer.js'

  const canvas = document.getElementById('player')
  const player = new ASCIIPlayer(canvas)

  await player.loadFromURL('/animation.txa')
  player.play()
</script>
```

### Constructor

```javascript
new ASCIIPlayer(canvas, options)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cellSize` | number | `16` | Cell size in pixels |
| `renderScale` | number | `1.0` | Render scale factor |
| `fontFamily` | string | `'monospace'` | Font family |
| `bgColor` | string | `'#000000'` | Background color |
| `changeSpeed` | number | `2.0` | Character change speed |
| `canvasRatio` | number | `0` | Canvas aspect ratio |
| `onFrameChange` | function | – | Frame change callback |
| `onPlayStateChange` | function | – | Play state change callback |

**Canvas Ratio Values:**

| Value | Ratio |
|-------|-------|
| 0 | Free (follows content) |
| 1 | 16:9 |
| 2 | 4:3 |
| 3 | 1:1 |
| 4 | 9:16 |
| 5 | 3:4 |

### Loading

```javascript
await player.load(arrayBuffer)        // From ArrayBuffer
await player.loadFromFile(file)       // From File object
await player.loadFromURL('/path.txa') // From URL
```

### Playback Controls

```javascript
player.play()
player.pause()
player.stop()
player.toggle()
player.seek(100)         // Seek to frame
player.seekToTime(5.5)   // Seek to time in seconds
```

### Style Methods

```javascript
player.setRenderScale(1.5)
player.setChangeSpeed(3.0)
player.setCanvasRatio(1)                      // 16:9
player.setFontFamily('JetBrains Mono')
player.setBgColor('#001100')
player.setColors('#003300', '#00ff00')        // Dark → Light gradient
player.setCharacters(' .:-=+*#%@')
```

### Read-only Properties

```javascript
player.duration      // Duration in seconds
player.totalFrames   // Total frame count
player.fps           // Frame rate
player.width         // Grid width (columns)
player.height        // Grid height (rows)
player.currentTime   // Current time in seconds
player.progress      // Progress (0–1)
player.isPlaying     // Playing state
player.isLoaded      // Loaded state
```

---

## TXA File Format (V2)

TXA (Text Animation) is a compact binary format designed for ASCII animations with efficient compression.

### File Layout

```
┌─────────────────────────────────────┐
│ HEADER (32 bytes)                   │
├─────────────────────────────────────┤
│ PALETTE                             │
│   Characters (CharCount bytes)      │
│   Colors (ColorCount x 3 bytes)     │
├─────────────────────────────────────┤
│ FRAMES                              │
│   Frame 0                           │
│   Frame 1                           │
│   ...                               │
└─────────────────────────────────────┘
```

### Header (32 bytes)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 4 | Magic | `TXA\0` |
| 4 | 1 | Version | Format version (`2`) |
| 5 | 1 | ColorMode | `0` = gradient, `1` = full color |
| 6 | 2 | Width | Grid columns (uint16 LE) |
| 8 | 2 | Height | Grid rows (uint16 LE) |
| 10 | 1 | FPS | Frame rate |
| 11 | 4 | TotalFrames | Frame count (uint32 LE) |
| 15 | 1 | CharCount | Character palette size |
| 16 | 2 | ColorCount | Color palette size (uint16 LE) |
| 18 | 3 | BgColor | Background color (RGB) |
| 21 | 1 | ChangeSpeed | Character change speed (value / 10) |
| 22 | 1 | CanvasRatio | Aspect ratio preset |
| 23 | 1 | LumBits | Luminance quantization bits |
| 24 | 8 | Reserved | Reserved for future use |

### Frame Structure

| Size | Field | Description |
|------|-------|-------------|
| 1 | FrameType | `0` = keyframe, `1` = delta frame |
| 4 | DataSize | Compressed data size (uint32 LE) |
| N | Data | Compressed payload |

### Cell Data (before compression)

- **Gradient mode** (`ColorMode 0`): 1 byte per cell `[luminance]`
- **Full-color mode** (`ColorMode 1`): 3 bytes per cell `[r, g, b]`

### Compression

1. **Delta Encoding**: row-wise differential encoding
2. **RLE** (Run-Length Encoding):
   - `255, count, value` → repeat `value` for `count` times
   - `N, v1, v2, ...` → N literal values

---

## TXAEncoder

Programmatic TXA file creation.

```javascript
import { TXAEncoder } from './src/TXAEncoder.js'

const encoder = new TXAEncoder({
  width: 80,
  height: 45,
  fps: 30,
  colorMode: 0,            // 0 = gradient, 1 = full color
  characters: ' 01',
  lumBits: 8,               // Luminance quantization (8/6/5/4)
  bgColor: [0, 0, 0],
  changeSpeed: 2.0,
  canvasRatio: 0
})

// Build gradient color palette
encoder.buildColorPalette([0, 0, 0], [0, 255, 0])

// Add frames (2D array, each cell is [luminance] or [r, g, b])
for (let i = 0; i < 300; i++) {
  const grid = generateFrame(i)
  encoder.addFrame(grid)
}

// Encode and download
const buffer = encoder.encode()
const blob = new Blob([buffer], { type: 'application/octet-stream' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = 'animation.txa'
a.click()

// Compression stats
console.log(encoder.getStats())
// { totalFrames: 300, keyframes: 10, deltaFrames: 290, compressionRatio: '85.2%' }
```

---

## TXADecoder

Parse and read TXA files.

```javascript
import { TXADecoder } from './src/TXADecoder.js'

const decoder = new TXADecoder()

const response = await fetch('/animation.txa')
const buffer = await response.arrayBuffer()
const header = decoder.parse(buffer)

console.log(header)
// { version: 2, width: 80, height: 45, fps: 30, totalFrames: 300, ... }

// Read frame data
const grid = decoder.getFrame(0)  // 2D array: grid[x][y]

for (let x = 0; x < decoder.width; x++) {
  for (let y = 0; y < decoder.height; y++) {
    const cell = grid[x][y]
    if (decoder.colorMode === 0) {
      const luminance = cell[0]
      const color = decoder.getColor(luminance)  // [r, g, b]
    } else {
      const [r, g, b] = cell
    }
  }
}
```

---

## Tech Stack

- [Three.js](https://threejs.org/) – 3D rendering and WebGL
- [postprocessing](https://github.com/pmndrs/postprocessing) – Shader post-processing pipeline
- [Vite](https://vitejs.dev/) – Dev server and bundler

## License

MIT
