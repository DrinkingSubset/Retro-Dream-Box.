import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { loadDeltaSkin, expandInputs, pickRepresentation, type ParsedSkin, type RenderedRepresentation, type SkinItem } from "@/lib/deltaSkin";
import { useSettings, triggerHaptic } from "@/lib/settingsStore";
import { useSkinLayout, inputKeyForItem, type SkinLayout } from "@/lib/skinLayoutStore";

/**
 * Maps Delta input names → the canonical button strings that Play.tsx
 * understands and forwards to EmulatorJS.
 */
const INPUT_MAP: Record<string, string> = {
  up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT",
  a: "A", b: "B", x: "X", y: "Y",
  l: "L", r: "R", l2: "L2", r2: "R2",
  start: "START", select: "SELECT",
};

/**
 * Hides emulator-helper hit regions (fastForward, quickSave, quickLoad)
 * from the on-screen overlay — those actions live in the in-app menu now,
 * so leaving the regions tappable just causes accidental fast-forwards.
 * `menu` is kept because it opens the game menu sheet.
 */
function isUserActionable(item: SkinItem): boolean {
  if (item.thumbstick) return true;
  const names = Array.isArray(item.inputs) ? item.inputs : Object.values(item.inputs);
  const skip = new Set(["fastForward", "quickSave", "quickLoad", "toggleFastForward"]);
  return names.some((n) => !skip.has(n));
}

interface Props {
  /** URL of the .deltaskin file in /public/skins. */
  skinUrl: string;
  /** Orientation to render. */
  orientation: "portrait" | "landscape";
  /**
   * Called when an input is pressed/released. The button string matches the
   * one used by VirtualController so Play.tsx's existing wiring works.
   */
  onInput: (button: string, pressed: boolean) => void;
  /**
   * Called whenever the screen-slot rect changes (resize / orientation).
   * Play.tsx uses this to position the EmulatorJS container exactly inside
   * the slot — viewport coordinates.
   */
  onScreenRect?: (rect: { left: number; top: number; width: number; height: number } | null) => void;
  /** Tap "menu" to open this callback (e.g. emulator pause). */
  onMenu?: () => void;
}

/**
 * Renders a Delta-format skin pixel-faithfully:
 *   - PDF artwork as the controller background image
 *   - Invisible <button>s positioned over each `info.json` hit region,
 *     scaled from `mappingSize` coordinates to actual screen pixels.
 *
 * Portrait: vertical stack — game screen on top, skin below.
 * Landscape: skin overlay floats over the game screen (filling all space).
 */
export default function DeltaSkinController({
  skinUrl,
  orientation,
  onInput,
  onScreenRect,
  onMenu,
}: Props) {
  const settings = useSettings();
  const player = settings.players[1];
  const opacity = Math.max(0.05, player.opacity / 100);

  const [skin, setSkin] = useState<ParsedSkin | null>(null);
  const [error, setError] = useState<string | null>(null);
  // All hooks must be called unconditionally before any early returns.
  const layout = useSkinLayout(skinUrl);

  useEffect(() => {
    let cancelled = false;
    setSkin(null);
    setError(null);
    loadDeltaSkin(skinUrl)
      .then((s) => { if (!cancelled) setSkin(s); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Failed to load skin"); });
    return () => { cancelled = true; };
  }, [skinUrl]);

  useEffect(() => {
    if (error || !skin) onScreenRect?.(null);
  }, [error, skin, onScreenRect]);

  if (error) {
    return (
      <div className="text-xs text-destructive p-2 text-center">
        Skin failed to load: {error}
      </div>
    );
  }

  if (!skin) {
    return <div className="w-full h-32 animate-pulse bg-secondary/40 rounded-xl" />;
  }


  return (
    <SkinCanvasWrapper
      skin={skin}
      orientation={orientation}
      onInput={onInput}
      onScreenRect={onScreenRect}
      onMenu={onMenu}
      opacity={opacity}
      settings={settings}
      layout={layout}
    />
  );
}

/**
 * Wraps SkinCanvas with a memoized representation that updates only when
 * orientation or viewport changes — avoids re-picking the rep on every
 * parent render.
 */
function SkinCanvasWrapper({
  skin,
  orientation,
  onInput,
  onScreenRect,
  onMenu,
  opacity,
  settings,
  layout,
}: {
  skin: ParsedSkin;
  orientation: "portrait" | "landscape";
  onInput: (button: string, pressed: boolean) => void;
  onScreenRect?: (rect: { left: number; top: number; width: number; height: number } | null) => void;
  onMenu?: () => void;
  opacity: number;
  settings: ReturnType<typeof useSettings>;
  layout: SkinLayout;
}) {
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 390,
    height: typeof window !== "undefined" ? window.innerHeight : 844,
  }));
  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const rep = useMemo(
    () => pickRepresentation(skin, orientation, viewport),
    [skin, orientation, viewport],
  );
  const onPress = useCallback(() => triggerHaptic(settings), [settings]);

  return (
    <SkinCanvas
      rep={rep}
      orientation={orientation}
      onInput={onInput}
      onScreenRect={onScreenRect}
      onMenu={onMenu}
      opacity={opacity}
      onPress={onPress}
      layout={layout}
    />
  );
}

