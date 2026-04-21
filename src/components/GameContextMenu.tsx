import { useRef, useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ExternalLink, Pencil, Image as ImageIcon, Share2, Settings as SettingsIcon,
  Save, FileText, Trash2, Clipboard, FolderOpen, Database, Heart, Tag, Loader2,
} from "lucide-react";
import { renameGame, setArtwork, deleteGame, toggleFavorite, setCollections, type GameMeta } from "@/lib/gameStore";
import { fetchBoxArtAsDataUrl } from "@/lib/boxArtFetch";
import { toast } from "sonner";

interface Props {
  game: GameMeta;
  children: React.ReactNode;
  onChanged: () => void;
}

export default function GameContextMenu({ game, children, onChanged }: Props) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [artworkOpen, setArtworkOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(game.name);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleRename = async () => {
    await renameGame(game.id, name);
    setRenameOpen(false);
    onChanged();
    toast.success("Renamed");
  };

  const handleDelete = async () => {
    await deleteGame(game.id);
    setDeleteOpen(false);
    onChanged();
    toast.success(`Removed ${game.name}`);
  };

  const handleArtworkFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      await setArtwork(game.id, reader.result as string);
      setArtworkOpen(false);
      onChanged();
      toast.success("Artwork updated");
    };
    reader.readAsDataURL(file);
  };

  const handleClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          handleArtworkFile(new File([blob], "clipboard.png", { type }));
          return;
        }
      }
      toast.error("No image on clipboard");
    } catch {
      toast.error("Clipboard access denied");
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/play/${game.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: game.name, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
      }
    } catch {
      // user cancelled
    }
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onSelect={() => window.open(`/play/${game.id}`, "_blank")}>
            <ExternalLink className="w-4 h-4" /> Open in new window
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setRenameOpen(true)}>
            <Pencil className="w-4 h-4" /> Rename
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setArtworkOpen(true)}>
            <ImageIcon className="w-4 h-4" /> Change artwork
          </ContextMenuItem>
          <ContextMenuItem onSelect={handleShare}>
            <Share2 className="w-4 h-4" /> Share game
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => toast.info("Per-game settings — coming soon")}>
            <SettingsIcon className="w-4 h-4" /> Settings
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => toast.info("Save states — coming soon")}>
            <Save className="w-4 h-4" /> View save states
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => toast.info("Save file manager — coming soon")}>
            <FileText className="w-4 h-4" /> Manage save file
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => setDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Rename */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename game</DialogTitle>
          </DialogHeader>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={handleRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change artwork */}
      <Dialog open={artworkOpen} onOpenChange={setArtworkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change artwork</DialogTitle>
            <DialogDescription>Pick a new cover image for {game.name}.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <ArtworkOption icon={<Clipboard className="w-5 h-5" />} label="Clipboard" onClick={handleClipboard} />
            <ArtworkOption icon={<ImageIcon className="w-5 h-5" />} label="Photo Library" onClick={() => fileRef.current?.click()} />
            <ArtworkOption icon={<Database className="w-5 h-5" />} label="Game Database" onClick={() => toast.info("Game database lookup — coming soon")} />
            <ArtworkOption icon={<FolderOpen className="w-5 h-5" />} label="Files" onClick={() => fileRef.current?.click()} />
          </div>
          {game.artworkDataUrl && (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                await setArtwork(game.id, undefined);
                setArtworkOpen(false);
                onChanged();
                toast.success("Artwork reset");
              }}
            >
              Reset to default
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleArtworkFile(f);
              e.target.value = "";
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {game.name}?</DialogTitle>
            <DialogDescription>
              The ROM file will be removed from your library. Save data is kept separately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ArtworkOption({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-border/50 hover:border-primary/60 hover:bg-primary/5 transition-colors"
    >
      <div className="w-10 h-10 rounded-xl bg-secondary/60 flex items-center justify-center text-primary">
        {icon}
      </div>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
