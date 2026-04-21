import { useEffect, useState } from "react";
import { Menu, Save, Download, Zap, Lock, Camera, Sparkles, X, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { getCheats, saveCheats, normaliseCheatCode, type Cheat } from "@/lib/cheatStore";

interface Props {
  gameId: string;
  /** Called when the user wants to toggle the "hold buttons" mode in the parent. */
  onToggleHoldMode: () => void;
  holdMode: boolean;
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

/**
 * Bottom-left floating menu button rendered on the Play screen.
 * Opens a sheet of options that act on `window.EJS_emulator`.
 */
export default function PlayMenu({
  gameId,
  onToggleHoldMode,
  holdMode,
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
  const [fastForward, setFastForward] = useState(false);

  const emu = () => (window as any).EJS_emulator;

  const saveState = async () => {
    try {
      const e = emu();
      if (!e?.gameManager?.getState) throw new Error("Emulator not ready");
      const state: Uint8Array = e.gameManager.getState();
      const key = `delta-state:${gameId}`;
      // Copy into a fresh ArrayBuffer to avoid SharedArrayBuffer typing issues
      const buf = new ArrayBuffer(state.byteLength);
      new Uint8Array(buf).set(state);
      localStorage.setItem(key + ":ts", String(Date.now()));
      const { set } = await import("idb-keyval");
      await set(key, buf);
      toast({ title: "State saved" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message, variant: "destructive" });
    }
    setOpen(false);
  };

  const loadState = async () => {
    try {
      const e = emu();
      if (!e?.gameManager?.loadState) throw new Error("Emulator not ready");
      const { get } = await import("idb-keyval");
      const buf = (await get(`delta-state:${gameId}`)) as ArrayBuffer | undefined;
      if (!buf) {
        toast({ title: "No saved state", description: "Save one first." });
        return;
      }
      e.gameManager.loadState(new Uint8Array(buf));
      toast({ title: "State loaded" });
    } catch (err: any) {
      toast({ title: "Load failed", description: err?.message, variant: "destructive" });
    }
    setOpen(false);
  };

  const toggleFastForward = () => {
    try {
      const e = emu();
      const next = !fastForward;
      // Most EJS builds expose setFastForwardRatio; fall back to gameManager.
      if (e?.setFastForwardRatio) e.setFastForwardRatio(next ? 4 : 1);
      else if (e?.gameManager?.setFastForwardRatio) e.gameManager.setFastForwardRatio(next ? 4 : 1);
      setFastForward(next);
      toast({ title: next ? "Fast forward ON (4×)" : "Fast forward OFF" });
    } catch (err: any) {
      toast({ title: "Fast forward unavailable", description: err?.message, variant: "destructive" });
    }
    setOpen(false);
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
          className="fixed bottom-3 left-3 z-40 w-11 h-11 rounded-full bg-background/70 backdrop-blur-md border border-border/60 shadow-elevated flex items-center justify-center text-foreground hover:bg-background/90 active:scale-95 transition"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Game menu</DialogTitle>
            <DialogDescription>Quick actions for this session.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <MenuTile icon={<Save className="w-5 h-5" />} label="Save state" onClick={saveState} />
            <MenuTile icon={<Download className="w-5 h-5" />} label="Load state" onClick={loadState} />
            <MenuTile icon={<Sparkles className="w-5 h-5" />} label="Cheat codes" onClick={() => { setOpen(false); setCheatsOpen(true); }} />
            <MenuTile icon={<Zap className="w-5 h-5" />} label={fastForward ? "Stop fast fwd" : "Fast forward"} onClick={toggleFastForward} active={fastForward} />
            <MenuTile icon={<Lock className="w-5 h-5" />} label={holdMode ? "Hold: ON" : "Hold buttons"} onClick={handleHold} active={holdMode} />
            <MenuTile icon={<Camera className="w-5 h-5" />} label="Screenshot" onClick={screenshot} />
          </div>
        </DialogContent>
      </Dialog>

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
      className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl border transition-colors ${
        active
          ? "bg-primary/15 border-primary/40 text-primary"
          : "bg-secondary/40 border-border/50 hover:bg-secondary/70"
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
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
