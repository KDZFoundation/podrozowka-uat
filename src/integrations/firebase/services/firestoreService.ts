import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../config";
import type {
  FirestoreCardDesign,
  FirestoreCountry,
  FirestoreCategory,
  FirestoreAuthor,
  FirestoreOrder,
  FirestoreRecipientRegistration,
  FirestoreUserProfile,
  FirestoreLanguageTemplate,
} from "../types";

function normalizeCardDesign(id: string, raw: Record<string, unknown>): FirestoreCardDesign {
  const active = raw.active !== undefined
    ? Boolean(raw.active)
    : raw.is_active !== undefined
      ? Boolean(raw.is_active)
      : true;
  const legacyPrice = typeof raw.price_pln === "number" ? Math.round(raw.price_pln * 100) : 0;

  return {
    ...raw,
    id,
    title: typeof raw.title === "string" ? raw.title : "",
    slug: typeof raw.slug === "string" ? raw.slug : id,
    price_grosze: typeof raw.price_grosze === "number" ? raw.price_grosze : legacyPrice,
    currency: "PLN",
    language_code: typeof raw.language_code === "string" ? raw.language_code : "pl",
    view_no: typeof raw.view_no === "number" ? raw.view_no : 1,
    active,
    is_active: active,
  } as FirestoreCardDesign;
}

const numericValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const createdAtValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return new Date(0).toISOString();
};

export const normalizeOrder = (id: string, raw: Record<string, unknown>): FirestoreOrder => ({
  ...raw,
  id,
  order_number: typeof raw.order_number === "string" ? raw.order_number : id,
  user_id: typeof raw.user_id === "string" ? raw.user_id : "",
  guest_email: typeof raw.guest_email === "string"
    ? raw.guest_email
    : typeof raw.customer_email === "string" ? raw.customer_email : "",
  status: (typeof raw.status === "string" ? raw.status : "new") as FirestoreOrder["status"],
  payment_method: (typeof raw.payment_method === "string" ? raw.payment_method : "hotpay") as FirestoreOrder["payment_method"],
  payment_status: (typeof raw.payment_status === "string" ? raw.payment_status : "pending") as FirestoreOrder["payment_status"],
  total_amount_pln: numericValue(raw.total_amount_pln, numericValue(raw.total_amount, numericValue(raw.total_amount_grosze) / 100)),
  shipping_cost_pln: numericValue(raw.shipping_cost_pln, numericValue(raw.shipping_cost_grosze) / 100),
  items: Array.isArray(raw.items) ? raw.items.map((item) => {
    const value = item as Record<string, unknown>;
    return {
      ...value,
      card_design_id: String(value.card_design_id || ""),
      title: String(value.title || "Podróżówka"),
      quantity: numericValue(value.quantity),
      unit_price_pln: numericValue(value.unit_price_pln, numericValue(value.unit_price_grosze) / 100),
      total_price_pln: numericValue(value.total_price_pln, numericValue(value.total_price_grosze) / 100),
    };
  }) : [],
  created_at: createdAtValue(raw.created_at),
} as FirestoreOrder);

export const uniqueOrders = (orders: FirestoreOrder[]) => {
  const byNumber = new Map<string, FirestoreOrder>();
  for (const order of orders) {
    const existing = byNumber.get(order.order_number);
    if (!existing || (order.payment_status === "paid" && existing.payment_status !== "paid")) {
      byNumber.set(order.order_number, order);
    }
  }
  return [...byNumber.values()].sort((left, right) => right.created_at!.localeCompare(left.created_at!));
};

