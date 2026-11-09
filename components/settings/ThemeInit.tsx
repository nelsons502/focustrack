"use client";

import { useEffect } from "react";
import { applyThemeChoice, readThemeChoice } from "./theme";

export default function ThemeInit() {
  useEffect(() => {
    applyThemeChoice(readThemeChoice());
  }, []);
  return null;
}
