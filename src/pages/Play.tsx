import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { getGame, markPlayed, SYSTEM_LABELS, type GameRecord } from "@/lib/gameStore";
import VirtualController from "@/components/VirtualController";
import SystemBadge from "@/components/SystemBadge";

// EmulatorJS core mapping. Values are the canonical EJS_core strings.
// gba   -> mGBA
// gbc   -> Gambatte (handles both .gb and .gbc)
// nes   -> FCEUmm
const CORE_MAP: Record<string, string> = {
  gba: "gba",
  gbc: "gambatte",
  nes: "nes",
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
    // Let EmulatorJS show its own "Play" overlay so audio context unlocks on
    // user gesture. Auto-starting often fails silently on mobile Safari.
    window.EJS_startOnLoaded = false;
    window.EJS_gameName = game.name;
    window.EJS_gameID = game.id;
    window.EJS_color = "#a855f7";
    window.EJS_volume = 0.6;
    window.EJS_ready = () => setReady(true);
    window.EJS_onGameStart = () => setStarted(true);

    // Fresh loader script every boot — EmulatorJS guards against double-init
    // internally but we want clean ordering after navigations.
    const script = document.createElement("script");
    script.src = "https://cdn.emulatorjs.org/stable/data/loader.js";
    script.onerror = () =>
      setError("Failed to load the emulator. Check your internet connection and refresh.");
    document.body.appendChild(script);
    scriptRef.current = script;

    return () => {
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
  const sendInput = (button: string, pressed: boolean) => {
    const emu = window.EJS_emulator;
    const sim = emu?.gameManager?.simulateInput;
    if (!sim) return;
    const map: Record<string, number> = {
      B: 0,
      Y: 1,
      SELECT: 2,
      START: 3,
      UP: 4,
      DOWN: 5,
      LEFT: 6,
      RIGHT: 7,
      A: 8,
      X: 9,
      L: 10,
      R: 11,
    };
    const idx = map[button];
    if (idx === undefined) return;
    try {
      emu.gameManager.simulateInput(0, idx, pressed ? 1 : 0);
    } catch {
      // ignore
    }
  };

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
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="glass border-b border-border/40 px-4 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-secondary/60 hover:bg-secondary text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Library</span>
        </button>
        <div className="flex-1 min-w-0 text-center">
          <h1 className="font-display font-semibold truncate">{game?.name ?? "Loading…"}</h1>
        </div>
        {game && <SystemBadge system={game.system} size="sm" />}
      </header>

      {/* Game stage */}
      <div className="flex-1 flex items-center justify-center p-2 md:p-6 bg-black/50">
        <div className="relative w-full max-w-5xl aspect-[4/3] rounded-2xl overflow-hidden ring-1 ring-primary/20 shadow-elevated bg-black">
          <div ref={containerRef} id="emu-game" className="absolute inset-0 w-full h-full" />
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
        </div>
      </div>

      {/* Virtual controls (mobile/tablet) — only useful once the game is running */}
      {game && started && <VirtualController system={game.system} onInput={sendInput} />}

      {/* Keyboard hint (desktop) */}
      <div className="hidden lg:block text-center text-xs text-muted-foreground pb-3">
        Keyboard: Arrow keys · Z = B · X = A · A = Y · S = X · Q/W = L/R · Enter = Start · Shift = Select
      </div>
    </div>
  );
}
