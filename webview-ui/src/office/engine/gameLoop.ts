import { MAX_DELTA_TIME_SEC } from '../../constants.js';

/** @internal */
export interface GameLoopCallbacks {
  update: (dt: number) => void;
  render: (ctx: CanvasRenderingContext2D) => void;
}

export function startGameLoop(canvas: HTMLCanvasElement, callbacks: GameLoopCallbacks): () => void {
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  let lastTime = 0;
  let rafId = 0;
  let stopped = false;
  let lastDrawWallTime = performance.now();

  const draw = (time: number) => {
    if (stopped) return;
    const dt = lastTime === 0 ? 0 : Math.min((time - lastTime) / 1000, MAX_DELTA_TIME_SEC);
    lastTime = time;
    callbacks.update(dt);
    ctx.imageSmoothingEnabled = false;
    callbacks.render(ctx);
    lastDrawWallTime = performance.now();
  };

  const frame = (time: number) => {
    if (stopped) return;
    draw(time);
    rafId = requestAnimationFrame(frame);
  };

  rafId = requestAnimationFrame(frame);

  // Safari/WebKit may suppress rAF while its view is being resumed, mounted or
  // captured. Keep the ORIGINAL renderer alive instead of showing a blank office.
  // On normally painting screens the watchdog never draws a duplicate frame.
  // Unlike scheduling another rAF, this never accumulates pending frame requests.
  const watchdog = setInterval(() => {
    if (!stopped && performance.now() - lastDrawWallTime > 350) {
      draw(performance.now());
    }
  }, 160);

  return () => {
    stopped = true;
    cancelAnimationFrame(rafId);
    clearInterval(watchdog);
  };
}
