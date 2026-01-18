# ASCII Craft

ASCII 艺术动画编辑器和播放器。支持将视频、图片、3D 场景转换为 ASCII 字符动画，并导出为 TXA 格式文件。

## 功能特性

- 实时 ASCII 艺术渲染（基于 WebGL Shader）
- 支持多种输入源：图片、视频、摄像头、3D 场景
- 录制导出为 TXA 格式动画文件
- 轻量级 TXA 播放器组件
- 可自定义字符集、颜色、字体等样式
- 高效压缩（Delta Encoding + RLE）

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 `http://localhost:3000` 打开编辑器，`http://localhost:3000/player.html` 打开播放器。

## 项目结构

```
ascii-craft/
├── index.html          # 编辑器页面
├── player.html         # 播放器页面
├── src/
│   ├── main.js         # 编辑器主程序
│   ├── ASCIIEffect.js  # WebGL ASCII 效果（Three.js 后处理）
│   ├── ASCIIRecorder.js# TXA 录制器
│   ├── ASCIIPlayer.js  # TXA 播放器
│   ├── TXAEncoder.js   # TXA 编码器
│   └── TXADecoder.js   # TXA 解码器
└── package.json
```

---

## Web Component 使用指南

`<txa-player>` 是一个标准的 Web Component，可以像使用 `<video>` 标签一样简单地嵌入 TXA 动画。

### 基础用法

```html
<script type="module" src="./src/TXAPlayerElement.js"></script>

<txa-player src="/animation.txa" autoplay loop></txa-player>
```

### 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `src` | string | TXA 文件 URL |
| `autoplay` | boolean | 自动播放 |
| `loop` | boolean | 循环播放 |
| `render-scale` | number | 渲染缩放 (默认 1.0) |
| `change-speed` | number | 字符变化速度 (默认 2.0) |
| `font-family` | string | 字体 (默认 monospace) |
| `bg-color` | string | 背景色 (默认 #000000) |
| `color-dark` | string | 渐变暗色 |
| `color-light` | string | 渐变亮色 |
| `characters` | string | 自定义字符集 |
| `canvas-ratio` | number | 画布比例 (0-5) |

### 方法

```javascript
const player = document.querySelector('txa-player')

player.play()           // 播放
player.pause()          // 暂停
player.stop()           // 停止
player.toggle()         // 切换播放/暂停
player.seek(100)        // 跳转到第 100 帧
player.seekToTime(5.5)  // 跳转到 5.5 秒
```

### 只读属性

```javascript
player.duration      // 时长（秒）
player.totalFrames   // 总帧数
player.fps           // 帧率
player.width         // 网格宽度
player.height        // 网格高度
player.currentTime   // 当前时间
player.progress      // 播放进度 (0-1)
player.paused        // 是否暂停
player.ended         // 是否播放结束
```

### 事件

| 事件 | 说明 |
|------|------|
| `loadstart` | 开始加载 |
| `loadeddata` | 加载完成，`event.detail` 包含文件信息 |
| `play` | 开始播放 |
| `pause` | 暂停 |
| `ended` | 播放结束 |
| `timeupdate` | 时间更新，`event.detail` 包含当前时间和进度 |
| `error` | 加载错误 |

### 完整示例

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
    .controls {
      margin-top: 10px;
    }
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
    <button id="play-btn">▶</button>
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
      timeDisplay.textContent = `${formatTime(e.detail.currentTime)} / ${formatTime(player.duration)}`
    })
    
    player.addEventListener('play', () => playBtn.textContent = '⏸')
    player.addEventListener('pause', () => playBtn.textContent = '▶')
    player.addEventListener('ended', () => console.log('Animation ended'))
    
    playBtn.addEventListener('click', () => player.toggle())
  </script>
</body>
</html>
```

### 动态修改属性

```javascript
const player = document.querySelector('txa-player')

// 通过属性修改
player.src = '/another.txa'
player.loop = true
player.renderScale = 2.0
player.changeSpeed = 5.0