interface CanvasProps {
  rep: RenderedRepresentation;
  orientation: "portrait" | "landscape";
  onInput: (button: string, pressed: boolean) => void;
  onScreenRect?: (rect: { left: number; top: number; width: number; height: number } | null) => void;
  onMenu?: () => void;
  opacity: number;
  onPress: () => void;
  layout: SkinLayout;
}

function SkinCanvas({ rep, orientation, onInput, onScreenRect, onMenu, opacity, onPress, layout }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** [width, height] of the rendered skin area, in CSS pixels. */
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Aspect ratio of the skin, derived from mappingSize (the logical layout).
  const aspect = rep.mappingWidth / rep.mappingHeight;

  // Observe container size so we can fit the skin into the available space
  // while keeping its aspect ratio identical to the original info.json layout.
  // The setSize call is deferred to the next animation frame so we never
  // trigger React work synchronously inside the ResizeObserver callback —
  // that pattern produces the noisy "ResizeObserver loop completed with
  // undelivered notifications" warning in dev tools.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setSize((prev) =>
          prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height },
        );
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Compute the actual rendered skin rect inside the container — keeping
  // the skin's aspect ratio so hit regions land precisely.
  const skinRect = useMemo(() => {
    if (!size.w || !size.h) return { left: 0, top: 0, width: 0, height: 0 };
    const containerAspect = size.w / size.h;
    let width: number, height: number;
    if (containerAspect > aspect) {
      height = size.h;
      width = height * aspect;
    } else {
      width = size.w;
      height = width / aspect;
    }
    return {
      left: (size.w - width) / 2,
      top: orientation === "portrait" ? size.h - height : (size.h - height) / 2,
      width,
      height,
    };
  }, [size, aspect, orientation]);

  // Compute the game-screen rect within the skin's mappingSize coordinate
  // system. Priority:
  //   1. Use the skin's explicit `screens[].outputFrame` if provided
  //      (edgeToEdge variants of recent skins include this).
  //   2. Otherwise infer from the bounding box of the *control* items
  //      (D-pad, A, B, L, R, Start, Select). Non-control items like
  //      quickSave / quickLoad / fastForward / menu sit on top of artwork
  //      and must NOT be used to bound the screen, or we end up with a
  //      tiny screen wedged into the corner (the bug we just fixed).
  const screenMappingRect = useMemo(() => {
    // 1. Explicit screen rect from the skin author.
    if (rep.screens && rep.screens.length > 0) {
      const f = rep.screens[0].outputFrame;
      return { x: f.x, y: f.y, width: f.width, height: f.height };
    }

    // 2. Infer from real controls only.
    const CONTROL_INPUTS = new Set([
      "up", "down", "left", "right",
      "a", "b", "x", "y",
      "l", "r", "l2", "r2",
      "start", "select", "thumbstick",
    ]);
    const isControl = (it: SkinItem) => {
      if (it.thumbstick) return true;
      const inputs = Array.isArray(it.inputs)
        ? it.inputs
        : Object.values(it.inputs);
      return inputs.some((i) => CONTROL_INPUTS.has(String(i).toLowerCase()));
    };
    const controls = rep.items.filter(isControl);
    if (controls.length === 0) {
      return { x: 0, y: 0, width: rep.mappingWidth, height: rep.mappingHeight };
    }

    if (orientation === "landscape") {
      // Find the gap between left-cluster and right-cluster controls.
      const half = rep.mappingWidth / 2;
      let leftEdge = 0;
      let rightEdge = rep.mappingWidth;
      for (const it of controls) {
        const cx = it.frame.x + it.frame.width / 2;
        if (cx < half) {
          leftEdge = Math.max(leftEdge, it.frame.x + it.frame.width);
        } else {
          rightEdge = Math.min(rightEdge, it.frame.x);
        }
      }
      const pad = rep.mappingWidth * 0.015;
      return {
        x: leftEdge + pad,
        y: 0,
        width: Math.max(0, rightEdge - leftEdge - pad * 2),
        height: rep.mappingHeight,
      };
    }

    // Portrait: screen sits above all controls.
    const minY = Math.min(...controls.map((i) => i.frame.y));
    const pad = rep.mappingHeight * 0.01;
    return {
      x: 0,
      y: 0,
      width: rep.mappingWidth,
      height: Math.max(0, minY - pad),
    };
  }, [rep, orientation]);

  // Report the screen-slot rect (in viewport coordinates) to the parent so
  // it can position the EmulatorJS canvas exactly inside it.
  //
  // Portrait special-case: when the skin is aspect-locked to the bottom of
  // the play area, there's typically a large empty band ABOVE the rendered
  // skin (between the header and the top of the artwork). The skin's own
  // tiny internal screen strip would waste all of that space — so instead
  // we hand the entire empty band above the skin to the EJS canvas. Result:
  // the game fills the top half of the screen, the skin sits flush below,
  // exactly like a real handheld console.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onScreenRect || !skinRect.width) return;
    const c = el.getBoundingClientRect();

    if (orientation === "portrait") {
      const topBand = skinRect.top; // empty space above the rendered skin
      if (topBand > 40) {
        onScreenRect({
          left: c.left,
          top: c.top,
          width: c.width,
          height: topBand,
        });
        return;
      }
    }

    // Landscape (or no empty top band): use the skin's internal screen rect.
    const sx = skinRect.width / rep.mappingWidth;
    const sy = skinRect.height / rep.mappingHeight;
    onScreenRect({
      left: c.left + skinRect.left + screenMappingRect.x * sx,
      top: c.top + skinRect.top + screenMappingRect.y * sy,
      width: screenMappingRect.width * sx,
      height: screenMappingRect.height * sy,
    });
  }, [size, skinRect, screenMappingRect, rep, onScreenRect, orientation]);

  // Convert a logical mappingSize coordinate to a CSS pixel offset within
  // the skin rect. This is the core of pixel-faithful hit-target mapping.
  const scale = skinRect.width / rep.mappingWidth;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none no-select"
      // pointer-events-none on the wrapper — only individual hit regions
      // re-enable them. This lets the EmulatorJS canvas receive clicks
      // (including its initial "press to start" overlay) on the screen area.
      style={{ touchAction: "none", pointerEvents: "none" }}
    >
      {/* Skin background — PDF artwork. */}
      <img
        src={rep.imageDataUrl}
        alt=""
        draggable={false}
        className="absolute pointer-events-none"
        style={{
          left: skinRect.left,
          top: skinRect.top,
          width: skinRect.width,
          height: skinRect.height,
          opacity,
        }}
      />

      {/* Hit regions — invisible buttons over each info.json item. */}
      <div
        className="absolute"
        style={{
          left: skinRect.left,
          top: skinRect.top,
          width: skinRect.width,
          height: skinRect.height,
          // pointer-events: none so empty space inside the skin still passes
          // through clicks; HitRegion children re-enable on themselves.
          pointerEvents: "none",
        }}
      >
        {rep.items.filter(isUserActionable).map((item, idx) => (
          <HitRegion
            key={idx}
            item={item}
            scale={scale}
            onInput={onInput}
            onMenu={onMenu}
            onPress={onPress}
            offset={layout[inputKeyForItem(item)]}
            mappingWidth={rep.mappingWidth}
            mappingHeight={rep.mappingHeight}
          />
        ))}
      </div>
    </div>
  );
}

