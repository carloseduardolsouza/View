// Paths taken from docs/ui/Lumen DICOM.html
const PATHS = {
  logo: <><ellipse cx="12" cy="12" rx="7.5" ry="9.5" /><path d="M4.5 12h15M12 2.5v19" opacity=".5" /></>,
  full: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  play: <path d="M7 4l13 8-13 8z" fill="currentColor" />,
  pause: <path d="M7 4h4v16H7zM13 4h4v16h-4z" fill="currentColor" />,
  first: <><path d="M6 4v16" /><path d="M20 4L9 12l11 8z" fill="currentColor" /></>,
  last: <><path d="M18 4v16" /><path d="M4 4l11 8L4 20z" fill="currentColor" /></>,
  prev: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M16 16l5 5" /></>,
  scroll: <><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 12.5l9 5 9-5" /><path d="M3 17l9 5 9-5" /></>,
  wl: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  zoom: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6" /></>,
  pan: <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />,
  len: <><path d="M3 17L17 3l4 4L7 21z" /><path d="M7 13l2 2M10 10l2 2M13 7l2 2" /></>,
  ang: <><path d="M4 20h16M4 20L16 6" /><path d="M11 20a7 7 0 0 0-2.4-5.3" /></>,
  cobb: <><path d="M3 9l11-3M10 21l11-3" /><path d="M12 7.5l-1.5 12" strokeDasharray="2 2.5" /></>,
  rect: <rect x="4" y="6" width="16" height="12" rx="1.5" />,
  roi: <ellipse cx="12" cy="12" rx="9" ry="6" />,
  free: <path d="M4 15c2-8 5-9 6-4s3 6 5 1 3-6 5-2" />,
  arrow: <path d="M5 19L19 5M10 5h9v9" />,
  text: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  rotL: <><path d="M3 4v5h5" /><path d="M3.5 9A9 9 0 1 1 5 16" /></>,
  rotR: <><path d="M21 4v5h-5" /><path d="M20.5 9A9 9 0 1 0 19 16" /></>,
  flipH: <><path d="M12 3v18" strokeDasharray="2 2.5" /><path d="M9 7l-6 10h6z" /><path d="M15 7l6 10h-6z" fill="currentColor" /></>,
  flipV: <><path d="M3 12h18" strokeDasharray="2 2.5" /><path d="M7 9h10l-5-6z" /><path d="M7 15h10l-5 6z" fill="currentColor" /></>,
  inv: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" /></>,
  reset: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>,
  keys: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  download: <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />,
  l1: <rect x="4" y="4" width="16" height="16" rx="2" />,
  l2: <><rect x="3.5" y="5" width="8" height="14" rx="1.5" /><rect x="12.5" y="5" width="8" height="14" rx="1.5" /></>,
  l4: <><rect x="4" y="4" width="7" height="7" rx="1.2" /><rect x="13" y="4" width="7" height="7" rx="1.2" /><rect x="4" y="13" width="7" height="7" rx="1.2" /><rect x="13" y="13" width="7" height="7" rx="1.2" /></>,
  panelL: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9.5 4v16" /><path d="M3 4h6.5v16H3z" fill="currentColor" opacity=".35" stroke="none" /></>,
  panelR: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M14.5 4v16" /><path d="M14.5 4H21v16h-6.5z" fill="currentColor" opacity=".35" stroke="none" /></>,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  ruler: <><rect x="3" y="9" width="18" height="6" rx="1" /><path d="M7 9v3M11 9v2M15 9v3M19 9v2" /></>,
  report: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></>,
  cube: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></>,
  fusion: <><circle cx="9" cy="12" r="6" /><circle cx="15" cy="12" r="6" /></>,
  out: <path d="M9 4H4v16h5M16 8l4 4-4 4M20 12H9" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
