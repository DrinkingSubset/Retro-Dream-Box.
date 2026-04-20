import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Gamepad2, Sparkles, AlertCircle, Settings as SettingsIcon } from "lucide-react";
import { GameMeta, listGames, SystemId, SYSTEM_LABELS } from "@/lib/gameStore";
import GameCard from "@/components/GameCard";
import UploadRomButton from "@/components/UploadRomButton";
import SystemBadge from "@/components/SystemBadge";

type Filter = "all" | SystemId;

const TABS: { id: Filter; label: string }[] = [
  { id: "all", label: "All Games" },
  { id: "gba", label: "GBA" },
  { id: "gbc", label: "GBC" },
  { id: "nes", label: "NES" },
];

export default function Library() {
  const navigate = useNavigate();
  const [games, setGames] = useState<GameMeta[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listGames().then((g) => {
      setGames(g);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    return games.filter((g) => {
      if (filter !== "all" && g.system !== filter) return false;
      if (query && !g.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [games, filter, query]);

  const refresh = async () => setGames(await listGames());

  const handlePlay = (g: GameMeta) => navigate(`/play/${g.id}`);

  const counts = useMemo(() => {
    const c = { all: games.length, gba: 0, gbc: 0, nes: 0 } as Record<Filter, number>;
    games.forEach((g) => (c[g.system] += 1));
    return c;
  }, [games]);

  return (
    <div className="min-h-screen pb-24">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/10" />
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/30 blur-3xl animate-pulse-glow" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-accent/20 blur-3xl" />

        <div className="container relative z-10 py-10 sm:py-12 md:py-16">
          <div className="flex items-center gap-3 mb-5 sm:mb-6">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow shrink-0">
              <Gamepad2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-display font-semibold tracking-[0.25em] text-primary-glow uppercase">Delta</p>
              <h1 className="font-display text-xl sm:text-2xl md:text-3xl font-bold leading-none">Your Library</h1>
            </div>
          </div>

          <div className="max-w-2xl mb-6 sm:mb-8 animate-fade-up">
            <h2 className="font-display text-3xl sm:text-4xl md:text-6xl font-bold leading-[1.05] mb-3 sm:mb-4 text-balance">
              Every classic.<br />
              <span className="text-gradient">In your browser.</span>
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground md:text-lg">
              GBA, GBC, and NES — powered by EmulatorJS. Upload your ROMs once, play instantly. Saves stay on your device.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <UploadRomButton onAdded={() => refresh()} />
            <div className="flex items-center gap-2 text-xs text-muted-foreground glass rounded-full px-3 sm:px-4 py-2 sm:py-2.5">
              <Sparkles className="w-3.5 h-3.5 text-primary-glow" />
              {games.length} game{games.length === 1 ? "" : "s"} in library
            </div>
          </div>
        </div>
      </header>

      <main className="container pt-10">
        {/* Tabs + search */}
        <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between mb-8">
          <div className="flex gap-1.5 p-1.5 rounded-full glass overflow-x-auto scrollbar-hide">
            {TABS.map((t) => {
              const active = filter === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setFilter(t.id)}
                  className={`relative px-4 py-2 rounded-full font-display text-sm font-semibold transition-all whitespace-nowrap ${
                    active
                      ? "bg-gradient-primary text-primary-foreground shadow-glow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                  <span className={`ml-2 text-xs ${active ? "opacity-90" : "opacity-60"}`}>
                    {counts[t.id]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative md:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search games…"
              className="w-full pl-11 pr-4 py-3 rounded-full bg-secondary/40 border border-border/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-secondary/70 transition-colors"
            />
          </div>
        </div>

        {/* Content — extra column at md (Z Fold unfolded ~968px) */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-3xl bg-card/60 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState hasGames={games.length > 0} filter={filter} onAdded={() => refresh()} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-5">
            {filtered.map((g, i) => (
              <GameCard
                key={g.id}
                game={g}
                index={i}
                onPlay={handlePlay}
                onChanged={() => refresh()}
              />
            ))}
          </div>
        )}

        {/* Disclaimer */}
        <div className="mt-16 max-w-3xl mx-auto glass rounded-2xl p-5 flex gap-4 text-sm">
          <AlertCircle className="w-5 h-5 text-primary-glow shrink-0 mt-0.5" />
          <p className="text-muted-foreground leading-relaxed">
            <span className="text-foreground font-semibold">ROMs not included.</span> You must own the
            original cartridge or a legal copy to play. All files are stored locally in your browser
            and never uploaded to a server.
          </p>
        </div>
      </main>
    </div>
  );
}

function EmptyState({
  hasGames,
  filter,
  onAdded,
}: {
  hasGames: boolean;
  filter: Filter;
  onAdded: () => void;
}) {
  if (hasGames) {
    return (
      <div className="text-center py-20">
        <div className="inline-flex w-16 h-16 rounded-2xl bg-secondary items-center justify-center mb-4">
          <Search className="w-7 h-7 text-muted-foreground" />
        </div>
        <h3 className="font-display text-xl font-semibold mb-2">No matches</h3>
        <p className="text-muted-foreground">
          Nothing in {filter === "all" ? "your library" : SYSTEM_LABELS[filter as SystemId]} matches that search.
        </p>
      </div>
    );
  }
  return (
    <div className="text-center py-20 max-w-lg mx-auto animate-scale-in">
      <div className="relative inline-flex w-24 h-24 rounded-3xl bg-gradient-primary items-center justify-center mb-6 shadow-glow animate-float-slow">
        <Gamepad2 className="w-12 h-12 text-primary-foreground" />
      </div>
      <h3 className="font-display text-3xl font-bold mb-3">Your library is empty</h3>
      <p className="text-muted-foreground mb-8 leading-relaxed">
        Drop in your <SystemBadge system="gba" size="sm" />, <SystemBadge system="gbc" size="sm" />, or{" "}
        <SystemBadge system="nes" size="sm" /> ROM files to start playing instantly.
      </p>
      <UploadRomButton onAdded={onAdded} />
    </div>
  );
}
