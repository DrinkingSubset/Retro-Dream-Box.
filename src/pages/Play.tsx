import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { getGame, markPlayed, SYSTEM_LABELS, type GameRecord, type SystemId } from "@/lib/gameStore";
import VirtualController from "@/components/VirtualController";
import DeltaSkinController from "@/components/DeltaSkinController";
import SystemBadge from "@/components/SystemBadge";
import PlayMenu, { applyCheatsToEmulator, applySpeedToEmulator } from "@/components/PlayMenu";
import { getSkinUrlForSystem } from "@/lib/skinRegistry";
import { useSettings, DISPLAY_MODE_FILTERS } from "@/lib/settingsStore";
import { getCheats } from "@/lib/cheatStore";
import { useGamepad } from "@/hooks/useGamepad";
import { useGameSettings, getGameSettings } from "@/lib/gameSettingsStore";
import { getShaderStyles, composeFilters } from "@/lib/shaders";

// EmulatorJS core mapping. Values are the canonical EJS_core strings.
// gba   -> mGBA
// gbc   -> Gambatte (handles both .gb and .gbc)
// nes   -> FCEUmm
const CORE_MAP: Record<SystemId, string> = {
  gba: "mgba",
  gbc: "gambatte",
  nes: "fceumm",
};

declare global {
  interface Window {
    EJS_player?: string;
    EJS_gameUrl?: string;
    EJS_core?: string;
    EJS_pathtodata?: string;
    EJS_startOnLoaded?: boolean;
    EJS_gameName?: string;
    EJS_gameID?: string | number;
    EJS_color?: string;
    EJS_Buttons?: Record<string, boolean>;
    EJS_emulator?: any;
    EJS_ready?: () => void;
    EJS_onGameStart?: () => void;
    EJS_VirtualGamepadSettings?: any;
    EJS_volume?: number;
    EJS_disableDatabases?: boolean;
    EJS_defaultOptions?: Record<string, string | number | boolean>;
    EJS_startButtonName?: string;
  }
}

// Clean every EJS_* global so a second boot in the same tab is deterministic.
function clearEjsGlobals() {
  try {
    Object.keys(window).forEach((k) => {
      if (k.startsWith("EJS_")) {
        try {
          delete (window as any)[k];
        } catch {
          (window as any)[k] = undefined;
        }
      }
    });
  } catch {
    // ignore
  }
}

