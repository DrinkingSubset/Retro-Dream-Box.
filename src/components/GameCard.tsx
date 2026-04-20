import { Gamepad2, Trash2 } from "lucide-react";
import { GameMeta, formatSize } from "@/lib/gameStore";
import SystemBadge from "./SystemBadge";

interface Props {
  game: GameMeta;
  onPlay: (game: GameMeta) => void;
  onDelete: (game: GameMeta) => void;
  index?: number;
}

const SYSTEM_GLYPH: Record<string, string> = {
  gba: "◢◣",
  gbc: "▣",
  nes: "▶",
};

export default function GameCard({ game, onPlay, onDelete, index = 0 }: Props) {
  return (
    <button
      onClick={() => onPlay(game)}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
      className="group relative text-left rounded-3xl bg-gradient-card border border-border/50 p-5 shadow-card hover:shadow-elevated hover:border-primary/40 hover:-translate-y-1 transition-all duration-300 ease-[var(--ease-spring)] animate-fade-up overflow-hidden"
    >
      {/* Cover art tile */}
      <div className="relative aspect-square w-full rounded-2xl overflow-hidden mb-4 ring-1 ring-white/5">
        <div
          className={`absolute inset-0 ${
            game.system === "gba"
              ? "bg-gradient-gba"
              : game.system === "gbc"
              ? "bg-gradient-gbc"
              : "bg-gradient-nes"
          }`}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(0_0%_100%/0.25),transparent_60%)]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display font-bold text-white/90 text-6xl drop-shadow-lg select-none">
            {SYSTEM_GLYPH[game.system]}
          </span>
        </div>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity scale-90 group-hover:scale-100 duration-300">
            <div className="w-14 h-14 rounded-full bg-white/95 flex items-center justify-center shadow-glow">
              <Gamepad2 className="w-7 h-7 text-primary" />
            </div>
          </div>
        </div>
        <div className="absolute top-2 left-2">
          <SystemBadge system={game.system} size="sm" />
        </div>
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-semibold text-foreground truncate">{game.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatSize(game.size)}
            {game.playCount > 0 && ` · Played ${game.playCount}×`}
          </p>
        </div>
        <span
          role="button"
          tabIndex={0}
          aria-label={`Delete ${game.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(game);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onDelete(game);
            }
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-2 -m-1 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </span>
      </div>
    </button>
  );
}
