import { useEffect, useState } from "react";
import { isMuted, onMuted, setMuted, sfx } from "../lib/sound";
import { Icon } from "./Icon";

export function SoundButton() {
  const [muted, setM] = useState(isMuted);
  useEffect(() => onMuted(setM), []);
  return (
    <button className="btn sq" title={muted ? "Ativar sons" : "Silenciar sons"} aria-label={muted ? "Ativar sons" : "Silenciar sons"} aria-pressed={!muted}
      onClick={() => { setMuted(!muted); if (muted) sfx("toggleOn"); }}>
      <Icon name={muted ? "mute" : "vol"} />
    </button>
  );
}