export const firestoreService = {
  // --- Katalog i Kraje ---
  async getCountries(): Promise<FirestoreCountry[]> {
    if (!isFirebaseConfigured) return [];
    try {
      const snap = await getDocs(collection(db, "countries"));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreCountry));
    } catch {
      return [];
    }
  },

  async getCategories(): Promise<FirestoreCategory[]> {
    if (!isFirebaseConfigured) return [];
    try {
      const snap = await getDocs(collection(db, "categories"));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreCategory));
    } catch {
      return [];
    }
  },

  async getAuthors(): Promise<FirestoreAuthor[]> {
    if (!isFirebaseConfigured) return [];
    try {
      const snap = await getDocs(collection(db, "authors"));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreAuthor));
    } catch {
      return [];
    }
  },

  async getCardDesigns(options: { includeInactive?: boolean } = {}): Promise<FirestoreCardDesign[]> {
    if (!isFirebaseConfigured) return [];
    try {
      const snap = await getDocs(collection(db, "card_designs"));
      const designs = snap.docs
        .map((d) => normalizeCardDesign(d.id, d.data()))
        .filter((design) => options.includeInactive || design.active);
      return designs;
    } catch {
      return [];
    }
  },

  async getCardDesignById(id: string): Promise<FirestoreCardDesign | null> {
    if (!isFirebaseConfigured) return null;
    try {
      const docRef = doc(db, "card_designs", id);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      return normalizeCardDesign(snap.id, snap.data());
    } catch {
      return null;
    }
  },

  async getLanguageTemplatesForCountry(countryId: string): Promise<FirestoreLanguageTemplate[]> {
    if (!isFirebaseConfigured || !countryId) return [];
    try {
      const snap = await getDocs(
        query(collection(db, "card_language_templates"), where("country_id", "==", countryId))
      );
      return snap.docs
        .map((item) => ({ id: item.id, ...item.data() } as FirestoreLanguageTemplate))
        .sort((left, right) => left.language_name.localeCompare(right.language_name, "pl"));
    } catch {
      return [];
    }
  },

  async upsertCardDesign(id: string, data: Partial<FirestoreCardDesign> & Record<string, unknown>): Promise<void> {
    if (!isFirebaseConfigured) return;
    try {
      const docRef = doc(db, "card_designs", id);
      const active = data.active ?? data.is_active ?? true;
      await setDoc(docRef, {
        ...data,
        active,
        is_active: active,
        currency: "PLN",
        updated_at: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      console.warn("Firestore upsertCardDesign error:", e);
    }
  },

  async setCardDesignActive(id: string, active: boolean): Promise<void> {
    await this.upsertCardDesign(id, { active, is_active: active });
  },

  async deleteCardDesign(id: string): Promise<void> {
    if (!isFirebaseConfigured) return;
    await deleteDoc(doc(db, "card_designs", id));
  },

  // --- Zamówienia ---
  async createOrder(orderData: Omit<FirestoreOrder, "id">): Promise<string> {
    if (!isFirebaseConfigured) {
      console.warn("Firebase is not configured. Order cannot be saved to Firestore.");
      return "temp-order-id";
    }
    const orderDoc = doc(collection(db, "orders"));
    await setDoc(orderDoc, {
      ...orderData,
      created_at: serverTimestamp(),
    });
    return orderDoc.id;
  },

  async getOrdersByUser(userId: string): Promise<FirestoreOrder[]> {
    if (!isFirebaseConfigured) return [];
    try {
      const snap = await getDocs(query(collection(db, "orders"), where("user_id", "==", userId)));
      return uniqueOrders(snap.docs.map((d) => normalizeOrder(d.id, d.data())));
    } catch (e) {
      console.warn("Firestore getOrdersByUser error:", e);
      return [];
    }
  },

  async getAllOrders(): Promise<FirestoreOrder[]> {
    if (!isFirebaseConfigured) return [];
    try {
      const snap = await getDocs(collection(db, "orders"));
      return uniqueOrders(snap.docs.map((d) => normalizeOrder(d.id, d.data()))).slice(0, 100);
    } catch (e) {
      console.warn("Firestore getAllOrders error:", e);
      return [];
    }
  },

  async getOrderByNumber(orderNumber: string): Promise<FirestoreOrder | null> {
    if (!isFirebaseConfigured) return null;
    try {
      const snap = await getDocs(query(collection(db, "orders"), where("order_number", "==", orderNumber)));
      if (snap.empty) return null;
      return uniqueOrders(snap.docs.map((d) => normalizeOrder(d.id, d.data())))[0] || null;
    } catch (e) {
      console.warn("Firestore getOrderByNumber error:", e);
      return null;
    }
  },

  async getOrderById(id: string): Promise<FirestoreOrder | null> {
    if (!isFirebaseConfigured) return null;
    const snapshot = await getDoc(doc(db, "orders", id));
    return snapshot.exists() ? normalizeOrder(snapshot.id, snapshot.data()) : null;
  },

  async updateOrder(id: string, data: Record<string, unknown>): Promise<void> {
    if (!isFirebaseConfigured) return;
    await updateDoc(doc(db, "orders", id), { ...data, updated_at: new Date().toISOString() });
  },

  async deleteOrdersByNumber(orderNumber: string): Promise<number> {
    if (!isFirebaseConfigured) return 0;
    const snapshot = await getDocs(query(collection(db, "orders"), where("order_number", "==", orderNumber)));
    const batch = writeBatch(db);
    snapshot.docs.forEach((orderDocument) => batch.delete(orderDocument.ref));
    await batch.commit();
    return snapshot.size;
  },

  // --- Rejestracja obdarowanych ---
  async getRecentRegistrations(limitCount: number = 20): Promise<FirestoreRecipientRegistration[]> {
    if (!isFirebaseConfigured) return [];
    const snap = await getDocs(
      query(collection(db, "recipient_registrations"), orderBy("registered_at", "desc"), limit(limitCount))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreRecipientRegistration));
  },

  async registerRecipient(registrationData: Omit<FirestoreRecipientRegistration, "id">): Promise<string> {
    if (!isFirebaseConfigured) return "temp-reg-id";
    const regDoc = doc(collection(db, "recipient_registrations"));
    await setDoc(regDoc, {
      ...registrationData,
      registered_at: new Date().toISOString(),
    });
    return regDoc.id;
  },

  // --- Profile i Grywalizacja ---
  async getUserProfile(userId: string): Promise<FirestoreUserProfile | null> {
    if (!isFirebaseConfigured || !userId) return null;
    try {
      const userRef = doc(db, "users", userId);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        return {
          id: snap.id,
          user_id: snap.id,
          email: data.email || "",
          first_name: data.first_name ?? null,
          last_name: data.last_name ?? null,
          display_name: data.display_name ?? data.full_name ?? data.username ?? null,
          full_name: data.full_name ?? "",
          username: data.username ?? "",
          avatar_url: data.avatar_url ?? null,
          role: data.role || "traveler",
          gamification_points: data.gamification_points || 0,
          current_tier: data.current_tier || "Początkujący Podróżnik",
          postcards_sent_count: data.postcards_sent_count || 0,
          postcards_registered_count: data.postcards_registered_count || 0,
          created_at: data.created_at || "",
          updated_at: data.updated_at || "",
        } as FirestoreUserProfile;
      }

      // Check profiles collection fallback
      const profRef = doc(db, "profiles", userId);
      const profSnap = await getDoc(profRef);
      if (profSnap.exists()) {
        const data = profSnap.data();
        return {
          id: profSnap.id,
          user_id: profSnap.id,
          email: data.email || "",
          first_name: data.first_name ?? null,
          last_name: data.last_name ?? null,
          display_name: data.display_name ?? null,
          full_name: data.full_name ?? "",
          username: data.username ?? "",
          avatar_url: data.avatar_url ?? null,
          role: data.role || "traveler",
          gamification_points: data.gamification_points || 0,
          current_tier: data.current_tier || "Początkujący Podróżnik",
          postcards_sent_count: data.postcards_sent_count || 0,
          postcards_registered_count: data.postcards_registered_count || 0,
        } as FirestoreUserProfile;
      }
      return null;
    } catch (e) {
      console.warn("Firestore getUserProfile error:", e);
      return null;
    }
  },

  async updateUserProfile(userId: string, profileData: Partial<FirestoreUserProfile>): Promise<void> {
    if (!isFirebaseConfigured || !userId) return;
    const userRef = doc(db, "users", userId);
    const profRef = doc(db, "profiles", userId);
    
    const cleanData = {
      ...profileData,
      updated_at: new Date().toISOString(),
    };

    await Promise.allSettled([
      setDoc(userRef, cleanData, { merge: true }),
      setDoc(profRef, cleanData, { merge: true }),
    ]);
  },

  async updateUserPoints(userId: string, addedPoints: number): Promise<void> {
    if (!isFirebaseConfigured || !userId) return;
    const userRef = doc(db, "users", userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const current = (snap.data().gamification_points || 0) + addedPoints;
      await updateDoc(userRef, { gamification_points: current });
    }
  },

  async getTravelerStats(userId: string) {
    if (!isFirebaseConfigured || !userId) {
      return {
        totalPoints: 0,
        currentRank: "Zwiadowca",
        uniqueCountries: 0,
        registeredRelations: 0,
        totalKilometers: 0,
        totalUnits: 0,
        purchasedCount: 0,
        registeredCount: 0,
        countryStats: [] as Array<{ name: string; total: number; registered: number }>,
      };
    }

    try {
      const [userProfile, orders, unitsSnap, regsSnap, designsSnap, countriesSnap] = await Promise.all([
        this.getUserProfile(userId),
        this.getOrdersByUser(userId),
        getDocs(query(collection(db, "inventory_units"), where("traveler_user_id", "==", userId))),
        getDocs(query(collection(db, "recipient_registrations"), where("traveler_user_id", "==", userId))),
        getDocs(collection(db, "card_designs")),
        getDocs(collection(db, "countries")),
      ]);

      const designsMap = new Map(designsSnap.docs.map((d) => [d.id, d.data()]));
      const countriesMap = new Map(countriesSnap.docs.map((c) => [c.id, c.data().name_pl || c.data().name || c.id]));

      // A traveler earns progress only for postcards from an order that has
      // actually been paid. Inventory imported for tests, stock, or a draft
      // order must never appear in the traveler's game profile.
      const paidOrderIds = new Set(
        orders.filter((order) => order.payment_status === "paid").map((order) => order.id),
      );
      const units = unitsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((unit: any) => typeof unit.order_id === "string" && paidOrderIds.has(unit.order_id));
      const totalUnits = units.length;
      const registeredUnitIds = new Set(
        regsSnap.docs
          .map((registration) => registration.data().inventory_unit_id)
          .filter((unitId): unitId is string => typeof unitId === "string"),
      );
      const registeredCount = units.filter(
        (unit: any) => unit.business_status === "registered" || registeredUnitIds.has(unit.id),
      ).length;
      const purchasedCount = units.filter((u: any) => ["purchased", "assigned"].includes(u.business_status || "")).length;

      const countrySet = new Set<string>();
      const countryMap = new Map<string, { total: number; registered: number }>();

      units.forEach((u: any) => {
        const design = designsMap.get(u.card_design_id);
        const countryId = design?.country_id || "PL";
        countrySet.add(countryId);
        const countryName = countriesMap.get(countryId) || countryId;
        const existing = countryMap.get(countryName) || { total: 0, registered: 0 };
        existing.total++;
        if (u.business_status === "registered" || registeredUnitIds.has(u.id)) existing.registered++;
        countryMap.set(countryName, existing);
      });

      const countryStats = Array.from(countryMap.entries())
        .map(([name, s]) => ({ name, ...s }))
        .sort((a, b) => b.total - a.total);

      // Do not trust historical cached counters during migration. They can
      // include deleted/test units, while the paid orders above are canonical.
      const totalPoints = totalUnits * 10 + registeredCount * 50;
      const currentRank = totalPoints >= 7500
        ? "Legenda Podróżówki"
        : totalPoints >= 3000
          ? "Misjonarz Kultury"
          : totalPoints >= 1500
            ? "Ambasador"
            : totalPoints >= 500
              ? "Odkrywca"
              : "Zwiadowca";
      const totalKilometers = registeredCount > 0 ? Number((userProfile as any)?.total_kilometers || 0) : 0;

      return {
        totalPoints,
        currentRank,
        uniqueCountries: countrySet.size,
        registeredRelations: registeredCount,
        totalKilometers,
        totalUnits,
        purchasedCount,
        registeredCount,
        countryStats,
      };
    } catch (e) {
      console.warn("Firestore getTravelerStats error:", e);
      return {
        totalPoints: 0,
        currentRank: "Zwiadowca",
        uniqueCountries: 0,
        registeredRelations: 0,
        totalKilometers: 0,
        totalUnits: 0,
        purchasedCount: 0,
        registeredCount: 0,
        countryStats: [],
      };
    }
  },

  async getPaidTravelerUnits(userId: string): Promise<Array<Record<string, unknown> & { id: string }>> {
    if (!isFirebaseConfigured || !userId) return [];
    try {
      const [orders, unitsSnap] = await Promise.all([
        this.getOrdersByUser(userId),
        getDocs(query(collection(db, "inventory_units"), where("traveler_user_id", "==", userId))),
      ]);
      const paidOrderIds = new Set(
        orders.filter((order) => order.payment_status === "paid").map((order) => order.id),
      );
      return unitsSnap.docs
        .map((document) => ({ id: document.id, ...document.data() } as Record<string, unknown> & { id: string }))
        .filter((unit) => typeof unit.order_id === "string" && paidOrderIds.has(unit.order_id));
    } catch (error) {
      console.warn("Firestore getPaidTravelerUnits error:", error);
      return [];
    }
  },

  async getTopTravelers(limitCount = 10): Promise<FirestoreUserProfile[]> {
    if (!isFirebaseConfigured) return [];
    try {
      const snap = await getDocs(collection(db, "users"));
      const users = snap.docs.map((d) => ({ id: d.id, user_id: d.id, ...d.data() } as unknown as FirestoreUserProfile));
      return users
        .sort((a, b) => (b.gamification_points || 0) - (a.gamification_points || 0))
        .slice(0, limitCount);
    } catch {
      return [];
    }
  },
};

