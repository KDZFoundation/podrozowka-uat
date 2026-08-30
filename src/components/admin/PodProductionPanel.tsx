import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Factory, FileCheck2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  approvePodProductionProof,
  checkPodProductionReadiness,
  createPodProductionAndArtifacts,
  createPodProductionProof,
  createPodProductionRelease,
  listPodProductionCandidates,
  transitionPodProductionRelease,
  type PodProductionCandidate,
} from "@/lib/podProductionOperations";
import { auth } from "@/integrations/firebase/config";
import { backendApiUrl } from "@/lib/backendApi";

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export const PodProductionPanel = () => {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<PodProductionCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [batch, setBatch] = useState<Awaited<ReturnType<typeof createPodProductionAndArtifacts>>["batch"] | null>(null);
  const [proofs, setProofs] = useState<Array<{ id: string; format: string; approvalId?: string }>>([]);
  const [proofComment, setProofComment] = useState("");
  const [physicalConfirmation, setPhysicalConfirmation] = useState(false);
  const [release, setRelease] = useState<{ id: string; status: string } | null>(null);
  const [readiness, setReadiness] = useState<Awaited<ReturnType<typeof checkPodProductionReadiness>> | null>(null);

  const refresh = useCallback(async () => {
    setBusy("candidates");
    try { setCandidates(await listPodProductionCandidates()); }
    catch (error) { toast({ title: "Nie można pobrać kolejki POD", description: message(error), variant: "destructive" }); }
    finally { setBusy(null); }
  }, [toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const createBatch = async () => {
    const selections = candidates.filter((candidate) => selected.has(candidate.asset_set_id));
    if (!selections.length) return;
    setBusy("batch");
    try {
      const result = await createPodProductionAndArtifacts(selections);
      setBatch(result.batch);
      setProofs([]);
      setRelease(null);
      setReadiness(null);
      toast({ title: "Batch i kanoniczne artefakty są gotowe", description: `${result.batch.header.item_count} pozycji / ${result.artifacts.length} grup.` });
    } catch (error) { toast({ title: "Batch POD został zablokowany", description: message(error), variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const prepareProofs = async () => {
    if (!batch) return;
    setBusy("proof");
    try {
      const created = [];
      const formatIds = [...new Set(batch.manifest.groups.map((group) => group.print_format_id))].sort();
      for (const formatId of formatIds) {
        const result = await createPodProductionProof(formatId);
        created.push({ id: result.artifact.id, format: formatId });
      }
      setProofs(created);
      toast({ title: "Próby są gotowe do pobrania", description: "PASS nie został ustawiony. Wydrukuj i sprawdź każdą próbę fizycznie." });
    } catch (error) { toast({ title: "Nie można przygotować próby", description: message(error), variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const downloadProof = async (artifactId: string) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    const response = await fetch(`${backendApiUrl("/api/pod/production-proof")}?${new URLSearchParams({ artifact_id: artifactId })}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("pod_proof_download_failed");
    const url = URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${artifactId}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const approveProofs = async () => {
    if (!physicalConfirmation || !proofComment.trim()) return;
    setBusy("approve");
    try {
      const approved = [];
      for (const proof of proofs) {
        const result = await approvePodProductionProof(proof.id, proofComment.trim(), `physical-proof:${proof.id}`);
        approved.push({ ...proof, approvalId: result.approval_event.id });
      }
      setProofs(approved);
      toast({ title: "Zapisano ręczne zatwierdzenie prób", description: "Zdarzenia audytowe są append-only." });
    } catch (error) { toast({ title: "Nie zapisano zatwierdzenia", description: message(error), variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const createRelease = async () => {
    if (!batch || proofs.some((proof) => !proof.approvalId)) return;
    setBusy("release");
    try {
      const result = await createPodProductionRelease(batch.header.id, proofs.map((proof) => proof.id), proofs.map((proof) => proof.approvalId!), `create-release:${batch.header.id}`);
      setRelease(result.release);
      toast({ title: "Utworzono release DRAFT" });
    } catch (error) { toast({ title: "Nie utworzono release", description: message(error), variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const checkReadiness = async () => {
    if (!batch || !release) return;
    setBusy("readiness");
    try { setReadiness(await checkPodProductionReadiness(batch.header.id, release.id)); }
    catch (error) { toast({ title: "Kontrola readiness nie powiodła się", description: message(error), variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const transition = async (event: "MARKED_READY" | "RELEASED_TO_PRINTER" | "CANCELLED") => {
    if (!release) return;
    setBusy(event);
    try {
      const result = await transitionPodProductionRelease(release.id, event, `${event}:${release.id}`);
      setRelease(result.release);
      await checkReadiness();
    } catch (error) { toast({ title: "Zmiana stanu została zablokowana", description: message(error), variant: "destructive" }); }
    finally { setBusy(null); }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-900/15 bg-[linear-gradient(135deg,hsl(var(--card)),hsl(var(--muted)/0.45))] shadow-soft">
      <div className="border-b border-border bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.13),transparent_46%)] p-5">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary"><Factory className="h-4 w-4" /> Produkcja POD</p>
        <h3 className="mt-2 font-display text-2xl font-bold">Deterministyczny release drukarski</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Batch, artefakty, próba, approval i release są wykonywane wyłącznie przez chronione endpointy backendu.</p>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">1. Kwalifikujące manifesty</h4>
            <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={Boolean(busy)}><RefreshCw className="mr-2 h-4 w-4" /> Odśwież</Button>
          </div>
          <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-border bg-background/70 p-2">
            {busy === "candidates" && <Loader2 className="m-4 h-5 w-5 animate-spin" />}
            {!busy && candidates.length === 0 && <p className="p-3 text-sm text-muted-foreground">Brak par FROZEN manifest + asset set.</p>}
            {candidates.map((candidate) => (
              <label key={candidate.asset_set_id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-transparent p-3 hover:border-primary/20 hover:bg-primary/[0.04]">
                <input type="checkbox" className="mt-1" checked={selected.has(candidate.asset_set_id)} onChange={(event) => setSelected((current) => {
                  const next = new Set(current); if (event.target.checked) next.add(candidate.asset_set_id); else next.delete(candidate.asset_set_id); return next;
                })} />
                <span className="min-w-0 text-xs"><strong className="block truncate font-mono">{candidate.print_manifest_id}</strong><span className="block truncate text-muted-foreground">{candidate.asset_set_id} · {candidate.item_count} pozycji</span></span>
              </label>
            ))}
          </div>
          <Button onClick={() => void createBatch()} disabled={Boolean(busy) || selected.size === 0} className="w-full">
            {busy === "batch" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />} Zamroź batch i przygotuj artefakty
          </Button>

          {batch && <div className="rounded-xl border border-emerald-700/20 bg-emerald-500/[0.06] p-4 text-sm"><strong className="font-mono">{batch.header.id}</strong><p className="mt-1 text-muted-foreground">{batch.header.item_count} pozycji · SHA-256 {batch.header.batch_sha256.slice(0, 16)}…</p></div>}
        </div>

        <div className="space-y-4">
          <h4 className="font-semibold">2. Próba fizyczna i release</h4>
          <Button variant="outline" onClick={() => void prepareProofs()} disabled={!batch || Boolean(busy)} className="w-full">Przygotuj numerowane próby formatów</Button>
          {proofs.map((proof) => <div key={proof.id} className="flex items-center justify-between rounded-lg border p-3 text-xs"><span><strong>{proof.format}</strong><br /><span className="font-mono text-muted-foreground">{proof.id.slice(0, 24)}…</span></span><Button size="sm" variant="ghost" onClick={() => void downloadProof(proof.id)}><Download className="h-4 w-4" /></Button></div>)}
          {proofs.length > 0 && <div className="space-y-3 rounded-xl border border-amber-600/25 bg-amber-500/[0.06] p-4">
            <p className="flex gap-2 text-sm"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" /> Approval jest ręczny. Sprawdź kolejność arkuszy, face-up, short-edge duplex, cięcie row-major i merge stosów.</p>
            <Input value={proofComment} onChange={(event) => setProofComment(event.target.value)} maxLength={2000} placeholder="Komentarz z fizycznej próby" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={physicalConfirmation} onChange={(event) => setPhysicalConfirmation(event.target.checked)} /> Potwierdzam wykonanie i zaliczenie fizycznej próby</label>
            <Button onClick={() => void approveProofs()} disabled={!physicalConfirmation || !proofComment.trim() || Boolean(busy)} className="w-full">Zapisz manualny approval</Button>
          </div>}
          <Button onClick={() => void createRelease()} disabled={!batch || !proofs.length || proofs.some((proof) => !proof.approvalId) || Boolean(busy)} className="w-full">Utwórz release DRAFT</Button>
          {release && <div className="rounded-xl border p-4 text-sm"><p className="font-mono">{release.id}</p><p className="mt-1 font-bold">{release.status}</p></div>}
          <Button variant="outline" onClick={() => void checkReadiness()} disabled={!release || Boolean(busy)} className="w-full"><ShieldCheck className="mr-2 h-4 w-4" /> Sprawdź readiness</Button>
          {readiness && <div className={`rounded-xl border p-4 text-sm ${readiness.status === "READY_FOR_RELEASE" ? "border-emerald-600/30 bg-emerald-500/[0.06]" : "border-destructive/30 bg-destructive/[0.05]"}`}>
            <p className="flex items-center gap-2 font-bold">{readiness.status === "READY_FOR_RELEASE" ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}{readiness.status}</p>
            <div className="mt-3 max-h-44 space-y-1 overflow-auto font-mono text-xs">{readiness.checks.map((check) => <p key={check.code} className={check.ok ? "text-emerald-700" : "text-destructive"}>{check.ok ? "OK" : "BLOCK"} · {check.code} · {check.detail}</p>)}</div>
            {readiness.warnings.map((warning) => <p key={warning} className="mt-2 text-xs text-amber-700">WARNING · {warning}</p>)}
          </div>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => void transition("MARKED_READY")} disabled={!release || release.status !== "DRAFT" || readiness?.status !== "READY_FOR_RELEASE" || Boolean(busy)}>Oznacz READY</Button>
            <Button onClick={() => void transition("RELEASED_TO_PRINTER")} disabled={!release || release.status !== "READY" || readiness?.status !== "READY_FOR_RELEASE" || Boolean(busy)}>Zarejestruj release</Button>
          </div>
          <Button variant="destructive" onClick={() => void transition("CANCELLED")} disabled={!release || !["DRAFT", "READY"].includes(release.status) || Boolean(busy)} className="w-full">Anuluj release</Button>
          <p className="text-xs text-muted-foreground">Rejestracja release nie wysyła plików ani zlecenia do drukarni.</p>
        </div>
      </div>
    </section>
  );
};
