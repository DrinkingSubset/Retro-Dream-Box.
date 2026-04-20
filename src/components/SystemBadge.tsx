import { SystemId } from "@/lib/gameStore";
import { cn } from "@/lib/utils";

interface Props {
  system: SystemId | "all";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const LABEL: Record<string, string> = {
  all: "ALL",
  gba: "GBA",
  gbc: "GBC",
  nes: "NES",
};

const GRADIENT: Record<string, string> = {
  all: "bg-gradient-primary",
  gba: "bg-gradient-gba",
  gbc: "bg-gradient-gbc",
  nes: "bg-gradient-nes",
};

export default function SystemBadge({ system, size = "md", className }: Props) {
  const sizeClass =
    size === "sm"
      ? "text-[10px] px-2 py-0.5"
      : size === "lg"
      ? "text-sm px-3 py-1"
      : "text-xs px-2.5 py-1";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-display font-bold tracking-wider text-white shadow-card",
        GRADIENT[system],
        sizeClass,
        className,
      )}
    >
      {LABEL[system]}
    </span>
  );
}
