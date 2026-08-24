"use client";

import { installExpandedPlayerNames } from "../../career/player-name-expansion";
import FutboboShell from "./FutboboShell";

export default function FutboboShellWithNames() {
  installExpandedPlayerNames();
  return <FutboboShell />;
}
