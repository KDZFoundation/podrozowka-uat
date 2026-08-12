import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ShoppingCart, ArrowLeft, Plus, Minus, Trash2, MapPin, Package } from "lucide-react";
import { toast } from "sonner";
import InpostGeowidget from "@/components/checkout/InpostGeowidget";
import type { PickupPoint } from "@/contexts/CheckoutContext";
import {
  getShippingCostGrosze,
  type PaymentMethod,
  type ShippingMethod,
  type CourierAddress,
  emptyCourierAddress,
  isCourierAddressValid,
} from "@/lib/constants";
import PaymentMethodPicker from "@/components/checkout/PaymentMethodPicker";
import ShippingMethodPicker from "@/components/checkout/ShippingMethodPicker";
import CourierAddressForm from "@/components/checkout/CourierAddressForm";

interface Order {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total_amount: number;
  currency: string;
  created_at: string;
}

interface OrderDetail extends Order {
  shipping_name: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;
  notes: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  items: OrderItem[];
}

interface OrderItem {
  id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  card_design_id: string;
  design_title: string | null;
  country_name: string | null;
  view_no: number | null;
}

interface DesignOption {
  id: string;
  title: string | null;
  view_no: number;
  country_name: string;
  price_grosze: number;
  image: string | null;
}

interface CartItem {
  design_id: string;
  quantity: number;
  design: DesignOption;
}

interface OrderItemJoin {
  id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  card_design_id: string;
  card_designs: {
    title: string | null;
    view_no: number;
    countries: {
      name_pl: string;
    } | null;
  } | null;
}

interface CardDesignJoin {
  id: string;
  title: string | null;
  view_no: number;
  price_grosze: number;
  image_front_url: string | null;
  countries: {
    name_pl: string;
  } | null;
}

interface CreatePaymentResponse {
  error?: string;
  payment_method?: string;
  order_number?: string;
  redirect_url?: string;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "Oczekujące", className: "bg-muted text-muted-foreground" },
  paid: { label: "W przygotowaniu", className: "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))]" },
  fulfilled: { label: "Zrealizowane", className: "bg-accent/15 text-accent" },
  cancelled: { label: "Anulowane", className: "bg-destructive/15 text-destructive" },
};

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: "Nieopłacone",
  paid: "Opłacone",
  refunded: "Zwrócone",
  failed: "Nieudane",
};