// ScreenSlot is no longer used — Play.tsx positions the EJS canvas directly
// based on the rect reported via onScreenRect.

interface HitRegionProps {
  item: SkinItem;
  scale: number;
  onInput: (button: string, pressed: boolean) => void;
  onMenu?: () => void;
  onPress: () => void;
  offset?: { dx: number; dy: number; scale?: number };
  mappingWidth: number;
  mappingHeight: number;
}

function HitRegion({ item, scale, onInput, onMenu, onPress, offset, mappingWidth, mappingHeight }: HitRegionProps) {
  const inputs = expandInputs(item);
  const isDpad =
    !Array.isArray(item.inputs) &&
    "up" in item.inputs && "down" in item.inputs;
  const isThumbstick = !!item.thumbstick;

  // Apply the user's saved offset (fraction of mappingSize) on top of the
  // skin's authored frame, then expand outward by extendedEdges.
  const dxPx = (offset?.dx ?? 0) * mappingWidth;
  const dyPx = (offset?.dy ?? 0) * mappingHeight;
  const sizeMul = offset?.scale ?? 1;
  const fx = item.frame.x + dxPx;
  const fy = item.frame.y + dyPx;
  const fw = item.frame.width * sizeMul;
  const fh = item.frame.height * sizeMul;

  // Extended edges expand the hit area outward (per Delta's design).
  const ext = item.extendedEdges ?? {};
  const left = (fx - (ext.left ?? 0)) * scale;
  const top = (fy - (ext.top ?? 0)) * scale;
  const width = (fw + (ext.left ?? 0) + (ext.right ?? 0)) * scale;
  const height = (fh + (ext.top ?? 0) + (ext.bottom ?? 0)) * scale;

  // ----- Single-input button (A, B, Start, etc.) -----
  if (!isDpad && !isThumbstick && inputs.length >= 1) {
    const handlers = makePressHandlers(inputs, onInput, onPress, onMenu);
    return (
      <button
        type="button"
        aria-label={inputs.join("+")}
        className="absolute bg-transparent active:bg-white/10 rounded-md transition-colors"
        style={{ left, top, width, height, pointerEvents: "auto" }}
        {...handlers}
      />
    );
  }

  // ----- D-pad: subdivide into 4 zones (up/down/left/right). -----
  if (isDpad) {
    return <DpadRegion left={left} top={top} width={width} height={height} onInput={onInput} onPress={onPress} />;
  }

  // ----- Thumbstick: treated as an analog-ish 8-way pad. -----
  if (isThumbstick) {
    return <ThumbstickRegion left={left} top={top} width={width} height={height} onInput={onInput} onPress={onPress} />;
  }

  return null;
}

