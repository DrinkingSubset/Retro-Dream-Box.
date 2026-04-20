import { useCallback } from "react";
import type { SystemId } from "@/lib/gameStore";
import { useSettings, triggerHaptic } from "@/lib/settingsStore";

interface Props {
  system: SystemId;
  onInput: (button: string, pressed: boolean) => void;
  /**
   * Layout variant.
   * - "bottom": stacked under the screen (portrait & desktop sizes)
   * - "sides": split — D-pad left / actions right, flanking the screen.
   *   Used on short landscape viewports (e.g. Z Fold 7 folded landscape)
   *   where vertical space is at a premium.
   */
  variant?: "bottom" | "sides";
}

/**
 * On-screen touch controls for mobile/tablet/foldable.
 * Hidden on lg+ where keyboard/gamepad are expected.
 */
export default function VirtualController({ system, onInput, variant = "bottom" }: Props) {
  const settings = useSettings();
  const player = settings.players[1];
  const opacityStyle = { opacity: Math.max(0.05, player.opacity / 100) };
  const showShoulders = system === "gba";

  const press = useCallback(
    (btn: string) => ({
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        (e.currentTarget as HTMLElement).dataset.active = "true";
        triggerHaptic(settings);
        onInput(btn, true);
      },
      onPointerUp: (e: React.PointerEvent) => {
        e.preventDefault();
        delete (e.currentTarget as HTMLElement).dataset.active;
        onInput(btn, false);
      },
      onPointerCancel: (e: React.PointerEvent) => {
        delete (e.currentTarget as HTMLElement).dataset.active;
        onInput(btn, false);
      },
      onPointerLeave: (e: React.PointerEvent) => {
        if ((e.currentTarget as HTMLElement).dataset.active) {
          delete (e.currentTarget as HTMLElement).dataset.active;
          onInput(btn, false);
        }
      },
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    }),
    [onInput, settings],
  );

  const dpadCls =
    "w-11 h-11 sm:w-12 sm:h-12 bg-secondary/90 border border-border/60 active:bg-primary active:border-primary text-foreground active:text-primary-foreground transition-colors no-select flex items-center justify-center font-bold";

  const dpadCenterCls = "w-11 h-11 sm:w-12 sm:h-12 bg-secondary/90 border border-border/60";

  const actionCls =
    "w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-primary text-primary-foreground font-display font-bold text-base sm:text-lg shadow-glow active:scale-90 transition-transform no-select flex items-center justify-center";

  const sysCls =
    "px-3 sm:px-4 h-8 sm:h-9 rounded-full bg-secondary/80 border border-border/60 text-foreground/80 text-[10px] sm:text-xs font-display font-semibold tracking-wider active:bg-primary active:text-primary-foreground transition-colors no-select";

  const shoulderCls =
    "px-4 sm:px-5 h-8 sm:h-9 rounded-xl bg-secondary/80 border border-border/60 text-foreground/80 text-[10px] sm:text-xs font-display font-semibold active:bg-primary active:text-primary-foreground transition-colors no-select";

  // Compact side layout — used in short landscape viewports.
  // The pad floats over the gameplay edges so the screen stays as large as possible.
  if (variant === "sides") {
    return (
      <div
        className="lg:hidden pointer-events-none absolute inset-0 z-20 select-none no-select"
        style={{
          paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
          paddingRight: "max(0.5rem, env(safe-area-inset-right))",
          paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
          ...opacityStyle,
        }}
      >
        {/* D-Pad — bottom left */}
        <div className="pointer-events-auto absolute bottom-2 left-2 grid grid-cols-3 grid-rows-3 gap-0">
          <div />
          <button {...press("UP")} className={`${dpadCls} rounded-t-lg`}>▲</button>
          <div />
          <button {...press("LEFT")} className={`${dpadCls} rounded-l-lg`}>◀</button>
          <div className={dpadCenterCls} />
          <button {...press("RIGHT")} className={`${dpadCls} rounded-r-lg`}>▶</button>
          <div />
          <button {...press("DOWN")} className={`${dpadCls} rounded-b-lg`}>▼</button>
          <div />
        </div>

        {/* Action buttons — bottom right */}
        <div className="pointer-events-auto absolute bottom-2 right-2 w-28 h-28 sm:w-32 sm:h-32">
          <button {...press("B")} className={`${actionCls} absolute left-0 bottom-3`}>B</button>
          <button {...press("A")} className={`${actionCls} absolute right-0 top-3`}>A</button>
        </div>

        {/* Shoulders — top corners */}
        {showShoulders && (
          <>
            <button {...press("L")} className={`${shoulderCls} pointer-events-auto absolute top-2 left-2`}>L</button>
            <button {...press("R")} className={`${shoulderCls} pointer-events-auto absolute top-2 right-2`}>R</button>
          </>
        )}

        {/* Start / Select — bottom center */}
        <div className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
          <button {...press("SELECT")} className={sysCls}>SELECT</button>
          <button {...press("START")} className={sysCls}>START</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="lg:hidden glass border-t border-border/40 px-3 sm:px-4 pt-3 sm:pt-4 select-none"
      style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))", ...opacityStyle }}
    >
      {showShoulders && (
        <div className="flex justify-between max-w-md mx-auto mb-3">
          <button {...press("L")} className={shoulderCls}>L</button>
          <button {...press("R")} className={shoulderCls}>R</button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 sm:gap-4 max-w-md mx-auto">
        {/* D-Pad */}
        <div className="grid grid-cols-3 grid-rows-3 gap-0">
          <div />
          <button {...press("UP")} className={`${dpadCls} rounded-t-lg`}>▲</button>
          <div />
          <button {...press("LEFT")} className={`${dpadCls} rounded-l-lg`}>◀</button>
          <div className={dpadCenterCls} />
          <button {...press("RIGHT")} className={`${dpadCls} rounded-r-lg`}>▶</button>
          <div />
          <button {...press("DOWN")} className={`${dpadCls} rounded-b-lg`}>▼</button>
          <div />
        </div>

        {/* Center: select / start */}
        <div className="flex flex-col gap-2">
          <button {...press("SELECT")} className={sysCls}>SELECT</button>
          <button {...press("START")} className={sysCls}>START</button>
        </div>

        {/* Action buttons */}
        <div className="relative w-28 h-28 sm:w-32 sm:h-32">
          <button {...press("B")} className={`${actionCls} absolute left-0 bottom-3 sm:bottom-4`}>B</button>
          <button {...press("A")} className={`${actionCls} absolute right-0 top-3 sm:top-4`}>A</button>
        </div>
      </div>
    </div>
  );
}
