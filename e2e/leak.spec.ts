import { expect, test } from "@playwright/test";
import { ctStudy, expectImage, forbidDialogs, openStudy } from "./helpers";

const CYCLES = 20;
// Generous: Cornerstone legitimately caches decoded images/textures (its cache is capped) and the shared
// RenderingEngine keeps GPU buffers, so the heap rises during the first cycles then plateaus. A real per-open leak
// (a retained StackView/viewport/canvas) would cost many MB per cycle; 20 cycles of that blows past 40 MB.
const MAX_HEAP_GROWTH_MB = 40;
const MAX_EXTRA_WEBGL_CANVASES = 2; // the shared engine may keep one offscreen canvas; per-open leaks would add 20+

test("open/close 20 times does not leak heap or WebGL canvases", async ({ page }) => {
  test.setTimeout(300_000);
  await forbidDialogs(page);
  // track every canvas that gets a WebGL context, weakly, so GC tells us which are really still alive
  await page.addInitScript(() => {
    const live: WeakRef<object>[] = [];
    (window as any).__gl = live;
    for (const C of [HTMLCanvasElement, window.OffscreenCanvas] as any[]) {
      const orig = C.prototype.getContext;
      C.prototype.getContext = function (this: object, type: string, ...rest: any[]) {
        if (/webgl/.test(type) && !(this as any).__tracked) { (this as any).__tracked = true; live.push(new WeakRef(this)); }
        return orig.call(this, type, ...rest);
      };
    }
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const measure = async () => {
    for (let i = 0; i < 3; i++) { await cdp.send("HeapProfiler.collectGarbage"); await page.waitForTimeout(150); }
    const m = (await cdp.send("Performance.getMetrics")).metrics.find((x) => x.name === "JSHeapUsedSize")!.value / 1048576;
    const gl = await page.evaluate(() => (window as any).__gl.filter((r: WeakRef<object>) => r.deref()).length as number);
    return { heapMB: m, gl };
  };
  const ct = await ctStudy();
  await page.goto("/");
  const cycle = async () => {
    await openStudy(page, ct, "CT", false); // no reload: a reload would hide leaks
    await page.keyboard.press("4"); // worst case: four viewports per open
    await expect(page.locator(".vp")).toHaveCount(4);
    await expectImage(page, page.locator(".vp").first());
    await page.getByRole("button", { name: /Estudos/ }).click();
    await expect(page.locator(".vpgrid")).toHaveCount(0);
  };
  for (let i = 0; i < 3; i++) await cycle(); // warm-up: caches fill, shaders compile
  const base = await measure();
  const trail: number[] = [];
  for (let i = 0; i < CYCLES; i++) { await cycle(); if (i % 5 === 4) trail.push(Math.round((await measure()).heapMB)); }
  const end = await measure();
  console.log(`heap MB baseline=${base.heapMB.toFixed(1)} trail=${trail} end=${end.heapMB.toFixed(1)} | live webgl canvases baseline=${base.gl} end=${end.gl}`);
  expect(await page.evaluate(() => (window as any).__gl.length)).toBeGreaterThan(0); // the probe really saw WebGL contexts
  expect(end.heapMB - base.heapMB).toBeLessThan(MAX_HEAP_GROWTH_MB);
  expect(end.gl).toBeLessThanOrEqual(base.gl + MAX_EXTRA_WEBGL_CANVASES);
  expect(await page.locator("canvas").count()).toBe(0); // nothing left in the DOM on the worklist
});