export default function Play() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  // Per-game default for hold-mode is read once on mount, then becomes
  // mutable through the in-game menu.
  const [holdMode, setHoldMode] = useState(() => (id ? !!getGameSettings(id).holdMode : false));
  const [speed, setSpeed] = useState(() => (id ? getGameSettings(id).speed ?? 1 : 1));
  const heldRef = useRef<Set<string>>(new Set());
  const blobUrlRef = useRef<string | null>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    getGame(id)
      .then((g) => {
        if (cancelled) return;
        if (!g) {
          setError("Game not found in your library.");
          return;
        }
        if (!CORE_MAP[g.system]) {
          setError(`Unsupported system: ${g.system}`);
          return;
        }
        if (!g.data || g.data.byteLength === 0) {
          setError("This ROM file appears to be empty or corrupted.");
          return;
        }
        setGame(g);
        markPlayed(id).catch(() => {});
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Failed to load game.");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Boot EmulatorJS once we have the game
  useEffect(() => {
    if (!game) return;
    const container = containerRef.current;
    if (!container) return;

    // Reset any previous boot state in this tab
    clearEjsGlobals();
    container.innerHTML = "";

    // Create a Blob URL for the ROM. EmulatorJS will fetch it via XHR.
    const ext = game.fileName.split(".").pop()?.toLowerCase() ?? "bin";
    const blob = new Blob([game.data], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;

    // EmulatorJS reads the file extension from the URL to detect the format.
    // Blob URLs have no extension, so we fake one via a hash — EJS strips it
    // for fetching but uses it for detection.
    const gameUrl = `${url}#${encodeURIComponent(game.fileName)}`;

    window.EJS_player = "#emu-game";
    window.EJS_gameUrl = gameUrl;
    window.EJS_core = CORE_MAP[game.system];
    window.EJS_pathtodata = "https://cdn.emulatorjs.org/stable/data/";
    // Auto-start the game so the user doesn't need to find/click EJS's
    // built-in "press to start" overlay (which can be hidden behind the
    // Delta skin overlay). Audio context unlocks on the first controller
    // tap, which is fine for retro-emulation use cases.
    window.EJS_startOnLoaded = true;
    // Disable EJS's IndexedDB cache UI; we manage saves ourselves.
    window.EJS_disableDatabases = true;
    window.EJS_gameName = game.name;
    window.EJS_gameID = game.id;
    window.EJS_color = "#a855f7";
    // Honour per-game volume override; fall back to a sensible default.
    window.EJS_volume = id ? (getGameSettings(id).volume ?? 0.6) : 0.6;
    // Disable EmulatorJS's built-in on-screen virtual gamepad — we render our
    // own controls below the screen. Without this, EJS overlays Fast/Slow/
    // Select/Start buttons directly on top of the gameplay on mobile.
    window.EJS_Buttons = {
      playPause: false,
      restart: false,
      mute: false,
      settings: true,
      fullscreen: true,
      saveState: false,
      loadState: false,
      screenRecord: false,
      gamepad: false,
      cheat: false,
      volume: false,
      saveSavFiles: false,
      loadSavFiles: false,
      quickSave: false,
      quickLoad: false,
      screenshot: false,
      cacheManager: false,
      exitEmulation: false,
      contextMenuButton: false,
    };
    window.EJS_VirtualGamepadSettings = [];
    window.EJS_ready = () => setReady(true);
    window.EJS_onGameStart = () => {
      setStarted(true);
      if (id) {
        // Apply any saved cheats once the core is fully running.
        getCheats(id).then((cheats) => applyCheatsToEmulator(cheats)).catch(() => {});
        // Restore the per-game default speed (1× when not customised).
        const gs = getGameSettings(id);
        if (gs.speed && gs.speed !== 1) applySpeedToEmulator(gs.speed);
      }
    };

    // Fresh loader script every boot — EmulatorJS guards against double-init
    // internally but we want clean ordering after navigations.
    const script = document.createElement("script");
    script.src = "https://cdn.emulatorjs.org/stable/data/loader.js";
    script.onerror = () =>
      setError("Failed to load the emulator. Check your internet connection and refresh.");
    document.body.appendChild(script);
    scriptRef.current = script;

    // Belt-and-braces: if the autoplay heuristic causes EJS to still render
    // its "Start Game" overlay, click it for the user. The original tap on
    // the ROM tile counts as a user gesture, so this is allowed.
    const autoStartInterval = window.setInterval(() => {
      const btn = container.querySelector<HTMLElement>(
        ".ejs_start_button, [class*='start_button'], .ejs_startgame_button",
      );
      if (btn) {
        btn.click();
        window.clearInterval(autoStartInterval);
      }
    }, 150);
    window.setTimeout(() => window.clearInterval(autoStartInterval), 15000);

    return () => {
      window.clearInterval(autoStartInterval);
      try {
        window.EJS_emulator?.callEvent?.("exit");
      } catch {
        // ignore
      }
      try {
        window.EJS_emulator?.exit?.();
      } catch {
        // ignore
      }
      if (scriptRef.current) {
        scriptRef.current.remove();
        scriptRef.current = null;
      }
      if (container) container.innerHTML = "";
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      clearEjsGlobals();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  // Map virtual controller -> EmulatorJS (libretro joypad indices)
  const sendInput = useCallback((button: string, pressed: boolean) => {
    const emu = window.EJS_emulator;
    const sim = emu?.gameManager?.simulateInput;
    if (!sim) return;
    const map: Record<string, number> = {
      B: 0, Y: 1, SELECT: 2, START: 3,
      UP: 4, DOWN: 5, LEFT: 6, RIGHT: 7,
      A: 8, X: 9, L: 10, R: 11,
    };
    const idx = map[button];
    if (idx === undefined) return;

    // Hold-button mode: a press toggles a latched state. We only act on the
    // press edge (pressed === true) and ignore the release. Pressing the
    // same button again releases it.
    if (holdMode) {
      if (!pressed) return;
      const held = heldRef.current;
      const isHeld = held.has(button);
      try {
        emu.gameManager.simulateInput(0, idx, isHeld ? 0 : 1);
      } catch { /* ignore */ }
      if (isHeld) held.delete(button);
      else held.add(button);
      return;
    }

    try {
      emu.gameManager.simulateInput(0, idx, pressed ? 1 : 0);
    } catch {
      // ignore
    }
  }, [holdMode]);

  // When leaving hold mode, release everything currently latched.
  useEffect(() => {
    if (holdMode) return;
    const emu = window.EJS_emulator;
    const map: Record<string, number> = {
      B: 0, Y: 1, SELECT: 2, START: 3,
      UP: 4, DOWN: 5, LEFT: 6, RIGHT: 7,
      A: 8, X: 9, L: 10, R: 11,
    };
    for (const b of heldRef.current) {
      try { emu?.gameManager?.simulateInput?.(0, map[b], 0); } catch { /* ignore */ }
    }
    heldRef.current.clear();
  }, [holdMode]);

  // Wire up physical gamepads (Web Gamepad API). Active whenever a game
  // is loaded — gamepad input flows through the same `sendInput` handler
  // as the on-screen controls, so hold-mode etc. all "just work".
  useGamepad({ enabled: !!game, onInput: sendInput });

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center glass rounded-3xl p-8">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="font-display text-2xl font-bold mb-2">Couldn't load game</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-primary text-primary-foreground font-display font-semibold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to library
          </button>
        </div>
      </div>
    );
  }

  return (
    <PlayLayout
      game={game}
      ready={ready}
      started={started}
      sendInput={sendInput}
      onBack={() => navigate("/")}
      containerRef={containerRef}
      holdMode={holdMode}
      onToggleHoldMode={() => setHoldMode((v) => !v)}
      speed={speed}
      onSpeedChange={(s) => {
        applySpeedToEmulator(s);
        setSpeed(s);
      }}
    />
  );
}

interface PlayLayoutProps {
  game: GameRecord | null;
  ready: boolean;
  started: boolean;
  sendInput: (button: string, pressed: boolean) => void;
  onBack: () => void;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  holdMode: boolean;
  onToggleHoldMode: () => void;
  speed: number;
  onSpeedChange: (s: number) => void;
}

function PlayLayout({ game, ready, started, sendInput, onBack, containerRef, holdMode, onToggleHoldMode }: PlayLayoutProps) {
  const settings = useSettings();
  const player = settings.players[1];
  const skinUrl = game ? getSkinUrlForSystem(game.system, player.gbcVariant, player.gbaVariant) : null;

  // Track viewport orientation so the skin controller knows which
  // representation to render.
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
    () => (typeof window !== "undefined" && window.matchMedia("(orientation: landscape)").matches ? "landscape" : "portrait"),
  );
  useEffect(() => {
    const mq = window.matchMedia("(orientation: landscape)");
    const handler = () => setOrientation(mq.matches ? "landscape" : "portrait");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || game?.system !== "gba" || orientation !== "landscape") return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    const screenOrientation = window.screen.orientation;
    const lock = screenOrientation?.lock?.bind(screenOrientation);
    if (!lock) return;

    lock("landscape").catch(() => {});
    return () => {
      screenOrientation.unlock?.();
    };
  }, [game?.system, orientation]);

  // Screen-slot rect (viewport coordinates) reported by DeltaSkinController.
  const [screenRect, setScreenRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const handleScreenRect = useCallback(
    (rect: { left: number; top: number; width: number; height: number } | null) => {
      setScreenRect(rect);
    },
    [],
  );

  // PlayMenu open state — lifted up so the skin's "menu" hit-region (the
  // small triangle button on most Delta skins) can open the same menu the
  // floating button used to. When the active skin defines its own menu
  // region, we hide the redundant floating button.
  const [menuOpen, setMenuOpen] = useState(false);
  const handleSkinMenu = useCallback(() => setMenuOpen(true), []);

  // The EmulatorJS canvas is positioned absolutely. When a skin reports a
  // rect we honour it; otherwise we centre in the legacy stage (below).
  // The CSS `filter` enriches the picture per the user's display profile —
  // works because EJS draws to a <canvas> child of #emu-game.
  const pictureFilter = DISPLAY_MODE_FILTERS[settings.displayMode];
  const canvasStyle: React.CSSProperties | undefined = skinUrl && screenRect
    ? {
        position: "fixed",
        left: screenRect.left,
        top: screenRect.top,
        width: screenRect.width,
        height: screenRect.height,
        zIndex: 5,
        filter: pictureFilter,
      }
    : undefined;

  return (
    <div className="min-h-dscreen flex flex-col bg-background">
      {/* Top bar — collapses on short landscape (Z Fold folded landscape, etc.) */}
      <header
        className="glass border-b border-border/40 px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-3 sticky top-0 z-30 [@media(max-height:480px)_and_(orientation:landscape)]:py-1.5"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-secondary/60 hover:bg-secondary text-sm font-medium transition-colors shrink-0"
          aria-label="Back to library"
        >
          <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Library</span>
        </button>
        <div className="flex-1 min-w-0 text-center">
          <h1 className="font-display font-semibold truncate text-sm sm:text-base">{game?.name ?? "Loading…"}</h1>
        </div>
        {game && <SystemBadge system={game.system} size="sm" />}
      </header>

      {/* === Path A: Delta skin available — full-screen skin layout === */}
      {skinUrl && game ? (
        <div className="flex-1 relative bg-black min-h-0">
          {/* The EJS canvas is positioned via canvasStyle (fixed). */}
          <div
            ref={containerRef}
            id="emu-game"
            className="bg-black"
            style={canvasStyle ?? { position: "absolute", inset: 0 }}
          />

          {!ready && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm pointer-events-none z-20">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="font-display font-semibold">
                Loading {game?.system && SYSTEM_LABELS[game.system]}…
              </p>
            </div>
          )}

          {/* Skin overlay — fills the play area beneath the header. The
              skin itself uses pointer-events:none on its wrapper and only
              re-enables them on actual hit regions, so the EJS canvas
              underneath still receives clicks (e.g. its "press to start"
              overlay). */}
          <div className="absolute inset-0 z-10">
            <DeltaSkinController
              skinUrl={skinUrl}
              orientation={orientation}
              onInput={sendInput}
              onScreenRect={handleScreenRect}
              onMenu={handleSkinMenu}
            />
          </div>
        </div>
      ) : (
        /* === Path B: legacy stacked layout (no Delta skin for this system) === */
        <>
          <div className="flex-1 flex items-center justify-center p-1 sm:p-2 md:p-6 bg-black/50 min-h-0 relative">
            <div className="relative w-full h-full max-w-5xl max-h-full aspect-[4/3] mx-auto rounded-xl sm:rounded-2xl overflow-hidden ring-1 ring-primary/20 shadow-elevated bg-black [@media(max-height:480px)_and_(orientation:landscape)]:rounded-lg">
              <div ref={containerRef} id="emu-game" className="absolute inset-0 w-full h-full" style={{ filter: pictureFilter }} />
              {!ready && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm pointer-events-none">
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  <div className="text-center px-6">
                    <p className="font-display font-semibold">
                      Loading {game?.system && SYSTEM_LABELS[game.system]}…
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Downloading the emulator core (one-time, ~2&nbsp;MB)
                    </p>
                  </div>
                </div>
              )}

              {game && started && (
                <div className="hidden [@media(max-height:480px)_and_(orientation:landscape)]:block">
                  <VirtualController system={game.system} onInput={sendInput} variant="sides" />
                </div>
              )}
            </div>
          </div>

          {game && started && (
            <div className="[@media(max-height:480px)_and_(orientation:landscape)]:hidden">
              <VirtualController system={game.system} onInput={sendInput} variant="bottom" />
            </div>
          )}
        </>
      )}

      {/* Keyboard hint (desktop only) */}
      <div className="hidden lg:block text-center text-xs text-muted-foreground pb-3 px-4">
        Keyboard: Arrow keys · Z = B · X = A · A = Y · S = X · Q/W = L/R · Enter = Start · Shift = Select
      </div>

      {/* Game menu — opened either from the skin's "menu" hit-region (the
          small triangle button on Delta skins) or from the floating button
          we render only when no skin is active. */}
      {game && started && (
        <PlayMenu
          gameId={game.id}
          holdMode={holdMode}
          onToggleHoldMode={onToggleHoldMode}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          hideTrigger={!!skinUrl}
        />
      )}

      {/* Live FPS counter — fixed top-left under the header. Only mounts
          while the game is actually running and the user has opted in. */}
      {settings.showFps && started && <FpsCounter />}
    </div>
  );
}

/**
 * Lightweight requestAnimationFrame-based FPS meter. Renders a small
 * monospace pill in the top-left of the viewport. Updates ~once per second
 * to avoid distracting flicker.
 */
function FpsCounter() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frames++;
      const delta = now - last;
      if (delta >= 1000) {
        setFps(Math.round((frames * 1000) / delta));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      className="fixed left-2 z-40 px-2 py-1 rounded-md bg-background/70 backdrop-blur-sm border border-border/50 text-xs font-mono tabular-nums text-primary pointer-events-none"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}
      aria-label={`${fps} frames per second`}
    >
      {fps} FPS
    </div>
  );
}
