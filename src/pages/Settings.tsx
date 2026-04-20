import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { ArrowLeft, Cloud, HardDrive, Smartphone, Volume2, Vibrate, Image as ImageIcon, CheckCircle2 } from "lucide-react";
import { useSettings, updatePlayer, updateSettings, SKIN_LABELS, GBC_VARIANTS, type SkinId, type PlayerId } from "@/lib/settingsStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const SKINS: SkinId[] = ["nes", "snes", "n64", "gbc", "gba", "ds"];
const APP_ICONS = [
  { id: "default" as const, label: "Default", className: "bg-gradient-primary" },
  { id: "midnight" as const, label: "Midnight", className: "bg-gradient-to-br from-slate-900 to-slate-700" },
  { id: "retro" as const, label: "Retro", className: "bg-gradient-to-br from-orange-500 to-red-600" },
  { id: "neon" as const, label: "Neon", className: "bg-gradient-to-br from-cyan-400 to-fuchsia-500" },
];

export default function Settings() {
  const navigate = useNavigate();
  const settings = useSettings();
  const [activePlayer, setActivePlayer] = useState<PlayerId>(1);

  const player = settings.players[activePlayer];

  return (
    <div className="min-h-dscreen pb-20">
      <header
        className="glass border-b border-border/40 sticky top-0 z-30"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <div className="container flex items-center gap-3 py-3">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-secondary/60 hover:bg-secondary text-sm font-medium transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="font-display text-xl sm:text-2xl font-bold">Settings</h1>
        </div>
      </header>

      <main className="container max-w-3xl pt-6 sm:pt-10 space-y-8">
        {/* Controllers */}
        <Section title="Controllers" subtitle="Customize each player's on-screen controls">
          <Tabs value={String(activePlayer)} onValueChange={(v) => setActivePlayer(Number(v) as PlayerId)}>
            <TabsList className="grid grid-cols-4 w-full">
              {[1, 2, 3, 4].map((p) => (
                <TabsTrigger key={p} value={String(p)}>Player {p}</TabsTrigger>
              ))}
            </TabsList>

            {[1, 2, 3, 4].map((p) => (
              <TabsContent key={p} value={String(p)} className="space-y-6 pt-6">
                {/* Skin grid */}
                <div>
                  <Label className="text-sm font-display font-semibold mb-3 block">Controller skin</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {SKINS.map((skin) => {
                      const active = player.skin === skin;
                      return (
                        <button
                          key={skin}
                          onClick={() => updatePlayer(activePlayer, { skin })}
                          className={`relative rounded-2xl border p-4 text-left transition-all ${
                            active
                              ? "border-primary bg-primary/10 shadow-glow"
                              : "border-border/50 bg-card/40 hover:border-primary/40"
                          }`}
                        >
                          <SkinPreview skin={skin} />
                          <p className="font-display font-semibold text-sm mt-3">{SKIN_LABELS[skin]}</p>
                          {active && (
                            <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-primary" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* GBC color variants — only meaningful when the GBC skin is selected. */}
                {player.skin === "gbc" && (
                  <div>
                    <Label className="text-sm font-display font-semibold mb-1 block">Game Boy Color skin</Label>
                    <p className="text-xs text-muted-foreground mb-3">
                      Pick a color — applied to the on-screen controls when you play a Game Boy Color game.
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {GBC_VARIANTS.map((v) => {
                        const active = player.gbcVariant === v.id;
                        return (
                          <button
                            key={v.id}
                            onClick={() => updatePlayer(activePlayer, { gbcVariant: v.id })}
                            className={`relative rounded-2xl border p-3 text-left transition-all ${
                              active
                                ? "border-primary bg-primary/10 shadow-glow"
                                : "border-border/50 bg-card/40 hover:border-primary/40"
                            }`}
                            aria-label={`Apply ${v.label} skin`}
                          >
                            <div
                              className="h-12 rounded-xl relative overflow-hidden"
                              style={{ background: `linear-gradient(180deg, ${v.body}, ${v.accent})` }}
                            >
                              <div
                                className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 rounded-sm"
                                style={{ background: v.button }}
                              />
                              <div
                                className="absolute right-2 top-2 w-3 h-3 rounded-full"
                                style={{ background: v.button }}
                              />
                              <div
                                className="absolute right-2 bottom-2 w-3 h-3 rounded-full"
                                style={{ background: v.button }}
                              />
                            </div>
                            <p className="font-display font-semibold text-xs mt-2 truncate">{v.label}</p>
                            {active && (
                              <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-primary" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Opacity */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-display font-semibold">Controller opacity</Label>
                    <span className="text-sm text-muted-foreground tabular-nums">{player.opacity}%</span>
                  </div>
                  <Slider
                    value={[player.opacity]}
                    onValueChange={([v]) => updatePlayer(activePlayer, { opacity: v })}
                    min={0}
                    max={100}
                    step={1}
                  />
                </div>

                {/* Size */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-display font-semibold">Controller size</Label>
                    <span className="text-sm text-muted-foreground tabular-nums">{player.scale}%</span>
                  </div>
                  <Slider
                    value={[player.scale]}
                    onValueChange={([v]) => updatePlayer(activePlayer, { scale: v })}
                    min={50}
                    max={150}
                    step={5}
                  />
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </Section>

        {/* Display */}
        <Section title="Display" subtitle="App appearance">
          <Label className="text-sm font-display font-semibold mb-3 block">Change app icon</Label>
          <div className="grid grid-cols-4 gap-3">
            {APP_ICONS.map((icon) => {
              const active = settings.appIcon === icon.id;
              return (
                <button
                  key={icon.id}
                  onClick={() => updateSettings({ appIcon: icon.id })}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${
                    active ? "border-primary bg-primary/10" : "border-border/50 hover:border-primary/40"
                  }`}
                >
                  <div className={`w-14 h-14 rounded-2xl ${icon.className} shadow-card flex items-center justify-center`}>
                    <ImageIcon className="w-6 h-6 text-white/90" />
                  </div>
                  <span className="text-xs font-medium">{icon.label}</span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* Audio & haptics */}
        <Section title="Game Audio & Haptics">
          <Row
            icon={<Volume2 className="w-4 h-4" />}
            label="Respect silent mode"
            description="Mute game audio when device is in silent mode"
          >
            <Switch
              checked={settings.respectSilentMode}
              onCheckedChange={(v) => updateSettings({ respectSilentMode: v })}
            />
          </Row>
          <Row
            icon={<Vibrate className="w-4 h-4" />}
            label="Haptic touches"
            description="Vibrate when on-screen buttons are pressed"
          >
            <Switch
              checked={settings.hapticFeedback}
              onCheckedChange={(v) => {
                updateSettings({ hapticFeedback: v });
                if (v) navigator.vibrate?.(15);
              }}
            />
          </Row>
        </Section>

        {/* Data sync */}
        <Section title="Data Sync" subtitle="Back up save files to the cloud">
          <SyncRow
            icon={<Cloud className="w-5 h-5" />}
            label="Google Drive"
            connected={settings.cloudSync.googleDrive.connected}
            email={settings.cloudSync.googleDrive.email}
            onClick={() => toast.info("Google Drive sync — coming soon")}
          />
          <SyncRow
            icon={<HardDrive className="w-5 h-5" />}
            label="Dropbox"
            connected={settings.cloudSync.dropbox.connected}
            email={settings.cloudSync.dropbox.email}
            onClick={() => toast.info("Dropbox sync — coming soon")}
          />
        </Section>

        <Section title="About">
          <Row
            icon={<Smartphone className="w-4 h-4" />}
            label="Retro Play"
            description="Version 1.0 · Local-first · Powered by EmulatorJS"
          >
            <span />
          </Row>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-3xl p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="font-display text-lg sm:text-xl font-bold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({
  icon, label, description, children,
}: { icon: React.ReactNode; label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center text-primary shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="font-medium">{label}</p>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function SyncRow({
  icon, label, connected, email, onClick,
}: { icon: React.ReactNode; label: string; connected: boolean; email?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-4 p-3 rounded-2xl bg-secondary/40 hover:bg-secondary/70 transition-colors text-left"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center text-primary shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="font-display font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground truncate">
            {connected ? (email ?? "Connected") : "Not connected"}
          </p>
        </div>
      </div>
      <span
        className={`text-xs px-3 py-1.5 rounded-full font-display font-semibold ${
          connected ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
        }`}
      >
        {connected ? "Connected" : "Connect"}
      </span>
    </button>
  );
}

function SkinPreview({ skin }: { skin: SkinId }) {
  const palette: Record<SkinId, { bg: string; a: string; b: string }> = {
    nes:  { bg: "from-zinc-700 to-zinc-900", a: "bg-red-600", b: "bg-red-600" },
    snes: { bg: "from-violet-700 to-violet-900", a: "bg-rose-500", b: "bg-emerald-500" },
    n64:  { bg: "from-slate-600 to-slate-800", a: "bg-blue-500", b: "bg-emerald-500" },
    gbc:  { bg: "from-fuchsia-600 to-fuchsia-800", a: "bg-rose-500", b: "bg-rose-500" },
    gba:  { bg: "from-indigo-600 to-indigo-900", a: "bg-rose-500", b: "bg-emerald-500" },
    ds:   { bg: "from-sky-600 to-sky-900", a: "bg-rose-500", b: "bg-yellow-400" },
  };
  const p = palette[skin];
  return (
    <div className={`relative h-14 rounded-xl bg-gradient-to-br ${p.bg} overflow-hidden`}>
      <div className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 bg-zinc-900 rounded-sm" />
      <div className={`absolute right-3 top-2 w-3 h-3 rounded-full ${p.a}`} />
      <div className={`absolute right-3 bottom-2 w-3 h-3 rounded-full ${p.b}`} />
    </div>
  );
}
