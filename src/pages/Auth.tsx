import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Cloud } from "lucide-react";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Auth() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [busy, setBusy] = useState(false);

  // Already signed in? Bounce to the library.
  useEffect(() => {
    if (!authLoading && user) navigate("/", { replace: true });
  }, [user, authLoading, navigate]);

  const handleGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/`,
      });
      if (result.error) throw result.error;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      toast.error(msg);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dscreen flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-primary/10">
      <div className="absolute top-4 left-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-full glass hover:bg-secondary/80 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </div>

      <div className="w-full max-w-sm glass rounded-3xl p-7 sm:p-8 shadow-elevated animate-scale-in">
        <div className="flex items-center justify-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow">
            <Cloud className="w-7 h-7 text-primary-foreground" />
          </div>
        </div>

        <h1 className="font-display text-2xl font-bold text-center mb-1">
          Welcome
        </h1>
        <p className="text-center text-sm text-muted-foreground mb-6">
          Sign in to sync save states &amp; battery saves across devices.
        </p>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogle}
          disabled={busy}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
          Continue with Google
        </Button>

        <p className="text-[11px] text-center text-muted-foreground mt-5">
          By continuing you agree to sync your library data with your Google account.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
      <path fill="#EA4335" d="M12 11v3.2h5.5c-.2 1.4-1.6 4.2-5.5 4.2-3.3 0-6-2.7-6-6.1S8.7 6.2 12 6.2c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.6 14.5 2.7 12 2.7 6.9 2.7 2.8 6.9 2.8 12s4.1 9.3 9.2 9.3c5.3 0 8.8-3.7 8.8-9 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}
