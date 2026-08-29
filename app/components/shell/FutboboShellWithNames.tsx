"use client";

import { installExpandedPlayerNames } from "../../career/player-name-expansion";
import { installSecondDivisions } from "../../career/second-divisions";
import FutboboShell from "./FutboboShell";

export default function FutboboShellWithNames() {
  installExpandedPlayerNames();
  installSecondDivisions();
  return <FutboboShell />;
}
