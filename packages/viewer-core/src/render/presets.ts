export interface WindowPreset { id: string; label: string; ww: number; wc: number }

// Common CT windows (HU). Other modalities use the image's own window ("Padrão").
export const CT_PRESETS: WindowPreset[] = [
  { id: "soft", label: "Tecido mole", ww: 400, wc: 40 },
  { id: "lung", label: "Pulmão", ww: 1500, wc: -600 },
  { id: "bone", label: "Osso", ww: 2000, wc: 400 },
  { id: "brain", label: "Cérebro", ww: 80, wc: 40 },
  { id: "mediastinum", label: "Mediastino", ww: 350, wc: 50 },
  { id: "liver", label: "Fígado", ww: 150, wc: 60 },
  { id: "angio", label: "Angio", ww: 700, wc: 200 },
];

export const presetsFor = (modality: string | undefined): WindowPreset[] => (modality === "CT" ? CT_PRESETS : []);

export const toWindow = (lower: number, upper: number) => ({ ww: upper - lower, wc: (upper + lower) / 2 });
export const fromWindow = (ww: number, wc: number) => ({ lower: wc - ww / 2, upper: wc + ww / 2 });
