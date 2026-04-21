import { useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";

/**
 * Standard mapping for Web Gamepad API "standard" layout.
 *
 * We map physical controller buttons -> the same string IDs that the
 * on-screen virtual controller emits, so a single `onInput` handler in
 * Play.tsx serves both input sources.
 *
 * Reference: https://www.w3.org/TR/gamepad/#remapping
 *  0  -> bottom face (A on Xbox, X on PS, B on Nintendo)        => libretro B
 *  1  -> right face                                              => libretro A
 *  2  -> left face                                               => libretro Y
 *  3  -> top face                                                => libretro X
 *  4  -> L1
 *  5  -> R1
 *  8  -> Select / Share / View
 *  9  -> Start / Options / Menu
 *  12 -> D-pad up
 *  13 -> D-pad down
 *  14 -> D-pad left
 *  15 -> D-pad right
 */
const BUTTON_MAP: Record<number, string> = {
  0: "B",
  1: "A",
  2: "Y",
  3: "X",
  4: "L",
  5: "R",
  8: "SELECT",
  9: "START",
  12: "UP",
  13: "DOWN",
  14: "LEFT",
  15: "RIGHT",
};

/** Analog-stick deadzone for translating left stick into D-pad presses. */
const STICK_DEADZONE = 0.55;

export interface GamepadOptions {
  /** Master enable. When false, the rAF poll loop is not installed. */
  enabled: boolean;
  /** Called with (button, pressed) — same shape as virtual controller. */
  onInput: (button: string, pressed: boolean) => void;
}

/**
 * Polls connected gamepads each animation frame and emits press/release
 * edges. Surfaces a toast when a controller is connected for the first
 * time so the user knows the wiring worked.
 */
export function useGamepad({ enabled, onInput }: GamepadOptions) {
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !("getGamepads" in navigator)) return;

    const prev = new Map<number, Set<string>>(); // pad index -> set of currently-pressed button IDs
    let raf = 0;

    const onConnect = (e: GamepadEvent) => {
      toast({
        title: "Controller connected",
        description: e.gamepad.id || "Unknown gamepad",
      });
    };
    const onDisconnect = (e: GamepadEvent) => {
      // Release anything we believe to be held on this pad.
      const held = prev.get(e.gamepad.index);
      held?.forEach((btn) => onInputRef.current(btn, false));
      prev.delete(e.gamepad.index);
      toast({ title: "Controller disconnected" });
    };

    let connectedCount = 0;
    const startLoop = () => {
      if (raf) return;
      raf = requestAnimationFrame(tick);
    };
    const stopLoop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const onConnectStart = (e: GamepadEvent) => {
      connectedCount++;
      onConnect(e);
      startLoop();
    };
    const onDisconnectStart = (e: GamepadEvent) => {
      connectedCount = Math.max(0, connectedCount - 1);
      onDisconnect(e);
      if (connectedCount === 0) stopLoop();
    };

    window.addEventListener("gamepadconnected", onConnectStart);
    window.addEventListener("gamepaddisconnected", onDisconnectStart);

    const tick = () => {
      const pads = navigator.getGamepads?.() ?? [];
      // No pads at all — pause the loop until a connect event fires.
      if (!pads.some((p) => p)) {
        raf = 0;
        return;
      }
      for (const pad of pads) {
        if (!pad) continue;
        const pressed = new Set<string>();

        // Buttons
        pad.buttons.forEach((b, idx) => {
          const id = BUTTON_MAP[idx];
          if (!id) return;
          if (b.pressed || b.value > 0.5) pressed.add(id);
        });

        // Left stick -> D-pad fallback (covers controllers that don't
        // emit hat presses, like many Bluetooth pads in iOS Safari).
        const [lx = 0, ly = 0] = pad.axes;
        if (lx <= -STICK_DEADZONE) pressed.add("LEFT");
        if (lx >= STICK_DEADZONE) pressed.add("RIGHT");
        if (ly <= -STICK_DEADZONE) pressed.add("UP");
        if (ly >= STICK_DEADZONE) pressed.add("DOWN");

        const before = prev.get(pad.index) ?? new Set<string>();

        // Press edges
        pressed.forEach((btn) => {
          if (!before.has(btn)) onInputRef.current(btn, true);
        });
        // Release edges
        before.forEach((btn) => {
          if (!pressed.has(btn)) onInputRef.current(btn, false);
        });

        prev.set(pad.index, pressed);
      }
      raf = requestAnimationFrame(tick);
    };

    // Kick off the loop only if a controller is already attached at mount.
    const initial = navigator.getGamepads?.() ?? [];
    if (initial.some((p) => p)) {
      connectedCount = initial.filter((p) => p).length;
      raf = requestAnimationFrame(tick);
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("gamepadconnected", onConnectStart);
      window.removeEventListener("gamepaddisconnected", onDisconnectStart);
      // Release any held buttons on teardown.
      prev.forEach((set) => set.forEach((btn) => onInputRef.current(btn, false)));
    };
  }, [enabled]);
}
