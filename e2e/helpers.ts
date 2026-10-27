import { expect, type Locator, type Page } from "@playwright/test";

process.loadEnvFile(new URL("../.env", import.meta.url));
export const API = "http://localhost:3000";
const ORTHANC = process.env.ORTHANC_URL!;
const orthancAuth = "Basic " + Buffer.from(`${process.env.ORTHANC_USER}:${process.env.ORTHANC_PASSWORD}`).toString("base64");

export type Study = { uid: string; modalities: string[]; name: string };

export async function listStudies(): Promise<Study[]> {
  const rows = (await (await fetch(`${API}/dicomweb/studies`)).json()) as any[];
  return rows.map((r) => ({
    uid: r["0020000D"].Value[0],
    modalities: r["00080061"]?.Value ?? [],
    name: r["00100010"]?.Value?.[0]?.Alphabetic ?? "",
  }));
}
export async function ctStudy(): Promise<Study> {
  const s = (await listStudies()).find((x) => x.modalities.includes("CT") && !x.name.startsWith("FANTOMA"));
  if (!s) throw new Error("no CT study in Orthanc");
  return s;
}

export const annotations = async (studyUid: string) => (await (await fetch(`${API}/annotations/${studyUid}`)).json()) as any[];
/** Deletes (via the API) every annotation of the study that was not in `keep`. */
export async function cleanupAnnotations(studyUid: string, keep: Set<string>) {
  for (const a of await annotations(studyUid)) if (!keep.has(a.uid)) await fetch(`${API}/annotations/${studyUid}/${a.uid}`, { method: "DELETE" });
}

export async function orthancUpload(dicom: Buffer): Promise<string> {
  const r = await fetch(`${ORTHANC}/instances`, { method: "POST", headers: { authorization: orthancAuth, "content-type": "application/dicom" }, body: dicom });
  if (!r.ok) throw new Error(`orthanc upload ${r.status}`);
  return ((await r.json()) as any).ParentStudy as string; // Orthanc study id
}
export const orthancDeleteStudy = (id: string) => fetch(`${ORTHANC}/studies/${id}`, { method: "DELETE", headers: { authorization: orthancAuth } });

/** Fails the test if the app ever calls a native dialog (they freeze the browser). */
export async function forbidDialogs(page: Page) {
  await page.addInitScript(() => {
    for (const k of ["prompt", "alert", "confirm"] as const) (window as any)[k] = () => { throw new Error(`window.${k} was called`); };
  });
}

/** Searches the worklist by patient family name and opens the first row (with `modality` chip, if given). */
export async function openStudy(page: Page, study: Study, modality?: string, nav = true) {
  if (nav) await page.goto("/");
  await page.getByRole("search").getByRole("textbox").first().fill(study.name.split("^")[0]!);
  await page.getByRole("button", { name: "Buscar" }).click();
  const row = page.locator(".studies .s-row").filter(modality ? { has: page.locator(".chip", { hasText: modality }) } : {}).first();
  await row.click();
  await expect(page.locator(".vpgrid")).toBeVisible();
  // the viewer opens in a multi-cell layout; start every test from one cell
  await pickLayout(page, 1);
  await expect(page.locator(".vp")).toHaveCount(1);
}

/** Screenshot of a locator decoded in-page: returns the pixels so tests can look at what the user sees. */
export async function pixels(page: Page, el: Locator) {
  const b64 = (await el.screenshot()).toString("base64");
  return page.evaluate(async (data) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i]! + d[i + 1]! + d[i + 2]! > 60) lit++;
    return { w: c.width, h: c.height, litFraction: lit / (d.length / 4) };
  }, b64);
}

/** The cell shows an image when a decent share of its pixels is not black (overlay text alone is ~1%). */
export async function expectImage(page: Page, cell: Locator) {
  await expect.poll(async () => (await pixels(page, cell.locator(".vp-host"))).litFraction, { timeout: 30_000 }).toBeGreaterThan(0.03);
}

/** Layout lives in a dropdown: open it, then pick the option. */
export async function pickLayout(page: Page, n: number) {
  await page.getByRole("button", { name: "Mais opções: layout" }).click();
  await page.getByRole("menuitem", { name: new RegExp(`Layout com ${n} image`) }).click();
}
