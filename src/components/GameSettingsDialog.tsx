/**
 * Per-game settings sheet — overrides only this ROM. Pulled out of the
 * main PlayMenu so the menu stays compact on small screens.
 */
import { useState } from "react";
import { Sliders, RotateCcw, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  useGameSettings,
  updateGameSettings,
  clearGameSettings,
} from "@/lib/gameSettingsStore";
import { useCustomSkins } from "@/lib/customSkinStore";
import { DISPLAY_MODE_LABELS, type DisplayMode, useSettings } from "@/lib/settingsStore";
import { SHADERS, type ShaderId } from "@/lib/shaders";
import type { SystemId } from "@/lib/gameStore";

interface Props {
  gameId: string;
  system: SystemId;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const SPEEDS = [0.5, 1, 2, 4] as const;

export default function GameSettingsDialog({ gameId, system, open, onOpenChange }: Props) {
  const overrides = useGameSettings(gameId);
  const globals = useSettings();
  const customSkins = useCustomSkins().filter((s) => s.system === system);

  const effectiveDisplay: DisplayMode = overrides.displayMode ?? globals.displayMode;
  const effectiveShader: ShaderId = overrides.shader ?? "off";
  const effectiveSpeed = overrides.speed ?? 1;
  const effectiveVolume = overrides.volume ?? 0.6;

  const reset = () => {
    clearGameSettings(gameId);
    toast({ title: "Per-game settings cleared" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sliders className="w-5 h-5" /> This game
          </DialogTitle>
          <DialogDescription>
            Settings here only apply to this ROM. Leave anything unset to use your global defaults.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Custom skin override */}
          {customSkins.length > 0 && (
            <div>
              <Label className="text-sm font-display font-semibold mb-2 block">Custom skin</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => updateGameSettings(gameId, { customSkinId: undefined })}
                  className={`p-2 rounded-lg border text-xs font-medium transition-colors ${
                    !overrides.customSkinId
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 bg-secondary/40 hover:bg-secondary/70"
                  }`}
                >
                  Default
                </button>
                {customSkins.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => updateGameSettings(gameId, { customSkinId: s.id })}
                    className={`p-2 rounded-lg border text-xs font-medium transition-colors truncate ${
                      overrides.customSkinId === s.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/50 bg-secondary/40 hover:bg-secondary/70"
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Picture profile */}
          <div>
            <Label className="text-sm font-display font-semibold mb-2 block">Picture mode</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(DISPLAY_MODE_LABELS) as DisplayMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => updateGameSettings(gameId, { displayMode: mode })}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                    effectiveDisplay === mode
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 bg-secondary/40 hover:bg-secondary/70"
                  }`}
                >
                  {DISPLAY_MODE_LABELS[mode].label}
                </button>
              ))}
            </div>
          </div>

          {/* Shader */}
          <div>
            <Label className="text-sm font-display font-semibold mb-2 block">Shader overlay</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {SHADERS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => updateGameSettings(gameId, { shader: s.id })}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                    effectiveShader === s.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 bg-secondary/40 hover:bg-secondary/70"
                  }`}
                  title={s.desc}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Default speed */}
          <div>
            <Label className="text-sm font-display font-semibold mb-2 block">Default speed</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => updateGameSettings(gameId, { speed: s })}
                  className={`py-2 rounded-lg text-sm font-display font-semibold border transition-colors ${
                    effectiveSpeed === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 bg-secondary/40 hover:bg-secondary/70"
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>

          {/* Volume */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-display font-semibold">Volume</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.round(effectiveVolume * 100)}%
              </span>
            </div>
            <Slider
              value={[Math.round(effectiveVolume * 100)]}
              onValueChange={([v]) => updateGameSettings(gameId, { volume: v / 100 })}
              min={0}
              max={100}
              step={5}
            />
          </div>

          {/* Hold buttons default */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-display font-semibold">Hold buttons by default</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auto-enable the latched-button mode for this game.
              </p>
            </div>
            <Switch
              checked={!!overrides.holdMode}
              onCheckedChange={(v) => updateGameSettings(gameId, { holdMode: v })}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="w-4 h-4" /> Reset
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4" /> Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
