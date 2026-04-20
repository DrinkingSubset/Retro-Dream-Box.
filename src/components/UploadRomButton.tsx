import { useRef } from "react";
import { Upload } from "lucide-react";
import { addGameFile, GameMeta } from "@/lib/gameStore";
import { toast } from "sonner";

interface Props {
  onAdded: (games: GameMeta[]) => void;
  variant?: "primary" | "ghost";
}

export default function UploadRomButton({ onAdded, variant = "primary" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added: GameMeta[] = [];
    let skipped = 0;
    for (const file of Array.from(files)) {
      const meta = await addGameFile(file);
      if (meta) added.push(meta);
      else skipped++;
    }
    if (added.length) {
      onAdded(added);
      toast.success(`Added ${added.length} game${added.length > 1 ? "s" : ""}`);
    }
    if (skipped) {
      toast.error(`${skipped} unsupported file${skipped > 1 ? "s" : ""} skipped`, {
        description: "Only .gba, .gbc, .gb, and .nes files are supported.",
      });
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const base =
    "inline-flex items-center gap-2 font-display font-semibold rounded-full transition-all duration-300 ease-[var(--ease-spring)]";
  const styles =
    variant === "primary"
      ? `${base} bg-gradient-primary text-primary-foreground px-6 py-3 shadow-glow hover:scale-105`
      : `${base} bg-secondary/50 text-foreground px-5 py-2.5 hover:bg-secondary border border-border/60`;

  return (
    <>
      <button onClick={() => inputRef.current?.click()} className={styles}>
        <Upload className="w-4 h-4" />
        Add Game
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".gba,.gbc,.gb,.nes"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </>
  );
}
