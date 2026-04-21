import { useRef } from "react";
import { Gamepad2, Heart, MoreVertical } from "lucide-react";
import { GameMeta, formatSize, formatPlayTime } from "@/lib/gameStore";
import SystemBadge from "./SystemBadge";
import GameContextMenu from "./GameContextMenu";

interface Props {
  game: GameMeta;
  onPlay: (game: GameMeta) => void;
  onChanged: () => void;
  index?: number;
}

const SYSTEM_GLYPH: Record<string, string> = {
  gba: "◢◣",
  gbc: "▣",
  nes: "▶",
};

export default function GameCard({ game, onPlay, onChanged, index = 0 }: Props) {
  const longPressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Long-press triggers the context menu (touch devices)
  const startLongPress = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    longPressed.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      try { navigator.vibrate?.(15); } catch { /* ignore */ }
      // Synthesize a contextmenu event so Radix ContextMenu opens
      const target = btnRef.current;
      if (target) {
        const rect = target.getBoundingClientRect();
        target.dispatchEvent(new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }));
      }
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <GameContextMenu game={game} onChanged={onChanged}>
      <button
        ref={btnRef}
        onClick={() => {
          if (longPressed.current) { longPressed.current = false; return; }
          onPlay(game);
        }}
        onPointerDown={startLongPress}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onPointerLeave={cancelLongPress}
        style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
        className="group relative text-left rounded-3xl bg-gradient-card border border-border/50 p-5 shadow-card hover:shadow-elevated hover:border-primary/40 hover:-translate-y-1 transition-all duration-300 ease-[var(--ease-spring)] animate-fade-up overflow-hidden no-select"
      >
        {/* Cover art tile */}
        <div className="relative aspect-square w-full rounded-2xl overflow-hidden mb-4 ring-1 ring-white/5">
          {game.artworkDataUrl ? (
            <img
              src={game.artworkDataUrl}
              alt={`${game.name} cover`}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <>
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
            </>
          )}
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
          {game.favorite && (
            <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <Heart className="w-3.5 h-3.5 fill-destructive text-destructive" />
            </div>
          )}
        </div>

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-display font-semibold text-foreground truncate">{game.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {formatSize(game.size)}
              {game.playCount > 0 && ` · ${game.playCount}×`}
              {formatPlayTime(game.playTimeMs) && ` · ${formatPlayTime(game.playTimeMs)}`}
            </p>
          </div>
          <span
            role="button"
            tabIndex={0}
            aria-label={`More options for ${game.name}`}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const target = btnRef.current;
              if (target) {
                const rect = target.getBoundingClientRect();
                target.dispatchEvent(new MouseEvent("contextmenu", {
                  bubbles: true,
                  cancelable: true,
                  clientX: rect.left + rect.width / 2,
                  clientY: rect.top + rect.height / 2,
                }));
              }
            }}
            className="opacity-60 group-hover:opacity-100 transition-opacity p-2 -m-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <MoreVertical className="w-4 h-4" />
          </span>
        </div>
      </button>
    </GameContextMenu>
  );
}
