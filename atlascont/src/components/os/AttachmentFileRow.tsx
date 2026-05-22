import { useEffect, useRef, useState } from "react";
import { useCallback } from "react";
import { pdfjs, Document, Page } from "react-pdf";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Eye, FileText, Loader2, Maximize, Minimize, Minus, Plus, RotateCcw, Trash2, X } from "@/lib/icons";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { toast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DEFAULT_BUCKET,
  type AttachmentStorageRecord,
  fetchAttachmentBlob,
  downloadAttachmentFile,
  getPreviewKind,
  revokeObjectUrl,
  serializeAttachmentDebugRecord,
} from "@/lib/os-attachments";

const PDF_WORKER_SRC = `${pdfWorkerSrc}${pdfWorkerSrc.includes("?") ? "&" : "?"}v=${encodeURIComponent(pdfjs.version)}`;

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
  console.info("[os-attachments] PDF.js worker configured", {
    pdfjs_version: pdfjs.version,
    worker_src: PDF_WORKER_SRC,
  });
}

interface AttachmentFileRowProps {
  attachment: AttachmentStorageRecord;
  onDelete?: () => void;
  canDownload?: boolean;
}

function normalizePreviewBlob(blob: Blob, file_name: string) {
  const kind = getPreviewKind(blob.type, file_name);

  if (kind === "pdf" && (!blob.type || blob.type === "application/octet-stream")) {
    return new Blob([blob], { type: "application/pdf" });
  }

  return blob;
}

function logAttachmentPreview(level: "info" | "error", message: string, details: Record<string, unknown>) {
  const logger = level === "error" ? console.error : console.info;
  logger(`[os-attachments] ${message}`, details);
}

