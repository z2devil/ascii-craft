# ASCII Craft

实时 ASCII 艺术动画编辑器与播放器。支持将图片、视频、摄像头画面、3D 场景转换为 ASCII 字符动画，并录制导出为紧凑的 TXA 二进制格式。

[**English**](./README.md)

## 功能特性

- **实时 ASCII 渲染**：基于 WebGL Shader（Three.js + postprocessing）
- **多种输入源**：图片、视频、摄像头、3D 场景
- **全功能编辑器**：单元格大小、字体、色彩渐变、色相/饱和度、色阶（黑白点、伽马、对比度）、反转、全彩模式
- **TXA 录制与导出**：录制动画为紧凑二进制格式，采用差分编码 + RLE 压缩
- **轻量级 TXA 播放器**：基于 Canvas 的播放组件
- **`<txa-player>` Web Component**：即插即用的自定义元素，用法类似 `<video>` 标签
- **可自定义字符集、颜色和字体**

## 快速开始

```bash
npm install
npm run dev
```

- 编辑器：`http://localhost:3000`
- 播放器：`http://localhost:3000/player.html`
- Web Component 演示：`http://localhost:3000/webcomponent-demo.html`

## 项目结构

```
ascii-craft/
├── index.html              # 编辑器页面
├── player.html             # 独立 TXA 播放器页面
├── webcomponent-demo.html  # <txa-player> Web Component 演示
├── src/
│   ├── main.js             # 编辑器主程序入口
│   ├── ASCIIEffect.js      # WebGL ASCII 后处理效果（Three.js）
│   ├── ASCIIRecorder.js    # TXA 录制器（从渲染器捕获帧）
│   ├── ASCIIPlayer.js      # 基于 Canvas 的 TXA 播放引擎
│   ├── TXAPlayerElement.js # <txa-player> Web Component 封装
│   ├── TXAEncoder.js       # TXA 二进制编码器
│   └── TXADecoder.js       # TXA 二进制解码器
├── vite.config.js
└── package.json
```

---

## `<txa-player>` Web Component

标准 Web Component，用于嵌入 TXA 动画，用法类似 `<video>` 标签。

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
| `render-scale` | number | 渲染缩放（默认 `1.0`） |
| `change-speed` | number | 字符变化速度（默认 `2.0`） |
| `font-family` | string | 字体（默认 `monospace`） |
| `bg-color` | string | 背景色（默认 `#000000`） |
| `color-dark` | string | 渐变暗色 |
| `color-light` | string | 渐变亮色 |
| `characters` | string | 自定义字符集 |
| `canvas-ratio` | number | 画布比例（0–5，详见下表） |

### 方法

```javascript
const player = document.querySelector('txa-player')

player.play()           // 播放
player.pause()          // 暂停
player.stop()           // 停止（回到第 0 帧）
player.toggle()         // 切换播放/暂停
player.seek(100)        // 跳转到第 100 帧
player.seekToTime(5.5)  // 跳转到 5.5 秒
```

### 只读属性

```javascript
player.duration      // 时长（秒）
player.totalFrames   // 总帧数
player.fps           // 帧率
player.width         // 网格宽度（列数）
player.height        // 网格高度（行数）
player.currentTime   // 当前播放时间
player.progress      // 播放进度（0–1）
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
| `timeupdate` | 时间更新，`event.detail` 包含 `currentTime` 和 `progress` |
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
      timeDisplay.textContent =
        `${formatTime(e.detail.currentTime)} / ${formatTime(player.duration)}`
    })

    player.addEventListener('play', () => playBtn.textContent = '⏸')
    player.addEventListener('pause', () => playBtn.textContent = '▶')

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

## ASCIIPlayer API

`ASCIIPlayer` 是底层播放引擎，可在任何 Canvas 元素上渲染 TXA 动画。

### 基础用法

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

### 构造函数

```javascript
new ASCIIPlayer(canvas, options)
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `cellSize` | number | `16` | 单元格大小（像素） |
| `renderScale` | number | `1.0` | 渲染缩放比例 |
| `fontFamily` | string | `'monospace'` | 字体 |
| `bgColor` | string | `'#000000'` | 背景色 |
| `changeSpeed` | number | `2.0` | 字符变化速度 |
| `canvasRatio` | number | `0` | 画布比例 |
| `onFrameChange` | function | – | 帧变化回调 |
| `onPlayStateChange` | function | – | 播放状态变化回调 |

