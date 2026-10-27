import { useEffect, useRef, useState, type ReactNode } from "react";
import { sfx } from "../lib/sound";
import { Icon } from "./Icon";

/** Button with a caret that opens a floating panel; `children` gets a `close` callback. Closes on outside click / Escape. */
export function Popover({ label, button, className = "", children }: { label: string; button?: ReactNode; className?: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className={`pop ${className}`} ref={root}>
      <button className={`pop-btn${button ? " txt" : ""}`} title={label} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => { if (!open) sfx("open"); setOpen(!open); }}>
        {button}<Icon name="down" size={12} />
      </button>
      {open && <div className="pop-panel" role="menu">{children(() => setOpen(false))}</div>}
    </div>
  );
}
