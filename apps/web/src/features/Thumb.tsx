import { renderThumbnail } from "@view/viewer-core";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DICOMWEB } from "../api";
import { modalityColor } from "../format";

// Thumbnails decode real images and each spins up a short-lived GL context, so render at most two at a time.
const MAX_PARALLEL = 2;
const queue: Array<() => Promise<void>> = [];
let running = 0;

function pump() {
  while (running < MAX_PARALLEL && queue.length) {
    const job = queue.shift()!;
    running++;
    job().finally(() => { running--; pump(); });
  }
}
const enqueue = (work: () => Promise<void>) =>
  new Promise<void>((resolve, reject) => { queue.push(() => work().then(resolve, reject)); pump(); });

/** Preview of a series (middle image), loaded only once it scrolls into view. Falls back to the modality for non-image series. */
export function Thumb({ studyUid, seriesUid, modality }: { studyUid: string; seriesUid: string; modality: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      enqueue(() => {
        if (cancelled || !canvas.current) return Promise.reject(new Error("unmounted"));
        return renderThumbnail(DICOMWEB, studyUid, seriesUid, canvas.current);
      }).then(() => !cancelled && setState("ok"), () => !cancelled && setState("fail"));
    });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [studyUid, seriesUid]);

  return (
    <span ref={box} className={`thumb ${state}`} style={{ "--c": modalityColor(modality) } as CSSProperties}>
      <canvas ref={canvas} width={128} height={128} aria-hidden="true" />
      {state !== "ok" && <span className="fallback">{state === "idle" ? "" : modality || "—"}</span>}
      <em>{modality}</em>
    </span>
  );
}
