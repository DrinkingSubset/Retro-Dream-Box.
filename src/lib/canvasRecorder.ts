/**
 * Capture the live emulator canvas to a downloadable WebM video using
 * MediaRecorder + canvas.captureStream(). Audio is not included — the
 * EJS audio output is routed through the AudioContext, not the canvas,
 * and mixing them reliably across browsers requires invasive plumbing.
 *
 * Browsers without MediaRecorder support (e.g. very old iOS Safari) will
 * see a friendly error toast.
 */

const MIME_PREFERENCES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4",
] as const;

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of MIME_PREFERENCES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

export interface ActiveRecording {
  stop(): Promise<void>;
  isRecording(): boolean;
  startedAt: number;
}

export function startCanvasRecording(): ActiveRecording {
  const canvas =
    (window as any).EJS_emulator?.canvas ??
    (document.querySelector("#emu-game canvas") as HTMLCanvasElement | null);
  if (!canvas) throw new Error("Canvas not found");

  const mime = pickMimeType();
  if (!mime) throw new Error("Recording is not supported on this browser");

  const stream = canvas.captureStream(60);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  let stopped = false;

  const stoppedPromise = new Promise<void>((resolve) => {
    recorder.onstop = () => {
      stopped = true;
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recording-${Date.now()}.${ext}`;
      a.click();
      // Defer revoke — Safari needs the URL alive briefly post-click.
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      stream.getTracks().forEach((t) => t.stop());
      resolve();
    };
  });

  recorder.start(1000); // Flush a chunk every second.

  return {
    isRecording: () => !stopped,
    startedAt: Date.now(),
    stop: async () => {
      if (recorder.state !== "inactive") recorder.stop();
      await stoppedPromise;
    },
  };
}
