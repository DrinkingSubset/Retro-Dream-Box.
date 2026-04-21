/**
 * Custom skin manager — drop in a `.deltaskin` file, pick the system it
 * targets, then it appears as an option in the per-game settings sheet.
 */
import { useRef, useState } from "react";
import { Upload, Trash2, FileArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  addCustomSkin,
  deleteCustomSkin,
  useCustomSkins,
  type CustomSkinRecord,
} from "@/lib/customSkinStore";
import { SYSTEM_LABELS, SYSTEM_SHORT, type SystemId } from "@/lib/gameStore";

const SUPPORTED: SystemId[] = ["gba", "gbc", "nes"];

export default function CustomSkinsManager() {
  const skins = useCustomSkins();
  const fileRef = useRef<HTMLInputElement>(null);
  const [system, setSystem] = useState<CustomSkinRecord["system"]>("gba");
  const [busy, setBusy] = useState(false);

  const onPick = async (file: File) => {
    setBusy(true);
    try {
      const meta = await addCustomSkin(file, system);
      toast({ title: "Skin added", description: meta.name });
    } catch (err: any) {
      toast({
        title: "Couldn't import skin",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-display font-semibold mb-2 block">System for new skin</Label>
        <div className="grid grid-cols-3 gap-2">
          {SUPPORTED.map((s) => (
            <button
              key={s}
              onClick={() => setSystem(s)}
              className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                system === s
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/50 bg-secondary/40 hover:bg-secondary/70"
              }`}
            >
              {SYSTEM_SHORT[s]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <input
          ref={fileRef}
          type="file"
          accept=".deltaskin,application/zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPick(file);
          }}
        />
        <Button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="w-full"
          size="sm"
        >
          <Upload className="w-4 h-4" />
          {busy ? "Importing…" : `Upload .deltaskin for ${SYSTEM_LABELS[system]}`}
        </Button>
        <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
          Imported skins appear in <strong>This game</strong> settings while playing a matching ROM.
        </p>
      </div>

      <div className="space-y-2">
        {skins.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No custom skins yet.</p>
        ) : (
          skins.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40">
              <div className="w-9 h-9 rounded-lg bg-card flex items-center justify-center text-primary shrink-0">
                <FileArchive className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{s.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {SYSTEM_SHORT[s.system]} · added {new Date(s.addedAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => deleteCustomSkin(s.id)}
                className="p-2 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                aria-label={`Delete ${s.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