const formatPln = (grosze: number) =>
  (grosze / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";

const MyOrders = ({ userId }: { userId: string }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // New order
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [designs, setDesigns] = useState<DesignOption[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [pickupPoint, setPickupPoint] = useState<PickupPoint | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("online");
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>("inpost");
  const [courierAddress, setCourierAddress] = useState<CourierAddress>(emptyCourierAddress);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, status, payment_status, total_amount, currency, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error && data) setOrders(data);
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const fetchOrderDetail = async (orderId: string) => {
    setDetailLoading(true);
    const [{ data: order }, { data: items }] = await Promise.all([
      supabase.from("orders").select("*").eq("id", orderId).single(),
      supabase
        .from("order_items")
        .select(`
          id, quantity, unit_price, total_price, card_design_id,
          card_designs!inner(title, view_no, countries!inner(name_pl))
        `)
        .eq("order_id", orderId),
    ]);

    if (order) {
      setSelectedOrder({
        ...order,
        items: ((items as unknown as OrderItemJoin[]) || []).map((i: OrderItemJoin) => ({
          id: i.id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          total_price: i.total_price,
          card_design_id: i.card_design_id,
          design_title: i.card_designs?.title || null,
          country_name: i.card_designs?.countries?.name_pl || null,
          view_no: i.card_designs?.view_no || null,
        })),
      });
    }
    setDetailLoading(false);
  };

  const loadDesigns = async () => {
    const { data } = await supabase
      .from("card_designs")
      .select("id, title, view_no, price_grosze, image_front_url, countries(name_pl)")
      .eq("active", true)
      .gt("price_grosze", 0)
      .order("view_no");

    if (data) {
      setDesigns(
        (data as unknown as CardDesignJoin[]).map((d: CardDesignJoin) => ({
          id: d.id,
          title: d.title,
          view_no: d.view_no,
          country_name: d.countries?.name_pl || "",
          price_grosze: d.price_grosze,
          image: d.image_front_url ?? null,
        })),
      );
    }
  };

  const openNewOrder = () => {
    setShowNewOrder(true);
    setCart([]);
    setPickupPoint(null);
    setShippingMethod("inpost");
    setCourierAddress(emptyCourierAddress());
    loadDesigns();
  };

  const addToCart = (designId: string) => {
    const design = designs.find((d) => d.id === designId);
    if (!design) return;
    const existing = cart.find((c) => c.design_id === designId);
    if (existing) {
      setCart(cart.map((c) => (c.design_id === designId ? { ...c, quantity: c.quantity + 1 } : c)));
    } else {
      setCart([...cart, { design_id: designId, quantity: 1, design }]);
    }
  };

  const updateCartQty = (designId: string, delta: number) => {
    setCart(
      cart
        .map((c) => (c.design_id === designId ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0),
    );
  };

  const subtotalGrosze = cart.reduce((s, c) => s + c.design.price_grosze * c.quantity, 0);
  const shippingCostGrosze = getShippingCostGrosze(paymentMethod);
  const totalGrosze = subtotalGrosze + shippingCostGrosze;

  const shippingValid =
    shippingMethod === "inpost" ? !!pickupPoint : isCourierAddressValid(courierAddress);



  const submitOrder = async () => {
    if (cart.length === 0) {
      toast.error("Dodaj przynajmniej jedną pozycję");
      return;
    }
    if (!shippingValid) {
      toast.error(
        shippingMethod === "inpost"
          ? "Wybierz paczkomat InPost"
          : "Uzupełnij dane adresowe do kuriera",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        items: cart.map((c) => ({ card_design_id: c.design_id, quantity: c.quantity })),
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
        invoice: { requested: false },
      };
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        toast.error("Sesja wygasła", { description: "Zaloguj się ponownie przed przejściem do płatności." });
        setIsSubmitting(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke("create-payment", {
        body: payload,
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) throw error;
      const res = data as CreatePaymentResponse;
      const errCode = res?.error;
      if (errCode === "out_of_stock") {
        toast.error("Zabrakło sztuk w magazynie", {
          description: "Ktoś Cię wyprzedził. Zmniejsz ilość i spróbuj ponownie.",
        });
        setIsSubmitting(false);
        return;
      }
      if (errCode) {
        toast.error("Nie udało się rozpocząć płatności", { description: errCode });
        setIsSubmitting(false);
        return;
      }
      if (res?.payment_method === "cod") {
        const orderNumber = res?.order_number;
        toast.success("Zamówienie złożone", { description: "Zapłacisz przy odbiorze." });
        window.location.href = `/checkout/potwierdzenie?order=${encodeURIComponent(orderNumber || "")}&cod=1`;
        return;
      }
      const url = res?.redirect_url;
      if (!url) {
        toast.error("Nie udało się rozpocząć płatności");
        setIsSubmitting(false);
        return;
      }
      window.location.href = url;
    } catch (err) {
      console.error(err);
      const e = err as Error;
      toast.error("Nie udało się rozpocząć płatności", { description: e?.message });
      setIsSubmitting(false);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const statusBadge = (status: string) => {
    const s = STATUS_LABELS[status] || STATUS_LABELS.pending;
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>;
  };

  // Order detail view
  if (selectedOrder) {
    return (
      <div className="space-y-6">
        <button onClick={() => setSelectedOrder(null)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Wróć do listy
        </button>

        {detailLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="bg-card rounded-xl p-6 shadow-soft space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl font-bold">{selectedOrder.order_number}</h3>
                {statusBadge(selectedOrder.status)}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><span className="text-muted-foreground">Data:</span><p>{formatDate(selectedOrder.created_at)}</p></div>
                <div><span className="text-muted-foreground">Płatność:</span><p>{PAYMENT_LABELS[selectedOrder.payment_status]}</p></div>
                <div><span className="text-muted-foreground">Kwota:</span><p className="font-bold">{Number(selectedOrder.total_amount).toFixed(2)} {selectedOrder.currency}</p></div>
                <div><span className="text-muted-foreground">Pozycji:</span><p>{selectedOrder.items.length}</p></div>
              </div>
              {selectedOrder.shipping_name && (
                <div className="border-t border-border pt-4 text-sm">
                  <p className="text-muted-foreground mb-1">Adres wysyłki:</p>
                  <p>{selectedOrder.shipping_name}</p>
                  <p>{selectedOrder.shipping_address}</p>
                  <p>{selectedOrder.shipping_postal_code} {selectedOrder.shipping_city}</p>
                  <p>{selectedOrder.shipping_country}</p>
                </div>
              )}
            </div>

            <div className="bg-card rounded-xl shadow-soft overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-muted-foreground">Wzór</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Kraj</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Ilość</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Cena jedn.</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Suma</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((item) => (
                    <tr key={item.id} className="border-b border-border/50">
                      <td className="p-3">V{item.view_no} {item.design_title || ""}</td>
                      <td className="p-3">{item.country_name}</td>
                      <td className="p-3 text-right">{item.quantity}</td>
                      <td className="p-3 text-right">{Number(item.unit_price).toFixed(2)} PLN</td>
                      <td className="p-3 text-right font-medium">{Number(item.total_price).toFixed(2)} PLN</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  // New order form
  if (showNewOrder) {
    return (
      <div className="space-y-6">
        <button onClick={() => setShowNewOrder(false)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Wróć do listy
        </button>

        <h2 className="font-display text-xl font-bold">Nowe zamówienie</h2>

        {/* Design picker */}
        <div className="bg-card rounded-xl p-6 shadow-soft space-y-4">
          <h3 className="font-medium">Wybierz kartki</h3>
          <Select onValueChange={addToCart}>
            <SelectTrigger><SelectValue placeholder="Dodaj wzór kartki..." /></SelectTrigger>
            <SelectContent>
              {designs.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.country_name} — Widok {d.view_no} {d.title ? `(${d.title})` : ""} · {formatPln(d.price_grosze)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {cart.length > 0 && (
            <div className="space-y-2">
              {cart.map((c) => (
                <div key={c.design_id} className="flex items-center justify-between bg-muted/50 rounded-lg p-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {c.design.image ? (
                      <img src={c.design.image} alt="" className="w-10 h-10 rounded object-cover shrink-0" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted shrink-0" />
                    )}
                    <span className="text-sm truncate">{c.design.country_name} — V{c.design.view_no} {c.design.title || ""}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => updateCartQty(c.design_id, -1)} className="p-1 hover:bg-muted rounded"><Minus className="w-4 h-4" /></button>
                    <span className="font-mono text-sm w-8 text-center">{c.quantity}</span>
                    <button onClick={() => updateCartQty(c.design_id, 1)} className="p-1 hover:bg-muted rounded"><Plus className="w-4 h-4" /></button>
                    <button onClick={() => setCart(cart.filter((x) => x.design_id !== c.design_id))} className="p-1 hover:bg-destructive/10 rounded text-destructive"><Trash2 className="w-4 h-4" /></button>
                    <span className="text-sm font-medium w-24 text-right">{formatPln(c.quantity * c.design.price_grosze)}</span>
                  </div>
                </div>
              ))}
              <div className="pt-3 border-t border-border space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Suma częściowa</span><span>{formatPln(subtotalGrosze)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Dostawa (InPost{paymentMethod === "cod" ? ", za pobraniem" : ""})</span>
                  <span>{formatPln(shippingCostGrosze)}</span>
                </div>
                <div className="flex justify-between font-display font-bold text-base pt-1">
                  <span>Razem</span><span>{formatPln(totalGrosze)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Payment method */}
        <div className="bg-card rounded-xl p-6 shadow-soft space-y-4">
          <h3 className="font-medium">Metoda płatności</h3>
          <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
        </div>


        {/* Shipping method */}
        <div className="bg-card rounded-xl p-6 shadow-soft space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Metoda dostawy</h3>
              <p className="text-sm text-muted-foreground">Paczkomat InPost lub kurier pod wskazany adres.</p>
            </div>
          </div>

          <ShippingMethodPicker value={shippingMethod} onChange={setShippingMethod} />

          {shippingMethod === "inpost" ? (
            pickupPoint ? (
              <div className="border border-border rounded-xl p-4 flex items-start gap-3">
                <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">{pickupPoint.name}</p>
                  {pickupPoint.address && <p className="text-sm text-muted-foreground">{pickupPoint.address}</p>}
                  {pickupPoint.city && <p className="text-sm text-muted-foreground">{pickupPoint.city}</p>}
                </div>
                <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>Zmień punkt</Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setDialogOpen(true)}>
                <MapPin className="w-4 h-4 mr-2" /> Wybierz paczkomat
              </Button>
            )
          ) : (
            <CourierAddressForm value={courierAddress} onChange={setCourierAddress} />
          )}
        </div>

        <Button
          onClick={submitOrder}
          disabled={isSubmitting || cart.length === 0 || !shippingValid}
          size="lg"
          className="gap-2"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
          {isSubmitting
            ? (paymentMethod === "cod" ? "Składanie zamówienia…" : "Przekierowywanie…")
            : (paymentMethod === "cod"
                ? `Zamów za pobraniem ${formatPln(totalGrosze)}`
                : `Zamów i zapłać ${formatPln(totalGrosze)}`)}
        </Button>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-4xl w-[95vw] p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Wybierz paczkomat InPost</DialogTitle>
            </DialogHeader>
            <InpostGeowidget
              onSelect={(p) => {
                setPickupPoint(p);
                setDialogOpen(false);
                toast.success("Wybrano paczkomat", { description: p.name });
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Orders list
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Moje zamówienia</h2>
        <Button onClick={openNewOrder} size="sm" className="gap-2"><Plus className="w-4 h-4" /> Nowe zamówienie</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : orders.length === 0 ? (
        <div className="bg-card rounded-xl p-12 text-center shadow-soft">
          <ShoppingCart className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Nie masz jeszcze żadnych zamówień</p>
          <Button onClick={openNewOrder} className="mt-4 gap-2"><Plus className="w-4 h-4" /> Złóż pierwsze zamówienie</Button>
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 font-medium text-muted-foreground">Nr zamówienia</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Data</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Płatność</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Kwota</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => fetchOrderDetail(o.id)}>
                  <td className="p-3 font-mono text-xs">{o.order_number}</td>
                  <td className="p-3 text-xs text-muted-foreground">{formatDate(o.created_at)}</td>
                  <td className="p-3">{statusBadge(o.status)}</td>
                  <td className="p-3 text-xs">{PAYMENT_LABELS[o.payment_status]}</td>
                  <td className="p-3 text-right font-medium">{Number(o.total_amount).toFixed(2)} {o.currency}</td>
                  <td className="p-3 text-xs text-primary">Szczegóły →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MyOrders;
