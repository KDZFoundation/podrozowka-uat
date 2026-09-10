import { useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Download, Loader2 } from "lucide-react";
import { db } from "@/integrations/firebase/config";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export const PodOrderPrintButton = ({ orderId, orderNumber, disabled = false }: {
  orderId: string;
  orderNumber: string;
  disabled?: boolean;
}) => {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const download = async () => {
    setBusy(true);
    try {
      const snapshot = await getDocs(query(collection(db, "qr_print_jobs"), where("order_id", "==", orderId)));
      const jobs = snapshot.docs.filter((job) => ["ready", "printed"].includes(String(job.data().status)));
      if (jobs.length === 0) throw new Error("Zamówienie nie ma jeszcze gotowego zadania POD z kodami QR. Spróbuj ponownie po zakończeniu przygotowania.");
      if (jobs.length > 1) throw new Error("Zamówienie ma więcej niż jedno gotowe zadanie POD. Przed drukiem trzeba wskazać właściwe zadanie.");
      const { generatePodPrintPdf } = await import("@/lib/generatePodPrintPdf");
      const result = await generatePodPrintPdf(jobs[0].id, orderNumber);
      console.info("pod_order_pdf_download_ready", { fileName: result.fileName, itemCount: result.itemCount });
      // Keep the URL alive long enough for the browser to start its download.
      window.setTimeout(() => URL.revokeObjectURL(result.downloadUrl), 60_000);
      toast({ title: "Pobrano PDF dla drukarni", description: `${result.itemCount} kartek · ${result.sheetCount} arkuszy SRA3. Plik możesz przekazać drukarni.` });
    } catch (error) {
      console.error("pod_order_pdf_download_failed", error);
      toast({ title: "Nie udało się pobrać PDF", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return <Button disabled={disabled || busy} onClick={(event) => { event.stopPropagation(); void download(); }} className="gap-2">
    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
    {busy ? "Przygotowuję PDF…" : "Pobierz PDF dla drukarni"}
  </Button>;
};
