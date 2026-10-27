import { beforeAll, expect, it } from "vitest";

let m: typeof import("./stow.js");
beforeAll(async () => {
  // stow.ts pulls in config.ts, which refuses to load without these
  Object.assign(process.env, { DATABASE_URL: "postgres://x/x", ORTHANC_URL: "http://x", ORTHANC_USER: "u", ORTHANC_PASSWORD: "p", WEB_ORIGIN: "http://x" });
  m = await import("./stow.js");
});

it("recognises Part10 only with the DICM magic", () => {
  const ok = Buffer.concat([Buffer.alloc(128), Buffer.from("DICM"), Buffer.from("x")]);
  expect(m.isPart10(ok)).toBe(true);
  expect(m.isPart10(Buffer.alloc(200))).toBe(false);
  expect(m.isPart10(Buffer.from("DICM"))).toBe(false);
});
it("wraps the file in a closed multipart/related body", () => {
  expect(m.multipartRelated(Buffer.from("DATA"), "bnd").toString()).toBe("--bnd\r\nContent-Type: application/dicom\r\n\r\nDATA\r\n--bnd--\r\n");
});
