import type { ReactNode } from "react";
import logo from "../assets/logo.png";
import { ThemeButton } from "../ui/theme";

export function Topbar({ chip, children }: { chip?: ReactNode; children?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="logo"><img src={logo} alt="" /></div>
        <b>Genus <span>View</span></b>
      </div>
      {chip}
      <div className="spacer" />
      {children}
      <ThemeButton />
    </header>
  );
}
