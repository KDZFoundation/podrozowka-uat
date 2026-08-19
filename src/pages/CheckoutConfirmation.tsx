import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, CheckCircle2, AlertCircle, Clock, FileText, Download } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import OrderSteps from "@/components/checkout/OrderSteps";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/contexts/CartContext";
import { useCheckout } from "@/contexts/CheckoutContext";
import { supabase, supabaseUrl } from "@/integrations/supabase/client";

const formatPln = (v: number) =>
  v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";

type Status = "loading" | "paid" | "pending" | "not_found" | "cod_placed";

interface OrderInfo {
  id: string;
  order_number: string;
  total_amount: number;
  fiscal_document_status: string | null;
  fiscal_document_number: string | null;
}

const CheckoutConfirmation = () => {
  const { user, isLoading: authLoading } = useAuth();
  const [params] = useSearchParams();
  const orderNumber = params.get("order");
  const isCod = params.get("cod") === "1";
  const { clear: clearCart } = useCart();
  const { clearPickupPoint } = useCheckout();

  const [status, setStatus] = useState<Status>("loading");
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const clearedRef = useRef(false);

  useEffect(() => {
    document.title = "Potwierdzenie płatności – Podróżówka";
  }, []);

  useEffect(() => {
    if (!user || !orderNumber) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 20; // ~60s — covers payment + fiscalization

    // COD path: order is placed but unpaid until admin confirms cash collection.
    if (isCod) {
      (async () => {
        let data: { id: string; order_number: string; total_amount: number } | null = null;

        try {
          const { data: sbData } = await supabase
            .from("orders")
            .select("id, order_number, total_amount")
            .eq("order_number", orderNumber)
            .maybeSingle();
          if (sbData) {
            data = {
              id: sbData.id,
              order_number: sbData.order_number,
              total_amount: Number(sbData.total_amount),
            };
          }
        } catch (_) {
          // ignore
        }

        if (!data) {
          try {
            const { firestoreService } = await import("@/integrations/firebase/services/firestoreService");
            const fsOrder = await firestoreService.getOrderByNumber(orderNumber);
            if (fsOrder) {
              data = {
                id: fsOrder.id,
                order_number: fsOrder.order_number,
                total_amount: Number(fsOrder.total_amount_pln),
              };
            }
          } catch (_) {
            // ignore
          }
        }

        if (cancelled) return;
        if (!data) {
          setStatus("not_found");
          return;
        }

        setOrder({
          id: data.id,
          order_number: data.order_number,
          total_amount: Number(data.total_amount),
          fiscal_document_status: null,
          fiscal_document_number: null,
        });
        setStatus("cod_placed");
        if (!clearedRef.current) {
          clearedRef.current = true;
          clearCart();
          clearPickupPoint();
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    const poll = async () => {
      attempts += 1;
      let orderFound: {
        id: string;
        order_number: string;
        total_amount: number;
        payment_status: string;
      } | null = null;

      try {
        const { data: sbData } = await supabase
          .from("orders")
          .select("id, order_number, total_amount, payment_status")
          .eq("order_number", orderNumber)
          .maybeSingle();
        if (sbData) {
          orderFound = {
            id: sbData.id,
            order_number: sbData.order_number,
            total_amount: Number(sbData.total_amount),
            payment_status: sbData.payment_status || "pending",
          };
        }
      } catch (_) {
        // ignore
      }

      if (!orderFound) {
        try {
          const { firestoreService } = await import("@/integrations/firebase/services/firestoreService");
          const fsOrder = await firestoreService.getOrderByNumber(orderNumber);
          if (fsOrder) {
            orderFound = {
              id: fsOrder.id,
              order_number: fsOrder.order_number,
              total_amount: Number(fsOrder.total_amount_pln),
              payment_status: fsOrder.payment_status || "pending",
            };
          }
        } catch (_) {
          // ignore
        }
      }

      if (cancelled) return;

      if (!orderFound) {
        if (attempts >= maxAttempts) {
          setStatus("not_found");
          return;
        }
        setTimeout(poll, 3000);
        return;
      }

      setOrder({
        id: orderFound.id,
        order_number: orderFound.order_number,
        total_amount: Number(orderFound.total_amount),
        fiscal_document_status: null,
        fiscal_document_number: null,
      });

      if (orderFound.payment_status === "paid") {
        setStatus("paid");
        if (!clearedRef.current) {
          clearedRef.current = true;
          clearCart();
          clearPickupPoint();
        }
        return;
      }
      if (attempts >= maxAttempts) {
        setStatus("pending");
        return;
      }
      setTimeout(poll, 3000);
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [user, orderNumber, clearCart, clearPickupPoint, isCod]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) {
    const back = `/checkout/potwierdzenie${orderNumber ? `?order=${encodeURIComponent(orderNumber)}` : ""}`;
    return <Navigate to={`/logowanie?redirect=${encodeURIComponent(back)}`} replace />;
  }
  if (!orderNumber) return <Navigate to="/sklep" replace />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Helmet>
        <title>Potwierdzenie płatności – Podróżówka</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Header />
      <main id="main-content" className="container mx-auto flex-1 px-4 pb-12 pt-24 md:pt-28">
        <div className="mx-auto max-w-xl">
          <OrderSteps current={3} />
          <div className="rounded-2xl bg-card p-8 text-center shadow-card">
          {status === "loading" && (
            <>
              <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
              <h1 className="font-display text-2xl font-bold mb-2">Sprawdzamy status płatności…</h1>
              <p className="text-muted-foreground text-sm">
                To potrwa chwilę — nie zamykaj tej strony.
              </p>
            </>
          )}

          {status === "paid" && (
            <>
              <CheckCircle2 className="w-14 h-14 text-primary mx-auto mb-4" />
              <h1 className="font-display text-2xl font-bold mb-2">Płatność potwierdzona</h1>
              {order && (
                <p className="text-muted-foreground text-sm mb-1">
                  Zamówienie <span className="font-mono text-foreground">{order.order_number}</span>
                </p>
              )}
              {order && (
                <p className="text-lg font-semibold mb-6">{formatPln(order.total_amount)}</p>
              )}
              <p className="text-sm text-muted-foreground mb-6">
                Dziękujemy! Twoje Podróżówki trafiły do przygotowania do druku. Po realizacji wyślemy je wybraną metodą dostawy.
              </p>

              {order && (
                <div className="border border-border rounded-xl p-4 mb-6 text-left">
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      {order.fiscal_document_status === "issued" ? (
                        <>
                          <p className="text-sm font-medium text-foreground">Dokument sprzedaży wystawiony</p>
                          {order.fiscal_document_number && (
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">
                              {order.fiscal_document_number}
                            </p>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-3"
                            onClick={async () => {
                              try {
                                const { data: { session } } = await supabase.auth.getSession();
                                if (!session) {
                                  toast.error("Zaloguj się ponownie, aby pobrać dokument.");
                                  return;
                                }
                                const url = `${supabaseUrl}/functions/v1/fiscal-document-pdf?order=${encodeURIComponent(order.order_number)}`;
                                const res = await fetch(url, {
                                  headers: { Authorization: `Bearer ${session.access_token}` },
                                });
                                if (!res.ok) {
                                  toast.error("Nie udało się pobrać dokumentu.");
                                  return;
                                }
                                const blob = await res.blob();
                                const objectUrl = URL.createObjectURL(blob);
                                window.open(objectUrl, "_blank", "noopener");
                                setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
                              } catch (e) {
                                const errMsg = e instanceof Error ? e.message : String(e);
                                toast.error("Nie udało się pobrać dokumentu.", { description: errMsg });
                              }
                            }}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Pobierz fakturę / paragon
                          </Button>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-foreground">Dokument sprzedaży w drodze</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Wyślemy go na Twój e-mail w ciągu 24 godzin.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild variant="outline">
                  <Link to="/sklep">Wróć do sklepu</Link>
                </Button>
                <Button asChild>
                  <Link to="/dashboard">Mój panel</Link>
                </Button>
              </div>
            </>
          )}

          {status === "cod_placed" && (
            <>
              <CheckCircle2 className="w-14 h-14 text-primary mx-auto mb-4" />
              <h1 className="font-display text-2xl font-bold mb-2">Zamówienie złożone</h1>
              {order && (
                <p className="text-muted-foreground text-sm mb-1">
                  Zamówienie <span className="font-mono text-foreground">{order.order_number}</span>
                </p>
              )}
              {order && (
                <p className="text-lg font-semibold mb-6">{formatPln(order.total_amount)}</p>
              )}
              <p className="text-sm text-muted-foreground mb-6">
                Zapłacisz przy odbiorze w paczkomacie. Wyślemy paczkę zaraz po przygotowaniu — dokument sprzedaży dołączymy po potwierdzeniu pobrania.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild variant="outline">
                  <Link to="/sklep">Wróć do sklepu</Link>
                </Button>
                <Button asChild>
                  <Link to="/dashboard">Mój panel</Link>
                </Button>
              </div>
            </>
          )}


          {status === "pending" && (
            <>
              <Clock className="w-14 h-14 text-muted-foreground mx-auto mb-4" />
              <h1 className="font-display text-2xl font-bold mb-2">Wciąż przetwarzamy płatność</h1>
              <p className="text-muted-foreground text-sm mb-6">
                Jeśli płatność się powiodła, status zaktualizuje się w ciągu kilku minut.
                Odśwież stronę lub sprawdź później w swoim panelu. Jeśli anulowałeś płatność,
                wróć do koszyka i spróbuj ponownie.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild variant="outline">
                  <Link to="/koszyk">Wróć do koszyka</Link>
                </Button>
                <Button asChild>
                  <Link to="/dashboard">Mój panel</Link>
                </Button>
              </div>
            </>
          )}

          {status === "not_found" && (
            <>
              <AlertCircle className="w-14 h-14 text-destructive mx-auto mb-4" />
              <h1 className="font-display text-2xl font-bold mb-2">Nie znaleźliśmy zamówienia</h1>
              <p className="text-muted-foreground text-sm mb-6">
                Zamówienie o numerze <span className="font-mono">{orderNumber}</span> nie istnieje
                lub nie jest przypisane do Twojego konta.
              </p>
              <Button asChild>
                <Link to="/sklep">Wróć do sklepu</Link>
              </Button>
            </>
          )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CheckoutConfirmation;
