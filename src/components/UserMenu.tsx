import { Link } from "react-router-dom";
import { Cloud, LogIn, LogOut, User as UserIcon } from "lucide-react";
import { useAuth, signOut } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

/**
 * Compact account chip rendered in page headers. Shows a "Sign in" pill
 * for guests and a circular avatar with a dropdown for signed-in users.
 */
export default function UserMenu() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="w-10 h-10 rounded-full bg-secondary/50 animate-pulse" aria-hidden />;
  }

  if (!user) {
    return (
      <Link
        to="/auth"
        className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-gradient-primary text-primary-foreground text-sm font-display font-semibold shadow-glow hover:shadow-elevated transition-shadow"
      >
        <LogIn className="w-4 h-4" />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  const initials = (user.email ?? "?")
    .split("@")[0]
    .slice(0, 2)
    .toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Account"
          className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-primary text-primary-foreground font-display font-bold text-sm flex items-center justify-center shadow-glow hover:shadow-elevated transition-shadow"
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          <UserIcon className="w-4 h-4 text-muted-foreground" />
          <span className="truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings" className="flex items-center gap-2">
            <Cloud className="w-4 h-4" /> Cloud sync
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} className="text-destructive focus:text-destructive">
          <LogOut className="w-4 h-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