// 通过 setAttribute
player.setAttribute('color-dark', '#000033')
player.setAttribute('color-light', '#3399ff')
player.setAttribute('characters', ' .:*#@')
```

---

## ASCIIPlayer 使用指南

`ASCIIPlayer` 是一个轻量级的 TXA 文件播放器，可以在任何 Canvas 元素上播放 ASCII 动画。

### 基础用法

```html
<canvas id="player"></canvas>
<script type="module">
  import { ASCIIPlayer } from './src/ASCIIPlayer.js'

  const canvas = document.getElementById('player')
  const player = new ASCIIPlayer(canvas)

  // 从 URL 加载并播放
  await player.loadFromURL('/animation.txa')
  player.play()
</script>
```

### 构造函数

```javascript
new ASCIIPlayer(canvas, options)
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `canvas` | HTMLCanvasElement | - | 渲染目标 Canvas |
| `options.cellSize` | number | 16 | 单元格大小（像素） |
| `options.renderScale` | number | 1.0 | 渲染缩放比例 |
| `options.fontFamily` | string | 'monospace' | 字体 |
| `options.bgColor` | string | '#000000' | 背景色 |
| `options.changeSpeed` | number | 2.0 | 字符变化速度 |
| `options.canvasRatio` | number | 0 | 画布比例（见下表） |
| `options.onFrameChange` | function | - | 帧变化回调 |
| `options.onPlayStateChange` | function | - | 播放状态变化回调 |

**canvasRatio 值：**
| 值 | 比例 |
|----|------|
| 0 | 自由（跟随内容） |
| 1 | 16:9 |
| 2 | 4:3 |
| 3 | 1:1 |
| 4 | 9:16 |
| 5 | 3:4 |

### 加载方法

```javascript
// 从 ArrayBuffer 加载
await player.load(arrayBuffer)

// 从 File 对象加载（如 input[type=file]）
await player.loadFromFile(file)

// 从 URL 加载
await player.loadFromURL('/path/to/animation.txa')
```

### 播放控制

```javascript
player.play()           // 播放
player.pause()          // 暂停
player.stop()           // 停止（回到开头）
player.toggle()         // 切换播放/暂停

player.seek(100)        // 跳转到第 100 帧
player.seekToTime(5.5)  // 跳转到 5.5 秒
```

### 样式设置

```javascript
player.setRenderScale(1.5)                    // 1.5 倍渲染
player.setChangeSpeed(3.0)                    // 字符变化速度
player.setCanvasRatio(1)                      // 16:9 比例
player.setFontFamily('JetBrains Mono')        // 字体
player.setBgColor('#001100')                  // 背景色
player.setColors('#003300', '#00ff00')        // 渐变色（暗→亮）
player.setCharacters(' .:-=+*#%@')            // 自定义字符集
```

### 只读属性

```javascript
player.duration      // 时长（秒）
player.totalFrames   // 总帧数
player.fps           // 帧率
player.width         // 网格宽度（字符数）
player.height        // 网格高度（字符数）
player.currentTime   // 当前时间（秒）
player.progress      // 播放进度 (0-1)
player.isPlaying     // 是否正在播放
player.isLoaded      // 是否已加载
```

### 完整示例：带进度条的播放器

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    #player { background: #000; }
    #progress { width: 300px; }
    #time { font-family: monospace; }
  </style>
</head>
<body>
  <canvas id="player"></canvas>
  <div>
    <button id="play-btn">▶</button>
    <input type="range" id="progress" min="0" max="100" value="0">
    <span id="time">0:00 / 0:00</span>
  </div>
  <input type="file" id="file-input" accept=".txa">

  <script type="module">
    import { ASCIIPlayer } from './src/ASCIIPlayer.js'

    const canvas = document.getElementById('player')
    const playBtn = document.getElementById('play-btn')
    const progressBar = document.getElementById('progress')
    const timeDisplay = document.getElementById('time')
    const fileInput = document.getElementById('file-input')

    const player = new ASCIIPlayer(canvas, {
      onFrameChange: () => {
        progressBar.value = player.progress * 100
        timeDisplay.textContent = formatTime(player.currentTime) + ' / ' + formatTime(player.duration)
      },
      onPlayStateChange: (playing) => {
        playBtn.textContent = playing ? '⏸' : '▶'
      }
    })

    function formatTime(sec) {
      const m = Math.floor(sec / 60)
      const s = Math.floor(sec % 60)
      return `${m}:${s.toString().padStart(2, '0')}`
    }

    fileInput.addEventListener('change', async (e) => {
      if (e.target.files[0]) {
        await player.loadFromFile(e.target.files[0])
        player.play()
      }
    })

    playBtn.addEventListener('click', () => player.toggle())

    progressBar.addEventListener('input', (e) => {
      const frame = Math.floor((e.target.value / 100) * player.totalFrames)
      player.seek(frame)
    })
  </script>
