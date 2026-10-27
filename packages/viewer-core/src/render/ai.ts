// Extension point for assistive modules. Nothing here ships a model: a module is any function that turns a study
// context into findings. Results are ALWAYS auxiliary, never a medical report (the UI states it).
export interface AiContext {
  studyUid: string;
  seriesUid: string;
  modality: string;
  imageIds: string[];
}
export interface AiFinding { title: string; detail?: string; imageIndex?: number }
export interface AiModule {
  id: string;
  name: string;
  version: string;
  /** DICOM modalities it accepts; empty = any */
  modalities: string[];
  run(ctx: AiContext, signal?: AbortSignal): Promise<AiFinding[]>;
}
export interface AiResult {
  moduleId: string;
  moduleName: string;
  version: string;
  ranAt: string; // ISO time
  findings: AiFinding[];
}

export const AI_DISCLAIMER = "Auxiliar — não é laudo";

const modules = new Map<string, AiModule>();

export function registerAiModule(m: AiModule) {
  if (modules.has(m.id)) throw new Error(`Módulo de IA já registrado: ${m.id}`);
  modules.set(m.id, m);
  return () => { modules.delete(m.id); };
}
export const listAiModules = (modality?: string) =>
  [...modules.values()].filter((m) => !modality || m.modalities.length === 0 || m.modalities.includes(modality));

/** Runs a module and stamps provenance; a failing module never throws into the UI flow's caller silently: it propagates. */
export async function runAiModule(id: string, ctx: AiContext, signal?: AbortSignal): Promise<AiResult> {
  const m = modules.get(id);
  if (!m) throw new Error("Módulo de IA não encontrado.");
  if (m.modalities.length && !m.modalities.includes(ctx.modality)) throw new Error(`O módulo "${m.name}" não aceita a modalidade ${ctx.modality}.`);
  const findings = await m.run(ctx, signal);
  return { moduleId: m.id, moduleName: m.name, version: m.version, ranAt: new Date().toISOString(), findings };
}

/** Harmless example: only counts slices. Registered by the UI on demand, not at import. */
export const sliceCounterModule: AiModule = {
  id: "example.slice-counter", name: "Contador de cortes (exemplo)", version: "1.0.0", modalities: [],
  run: async (ctx) => [{ title: `${ctx.imageIds.length} corte(s) na série`, detail: "Módulo de demonstração: não analisa o conteúdo das imagens." }],
};
