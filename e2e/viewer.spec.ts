import { expect, test, type Page } from "@playwright/test";
import { annotations, cleanupAnnotations, ctStudy, expectImage, forbidDialogs, listStudies, openStudy, pickLayout, type Study } from "./helpers";

let ct: Study;
let before: Set<string>;
test.beforeAll(async () => {
  ct = await ctStudy();
  before = new Set((await annotations(ct.uid)).map((a) => a.uid));
});
test.afterAll(async () => { await cleanupAnnotations(ct.uid, before); });
test.beforeEach(async ({ page }) => { await forbidDialogs(page); });

const cells = (page: Page) => page.locator(".vp");
const counter = (page: Page) => cells(page).first().locator(".ov.bl b").first();
const openCt = async (page: Page) => {
  await openStudy(page, ct, "CT");
  await expectImage(page, cells(page).first()); };

test("worklist lists every Orthanc study", async ({ page }) => {
  const all = await listStudies();
  await page.goto("/");
  await expect(page.locator(".studies .s-row")).toHaveCount(all.length);
});

test("CT study renders non-black pixels", async ({ page }) => {
  await openCt(page);
});

test("mouse wheel scrolls slices", async ({ page }) => {
  await openCt(page);
  await expect(counter(page)).toHaveText("1");
  const box = (await cells(page).first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 300);
  await expect(counter(page)).not.toHaveText("1");
});

test("length measurement is saved, restored once after reload, and listed", async ({ page }) => {
  await openCt(page);
  await page.keyboard.press("l");
  const box = (await cells(page).first().boundingBox())!;
  const y = box.y + box.height / 2;
  const saved = page.waitForResponse((r) => r.url().includes(`/annotations/${ct.uid}/`) && r.request().method() === "PUT");
  await page.mouse.move(box.x + box.width * 0.4, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, y + 20, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.6, y + 40, { steps: 8 });
  await page.mouse.up();
  await saved;
  const created = (await annotations(ct.uid)).filter((a) => !before.has(a.uid));
  expect(created).toHaveLength(1);

  await page.reload();
  await openCt(page);
  await page.getByRole("tab", { name: /Medidas/ }).click();
  await expect(page.locator(".item")).toHaveCount(before.size + 1);
  expect((await annotations(ct.uid)).filter((a) => !before.has(a.uid))).toHaveLength(1);
  // cleanup is in afterAll (API delete)
});

test("text tool opens the inline editor and saves the typed text", async ({ page }) => {
  await openCt(page);
  await page.keyboard.press("x");
  const box = (await cells(page).first().boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
  const editor = page.locator("textarea.inline-text");
  await expect(editor).toBeVisible();
  const saved = page.waitForResponse((r) => r.url().includes(`/annotations/${ct.uid}/`) && r.request().method() === "PUT");
  await editor.fill("texto e2e");
  await editor.press("Enter");
  await saved;
  const created = (await annotations(ct.uid)).filter((a) => !before.has(a.uid));
  expect(JSON.stringify(created.map((a) => a.data))).toContain("texto e2e");
});

for (const n of [1, 2, 4]) {
  test(`layout ${n} renders an image in every cell`, async ({ page }) => {
    await openCt(page);
    await pickLayout(page, n);
    await expect(cells(page)).toHaveCount(n);
    // cells beyond the first are filled with the next series by the viewer
    for (let i = 0; i < n; i++) await expectImage(page, cells(page).nth(i));
  });
}

test("keyboard shortcut 4 switches the layout", async ({ page }) => {
  await openCt(page);
  await page.keyboard.press("4");
  await expect(cells(page)).toHaveCount(4);
  await page.keyboard.press("1");
  await expect(cells(page)).toHaveCount(1);
});

test("image is never stretched when side panels toggle", async ({ page }) => {
  await openCt(page);
  const ratioOk = async () => {
    const r = await cells(page).first().locator("canvas").first().evaluate((c: HTMLCanvasElement) => ({ buf: c.width / c.height, box: c.clientWidth / c.clientHeight }));
    expect(Math.abs(r.buf / r.box - 1)).toBeLessThan(0.02);
  };
  await ratioOk();
  const left = page.getByRole("button", { name: "Alternar painel esquerdo" });
  const right = page.getByRole("button", { name: "Alternar painel direito" });
  for (const step of [left, right, left, right]) {
    await step.click();
    await page.waitForTimeout(700); // layout transition + canvas resize
    await ratioOk();
    await expectImage(page, cells(page).first());
  }
});

test("dragging a series card onto a cell opens it there", async ({ page }) => {
  await openCt(page);
  await page.keyboard.press("2");
  await expect(cells(page)).toHaveCount(2);
  const second = cells(page).nth(1);
  await expectImage(page, second);
  const cards = page.locator(".series-list .ser");
  const n = await cards.count();
  // pick a card whose series is not the one already in cell 2
  const current = await second.locator(".vp-chip").innerText();
  let target = cards.nth(0);
  for (let i = 0; i < n; i++) if (!current.includes((await cards.nth(i).locator("b").innerText()))) { target = cards.nth(i); break; }
  const name = await target.locator("b").innerText();
  await target.dragTo(second);
  await expect(second.locator(".vp-chip")).toContainText(name);
  await expectImage(page, second);
});