function makePressHandlers(
  inputs: string[],
  onInput: (b: string, p: boolean) => void,
  onPress: () => void,
  onMenu?: () => void,
) {
  const buttons = inputs
    .map((i) => (i === "menu" ? "MENU" : INPUT_MAP[i]))
    .filter((b): b is string => !!b);

  const press = (down: boolean) => {
    for (const b of buttons) {
      if (b === "MENU") {
        if (down) onMenu?.();
      } else {
        onInput(b, down);
      }
    }
  };

  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      onPress();
      press(true);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      press(false);
    },
    onPointerCancel: () => press(false),
    onPointerLeave: (e: React.PointerEvent) => {
      // Only release if pointer was actually captured/down.
      if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
        press(false);
      }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

/**
 * D-pad with diagonal-aware zones — touching the up-left corner fires both
 * UP and LEFT, matching Delta's behaviour.
 */
function DpadRegion({
  left, top, width, height, onInput, onPress,
}: {
  left: number; top: number; width: number; height: number;
  onInput: (b: string, p: boolean) => void;
  onPress: () => void;
}) {
  const activeRef = useRef<Set<string>>(new Set());

  const updateFromPointer = useCallback((clientX: number, clientY: number, rect: DOMRect) => {
    const dx = clientX - rect.left - rect.width / 2;
    const dy = clientY - rect.top - rect.height / 2;
    // Dead zone ~10% of the pad radius
    const deadzone = Math.min(rect.width, rect.height) * 0.1;
    const next = new Set<string>();
    if (Math.abs(dy) > deadzone) next.add(dy < 0 ? "UP" : "DOWN");
    if (Math.abs(dx) > deadzone) next.add(dx < 0 ? "LEFT" : "RIGHT");

    // Release any that were active but aren't now
    for (const b of activeRef.current) {
      if (!next.has(b)) onInput(b, false);
    }
    // Press any newly active
    for (const b of next) {
      if (!activeRef.current.has(b)) onInput(b, true);
    }
    activeRef.current = next;
  }, [onInput]);

  const releaseAll = useCallback(() => {
    for (const b of activeRef.current) onInput(b, false);
    activeRef.current = new Set();
  }, [onInput]);

  return (
    <div
      className="absolute"
      style={{ left, top, width, height, pointerEvents: "auto", touchAction: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        onPress();
        const rect = e.currentTarget.getBoundingClientRect();
        updateFromPointer(e.clientX, e.clientY, rect);
      }}
      onPointerMove={(e) => {
        if (!(e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) return;
        const rect = e.currentTarget.getBoundingClientRect();
        updateFromPointer(e.clientX, e.clientY, rect);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        releaseAll();
      }}
      onPointerCancel={releaseAll}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

/**
 * Thumbstick — same logic as D-pad but with a smaller deadzone and 8-way
 * coverage (any vector outside the deadzone counts).
 */
function ThumbstickRegion(props: {
  left: number; top: number; width: number; height: number;
  onInput: (b: string, p: boolean) => void;
  onPress: () => void;
}) {
  return <DpadRegion {...props} />;
}