**画布比例值：**

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
await player.load(arrayBuffer)        // 从 ArrayBuffer 加载
await player.loadFromFile(file)       // 从 File 对象加载
await player.loadFromURL('/path.txa') // 从 URL 加载
```

### 播放控制

```javascript
player.play()
player.pause()
player.stop()
player.toggle()
player.seek(100)         // 跳转到指定帧
player.seekToTime(5.5)   // 跳转到指定时间（秒）
```

### 样式设置

```javascript
player.setRenderScale(1.5)
player.setChangeSpeed(3.0)
player.setCanvasRatio(1)                      // 16:9
player.setFontFamily('JetBrains Mono')
player.setBgColor('#001100')
player.setColors('#003300', '#00ff00')        // 暗色 → 亮色渐变
player.setCharacters(' .:-=+*#%@')
```

### 只读属性

```javascript
player.duration      // 时长（秒）
player.totalFrames   // 总帧数
player.fps           // 帧率
player.width         // 网格宽度（列数）
player.height        // 网格高度（行数）
player.currentTime   // 当前时间（秒）
player.progress      // 播放进度（0–1）
player.isPlaying     // 是否正在播放
player.isLoaded      // 是否已加载
```

---

## TXA 文件格式规范（V2）

TXA（Text Animation）是一种专为 ASCII 动画设计的紧凑二进制格式，支持高效压缩。

### 文件结构

```
┌─────────────────────────────────────┐
│ HEADER（32 字节）                    │
├─────────────────────────────────────┤
│ PALETTE（调色板）                     │
│   Characters（CharCount 字节）       │
│   Colors（ColorCount x 3 字节）      │
├─────────────────────────────────────┤
│ FRAMES（帧数据）                     │
│   Frame 0                           │
│   Frame 1                           │
│   ...                               │
└─────────────────────────────────────┘
```

### Header（32 字节）

| 偏移 | 大小 | 字段 | 说明 |
|------|------|------|------|
| 0 | 4 | Magic | `TXA\0` |
| 4 | 1 | Version | 格式版本（`2`） |
| 5 | 1 | ColorMode | `0` = 渐变，`1` = 全彩 |
| 6 | 2 | Width | 网格列数（uint16 LE） |
| 8 | 2 | Height | 网格行数（uint16 LE） |
| 10 | 1 | FPS | 帧率 |
| 11 | 4 | TotalFrames | 总帧数（uint32 LE） |
| 15 | 1 | CharCount | 字符调色板大小 |
| 16 | 2 | ColorCount | 颜色调色板大小（uint16 LE） |
| 18 | 3 | BgColor | 背景色（RGB） |
| 21 | 1 | ChangeSpeed | 字符变化速度（值 / 10） |
| 22 | 1 | CanvasRatio | 画布比例预设 |
| 23 | 1 | LumBits | 亮度量化位数 |
| 24 | 8 | Reserved | 保留 |

### 帧结构

| 大小 | 字段 | 说明 |
|------|------|------|
| 1 | FrameType | `0` = 关键帧，`1` = 差分帧 |
| 4 | DataSize | 压缩后数据大小（uint32 LE） |
| N | Data | 压缩数据 |

### 单元格数据（压缩前）

- **渐变模式**（`ColorMode 0`）：每单元格 1 字节 `[luminance]`
- **全彩模式**（`ColorMode 1`）：每单元格 3 字节 `[r, g, b]`

### 压缩算法

1. **差分编码（Delta Encoding）**：行内差分编码
2. **游程编码（RLE）**：
   - `255, count, value` → 重复 `value` 共 `count` 次
   - `N, v1, v2, ...` → N 个字面量值

---

## TXAEncoder

编程方式创建 TXA 文件。

```javascript
import { TXAEncoder } from './src/TXAEncoder.js'

const encoder = new TXAEncoder({
  width: 80,
  height: 45,
  fps: 30,
  colorMode: 0,            // 0 = 渐变，1 = 全彩
  characters: ' 01',
  lumBits: 8,               // 亮度量化（8/6/5/4）
  bgColor: [0, 0, 0],
  changeSpeed: 2.0,
  canvasRatio: 0
})

// 构建渐变色板
encoder.buildColorPalette([0, 0, 0], [0, 255, 0])

// 添加帧（二维数组，每个单元格为 [luminance] 或 [r, g, b]）
for (let i = 0; i < 300; i++) {
  const grid = generateFrame(i)
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

## TXADecoder

解析和读取 TXA 文件。

```javascript
import { TXADecoder } from './src/TXADecoder.js'

const decoder = new TXADecoder()

const response = await fetch('/animation.txa')
const buffer = await response.arrayBuffer()
const header = decoder.parse(buffer)

console.log(header)
// { version: 2, width: 80, height: 45, fps: 30, totalFrames: 300, ... }

// 读取帧数据
const grid = decoder.getFrame(0)  // 二维数组：grid[x][y]

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

## 技术栈

- [Three.js](https://threejs.org/) – 3D 渲染与 WebGL
- [postprocessing](https://github.com/pmndrs/postprocessing) – Shader 后处理管线
- [Vite](https://vitejs.dev/) – 开发服务器与构建工具

## 许可证

MIT
