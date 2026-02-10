import {
  CanvasTexture,
  Color,
  NearestFilter,
  RepeatWrapping,
  Uniform
} from 'three'
import type { WebGLRenderer, WebGLRenderTarget } from 'three'
import { Effect } from 'postprocessing'

const fragmentShader = /* glsl */ `
uniform sampler2D uCharacters;
uniform float uCharactersCount;
uniform float uCellSize;
uniform bool uInvert;
uniform bool uColorMode;
uniform vec3 uColorDark;
uniform vec3 uColorLight;
uniform vec3 uBgColor;
uniform float uHueShift;
uniform float uSaturation;
uniform float uTime;
uniform float uChangeSpeed;
uniform float uBgCharIndex;
uniform float uInputBlack;
uniform float uInputWhite;
uniform float uGamma;
uniform float uContrast;

float getLuminance(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 adjustHSV(vec3 color, float hueShift, float satMult) {
  vec3 hsv = rgb2hsv(color);
  hsv.x = fract(hsv.x + hueShift);
  hsv.y = clamp(hsv.y * satMult, 0.0, 1.0);
  return hsv2rgb(hsv);
}

float applyLevels(float value, float inBlack, float inWhite, float gamma, float contrast) {
  float range = inWhite - inBlack;
  if (range <= 0.0) range = 0.001;
  value = (value - inBlack) / range;
  value = clamp(value, 0.0, 1.0);
  value = pow(value, gamma);
  value = (value - 0.5) * contrast + 0.5;
  return clamp(value, 0.0, 1.0);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 cellSize = vec2(uCellSize) / resolution;
  vec2 cellCoord = floor(uv / cellSize);
  vec2 cellUV = cellCoord * cellSize + cellSize * 0.5;
  
  vec4 texColor = texture2D(inputBuffer, cellUV);
  float luminance = getLuminance(texColor.rgb);
  
  luminance = applyLevels(luminance, uInputBlack, uInputWhite, uGamma, uContrast);
  
  if (uInvert) {
    luminance = 1.0 - luminance;
  }
  
  float timeStep = floor(uTime * uChangeSpeed);
  float randVal = random(cellCoord + timeStep);
  
  float charIndex;
  if (luminance < 0.05) {
    charIndex = uBgCharIndex;
  } else {
    float patternStart = uBgCharIndex + 1.0;
    float patternCount = uCharactersCount - patternStart;
    if (patternCount > 0.0) {
      charIndex = patternStart + floor(randVal * patternCount);
    } else {
      charIndex = uBgCharIndex;
    }
  }
  
  charIndex = clamp(charIndex, 0.0, uCharactersCount - 1.0);
  
  vec2 cellInnerUV = fract(uv / cellSize);
  
  float charWidth = 1.0 / uCharactersCount;
  vec2 charUV = vec2(
    charIndex * charWidth + cellInnerUV.x * charWidth,
    cellInnerUV.y
  );
  
  float charMask = texture2D(uCharacters, charUV).r;
  
  vec3 baseColor;
  if (uColorMode) {
    baseColor = texColor.rgb;
  } else {
    baseColor = mix(uColorDark, uColorLight, luminance);
  }
  
  if (uHueShift != 0.0 || uSaturation != 1.0) {
    baseColor = adjustHSV(baseColor, uHueShift, uSaturation);
  }
  
  float alpha = charMask * luminance;
  
  vec3 finalColor = mix(uBgColor, baseColor, alpha);
  outputColor = vec4(finalColor, 1.0);
}
`

function createCharacterTexture(characters: string, cellSize: number, fontFamily: string): CanvasTexture {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  
  const charCount = characters.length
  const size = Math.max(cellSize * 2, 32)
  
  canvas.width = size * charCount
  canvas.height = size
  
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  
  ctx.font = `${size * 0.9}px ${fontFamily}`
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  
  for (let i = 0; i < charCount; i++) {
    const x = i * size + size / 2
    const y = size / 2
    ctx.fillText(characters[i], x, y)
  }
  
  const texture = new CanvasTexture(canvas)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.needsUpdate = true
  
  return texture
}

export interface ASCIIEffectOptions {
  backgroundChar?: string
  patternChars?: string
  cellSize?: number
  fontFamily?: string
  colorDark?: string
  colorLight?: string
  bgColor?: string
  hueShift?: number
  saturation?: number
  invert?: boolean
  colorMode?: boolean
  changeSpeed?: number
  inputBlack?: number
  inputWhite?: number
  gamma?: number
  contrast?: number
}

export class ASCIIEffect extends Effect {
  private _backgroundChar: string
  private _patternChars: string
  private _cellSize: number
  private _fontFamily: string
  private _charTexture: CanvasTexture
  
