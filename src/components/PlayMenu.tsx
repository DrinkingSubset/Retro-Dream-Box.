import { useEffect, useRef, useState } from "react";
import { Save, Gauge, Lock, Camera, Sparkles, X, Trash2, Plus, Sliders, Video, Square, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { getCheats, saveCheats, normaliseCheatCode, type Cheat } from "@/lib/cheatStore";
import { listSlots, readSlot, type SaveSlot } from "@/lib/saveStateStore";
import SaveStatesDialog from "@/components/SaveStatesDialog";
import GameSettingsDialog from "@/components/GameSettingsDialog";
import { startCanvasRecording, type ActiveRecording } from "@/lib/canvasRecorder";
import { updateGameSettings } from "@/lib/gameSettingsStore";
import type { SystemId } from "@/lib/gameStore";

interface Props {
  gameId: string;
  system: SystemId;
  /** Called when the user wants to toggle the "hold buttons" mode in the parent. */
  onToggleHoldMode: () => void;
  holdMode: boolean;
  /** Current playback speed, controlled by the parent. */
  speed: number;
  onSpeedChange: (speed: number) => void;
  /**
   * When true, hides the built-in floating trigger button. The host is
   * expected to open the menu via the `open` / `onOpenChange` props
   * (e.g. by wiring it to the active skin's "menu" hit-region).
   */
  hideTrigger?: boolean;
  /** Controlled open state. If omitted, the component manages its own state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const SPEEDS = [0.5, 1, 2, 4] as const;

/**
 * Bottom-left floating menu button rendered on the Play screen.
 * Opens a sheet of options that act on `window.EJS_emulator`.
 */
export default function PlayMenu({
  gameId,
  system,
  onToggleHoldMode,
  holdMode,
  speed,
  onSpeedChange,
  hideTrigger,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setInternalOpen(v);
  };
  const [cheatsOpen, setCheatsOpen] = useState(false);
  const [statesOpen, setStatesOpen] = useState(false);
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);
  const recordingRef = useRef<ActiveRecording | null>(null);
  const [recording, setRecording] = useState(false);

  const emu = () => (window as any).EJS_emulator;

  const handleSpeed = (s: number) => {
    onSpeedChange(s);
    // Persist as the per-game default — next launch starts at this speed.
    updateGameSettings(gameId, { speed: s });
    toast({ title: `Speed: ${s}×` });
  };

  const screenshot = () => {
    try {
      const e = emu();
      const canvas: HTMLCanvasElement | undefined = e?.canvas ?? document.querySelector("#emu-game canvas") as HTMLCanvasElement;
      if (!canvas) throw new Error("Canvas not found");
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `screenshot-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
      toast({ title: "Screenshot saved" });
    } catch (err: any) {
      toast({ title: "Screenshot failed", description: err?.message, variant: "destructive" });
    }
    setOpen(false);
  };

  const toggleRecording = async () => {
    try {
      if (recordingRef.current?.isRecording()) {
        await recordingRef.current.stop();
        recordingRef.current = null;
        setRecording(false);
        toast({ title: "Recording saved" });
      } else {
        recordingRef.current = startCanvasRecording();
        setRecording(true);
        toast({ title: "Recording started", description: "Tap again to stop & download." });
      }
    } catch (err: any) {
      toast({ title: "Recording failed", description: err?.message, variant: "destructive" });
      recordingRef.current = null;
      setRecording(false);
    }
    setOpen(false);
  };

  // Stop any in-flight recording when this component unmounts (e.g. user
  // navigates back to the library).
  useEffect(() => {
    return () => {
      if (recordingRef.current?.isRecording()) {
        recordingRef.current.stop().catch(() => { /* ignore */ });
      }
    };
  }, []);

  const handleHold = () => {
    onToggleHoldMode();
    setOpen(false);
  };

  return (
    <>
      {!hideTrigger && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Game menu"
          className="fixed bottom-3 left-3 z-40 px-3 h-10 rounded-full bg-background/70 backdrop-blur-md border border-border/60 shadow-elevated flex items-center gap-1.5 text-foreground hover:bg-background/90 active:scale-95 transition text-xs font-display font-semibold"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <Sliders className="w-4 h-4" /> Menu
        </button>
      )}

      {recording && (
        <div className="fixed top-2 right-2 z-50 px-2 py-1 rounded-md bg-destructive/90 text-destructive-foreground text-xs font-mono font-bold flex items-center gap-1.5 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> REC
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl border-t border-border/60 bg-background/95 backdrop-blur-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto"
        >
          {/* Drag handle */}
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />

          <SheetHeader className="text-left mb-3">
            <SheetTitle className="text-base">Game menu</SheetTitle>
            <SheetDescription className="text-xs">Quick actions for this session.</SheetDescription>
          </SheetHeader>

          {/* Speed control — single row, four buttons. */}
          <div className="mb-3">
            <div className="text-[11px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" /> Speed
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSpeed(s)}
                  className={`py-1.5 rounded-lg text-sm font-display font-semibold border transition-colors ${
                    speed === s
                      ? "bg-primary/15 border-primary/50 text-primary"
                      : "bg-secondary/40 border-border/50 hover:bg-secondary/70"
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <MenuTile icon={<Save className="w-4 h-4" />} label="Saves" onClick={() => { setOpen(false); setStatesOpen(true); }} />
            <MenuTile icon={<Sliders className="w-4 h-4" />} label="Game" onClick={() => { setOpen(false); setGameSettingsOpen(true); }} />
            <MenuTile icon={<Sparkles className="w-4 h-4" />} label="Cheats" onClick={() => { setOpen(false); setCheatsOpen(true); }} />
            <MenuTile icon={<Lock className="w-4 h-4" />} label={holdMode ? "Hold ✓" : "Hold"} onClick={handleHold} active={holdMode} />
            <MenuTile icon={<Camera className="w-4 h-4" />} label="Shot" onClick={screenshot} />
            <MenuTile
              icon={recording ? <Square className="w-4 h-4" /> : <Video className="w-4 h-4" />}
              label={recording ? "Stop" : "Record"}
              onClick={toggleRecording}
              active={recording}
            />
          </div>
        </SheetContent>
      </Sheet>

      <SaveStatesDialog gameId={gameId} open={statesOpen} onOpenChange={setStatesOpen} />
      <GameSettingsDialog gameId={gameId} system={system} open={gameSettingsOpen} onOpenChange={setGameSettingsOpen} />
      <CheatsDialog gameId={gameId} open={cheatsOpen} onOpenChange={setCheatsOpen} />
    </>
  );
}

function MenuTile({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl border transition-colors ${
        active
          ? "bg-primary/15 border-primary/40 text-primary"
          : "bg-secondary/40 border-border/50 hover:bg-secondary/70"
      }`}
    >
      {icon}
      <span className="text-[11px] font-medium leading-none">{label}</span>
    </button>
  );
}

function CheatsDialog({
  gameId,
  open,
  onOpenChange,
}: {
  gameId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [cheats, setCheats] = useState<Cheat[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!open) return;
    getCheats(gameId).then(setCheats);
  }, [gameId, open]);

  const persist = async (next: Cheat[]) => {
    setCheats(next);
    await saveCheats(gameId, next);
    applyCheatsToEmulator(next);
  };

  const addCheat = async () => {
    if (!name.trim() || !code.trim()) {
      toast({ title: "Enter a name and code" });
      return;
    }
    const next: Cheat[] = [
      ...cheats,
      { id: crypto.randomUUID(), name: name.trim(), code: normaliseCheatCode(code), enabled: true },
    ];
    await persist(next);
    setName("");
    setCode("");
    toast({ title: "Cheat added" });
  };

  const toggle = async (id: string) => {
    await persist(cheats.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
  };

  const remove = async (id: string) => {
    await persist(cheats.filter((c) => c.id !== id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cheat codes</DialogTitle>
          <DialogDescription>
            Supports Game Genie & GameShark / Action Replay. Paste one or
            multiple codes (separate with new lines or <code>+</code>).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="Cheat name (e.g. Infinite Lives)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Textarea
            placeholder={"Code(s)\ne.g. 010138CD\n01FF1AD0"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={4}
            className="font-mono text-xs"
          />
          <Button onClick={addCheat} className="w-full" size="sm">
            <Plus className="w-4 h-4" /> Add cheat
          </Button>
        </div>

        <div className="border-t border-border/50 pt-3 space-y-2">
          {cheats.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No cheats yet.</p>
          )}
          {cheats.map((c) => (
            <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/40">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.name}</div>
                <div className="text-[10px] font-mono text-muted-foreground truncate">
                  {c.code.replace(/\n/g, " · ")}
                </div>
              </div>
              <Switch checked={c.enabled} onCheckedChange={() => toggle(c.id)} />
              <button
                onClick={() => remove(c.id)}
                className="p-1.5 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                aria-label="Delete cheat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4" /> Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Push enabled cheats into the running EmulatorJS instance. Works with
 * the standard `gameManager.setCheat(idx, enabled, code)` API exposed by
 * libretro cores (mGBA, Gambatte, FCEUmm all support both Game Genie and
 * GameShark / Action Replay codes).
 */
export function applyCheatsToEmulator(cheats: Cheat[]) {
  const e = (window as any).EJS_emulator;
  const gm = e?.gameManager;
  if (!gm?.setCheat) return;
  try {
    // Reset all slots first by disabling a generous range.
    gm.resetCheat?.();
    cheats.forEach((c, idx) => {
      if (!c.enabled) return;
      // setCheat handles multi-line codes natively.
      gm.setCheat(idx, true, c.code);
    });
  } catch {
    // ignore — some cores may not implement cheats
  }
}

/**
 * Apply a numeric speed multiplier to the running emulator. 1× restores
 * the natural rate; values <1 use slow-motion, values >1 fast-forward.
 */
export function applySpeedToEmulator(speed: number) {
  const e = (window as any).EJS_emulator;
  if (!e) return;
  const gm = e.gameManager;
  // EmulatorJS gates fast-forward / slow-motion behind boolean toggles.
  // Setting only the ratio has no effect unless the corresponding mode is
  // enabled. Always disable both first, then enable + set the ratio for the
  // desired mode.
  const setFFRatio = (r: number) => {
    if (gm?.setFastForwardRatio) gm.setFastForwardRatio(r);
    else if (e.setFastForwardRatio) e.setFastForwardRatio(r);
  };
  const setSMRatio = (r: number) => {
    if (gm?.setSlowMotionRatio) gm.setSlowMotionRatio(r);
    else if (e.setSlowMotionRatio) e.setSlowMotionRatio(r);
  };
  const toggleFF = (on: boolean) => {
    try { gm?.toggleFastForward?.(on ? 1 : 0); } catch { /* ignore */ }
    try { e.toggleFastForward?.(on ? 1 : 0); } catch { /* ignore */ }
  };
  const toggleSM = (on: boolean) => {
    try { gm?.toggleSlowMotion?.(on ? 1 : 0); } catch { /* ignore */ }
    try { e.toggleSlowMotion?.(on ? 1 : 0); } catch { /* ignore */ }
  };
  try {
    if (speed === 1) {
      toggleFF(false);
      toggleSM(false);
      setFFRatio(1);
      setSMRatio(1);
    } else if (speed > 1) {
      toggleSM(false);
      setSMRatio(1);
      setFFRatio(speed);
      toggleFF(true);
    } else {
      const ratio = Math.max(2, Math.round(1 / speed));
      toggleFF(false);
      setFFRatio(1);
      setSMRatio(ratio);
      toggleSM(true);
    }
  } catch {
    // ignore — core may not support
  }
}
