import type { ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { ThemeButton } from "../ui/theme";

export function Topbar({ chip, children }: { chip?: ReactNode; children?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="logo"><Icon name="logo" size={22} /></div>
        <b>Lumen <span>DICOM</span></b>
      </div>
      {chip}
      <div className="spacer" />
      {children}
      <ThemeButton />
    </header>
  );
}
