import { expect, test, type Page } from "@playwright/test";
import { buildPhantom } from "./dicom";
import { forbidDialogs, openStudy, orthancDeleteStudy, orthancUpload, pixels, cleanupAnnotations, listStudies } from "./helpers";

// 256x256 image, bright 100x100 square: with 0.5 mm pixels its side is 50 mm.
const SQUARE = { x: 78, y: 78, w: 100 };
const created: string[] = [];
const studyUids: string[] = [];
test.afterAll(async () => {
  for (const id of created) await orthancDeleteStudy(id);
  for (const uid of studyUids) await cleanupAnnotations(uid, new Set());
});
test.beforeEach(async ({ page }) => { await forbidDialogs(page); });

async function upload(name: string, pixelSpacing?: [number, number]) {
  created.push(await orthancUpload(buildPhantom({ name, pixelSpacing, size: 256, square: SQUARE })));
  const s = (await listStudies()).find((x) => x.name === name)!;
  studyUids.push(s.uid);
  return s;
}

/** Drags the Length tool across the square's horizontal extent (measured from the rendered pixels, not assumed) and returns the first measurement text. */
async function measureSquare(page: Page) {
  const vp = page.locator(".vp").first();
  await expect.poll(async () => (await pixels(page, vp.locator(".vp-host"))).litFraction).toBeGreaterThan(0.03);
  const host = vp.locator(".vp-host");
  const box = (await host.boundingBox())!;
  // find the square on the middle row (free of overlay text) of a screenshot
  const edges = await page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!; ctx.drawImage(bmp, 0, 0);
    const row = ctx.getImageData(0, Math.floor(c.height / 2), c.width, 1).data;
    // longest bright run = the square (the R/L orientation letters sit on the same row, at the edges)
    let best = { first: 0, last: 0 }, start = -1;
    for (let x = 0; x <= c.width; x++) {
      const on = x < c.width && row[x * 4]! > 200;
      if (on && start < 0) start = x;
      if (!on && start >= 0) { if (x - 1 - start > best.last - best.first) best = { first: start, last: x - 1 }; start = -1; }
    }
    return best;
  }, (await host.screenshot()).toString("base64"));
  const y = box.y + box.height / 2;
  await page.keyboard.press("l");
  await page.mouse.move(box.x + edges.first + 1, y);
  await page.mouse.down();
  await page.mouse.move(box.x + (edges.first + edges.last) / 2, y, { steps: 6 });
  await page.mouse.move(box.x + edges.last, y, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("tab", { name: /Medidas/ }).click();
  return page.locator(".item").first();
}

test("phantom with PixelSpacing 0.5 mm: 100 px square measures ~50 mm", async ({ page }) => {
  const s = await upload("FANTOMA^CALIBRADO", [0.5, 0.5]);
  await openStudy(page, s);
  const item = await measureSquare(page);
  await expect(item.locator("b")).toContainText("mm");
  const mm = async () => parseFloat((await item.locator("b").innerText()).replace(",", "."));
  // +-1.5 mm: the drag endpoints are whole screen pixels (~0.4 image px each). Poll: the list updates after the drag settles.
  await expect.poll(mm).toBeGreaterThan(48.5);
  expect(await mm()).toBeLessThan(51.5);
  await expect(item.locator(".warn")).toHaveCount(0);
});

test("phantom without PixelSpacing shows px and the uncalibrated warning, never mm", async ({ page }) => {
  await upload("FANTOMA^SEMCALIB");
  await openStudy(page, (await listStudies()).find((x) => x.name === "FANTOMA^SEMCALIB")!);
  const item = await measureSquare(page);
  const text = await item.innerText();
  expect(text).toMatch(/px/);
  expect(text).not.toMatch(/\bmm\b/);
  await expect(item.locator(".warn")).toContainText("sem calibração");
});
