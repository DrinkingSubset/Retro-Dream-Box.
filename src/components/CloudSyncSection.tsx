import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cloud, CloudOff, Loader2, Trash2, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { listAllCloudSaves, deleteCloudSave, type CloudSaveRow } from "@/lib/cloudSync";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Settings panel showing cloud-sync status. For signed-in users it lists
 * every cloud save grouped by game, with a delete-from-cloud action. For
 * guests it shows a "Sign in to enable sync" CTA.
 */
export default function CloudSyncSection() {
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<CloudSaveRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!user) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      setRows(await listAllCloudSaves());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load cloud saves");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  if (authLoading) {
    return <div className="h-32 rounded-2xl bg-card/40 animate-pulse" />;
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/40 p-5 sm:p-6 text-center">
        <div className="inline-flex w-12 h-12 rounded-2xl bg-secondary items-center justify-center mb-3">
          <CloudOff className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="font-display font-semibold text-lg mb-1">Cloud sync is off</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Sign in to back up your battery saves and save states across devices.
        </p>
        <Button asChild>
          <Link to="/auth">
            <Cloud className="w-4 h-4" /> Sign in
          </Link>
        </Button>
      </div>
    );
  }

  // Group by game.
  const grouped = new Map<string, { name: string; system: string; rows: CloudSaveRow[] }>();
  for (const r of rows) {
    const g = grouped.get(r.game_id) ?? { name: r.game_name, system: r.system, rows: [] };
    g.rows.push(r);
    grouped.set(r.game_id, g);
  }

  const handleDelete = async (row: CloudSaveRow) => {
    try {
      await deleteCloudSave(row, row.kind, row.slot);
      toast.success("Cloud save removed");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Signed in as <span className="text-foreground font-medium">{user.email}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-6 text-center text-sm text-muted-foreground">
          No cloud saves yet. They'll appear here as you save in-game.
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([gameId, g]) => (
            <div key={gameId} className="rounded-2xl border border-border/50 bg-card/40 p-4">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <p className="font-display font-semibold truncate">{g.name}</p>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{g.system}</span>
              </div>
              <ul className="space-y-1.5">
                {g.rows
                  .slice()
                  .sort((a, b) => (a.kind === b.kind ? a.slot - b.slot : a.kind === "sram" ? -1 : 1))
                  .map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">
                          {r.kind === "sram" ? "Battery save" : `State slot ${r.slot}`}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {new Date(r.updated_at).toLocaleString()}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDelete(r)}
                        aria-label="Delete from cloud"
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
