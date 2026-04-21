/**
 * Skin layout editor — full-screen drag overlay for repositioning the
 * hit regions on the active skin. Long-press / pointer-down on a region,
 * drag to reposition, release to save. Shows a red outline of every
 * draggable region while open.
 *
 * Persists offsets per-skin via skinLayoutStore so they survive across
 * sessions and apply identically on every device.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Move, RotateCcw, Check } from "lucide-react";
import { loadDeltaSkin, pickRepresentation, type ParsedSkin, type SkinItem } from "@/lib/deltaSkin";
import {
  getSkinLayout,
  setSkinLayoutEntry,
  clearSkinLayout,
  inputKeyForItem,
  SCREEN_KEY,
  type ButtonOffset,
  type SkinLayout,
} from "@/lib/skinLayoutStore";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface Props {
  skinUrl: string;
  orientation: "portrait" | "landscape";
  open: boolean;
  onClose: () => void;
}

export default function SkinLayoutEditor({ skinUrl, orientation, open, onClose }: Props) {
  const [skin, setSkin] = useState<ParsedSkin | null>(null);
  const [layout, setLayout] = useState<SkinLayout>({});

  useEffect(() => {
    if (!open) return;
    setLayout(getSkinLayout(skinUrl));
    loadDeltaSkin(skinUrl).then(setSkin).catch(() => {});
  }, [skinUrl, open]);

  const viewport = useViewport();
  const rep = useMemo(
    () => (skin ? pickRepresentation(skin, orientation, viewport) : null),
    [skin, orientation, viewport],
  );

  if (!open) return null;

  const reset = () => {
    clearSkinLayout(skinUrl);
    setLayout({});
    toast({ title: "Layout reset to default" });
  };

  const updateOffset = (key: string, offset: ButtonOffset) => {
    setSkinLayoutEntry(skinUrl, key, offset);
    setLayout((prev) => ({ ...prev, [key]: offset }));
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex flex-col">
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-background/80"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2">
          <Move className="w-4 h-4 text-primary" />
          <div>
            <div className="text-sm font-display font-semibold">Customize layout</div>
            <div className="text-[11px] text-muted-foreground">Drag any button or the screen to reposition. Drag the screen's bottom-right corner to resize. Saves automatically.</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={reset}>
            <RotateCcw className="w-4 h-4" /> Reset
          </Button>
          <Button size="sm" onClick={onClose}>
            <Check className="w-4 h-4" /> Done
          </Button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 relative overflow-hidden">
        {rep ? (
          <EditorCanvas rep={rep} layout={layout} onChange={updateOffset} orientation={orientation} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Loading skin…
          </div>
        )}
      </div>
    </div>
  );
}

function useViewport() {
  const [v, setV] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 390,
    height: typeof window !== "undefined" ? window.innerHeight : 844,
  }));
  useEffect(() => {
    const on = () => setV({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return v;
}

function EditorCanvas({
  rep,
  layout,
  onChange,
  orientation,
}: {
  rep: ReturnType<typeof pickRepresentation>;
  layout: SkinLayout;
  onChange: (key: string, offset: ButtonOffset) => void;
  orientation: "portrait" | "landscape";
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const aspect = rep.mappingWidth / rep.mappingHeight;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const skinRect = useMemo(() => {
    if (!size.w || !size.h) return { left: 0, top: 0, width: 0, height: 0 };
    const ca = size.w / size.h;
    let width: number, height: number;
    if (ca > aspect) {
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

  const scale = skinRect.width / rep.mappingWidth;

  return (
    <div ref={containerRef} className="relative w-full h-full select-none" style={{ touchAction: "none" }}>
      {/* Skin background */}
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
          opacity: 0.5,
        }}
      />

      {/* Draggable hit regions + screen */}
      <div
        className="absolute"
        style={{
          left: skinRect.left,
          top: skinRect.top,
          width: skinRect.width,
          height: skinRect.height,
        }}
      >
        {/* Screen rectangle — draggable + resizable. Falls back to a
            centered rect if the skin doesn't declare an explicit screen. */}
        <ScreenRegion
          screenFrame={
            rep.screens?.[0]?.outputFrame ?? {
              x: rep.mappingWidth * 0.1,
              y: rep.mappingHeight * 0.05,
              width: rep.mappingWidth * 0.8,
              height: rep.mappingHeight * 0.4,
            }
          }
          scale={scale}
          mappingWidth={rep.mappingWidth}
          mappingHeight={rep.mappingHeight}
          offset={layout[SCREEN_KEY] ?? { dx: 0, dy: 0, scale: 1 }}
          onChange={(off) => onChange(SCREEN_KEY, off)}
        />
        {rep.items.filter(isUserControl).map((item, idx) => (
          <DraggableRegion
            key={idx}
            item={item}
            scale={scale}
            mappingWidth={rep.mappingWidth}
            mappingHeight={rep.mappingHeight}
            offset={layout[inputKeyForItem(item)] ?? { dx: 0, dy: 0 }}
            onChange={(off) => onChange(inputKeyForItem(item), off)}
          />
        ))}
      </div>
    </div>
  );
}