  constructor({
    backgroundChar = ' ',
    patternChars = '0123456789ABCDEF',
    cellSize = 16,
    fontFamily = 'monospace',
    colorDark = '#003300',
    colorLight = '#00ff00',
    bgColor = '#000000',
    hueShift = 0,
    saturation = 1,
    invert = false,
    colorMode = false,
    changeSpeed = 2.0,
    inputBlack = 0,
    inputWhite = 1,
    gamma = 1,
    contrast = 1
  }: ASCIIEffectOptions = {}) {
    const allChars = backgroundChar + patternChars
    const charTexture = createCharacterTexture(allChars, cellSize, fontFamily)
    const colorDarkObj = new Color(colorDark)
    const colorLightObj = new Color(colorLight)
    const bgColorObj = new Color(bgColor)
    
    super('ASCIIEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['uCharacters', new Uniform(charTexture)],
        ['uCharactersCount', new Uniform(allChars.length)],
        ['uCellSize', new Uniform(cellSize)],
        ['uInvert', new Uniform(invert)],
        ['uColorMode', new Uniform(colorMode)],
        ['uColorDark', new Uniform(colorDarkObj)],
        ['uColorLight', new Uniform(colorLightObj)],
        ['uBgColor', new Uniform(bgColorObj)],
        ['uHueShift', new Uniform(hueShift)],
        ['uSaturation', new Uniform(saturation)],
        ['uTime', new Uniform(0)],
        ['uChangeSpeed', new Uniform(changeSpeed)],
        ['uBgCharIndex', new Uniform(0)],
        ['uInputBlack', new Uniform(inputBlack)],
        ['uInputWhite', new Uniform(inputWhite)],
        ['uGamma', new Uniform(gamma)],
        ['uContrast', new Uniform(contrast)]
      ])
    })
    
    this._backgroundChar = backgroundChar
    this._patternChars = patternChars
    this._cellSize = cellSize
    this._fontFamily = fontFamily
    this._charTexture = charTexture
  }
  
  set cellSize(value: number) {
    this._cellSize = value
    this.uniforms.get('uCellSize')!.value = value
    this._regenerateTexture()
  }
  
  get cellSize(): number {
    return this._cellSize
  }
  
  set fontFamily(value: string) {
    this._fontFamily = value
    this._regenerateTexture()
  }
  
  get fontFamily(): string {
    return this._fontFamily
  }
  
  set invert(value: boolean) {
    this.uniforms.get('uInvert')!.value = value
  }
  
  get invert(): boolean {
    return this.uniforms.get('uInvert')!.value as boolean
  }
  
  set colorMode(value: boolean) {
    this.uniforms.get('uColorMode')!.value = value
  }
  
  get colorMode(): boolean {
    return this.uniforms.get('uColorMode')!.value as boolean
  }
  
  set colorDark(value: string) {
    (this.uniforms.get('uColorDark')!.value as Color).set(value)
  }
  
  set colorLight(value: string) {
    (this.uniforms.get('uColorLight')!.value as Color).set(value)
  }
  
  set bgColor(value: string) {
    (this.uniforms.get('uBgColor')!.value as Color).set(value)
  }
  
  set hueShift(value: number) {
    this.uniforms.get('uHueShift')!.value = value
  }
  
  get hueShift(): number {
    return this.uniforms.get('uHueShift')!.value as number
  }
  
  set saturation(value: number) {
    this.uniforms.get('uSaturation')!.value = value
  }
  
  get saturation(): number {
    return this.uniforms.get('uSaturation')!.value as number
  }
  
  set changeSpeed(value: number) {
    this.uniforms.get('uChangeSpeed')!.value = value
  }
  
  get changeSpeed(): number {
    return this.uniforms.get('uChangeSpeed')!.value as number
  }
  
  set inputBlack(value: number) {
    this.uniforms.get('uInputBlack')!.value = value
  }
  
  get inputBlack(): number {
    return this.uniforms.get('uInputBlack')!.value as number
  }
  
  set inputWhite(value: number) {
    this.uniforms.get('uInputWhite')!.value = value
  }
  
  get inputWhite(): number {
    return this.uniforms.get('uInputWhite')!.value as number
  }
  
  set gamma(value: number) {
    this.uniforms.get('uGamma')!.value = value
  }
  
  get gamma(): number {
    return this.uniforms.get('uGamma')!.value as number
  }
  
  set contrast(value: number) {
    this.uniforms.get('uContrast')!.value = value
  }
  
  get contrast(): number {
    return this.uniforms.get('uContrast')!.value as number
  }
  
  update(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget, deltaTime?: number): void {
    this.uniforms.get('uTime')!.value += deltaTime ?? 0
  }
  
  setCharacters(backgroundChar: string, patternChars: string): void {
    this._backgroundChar = backgroundChar
    this._patternChars = patternChars
    this._regenerateTexture()
  }
  
  private _regenerateTexture(): void {
    if (this._charTexture) {
      this._charTexture.dispose()
    }
    
    const allChars = this._backgroundChar + this._patternChars
    this._charTexture = createCharacterTexture(allChars, this._cellSize, this._fontFamily)
    this.uniforms.get('uCharacters')!.value = this._charTexture
    this.uniforms.get('uCharactersCount')!.value = allChars.length
    this.uniforms.get('uBgCharIndex')!.value = 0
  }
  
  dispose(): void {
    if (this._charTexture) {
      this._charTexture.dispose()
    }
    super.dispose()
  }
}