</body>
</html>
```

---

## TXA 文件格式规范 (V2)

TXA (Text Animation) 是一种专为 ASCII 动画设计的二进制格式，支持高效压缩。

### 文件结构

```
┌─────────────────────────────────────┐
│ HEADER (32 bytes)                   │
├─────────────────────────────────────┤
│ PALETTE                             │
│   - Characters (CharCount bytes)    │
│   - Colors (ColorCount × 3 bytes)   │
├─────────────────────────────────────┤
│ FRAMES                              │
│   - Frame 0                         │
│   - Frame 1                         │
│   - ...                             │
└─────────────────────────────────────┘
```

### Header 结构 (32 bytes)

| 偏移 | 大小 | 字段 | 说明 |
|------|------|------|------|
| 0 | 4 | Magic | `TXA\0` |
| 4 | 1 | Version | 版本号 (2) |
| 5 | 1 | ColorMode | 0=渐变, 1=全彩 |
| 6 | 2 | Width | 网格宽度 (uint16 LE) |
| 8 | 2 | Height | 网格高度 (uint16 LE) |
| 10 | 1 | FPS | 帧率 |
| 11 | 4 | TotalFrames | 总帧数 (uint32 LE) |
| 15 | 1 | CharCount | 字符数量 |
| 16 | 2 | ColorCount | 颜色数量 (uint16 LE) |
| 18 | 3 | BgColor | 背景色 RGB |
| 21 | 1 | ChangeSpeed | 字符变化速度 (×10) |
| 22 | 1 | CanvasRatio | 画布比例 |
| 23 | 1 | LumBits | 亮度量化位数 |
| 24 | 8 | Reserved | 保留 |

### 帧结构

每帧包含：
| 大小 | 字段 | 说明 |
|------|------|------|
| 1 | FrameType | 0=关键帧, 1=差分帧 |
| 4 | DataSize | 压缩后数据大小 (uint32 LE) |
| N | Data | 压缩数据 |

### 单元格数据（压缩前）

- **渐变模式**: 1 字节 `[luminance]`
- **全彩模式**: 3 字节 `[r, g, b]`

### 压缩算法

1. **Delta Encoding**: 行内差分编码
2. **RLE**: 游程长度编码
   - `255, count, value`: 重复 `count` 次 `value`
   - `N, v1, v2, ...`: N 个字面量

---

## TXAEncoder 使用指南

用于创建 TXA 文件。

```javascript
import { TXAEncoder } from './src/TXAEncoder.js'

const encoder = new TXAEncoder({
  width: 80,
  height: 45,
  fps: 30,
  colorMode: 0,           // 0=渐变, 1=全彩
  characters: ' 01',
  lumBits: 8,             // 亮度量化 (8/6/5/4)
  bgColor: [0, 0, 0],
  changeSpeed: 2.0,
  canvasRatio: 0
})

// 构建色板（渐变模式）
encoder.buildColorPalette([0, 0, 0], [0, 255, 0])

// 添加帧（二维数组，每个单元格为 [luminance] 或 [r,g,b]）
for (let i = 0; i < 300; i++) {
  const grid = generateFrame(i)  // 你的帧数据
  encoder.addFrame(grid)
}

// 编码并下载
const buffer = encoder.encode()
const blob = new Blob([buffer], { type: 'application/octet-stream' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = 'animation.txa'
a.click()

// 查看压缩统计
console.log(encoder.getStats())
// { totalFrames: 300, keyframes: 10, deltaFrames: 290, compressionRatio: '85.2%' }
```

---

## TXADecoder 使用指南

用于解析 TXA 文件。

```javascript
import { TXADecoder } from './src/TXADecoder.js'

const decoder = new TXADecoder()

// 解析文件
const response = await fetch('/animation.txa')
const buffer = await response.arrayBuffer()
const header = decoder.parse(buffer)

console.log(header)
// { version: 2, width: 80, height: 45, fps: 30, totalFrames: 300, ... }

// 获取帧数据
const grid = decoder.getFrame(0)  // 二维数组 grid[x][y]

// 遍历渲染
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

## 许可证

MIT