function DraggableRegion({
  item,
  scale,
  mappingWidth,
  mappingHeight,
  offset,
  onChange,
}: {
  item: SkinItem;
  scale: number;
  mappingWidth: number;
  mappingHeight: number;
  offset: ButtonOffset;
  onChange: (offset: ButtonOffset) => void;
}) {
  const dragStartRef = useRef<{ x: number; y: number; baseDx: number; baseDy: number } | null>(null);

  const left = (item.frame.x + offset.dx * mappingWidth) * scale;
  const top = (item.frame.y + offset.dy * mappingHeight) * scale;
  const width = item.frame.width * scale;
  const height = item.frame.height * scale;

  const label =
    item.thumbstick?.name ??
    (Array.isArray(item.inputs) ? item.inputs.join("+") : Object.keys(item.inputs).join("+"));

  return (
    <div
      role="button"
      aria-label={`Move ${label}`}
      className="absolute rounded-md border-2 border-primary/80 bg-primary/15 backdrop-blur-sm flex items-center justify-center text-[10px] font-display font-semibold text-primary cursor-grab active:cursor-grabbing"
      style={{ left, top, width, height, touchAction: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        dragStartRef.current = { x: e.clientX, y: e.clientY, baseDx: offset.dx, baseDy: offset.dy };
      }}
      onPointerMove={(e) => {
        const start = dragStartRef.current;
        if (!start) return;
        const dxPx = e.clientX - start.x;
        const dyPx = e.clientY - start.y;
        onChange({
          dx: start.baseDx + dxPx / (mappingWidth * scale),
          dy: start.baseDy + dyPx / (mappingHeight * scale),
          scale: offset.scale,
        });
      }}
      onPointerUp={() => {
        dragStartRef.current = null;
      }}
      onPointerCancel={() => {
        dragStartRef.current = null;
      }}
    >
      {label}
    </div>
  );
}

/**
 * Game-screen draggable. Same offset model as buttons (dx/dy as fractions
 * of the skin's mappingSize), plus a scale handle in the bottom-right
 * corner so the player can resize the picture window.
 */
function ScreenRegion({
  screenFrame,
  scale,
  mappingWidth,
  mappingHeight,
  offset,
  onChange,
}: {
  screenFrame: { x: number; y: number; width: number; height: number };
  scale: number;
  mappingWidth: number;
  mappingHeight: number;
  offset: ButtonOffset;
  onChange: (offset: ButtonOffset) => void;
}) {
  const dragRef = useRef<
    | { mode: "move"; x: number; y: number; baseDx: number; baseDy: number }
    | { mode: "resize"; x: number; y: number; baseScale: number }
    | null
  >(null);

  const s = offset.scale ?? 1;
  const left = (screenFrame.x + offset.dx * mappingWidth) * scale;
  const top = (screenFrame.y + offset.dy * mappingHeight) * scale;
  const width = screenFrame.width * scale * s;
  const height = screenFrame.height * scale * s;

  return (
    <div
      role="button"
      aria-label="Move screen"
      className="absolute rounded-md border-2 border-dashed border-accent/80 bg-accent/10 flex items-center justify-center text-[11px] font-display font-semibold text-accent-foreground cursor-grab active:cursor-grabbing"
      style={{ left, top, width, height, touchAction: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        dragRef.current = {
          mode: "move",
          x: e.clientX,
          y: e.clientY,
          baseDx: offset.dx,
          baseDy: offset.dy,
        };
      }}
      onPointerMove={(e) => {
        const start = dragRef.current;
        if (!start) return;
        if (start.mode === "move") {
          const dxPx = e.clientX - start.x;
          const dyPx = e.clientY - start.y;
          onChange({
            dx: start.baseDx + dxPx / (mappingWidth * scale),
            dy: start.baseDy + dyPx / (mappingHeight * scale),
            scale: offset.scale,
          });
        } else {
          const dPx = Math.max(e.clientX - start.x, e.clientY - start.y);
          // 1 px corner drag ≈ 1/avg-side scale change.
          const avg = (screenFrame.width + screenFrame.height) * 0.5 * scale;
          const next = Math.max(0.4, Math.min(2, start.baseScale + dPx / avg));
          onChange({ dx: offset.dx, dy: offset.dy, scale: next });
        }
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    >
      Screen
      {/* Resize handle */}
      <div
        className="absolute -right-1.5 -bottom-1.5 w-5 h-5 rounded-full bg-accent border-2 border-background cursor-se-resize"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          dragRef.current = {
            mode: "resize",
            x: e.clientX,
            y: e.clientY,
            baseScale: s,
          };
        }}
        onPointerMove={(e) => {
          const start = dragRef.current;
          if (!start || start.mode !== "resize") return;
          const dPx = Math.max(e.clientX - start.x, e.clientY - start.y);
          const avg = (screenFrame.width + screenFrame.height) * 0.5 * scale;
          const next = Math.max(0.4, Math.min(2, start.baseScale + dPx / avg));
          onChange({ dx: offset.dx, dy: offset.dy, scale: next });
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        aria-label="Resize screen"
      />
    </div>
  );
}
