import type { ReactNode } from "react";
import logo from "../assets/logo.png";
import { SoundButton } from "../ui/SoundButton";

/** `end` replaces the sound toggle. */
export function Topbar({ chip, children, end = <SoundButton /> }: { chip?: ReactNode; children?: ReactNode; end?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="logo"><img src={logo} alt="" /></div>
        <b>Genus <span>View</span></b>
      </div>
      {chip}
      <div className="spacer" />
      {children}
      {end}
    </header>
  );
}
