// DICOM PN "DOE^JOHN" -> "John Doe"-style display; DA "20260131" -> "31/01/2026"
export const personName = (pn: string) =>
  pn.split("=")[0]!.split("^").reverse().filter(Boolean).join(" ") || "Sem nome";

export const dicomDate = (da: string) =>
  /^\d{8}$/.test(da) ? `${da.slice(6)}/${da.slice(4, 6)}/${da.slice(0, 4)}` : da || "—";

const COLORS: Record<string, string> = {
  CT: "#3c73ff", MR: "#8b5cf6", DX: "#e08a1e", CR: "#e08a1e", US: "#1fa971", PT: "#e5484d", NM: "#e5484d", XA: "#0ea5b7",
};
export const modalityColor = (m: string) => COLORS[m] ?? "#7686a5";

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** Age in whole years at `at` (both DA "yyyymmdd"); null when either is missing. */
export function ageAt(birth: string | undefined, at: string): number | null {
  if (!birth || !/^\d{8}$/.test(birth) || !/^\d{8}$/.test(at)) return null;
  const y = +at.slice(0, 4) - +birth.slice(0, 4);
  return at.slice(4) < birth.slice(4) ? y - 1 : y;
}

/** TM "143015.123" -> "14:30" */
export const dicomTime = (tm: string | undefined) => (tm && /^\d{4}/.test(tm) ? `${tm.slice(0, 2)}:${tm.slice(2, 4)}` : "");

export const SEX: Record<string, string> = { F: "Feminino", M: "Masculino", O: "Outro" };
