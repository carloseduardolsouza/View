import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type Theme = "light" | "dark";

function initial(): Theme {
  try {
    const s = localStorage.getItem("theme");
    if (s === "light" || s === "dark") return s;
  } catch { /* storage blocked: fall back to system */ }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeButton() {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch { /* ignore */ }
  }, [theme]);
  const dark = theme === "dark";
  return (
    <button className="btn sq" title={dark ? "Tema claro" : "Tema escuro"} aria-label={dark ? "Mudar para tema claro" : "Mudar para tema escuro"} onClick={() => setTheme(dark ? "light" : "dark")}>
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}
