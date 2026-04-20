import { useCallback } from "react";
import type { SystemId } from "@/lib/gameStore";

interface Props {
  system: SystemId;
  onInput: (button: string, pressed: boolean) => void;
}

/**
 * On-screen touch controls for mobile/tablet.
 * Hidden on lg+ where keyboard/gamepad are expected.
 */
export default function VirtualController({ system, onInput }: Props) {
  const showShoulders = system === "gba";

  const press = useCallback(
    (btn: string) => ({
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        (e.currentTarget as HTMLElement).dataset.active = "true";
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
    [onInput],
  );

  const dpadCls =
    "w-12 h-12 bg-secondary/90 border border-border/60 active:bg-primary active:border-primary text-foreground active:text-primary-foreground transition-colors no-select flex items-center justify-center font-bold";

  const actionCls =
    "w-14 h-14 rounded-full bg-gradient-primary text-primary-foreground font-display font-bold text-lg shadow-glow active:scale-90 transition-transform no-select flex items-center justify-center";

  const sysCls =
    "px-4 h-9 rounded-full bg-secondary/80 border border-border/60 text-foreground/80 text-xs font-display font-semibold tracking-wider active:bg-primary active:text-primary-foreground transition-colors no-select";

  const shoulderCls =
    "px-5 h-9 rounded-xl bg-secondary/80 border border-border/60 text-foreground/80 text-xs font-display font-semibold active:bg-primary active:text-primary-foreground transition-colors no-select";

  return (
    <div className="lg:hidden glass border-t border-border/40 px-4 pt-4 pb-6 select-none">
      {showShoulders && (
        <div className="flex justify-between max-w-md mx-auto mb-3">
          <button {...press("L")} className={shoulderCls}>L</button>
          <button {...press("R")} className={shoulderCls}>R</button>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 max-w-md mx-auto">
        {/* D-Pad */}
        <div className="grid grid-cols-3 grid-rows-3 gap-0">
          <div />
          <button {...press("UP")} className={`${dpadCls} rounded-t-lg`}>▲</button>
          <div />
          <button {...press("LEFT")} className={`${dpadCls} rounded-l-lg`}>◀</button>
          <div className="w-12 h-12 bg-secondary/90 border border-border/60" />
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
        <div className="relative w-32 h-32">
          <button {...press("B")} className={`${actionCls} absolute left-0 bottom-4`}>B</button>
          <button {...press("A")} className={`${actionCls} absolute right-0 top-4`}>A</button>
        </div>
      </div>
    </div>
  );
}
