import { expect, it } from "vitest";
import { describeAnnotation, hasStats } from "./annotation-info";

const mk = (toolName: string, stats: Record<string, unknown>) => ({ metadata: { toolName }, data: { cachedStats: { t: stats } } });

it("length in mm is calibrated, in px is flagged", () => {
  expect(describeAnnotation(mk("Length", { length: 42.345, unit: "mm" }))).toEqual({ title: "Comprimento", value: "42,3 mm", calibrated: true });
  expect(describeAnnotation(mk("Length", { length: 80, unit: "px" }))).toMatchObject({ value: "80,0 px", calibrated: false });
});
it("angles never depend on spacing", () => {
  expect(describeAnnotation(mk("Angle", { angle: 90 }))).toEqual({ title: "Ângulo", value: "90,0°", calibrated: true });
  expect(describeAnnotation(mk("CobbAngle", { angle: 35.04 }))).toMatchObject({ value: "35,0°" });
});
it("ROI shows area with mean, px² is uncalibrated", () => {
  expect(describeAnnotation(mk("RectangleROI", { area: 120, areaUnit: "mm²", mean: 40.2 }))).toMatchObject({ value: "120,0 mm² · média 40", calibrated: true });
  expect(describeAnnotation(mk("EllipticalROI", { area: 50, areaUnit: "px²" }))).toMatchObject({ calibrated: false });
});
it("text annotations show their label; unknown stats degrade to a dash", () => {
  expect(describeAnnotation({ metadata: { toolName: "ArrowAnnotate" }, data: { label: "nódulo" } }).value).toBe("nódulo");
  expect(describeAnnotation({ metadata: { toolName: "Length" }, data: {} }).value).toBe("—");
});

it("detects measurements that Cornerstone has not computed yet", () => {
  expect(hasStats(mk("EllipticalROI", { Modality: "CT" }))).toBe(false);
  expect(hasStats(mk("EllipticalROI", { Modality: "CT", area: 10 }))).toBe(true);
  expect(describeAnnotation(mk("EllipticalROI", { Modality: "CT" }))).toMatchObject({ value: "—", calibrated: true });
});