export default function AttachmentFileRow({ attachment, onDelete, canDownload = true }: AttachmentFileRowProps) {
  const isMobile = useIsMobile();
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewAssetUrl, setPreviewAssetUrl] = useState<string | null>(null);
  const [previewSourceUrl, setPreviewSourceUrl] = useState<string | null>(null);
  const [previewAccessStrategy, setPreviewAccessStrategy] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<"pdf" | "image" | "unsupported">("pdf");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewWidth, setPreviewWidth] = useState(0);
  const [zoomMode, setZoomMode] = useState<"fit-width" | "fit-page" | "manual">("fit-width");
  const [manualScale, setManualScale] = useState(1);
  const [pdfPageOriginalWidth, setPdfPageOriginalWidth] = useState<number | null>(null);
  const [pdfPageOriginalHeight, setPdfPageOriginalHeight] = useState<number | null>(null);

  const ZOOM_STEP = 0.15;
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 4;

  const containerPadding = isMobile ? 16 : 32;

  const computedPageWidth = (() => {
    const availableWidth = Math.max(previewWidth - containerPadding, isMobile ? 220 : 320);
    const availableHeight = typeof window !== "undefined" ? window.innerHeight * (isFullscreen ? 0.82 : 0.75) : 600;

    if (zoomMode === "fit-width") {
      return availableWidth;
    }

    if (zoomMode === "fit-page" && pdfPageOriginalWidth && pdfPageOriginalHeight) {
      const scaleByWidth = availableWidth / pdfPageOriginalWidth;
      const scaleByHeight = availableHeight / pdfPageOriginalHeight;
      const fitScale = Math.min(scaleByWidth, scaleByHeight);
      return pdfPageOriginalWidth * fitScale;
    }

    if (zoomMode === "manual" && pdfPageOriginalWidth) {
      return pdfPageOriginalWidth * manualScale;
    }

    return availableWidth;
  })();

  const displayZoomPercent = (() => {
    if (!pdfPageOriginalWidth || pdfPageOriginalWidth === 0) return 100;
    return Math.round((computedPageWidth / pdfPageOriginalWidth) * 100);
  })();

  const zoomIn = () => {
    const currentScale = pdfPageOriginalWidth ? computedPageWidth / pdfPageOriginalWidth : 1;
    const next = Math.min(currentScale + ZOOM_STEP, ZOOM_MAX);
    setManualScale(next);
    setZoomMode("manual");
  };

  const zoomOut = () => {
    const currentScale = pdfPageOriginalWidth ? computedPageWidth / pdfPageOriginalWidth : 1;
    const next = Math.max(currentScale - ZOOM_STEP, ZOOM_MIN);
    setManualScale(next);
    setZoomMode("manual");
  };

  const zoomFitWidth = () => setZoomMode("fit-width");
  const zoomFitPage = () => setZoomMode("fit-page");
  const zoomReset = () => {
    setManualScale(1);
    setZoomMode("fit-width");
  };

  const toggleFullscreen = () => setIsFullscreen((v) => !v);

  // Ctrl+Scroll zoom on the PDF container
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const currentScale = pdfPageOriginalWidth ? computedPageWidth / pdfPageOriginalWidth : 1;
      const delta = e.deltaY > 0 ? -ZOOM_STEP * 0.5 : ZOOM_STEP * 0.5;
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, currentScale + delta));
      setManualScale(next);
      setZoomMode("manual");
    },
    [computedPageWidth, pdfPageOriginalWidth],
  );

  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el || !previewOpen || previewKind !== "pdf") return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel, previewOpen, previewKind]);

  useEffect(() => {
    return () => revokeObjectUrl(previewAssetUrl);
  }, [previewAssetUrl]);

  useEffect(() => {
    const element = previewContainerRef.current;

    if (!previewOpen || previewKind !== "pdf" || !element) {
      return;
    }

    const updateWidth = () => setPreviewWidth(Math.floor(element.clientWidth));
    updateWidth();

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width || element.clientWidth;
      setPreviewWidth(Math.floor(width));
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [previewKind, previewOpen]);

  const resetPreviewState = () => {
    revokeObjectUrl(previewAssetUrl);
    setPreviewAssetUrl(null);
    setPreviewBlob(null);
    setPreviewSourceUrl(null);
    setPreviewAccessStrategy(null);
    setPreviewError(null);
    setPreviewLoading(false);
    setPageCount(0);
    setCurrentPage(1);
    setPreviewWidth(0);
    setZoomMode("fit-width");
    setManualScale(1);
    setPdfPageOriginalWidth(null);
    setPdfPageOriginalHeight(null);
    setIsFullscreen(false);
  };

  const closePreview = (open: boolean) => {
    setPreviewOpen(open);

    if (!open) {
      resetPreviewState();
    }
  };

  const handlePreview = async () => {
    const record_debug = serializeAttachmentDebugRecord(attachment);

    logAttachmentPreview("info", "Preview requested", {
      record: record_debug,
      frontend_storage_fields_used: ["bucket_name", "file_path"],
      using_legacy_url: false,
      pdfjs_version: pdfjs.version,
      worker_src: PDF_WORKER_SRC,
    });

    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    revokeObjectUrl(previewAssetUrl);
    setPreviewAssetUrl(null);
    setPreviewBlob(null);
    setPreviewSourceUrl(null);
    setPreviewAccessStrategy(null);
    setPageCount(0);
    setCurrentPage(1);

    try {
      const { blob, access_url, access_strategy } = await fetchAttachmentBlob(attachment);
      const normalized_blob = normalizePreviewBlob(blob, attachment.nome_arquivo);
      const detected_kind = getPreviewKind(normalized_blob.type, attachment.nome_arquivo);
      const next_preview_asset_url = detected_kind === "unsupported" ? null : URL.createObjectURL(normalized_blob);

      setPreviewKind(detected_kind);
      setPreviewBlob(normalized_blob);
      setPreviewSourceUrl(access_url);
      setPreviewAccessStrategy(access_strategy);

      if (next_preview_asset_url) {
        setPreviewAssetUrl(next_preview_asset_url);
      }

      logAttachmentPreview("info", "Preview asset prepared", {
        record: record_debug,
        frontend_storage_fields_used: ["bucket_name", "file_path"],
        using_legacy_url: false,
        source_access_url: access_url,
        access_strategy,
        preview_asset_url: next_preview_asset_url,
        detected_kind,
        mime_type: normalized_blob.type || null,
        size: normalized_blob.size,
      });
    } catch (error) {
      logAttachmentPreview("error", "Preview request failed", {
        record: record_debug,
        frontend_storage_fields_used: ["bucket_name", "file_path"],
        using_legacy_url: false,
        source_access_url: previewSourceUrl,
        error: error instanceof Error ? error.message : error,
        pdfjs_version: pdfjs.version,
        worker_src: PDF_WORKER_SRC,
      });
      setPreviewError("Não foi possível visualizar o arquivo. Tente baixar.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloadLoading(true);

    try {
      await downloadAttachmentFile(attachment);
    } catch (error) {
      const record_debug = serializeAttachmentDebugRecord(attachment);

      logAttachmentPreview("error", "Attachment download failed", {
        record: record_debug,
        frontend_storage_fields_used: ["bucket_name", "file_path"],
        using_legacy_url: false,
        error: error instanceof Error ? error.message : error,
      });

      toast({
        title: "Falha ao baixar anexo",
        description: "O navegador bloqueou a visualização do arquivo. Tente baixar ou desative extensões de bloqueio.",
        variant: "destructive",
      });
    } finally {
      setDownloadLoading(false);
    }
  };

  const previewBody = (containerClass?: string) => (
    <div className={containerClass || "flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 sm:px-6"}>
      {previewLoading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando anexo...
        </div>
      ) : previewError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">{previewError}</p>
        </div>
      ) : previewKind === "image" && previewAssetUrl ? (
        <div className="flex flex-1 items-center justify-center overflow-auto rounded-md border bg-muted/20 p-3">
          <img src={previewAssetUrl} alt={attachment.nome_arquivo} className="max-h-full w-auto max-w-full rounded-md object-contain" loading="lazy" />
        </div>
      ) : previewKind === "unsupported" || !previewBlob ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">Não foi possível visualizar o arquivo. Tente baixar.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {/* ── Zoom toolbar ── */}
          <div className="flex flex-wrap items-center justify-center gap-1 rounded-md border bg-card px-2 py-1.5 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomOut} title="Diminuir zoom" type="button">
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-[3.5rem] select-none text-center text-xs font-medium tabular-nums text-muted-foreground">
              {displayZoomPercent}%
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomIn} title="Aumentar zoom" type="button">
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <div className="mx-1 h-4 w-px bg-border" />
            <Button
              variant={zoomMode === "fit-width" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={zoomFitWidth}
              title="Ajustar à largura"
              type="button"
            >
              Largura
            </Button>
            <Button
              variant={zoomMode === "fit-page" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={zoomFitPage}
              title="Ajustar à página"
              type="button"
            >
              Página
            </Button>
            <div className="mx-1 h-4 w-px bg-border" />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomReset} title="Resetar zoom" type="button">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <div className="mx-1 h-4 w-px bg-border" />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleFullscreen} title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"} type="button">
              {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
            </Button>
          </div>

          <div ref={previewContainerRef} className="flex min-h-0 flex-1 items-start justify-center overflow-auto rounded-md border bg-muted/20 p-2 sm:p-4">
            <Document
              file={previewAssetUrl || previewBlob}
              loading={
                <div className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Renderizando PDF...
                </div>
              }
              noData={<p className="text-sm text-muted-foreground">Arquivo indisponível.</p>}
              onSourceError={(error: Error) => {
                logAttachmentPreview("error", "PDF source load failed", {
                  record: serializeAttachmentDebugRecord(attachment),
                  frontend_storage_fields_used: ["bucket_name", "file_path"],
                  using_legacy_url: false,
                  source_access_url: previewSourceUrl,
                  access_strategy: previewAccessStrategy,
                  preview_asset_url: previewAssetUrl,
                  error: error.message,
                  pdfjs_version: pdfjs.version,
                  worker_src: PDF_WORKER_SRC,
                });
                setPreviewError("Não foi possível visualizar o arquivo. Tente baixar.");
              }}
              onLoadSuccess={({ numPages }: { numPages: number }) => {
                logAttachmentPreview("info", "PDF loaded successfully", {
                  record: serializeAttachmentDebugRecord(attachment),
                  frontend_storage_fields_used: ["bucket_name", "file_path"],
                  using_legacy_url: false,
                  source_access_url: previewSourceUrl,
                  access_strategy: previewAccessStrategy,
                  preview_asset_url: previewAssetUrl,
                  mime_type: previewBlob?.type || null,
                  pages: numPages,
                  pdfjs_version: pdfjs.version,
                  worker_src: PDF_WORKER_SRC,
                });
                setPageCount(numPages);
                setCurrentPage((page) => Math.min(page, numPages) || 1);
              }}
              onLoadError={(error: Error) => {
                logAttachmentPreview("error", "PDF render failed", {
                  record: serializeAttachmentDebugRecord(attachment),
                  frontend_storage_fields_used: ["bucket_name", "file_path"],
                  using_legacy_url: false,
                  source_access_url: previewSourceUrl,
                  access_strategy: previewAccessStrategy,
                  preview_asset_url: previewAssetUrl,
                  mime_type: previewBlob?.type || null,
                  error: error.message,
                  pdfjs_version: pdfjs.version,
                  worker_src: PDF_WORKER_SRC,
                });
                setPreviewError("Não foi possível visualizar o arquivo. Tente baixar.");
              }}
              error={<p className="text-sm text-muted-foreground">Não foi possível visualizar o arquivo. Tente baixar.</p>}
            >
              <Page
                pageNumber={currentPage}
                width={computedPageWidth}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                onLoadSuccess={(page) => {
                  if (!pdfPageOriginalWidth) {
                    setPdfPageOriginalWidth(page.originalWidth);
                    setPdfPageOriginalHeight(page.originalHeight);
                  }
                }}
                loading={
                  <div className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando página...
                  </div>
                }
              />
            </Document>
          </div>

          {pageCount > 0 ? (
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
              </Button>
              <p className="text-xs text-muted-foreground">
                Página {currentPage} de {pageCount}
              </p>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                disabled={currentPage >= pageCount}
              >
                Próxima <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );

  const downloadButton = canDownload ? (
    <Button variant="outline" size="sm" onClick={handleDownload} disabled={downloadLoading}>
      {downloadLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
      Baixar
    </Button>
  ) : null;

  // ── Fullscreen overlay ──
  if (previewOpen && isFullscreen) {
    return (
      <>
        {/* Row */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">{attachment.nome_arquivo}</span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button variant="outline" size="sm" type="button" onClick={handlePreview} disabled={previewLoading}>
              {previewLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
              Visualizar
            </Button>
            {canDownload && (
              <Button variant="ghost" size="sm" type="button" onClick={handleDownload} disabled={downloadLoading}>
                {downloadLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                Baixar
              </Button>
            )}
            {onDelete ? (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete} type="button">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </div>

        {/* Fullscreen overlay */}
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          {/* Header bar */}
          <div className="flex items-center justify-between border-b bg-card px-4 py-2 sm:px-6">
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{attachment.nome_arquivo}</h2>
            <div className="flex items-center gap-1.5 ml-3">
              {downloadButton}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => closePreview(false)} title="Fechar" type="button">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Body */}
          {previewBody("flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-6")}

          {/* Page navigation */}
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 border-t bg-card px-4 py-2">
              <Button variant="outline" size="sm" type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
              </Button>
              <p className="text-xs text-muted-foreground">Página {currentPage} de {pageCount}</p>
              <Button variant="outline" size="sm" type="button" onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))} disabled={currentPage >= pageCount}>
                Próxima <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium">{attachment.nome_arquivo}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" type="button" onClick={handlePreview} disabled={previewLoading}>
            {previewLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
            Visualizar
          </Button>
          {canDownload && (
            <Button variant="ghost" size="sm" type="button" onClick={handleDownload} disabled={downloadLoading}>
              {downloadLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
              Baixar
            </Button>
          )}
          {onDelete ? (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete} type="button">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      {isMobile ? (
        <Drawer open={previewOpen} onOpenChange={closePreview}>
          <DrawerContent className="max-h-[98vh] h-[96vh]">
            <DrawerHeader className="text-left">
              <DrawerTitle className="truncate">{attachment.nome_arquivo}</DrawerTitle>
              <DrawerDescription className="sr-only">
                Visualização interna do anexo da ordem de serviço com opção de download seguro.
              </DrawerDescription>
            </DrawerHeader>
            {previewBody()}
            <DrawerFooter>{downloadButton}</DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={previewOpen} onOpenChange={closePreview}>
          <DialogContent className="flex h-[92vh] w-[92vw] max-w-[92vw] flex-col p-0">
            <DialogHeader className="px-6 pt-5 pb-2">
              <DialogTitle className="truncate pr-8">{attachment.nome_arquivo}</DialogTitle>
              <DialogDescription className="sr-only">
                Visualização interna do anexo da ordem de serviço com opção de download seguro.
              </DialogDescription>
            </DialogHeader>
            {previewBody()}
            <DialogFooter className="border-t px-6 py-3 sm:justify-end">{downloadButton}</DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
