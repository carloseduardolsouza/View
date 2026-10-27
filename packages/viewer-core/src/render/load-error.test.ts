import { expect, it } from "vitest";
import { describeLoadError } from "./load-error";

it("maps known failures to Portuguese", () => {
  expect(describeLoadError(new Error("No decoder for transfer syntax 1.2.840.10008.1.2.4.201"))).toMatch(/1\.2\.840\.10008\.1\.2\.4\.201/);
  expect(describeLoadError("failed to decode frame")).toMatch(/decodificar/);
  expect(describeLoadError(new Error("HTTP 404"))).toMatch(/servidor/);
  expect(describeLoadError(new Error("boom"))).toBe("Falha ao carregar a imagem: boom");
  expect(describeLoadError(undefined)).toBe("Falha ao carregar a imagem.");
});
