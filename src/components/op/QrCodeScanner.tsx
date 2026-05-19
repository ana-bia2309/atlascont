import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Camera, Keyboard, AlertTriangle, Loader2, X } from "@/lib/icons";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Validates the scanned/typed code. Return true if it matches the linked equipment. */
  onValidate: (rawValue: string) => boolean | Promise<boolean>;
  expectedHint?: string;
}

const QR_REGION_ID = "qr-scanner-region";

export default function QrCodeScanner({ open, onClose, onValidate, expectedHint }: Props) {
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isHandlingRef = useRef(false);

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      const state = scanner.getState();
      // 2 = SCANNING
      if (state === 2) await scanner.stop();
      await scanner.clear();
    } catch {
      // ignore
    }
  };

  const handleDetected = async (decoded: string) => {
    if (isHandlingRef.current) return;
    isHandlingRef.current = true;
    setError(null);
    setValidating(true);
    try {
      const ok = await onValidate(decoded);
      if (ok) {
        await stopScanner();
        onClose();
      } else {
        setError("Equipamento incorreto. Escaneie o QR Code do equipamento vinculado.");
        setTimeout(() => { isHandlingRef.current = false; }, 1200);
      }
    } catch (e) {
      setError("Falha ao validar QR Code. Tente novamente.");
      isHandlingRef.current = false;
    } finally {
      setValidating(false);
    }
  };

  useEffect(() => {
    if (!open || mode !== "camera") return;
    setError(null);
    setCameraReady(false);
    isHandlingRef.current = false;

    let cancelled = false;

    const start = async () => {
      try {
        // Wait for the DOM region to be available
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (cancelled) return;

        const region = document.getElementById(QR_REGION_ID);
        if (!region) {
          setError("Não foi possível inicializar o leitor. Use a entrada manual.");
          return;
        }

        const scanner = new Html5Qrcode(QR_REGION_ID, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            // Square QR box that adapts to viewfinder size (≈85% of the smaller edge)
            qrbox: (vw: number, vh: number) => {
              const size = Math.floor(Math.min(vw, vh) * 0.85);
              return { width: size, height: size };
            },
            aspectRatio: 1,
          },
          (decodedText) => { handleDetected(decodedText); },
          () => { /* ignore non-detection frames */ },
        );
        if (!cancelled) setCameraReady(true);
      } catch (e: any) {
        const msg = e?.message || String(e);
        if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed")) {
          setError("Permissão de câmera negada. Use a entrada manual abaixo.");
        } else {
          setError("Câmera indisponível. Use a entrada manual abaixo.");
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setMode("camera");
      setManualValue("");
      setError(null);
      setValidating(false);
      isHandlingRef.current = false;
      stopScanner();
    }
  }, [open]);

  const handleManualSubmit = async () => {
    const v = manualValue.trim();
    if (!v) {
      setError("Digite o código do equipamento.");
      return;
    }
    setError(null);
    setValidating(true);
    try {
      const ok = await onValidate(v);
      if (ok) {
        onClose();
      } else {
        setError("Equipamento incorreto. Confira o código do equipamento vinculado.");
      }
    } catch {
      setError("Falha ao validar código.");
    } finally {
      setValidating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          stopScanner();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <style>{`
          #${QR_REGION_ID} video { width: 100% !important; height: 100% !important; object-fit: cover; }
          #${QR_REGION_ID} > div:not([id]) { border: 4px solid hsl(var(--primary)) !important; box-shadow: 0 0 0 9999px hsl(0 0% 0% / 0.45); border-radius: 12px; }
          #${QR_REGION_ID} img[alt="Info icon"] { display: none !important; }
        `}</style>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            Escanear QR Code do Equipamento
          </DialogTitle>
          <DialogDescription className="text-xs">
            {expectedHint
              ? <>Equipamento esperado: <strong>{expectedHint}</strong></>
              : "Aproxime a câmera do QR Code fixado no equipamento vinculado à ordem."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "camera" ? "default" : "outline"}
            className="flex-1 gap-1.5"
            onClick={() => setMode("camera")}
          >
            <Camera className="h-3.5 w-3.5" /> Câmera
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "manual" ? "default" : "outline"}
            className="flex-1 gap-1.5"
            onClick={async () => { await stopScanner(); setMode("manual"); setError(null); }}
          >
            <Keyboard className="h-3.5 w-3.5" /> Manual
          </Button>
        </div>

        {mode === "camera" && (
          <div className="space-y-2">
            <div
              id={QR_REGION_ID}
              className="w-full aspect-square overflow-hidden rounded-lg border-2 border-primary/30 bg-black"
            />
            {!cameraReady && !error && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Inicializando câmera...
              </div>
            )}
          </div>
        )}

        {mode === "manual" && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Código de identificação do equipamento
            </label>
            <div className="flex gap-2">
              <Input
                autoFocus
                placeholder="Ex.: ATV-0042"
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleManualSubmit(); }}
              />
              <Button onClick={handleManualSubmit} disabled={validating || !manualValue.trim()}>
                {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Validar"}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="border-amber-500/50 bg-amber-50 text-amber-900 [&>svg]:text-amber-600 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm">Erro de validação</AlertTitle>
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={() => { stopScanner(); onClose(); }} className="gap-1">
            <X className="h-3.5 w-3.5" /> Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
