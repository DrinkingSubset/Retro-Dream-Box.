import { useEffect, useState } from "react";
import { Save, Download, Trash2, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  SAVE_SLOTS,
  captureThumbnail,
  deleteSlot,
  listSlots,
  readSlot,
  writeSlot,
  type SaveSlot,
  type SaveStateMeta,
} from "@/lib/saveStateStore";

interface Props {
  gameId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Slot picker for save states. Renders a 3x3 grid of slots, each showing
 * the timestamp and a small screenshot of the moment the state was saved.
 *
 * Tap an empty slot to save into it; tap a filled slot to load it
 * (long-press / trash icon to delete).
 */
export default function SaveStatesDialog({ gameId, open, onOpenChange }: Props) {
  const [slots, setSlots] = useState<Record<SaveSlot, SaveStateMeta | null>>({} as any);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setSlots(await listSlots(gameId));
  };

  useEffect(() => {
    if (!open) return;
    refresh();
  }, [open, gameId]);

  const emu = () => (window as any).EJS_emulator;

  const doSave = async (slot: SaveSlot) => {
    if (busy) return;
    setBusy(true);
    try {
      const e = emu();
      if (!e?.gameManager?.getState) throw new Error("Emulator not ready");
      const state: Uint8Array = e.gameManager.getState();
      const buf = new ArrayBuffer(state.byteLength);
      new Uint8Array(buf).set(state);
      const thumb = captureThumbnail();
      await writeSlot(gameId, slot, buf, thumb);
      await refresh();
      toast({ title: `Saved to slot ${slot}` });
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const doLoad = async (slot: SaveSlot) => {
    if (busy) return;
    setBusy(true);
    try {
      const e = emu();
      if (!e?.gameManager?.loadState) throw new Error("Emulator not ready");
      const buf = await readSlot(gameId, slot);
      if (!buf) {
        toast({ title: "Slot is empty" });
        return;
      }
      e.gameManager.loadState(new Uint8Array(buf));
      toast({ title: `Loaded slot ${slot}` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Load failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (slot: SaveSlot, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteSlot(gameId, slot);
    await refresh();
    toast({ title: `Slot ${slot} cleared` });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl border-t border-border/60 bg-background/95 backdrop-blur-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <SheetHeader className="text-left mb-3">
          <SheetTitle className="text-base">Save states</SheetTitle>
          <SheetDescription className="text-xs">
            9 slots per game. Tap an empty slot to save; tap a filled slot to load.
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-3 gap-2">
          {SAVE_SLOTS.map((slot) => {
            const meta = slots[slot];
            const filled = !!meta;
            return (
              <button
                key={slot}
                onClick={() => (filled ? doLoad(slot) : doSave(slot))}
                disabled={busy}
                className={`relative aspect-[4/3] rounded-xl border overflow-hidden text-left transition-colors ${
                  filled
                    ? "border-primary/40 bg-secondary/30 hover:bg-secondary/50"
                    : "border-dashed border-border/60 bg-secondary/20 hover:bg-secondary/40"
                } disabled:opacity-50`}
              >
                {meta?.thumbnail ? (
                  <img
                    src={meta.thumbnail}
                    alt={`Slot ${slot} preview`}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <Save className="w-6 h-6" />
                  </div>
                )}

                {/* Slot badge */}
                <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-background/80 backdrop-blur text-[10px] font-mono font-bold">
                  {slot}
                </div>

                {filled && (
                  <>
                    <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 bg-gradient-to-t from-black/85 to-transparent text-[10px] text-white">
                      {new Date(meta!.savedAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => doDelete(slot, e)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") doDelete(slot, e as any);
                      }}
                      className="absolute top-1 right-1 p-1 rounded-md bg-background/80 hover:bg-destructive/30 text-muted-foreground hover:text-destructive backdrop-blur cursor-pointer"
                      aria-label={`Delete slot ${slot}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </span>
                  </>
                )}

                {filled && (
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none opacity-0 group-hover:opacity-100">
                    <Download className="w-5 h-5 text-white drop-shadow" />
                  </div>
                )}
              </button>
            );
          })}
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
