import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ThemePreference } from "@/hooks/use-theme";
import { useTheme } from "@/hooks/use-theme";

const NEXT: Readonly<Record<ThemePreference, ThemePreference>> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const LABELS: Readonly<Record<ThemePreference, string>> = {
  system: "System theme",
  light: "Light theme",
  dark: "Dark theme",
};

export const ThemeToggle = () => {
  const { preference, setPreference } = useTheme();
  const Icon = preference === "system" ? MonitorIcon : preference === "light" ? SunIcon : MoonIcon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${LABELS[preference]} (click to change)`}
          onClick={() => {
            setPreference(NEXT[preference]);
          }}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{LABELS[preference]}</TooltipContent>
    </Tooltip>
  );
};
