import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { MapPin, ArrowLeft, Loader2, Package, AlertCircle, FileText } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/contexts/CartContext";
import { useCheckout } from "@/contexts/CheckoutContext";
import { useCartItems } from "@/hooks/useCartItems";
import {
  getShippingCostGrosze,
  type PaymentMethod,
  type ShippingMethod,
  type CourierAddress,
  emptyCourierAddress,
  isCourierAddressValid,
} from "@/lib/constants";
import InpostGeowidget from "@/components/checkout/InpostGeowidget";
import PaymentMethodPicker from "@/components/checkout/PaymentMethodPicker";
import ShippingMethodPicker from "@/components/checkout/ShippingMethodPicker";
import CourierAddressForm from "@/components/checkout/CourierAddressForm";
import OrderSteps from "@/components/checkout/OrderSteps";
import { isValidNip, normalizeNip } from "@/lib/nip";

const formatPln = (grosze: number) =>
  (grosze / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";

const Checkout = () => {
  const { user, isLoading: authLoading } = useAuth();
  const { items: cartItems } = useCart();
  const { pickupPoint, setPickupPoint } = useCheckout();
  const { items, subtotalGrosze, isLoading } = useCartItems();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSelectPickupPoint = useCallback(
    (p: PickupPoint) => {
      setPickupPoint(p);
      setDialogOpen(false);
      toast.success("Wybrano paczkomat", { description: p.name });
    },
    [setPickupPoint, setDialogOpen],
  );

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("online");
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>("inpost");
  const [courierAddress, setCourierAddress] = useState<CourierAddress>(emptyCourierAddress);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invoiceRequested, setInvoiceRequested] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyNip, setCompanyNip] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [invoiceTouched, setInvoiceTouched] = useState({ name: false, nip: false, addr: false });

  const invoiceErrors = useMemo(() => {
    const e: { name?: string; nip?: string; addr?: string } = {};
    if (invoiceRequested) {
      if (companyName.trim().length === 0) e.name = "Podaj nazwę firmy.";
      else if (companyName.length > 200) e.name = "Maksymalnie 200 znaków.";
      const nipClean = normalizeNip(companyNip);
      if (nipClean.length === 0) e.nip = "Podaj NIP.";
      else if (!isValidNip(nipClean)) e.nip = "Nieprawidłowy NIP.";
      if (companyAddress.trim().length === 0) e.addr = "Podaj adres firmy.";
      else if (companyAddress.length > 500) e.addr = "Maksymalnie 500 znaków.";
    }
    return e;
  }, [invoiceRequested, companyName, companyNip, companyAddress]);

  useEffect(() => {
    document.title = "Zamówienie – Podróżówka";
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/logowanie?redirect=/checkout" replace />;
  if (cartItems.length === 0) return <Navigate to="/koszyk" replace />;

  const hasUnavailable = items.some((i) => i.unavailable);
  const totalItemCount = items.reduce((s, i) => s + (i.unavailable ? 0 : i.quantity), 0);
  const isBelowMin = totalItemCount < 10;

  const shippingCostGrosze = getShippingCostGrosze(paymentMethod);
  const totalGrosze = subtotalGrosze + shippingCostGrosze;

  const invoiceValid = !invoiceRequested || Object.keys(invoiceErrors).length === 0;
  const shippingValid =
    shippingMethod === "inpost" ? !!pickupPoint : isCourierAddressValid(courierAddress);
  const canProceed = shippingValid && !hasUnavailable && !isLoading && invoiceValid && !isBelowMin;

  const handleProceed = async () => {
    if (!shippingValid || isBelowMin) {
      if (isBelowMin) toast.error("Minimalne zamówienie to 10 podróżówek.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        items: items
          .filter((i) => !i.unavailable)
          .map((i) => ({
            card_design_id: i.card_design_id,
            quantity: i.quantity,
            ...(i.secondary_language ? { secondary_language_code: i.secondary_language.code } : {}),
          })),
        shipping_method: shippingMethod,
        pickup_point:
          shippingMethod === "inpost" && pickupPoint
            ? {
                name: pickupPoint.name,
                address: pickupPoint.address,
                city: pickupPoint.city,
              }
            : null,
        shipping_address:
          shippingMethod === "courier"
            ? {
                name: courierAddress.name.trim(),
                street: courierAddress.street.trim(),
                postal_code: courierAddress.postal_code.trim(),
                city: courierAddress.city.trim(),
                phone: courierAddress.phone.replace(/[^0-9+]/g, ""),
              }
            : null,
        shipping_cost_grosze: shippingCostGrosze,
        payment_method: paymentMethod,
        invoice: invoiceRequested
          ? {
              requested: true,
              company_name: companyName.trim(),
              company_nip: normalizeNip(companyNip),
              company_address: companyAddress.trim(),
            }
          : { requested: false },
      };
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke("create-payment", { body: payload });
      if (error) throw error;
      interface CreatePaymentResponse {
        error?: string;
        payment_method?: string;
        order_number?: string;
        redirect_url?: string;
      }
      const responseData = data as CreatePaymentResponse | null;
      const errCode = responseData?.error;
      if (errCode === "out_of_stock") {
        toast.error("Zabrakło sztuk w magazynie", {
          description: "Ktoś Cię wyprzedził. Wróć do koszyka i zaktualizuj ilość.",
        });
        setIsSubmitting(false);
        return;
      }
      if (errCode === "invoice_nip_invalid") {
        toast.error("Nieprawidłowy NIP", { description: "Sprawdź numer i spróbuj ponownie." });
        setIsSubmitting(false);
        return;
      }
      if (errCode) {
        toast.error("Nie udało się rozpocząć płatności", { description: errCode });
        setIsSubmitting(false);
        return;
      }
      if (responseData?.payment_method === "cod") {
        const orderNumber = responseData?.order_number || "";
        toast.success("Zamówienie złożone", { description: "Zapłacisz przy odbiorze." });
        window.location.href = `/checkout/potwierdzenie?order=${encodeURIComponent(orderNumber)}&cod=1`;
        return;
      }
      const url = responseData?.redirect_url;
      if (!url) {
        toast.error("Nie udało się rozpocząć płatności");
        setIsSubmitting(false);
        return;
      }
      window.location.href = url;
    } catch (e) {
      console.error(e);
      const errMsg = e instanceof Error ? e.message : String(e);
      toast.error("Nie udało się rozpocząć płatności", { description: errMsg });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Helmet>
        <title>Zamówienie – Podróżówka</title>
        <meta name="description" content="Wybierz paczkomat InPost i sfinalizuj zamówienie w Podróżówce." />
        <link rel="canonical" href="https://podrozowka.lovable.app/checkout" />
      </Helmet>
      <Header />
      <main id="main-content" className="container mx-auto flex-1 px-4 pb-10 pt-24 md:pb-14 md:pt-28">
        <OrderSteps current={2} />
        <div className="mb-6">
          <Link
            to="/koszyk"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> Wróć do koszyka
          </Link>
        </div>

        <div className="mb-8">
          <p className="mb-2 text-sm font-medium text-primary">Krok 2 z 3</p>
          <h1 className="font-display text-3xl font-bold text-foreground md:text-4xl">Dostawa i płatność</h1>
          <p className="mt-2 text-muted-foreground">Po opłaceniu przygotujemy Twoje Podróżówki do druku.</p>
        </div>

        {isBelowMin && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-900 dark:text-amber-200 flex items-start gap-3 mb-6">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Minimalne zamówienie to 10 podróżówek</p>
              <p className="text-xs mt-0.5">
                W Twoim koszyku znajduje się obecnie <strong>{totalItemCount} szt.</strong> Wróć do koszyka i dodaj jeszcze <strong>{10 - totalItemCount} szt.</strong>
              </p>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left: shipping */}
          <section className="lg:col-span-2 space-y-6">
            <div className="bg-card rounded-2xl shadow-card p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <Package className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold text-foreground">
                    Metoda dostawy
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Wybierz paczkomat InPost lub dostawę kurierem pod wskazany adres.
                  </p>
                </div>
              </div>

              <ShippingMethodPicker value={shippingMethod} onChange={setShippingMethod} />

              {shippingMethod === "inpost" ? (
                pickupPoint ? (
                  <div className="border border-border rounded-xl p-4 flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{pickupPoint.name}</p>
                      {pickupPoint.address && (
                        <p className="text-sm text-muted-foreground">{pickupPoint.address}</p>
                      )}
                      {pickupPoint.city && (
                        <p className="text-sm text-muted-foreground">{pickupPoint.city}</p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                      Zmień punkt
                    </Button>
                  </div>
                ) : (
                  <Button className="w-full sm:w-auto" onClick={() => setDialogOpen(true)}>
                    <MapPin className="w-4 h-4 mr-2" />
                    Wybierz paczkomat
                  </Button>
                )
              ) : (
                <CourierAddressForm value={courierAddress} onChange={setCourierAddress} />
              )}
            </div>

            {/* Payment method */}
            <div className="bg-card rounded-2xl shadow-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">2</div>
                <h2 className="font-display text-lg font-semibold text-foreground">Metoda płatności</h2>
              </div>
              <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
            </div>


            {/* Invoice */}
            <div className="bg-card rounded-2xl shadow-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold text-foreground">
                    Dokument sprzedaży
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Domyślnie wystawiamy paragon konsumencki. Zaznacz, jeśli chcesz fakturę na firmę.
                  </p>
                </div>
              </div>

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <Checkbox
                  checked={invoiceRequested}
                  onCheckedChange={(v) => setInvoiceRequested(v === true)}
                  className="mt-0.5"
                />
                <span className="text-sm text-foreground">Chcę fakturę na firmę</span>
              </label>

              {invoiceRequested && (
                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="company_name">Nazwa firmy</Label>
                    <Input
                      id="company_name"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      onBlur={() => setInvoiceTouched((s) => ({ ...s, name: true }))}
                      maxLength={200}
                      placeholder="np. Podróżówka Sp. z o.o."
                      aria-invalid={!!(invoiceTouched.name && invoiceErrors.name)}
                    />
                    {invoiceTouched.name && invoiceErrors.name && (
                      <p className="text-xs text-destructive">{invoiceErrors.name}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="company_nip">NIP</Label>
                    <Input
                      id="company_nip"
                      value={companyNip}
                      onChange={(e) => setCompanyNip(e.target.value)}
                      onBlur={() => setInvoiceTouched((s) => ({ ...s, nip: true }))}
                      inputMode="numeric"
                      maxLength={13}
                      placeholder="10 cyfr, np. 5213650575"
                      aria-invalid={!!(invoiceTouched.nip && invoiceErrors.nip)}
                    />
                    {invoiceTouched.nip && invoiceErrors.nip && (
                      <p className="text-xs text-destructive">{invoiceErrors.nip}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="company_address">Adres firmy</Label>
                    <Textarea
                      id="company_address"
                      value={companyAddress}
                      onChange={(e) => setCompanyAddress(e.target.value)}
                      onBlur={() => setInvoiceTouched((s) => ({ ...s, addr: true }))}
                      maxLength={500}
                      rows={3}
                      placeholder="ul. Przykładowa 1, 00-001 Warszawa"
                      aria-invalid={!!(invoiceTouched.addr && invoiceErrors.addr)}
                    />
                    {invoiceTouched.addr && invoiceErrors.addr && (
                      <p className="text-xs text-destructive">{invoiceErrors.addr}</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Fakturę VAT wyślemy na e-mail przypisany do Twojego konta.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Right: summary */}
          <aside className="lg:sticky lg:top-24 h-fit">
            <div className="bg-card rounded-2xl shadow-card p-6">
              <h2 className="font-display text-lg font-semibold text-foreground mb-4">
                Podsumowanie
              </h2>

              {isLoading ? (
                <div className="space-y-3 animate-pulse">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-12 h-12 bg-muted rounded" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-muted rounded w-3/4" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="space-y-3 mb-4">
                  {items.map((it) => (
                    <li key={it.id} className="flex gap-3">
                      {it.image ? (
                        <img
                          src={it.image}
                          alt=""
                          className="w-12 h-12 object-cover rounded shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded bg-muted shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-2">
                          {it.title || "Podróżówka"}
                        </p>
                        {it.unavailable ? (
                          <p className="text-xs text-destructive flex items-center gap-1 mt-0.5">
                            <AlertCircle className="w-3 h-3" /> Niedostępne
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {it.quantity} × {formatPln(it.price_grosze)}
                          </p>
                        )}
                      </div>
                      {!it.unavailable && (
                        <p className="text-sm font-semibold whitespace-nowrap">
                          {formatPln(it.price_grosze * it.quantity)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-2 pt-4 border-t border-border">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Suma częściowa</span>
                  <span className="font-medium">{formatPln(subtotalGrosze)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Dostawa ({shippingMethod === "courier" ? "kurier" : "InPost"}
                    {paymentMethod === "cod" ? ", za pobraniem" : ""})
                  </span>
                  <span className="font-medium">{formatPln(shippingCostGrosze)}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="font-semibold">Suma</span>
                  <span className="font-display text-xl font-bold">{formatPln(totalGrosze)}</span>
                </div>
              </div>

              {hasUnavailable && (
                <p className="text-xs text-destructive mt-3 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Usuń niedostępne pozycje z koszyka, aby kontynuować.
                </p>
              )}

              <Button
                size="lg"
                className="w-full mt-6"
                disabled={!canProceed || isSubmitting}
                onClick={handleProceed}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Przekierowywanie…
                  </>
                ) : (
                  `Przejdź do płatności · ${formatPln(totalGrosze)}`
                )}
              </Button>
              {!shippingValid && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {shippingMethod === "inpost"
                    ? "Wybierz paczkomat, aby przejść dalej."
                    : "Uzupełnij dane adresowe, aby przejść dalej."}
                </p>
              )}
            </div>
          </aside>
        </div>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl w-[95vw] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Wybierz paczkomat InPost</DialogTitle>
          </DialogHeader>
          <InpostGeowidget
            onSelect={handleSelectPickupPoint}
          />
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default Checkout;
