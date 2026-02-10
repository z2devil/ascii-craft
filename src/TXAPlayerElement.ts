import { ASCIIPlayer } from "./ASCIIPlayer";

interface ASCIIPlayerWithComplete extends ASCIIPlayer {
  onComplete?: () => void;
}

class TXAPlayerElement extends HTMLElement {
  private _canvas: HTMLCanvasElement;
  private _player: ASCIIPlayerWithComplete | null;
  private _loop: boolean;
  private _autoplay: boolean;

  static get observedAttributes(): string[] {
    return [
      "src",
      "autoplay",
      "loop",
      "render-scale",
      "change-speed",
      "font-family",
      "bg-color",
      "color-dark",
      "color-light",
      "characters",
      "canvas-ratio",
    ];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.shadowRoot!.innerHTML = `
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
    `;

    this._canvas = this.shadowRoot!.querySelector("canvas")!;
    this._player = null;
    this._loop = false;
    this._autoplay = false;
  }

  connectedCallback(): void {
    this._player = new ASCIIPlayer(this._canvas, {
      onFrameChange: () => {
        this.dispatchEvent(
          new CustomEvent("timeupdate", {
            detail: {
              currentTime: this._player?.currentTime,
              progress: this._player?.progress,
              currentFrame: this._player?.currentFrame,
            },
          }),
        );
      },
      onPlayStateChange: (playing: boolean) => {
        this.dispatchEvent(new CustomEvent(playing ? "play" : "pause"));
      },
    });

    this._player.onComplete = () => {
      if (this._loop) {
        this._player?.seek(0);
        this._player?.play();
      } else {
        this.dispatchEvent(new CustomEvent("ended"));
      }
    };

    const _originalAnimate = this._player.animate.bind(this._player);
    this._player.animate = () => {
      if (!this._player?.isPlaying) return;

      const now = performance.now();
      const frameTime = 1000 / this._player?.decoder.fps;
      const elapsed = now - this._player?.lastFrameTime;

      if (elapsed >= frameTime) {
        this._player!.lastFrameTime = now - (elapsed % frameTime);
        this._player!.charChangeTime = now / 1000;

        let nextFrame = this._player?.currentFrame + 1;
        if (nextFrame >= this._player?.decoder.totalFrames) {
          if (this._loop) {
            nextFrame = 0;
          } else {
            this._player?.pause();
            this.dispatchEvent(new CustomEvent("ended"));
            return;
          }
        }

        this._player?.renderFrame(nextFrame);
      } else if (this._player?.changeSpeed > 0) {
        this._player!.charChangeTime = now / 1000;
        this._player?.renderFrame(this._player?.currentFrame);
      }

      this._player!.animationId = requestAnimationFrame(() => this._player?.animate());
    };

    if (this.hasAttribute("src")) {
      this._loadSrc(this.getAttribute("src")!);
    }
  }

  disconnectedCallback(): void {
    if (this._player) {
      this._player.pause();
    }
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (!this._player) return;

    switch (name) {
      case "src":
        if (newValue) this._loadSrc(newValue);
        break;
      case "autoplay":
        this._autoplay = newValue !== null;
        break;
      case "loop":
        this._loop = newValue !== null;
        break;
      case "render-scale":
        this._player.setRenderScale(parseFloat(newValue!) || 1.0);
        break;
      case "change-speed":
        this._player.setChangeSpeed(parseFloat(newValue!) || 2.0);
        break;
      case "font-family":
        this._player.setFontFamily(newValue || "monospace");
        break;
      case "bg-color":
        this._player.setBgColor(newValue || "#000000");
        break;
      case "color-dark":
      case "color-light":
        this._updateColors();
        break;
      case "characters":
        if (newValue) this._player.setCharacters(newValue);
        break;
      case "canvas-ratio":
        this._player.setCanvasRatio(parseInt(newValue!, 10) || 0);
        break;
    }
  }

  private _updateColors(): void {
    const dark = this.getAttribute("color-dark");
    const light = this.getAttribute("color-light");
    if (dark && light) {
      this._player?.setColors(dark, light);
    }
  }

  private async _loadSrc(src: string): Promise<void> {
    if (!this._player) return;

    try {
      this.dispatchEvent(new CustomEvent("loadstart"));
      await this._player.loadFromURL(src);
      this.dispatchEvent(
        new CustomEvent("loadeddata", {
          detail: {
            duration: this._player.duration,
            totalFrames: this._player.totalFrames,
            fps: this._player.fps,
            width: this._player.width,
            height: this._player.height,
          },
        }),
      );

      this._applyAttributes();

      if (this._autoplay || this.hasAttribute("autoplay")) {
        this._player.play();
      }
    } catch (err) {
      this.dispatchEvent(new CustomEvent("error", { detail: err }));
    }
  }

  private _applyAttributes(): void {
    if (this.hasAttribute("render-scale")) {
      this._player?.setRenderScale(parseFloat(this.getAttribute("render-scale")!));
    }
    if (this.hasAttribute("change-speed")) {
      this._player?.setChangeSpeed(parseFloat(this.getAttribute("change-speed")!));
    }
    if (this.hasAttribute("font-family")) {
      this._player?.setFontFamily(this.getAttribute("font-family")!);
    }
    if (this.hasAttribute("bg-color")) {
      this._player?.setBgColor(this.getAttribute("bg-color")!);
    }
    if (this.hasAttribute("characters")) {
      this._player?.setCharacters(this.getAttribute("characters")!);
    }
    if (this.hasAttribute("canvas-ratio")) {
      this._player?.setCanvasRatio(parseInt(this.getAttribute("canvas-ratio")!, 10));
    }
    this._updateColors();
    this._loop = this.hasAttribute("loop");
    this._autoplay = this.hasAttribute("autoplay");
  }

  play(): void {
    this._player?.play();
  }

  pause(): void {
    this._player?.pause();
  }

  stop(): void {
    this._player?.stop();
  }

  toggle(): void {
    this._player?.toggle();
  }

  seek(frame: number): void {
    this._player?.seek(frame);
  }

  seekToTime(time: number): void {
    this._player?.seekToTime(time);
  }

  get duration(): number {
    return this._player?.duration || 0;
  }
  get totalFrames(): number {
    return this._player?.totalFrames || 0;
  }
  get fps(): number {
    return this._player?.fps || 0;
  }
  get width(): number {
    return this._player?.width || 0;
  }
  get height(): number {
    return this._player?.height || 0;
  }
  get currentTime(): number {
    return this._player?.currentTime || 0;
  }
  get progress(): number {
    return this._player?.progress || 0;
  }
  get paused(): boolean {
    return !this._player?.isPlaying;
  }
  get ended(): boolean {
    return this._player ? this._player.currentFrame >= this._player.totalFrames - 1 : false;
  }

  get loop(): boolean {
    return this._loop;
  }
  set loop(value: boolean) {
    this._loop = value;
    if (value) {
      this.setAttribute("loop", "");
    } else {
      this.removeAttribute("loop");
    }
  }

  get src(): string | null {
    return this.getAttribute("src");
  }
  set src(value: string | null) {
    if (value) {
      this.setAttribute("src", value);
    } else {
      this.removeAttribute("src");
    }
  }

  get renderScale(): number {
    return this._player?.renderScale || 1.0;
  }
  set renderScale(value: number) {
    this.setAttribute("render-scale", String(value));
  }

  get changeSpeed(): number {
    return this._player?.changeSpeed || 2.0;
  }
  set changeSpeed(value: number) {
    this.setAttribute("change-speed", String(value));
  }
}

customElements.define("txa-player", TXAPlayerElement);

export { TXAPlayerElement };
