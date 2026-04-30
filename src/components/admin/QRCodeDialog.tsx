import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Printer, QrCode } from "lucide-react";

interface QRCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inviteCode: string;
  organizationName: string;
}

export function QRCodeDialog({
  open,
  onOpenChange,
  inviteCode,
  organizationName,
}: QRCodeDialogProps) {
  const [dataUrl, setDataUrl] = useState<string>("");

  const joinUrl = `${window.location.origin}/join-organization?code=${encodeURIComponent(
    inviteCode,
  )}`;

  useEffect(() => {
    if (!open) return;
    setDataUrl("");

    QRCode.toDataURL(joinUrl, {
      width: 1024,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#0B1F3A", light: "#FFFFFF" },
    })
      .then(setDataUrl)
      .catch((err) => console.error("QR generation failed", err));
  }, [open, joinUrl]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `pulse-invite-${inviteCode}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    if (!dataUrl) return;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    w.document.write(`
      <html>
        <head>
          <title>Pulse Invite — ${organizationName}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              margin: 0;
              padding: 48px;
              text-align: center;
              color: #0B1F3A;
            }
            h1 { font-size: 32px; margin: 0 0 8px; }
            h2 { font-size: 18px; font-weight: 500; color: #475569; margin: 0 0 32px; }
            img { width: 480px; height: 480px; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; background: #fff; }
            .code { font-family: 'Courier New', monospace; font-size: 28px; letter-spacing: 4px; margin: 24px 0 8px; font-weight: 700; }
            .tagline { font-size: 14px; color: #64748b; margin-top: 24px; }
            .brand { margin-top: 48px; font-size: 12px; color: #94a3b8; }
          </style>
        </head>
        <body>
          <h1>Join ${organizationName}</h1>
          <h2>Scan to join Pulse</h2>
          <img src="${dataUrl}" alt="QR Code" />
          <div class="code">${inviteCode}</div>
          <div class="tagline">Open your camera, scan the code, and tap the link.</div>
          <div class="brand">Designed by Frank Bazuaye · Powered by LiveGig Ltd</div>
        </body>
      </html>
    `);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-primary" />
            Invite QR Code
          </DialogTitle>
          <DialogDescription>
            Print on flyers, posters, or rally banners. Scanning opens Pulse with the
            code pre-filled.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm w-72 h-72 flex items-center justify-center">
            {dataUrl ? (
              <img src={dataUrl} alt="Invite QR code" className="w-64 h-64" />
            ) : (
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="text-center">
            <div className="text-sm text-muted-foreground">{organizationName}</div>
            <div className="font-mono tracking-widest text-lg font-bold mt-1">
              {inviteCode}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleDownload} className="flex-1 gap-2" disabled={!dataUrl}>
            <Download className="w-4 h-4" />
            Download PNG
          </Button>
          <Button
            onClick={handlePrint}
            variant="outline"
            className="flex-1 gap-2"
            disabled={!dataUrl}
          >
            <Printer className="w-4 h-4" />
            Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
