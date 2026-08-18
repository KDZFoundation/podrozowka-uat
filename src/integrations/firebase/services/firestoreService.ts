import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
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
} from "../types";

export const firestoreService = {
  // --- Katalog i Kraje ---
  async getCountries(): Promise<FirestoreCountry[]> {
    if (!isFirebaseConfigured) return [];
    const snap = await getDocs(query(collection(db, "countries"), where("is_active", "==", true)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreCountry));
  },

  async getCategories(): Promise<FirestoreCategory[]> {
    if (!isFirebaseConfigured) return [];
    const snap = await getDocs(query(collection(db, "categories"), where("is_active", "==", true), orderBy("sort_order", "asc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreCategory));
  },

  async getAuthors(): Promise<FirestoreAuthor[]> {
    if (!isFirebaseConfigured) return [];
    const snap = await getDocs(query(collection(db, "authors"), where("is_active", "==", true)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreAuthor));
  },

  async getCardDesigns(): Promise<FirestoreCardDesign[]> {
    if (!isFirebaseConfigured) return [];
    const snap = await getDocs(query(collection(db, "card_designs"), where("is_active", "==", true)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreCardDesign));
  },

  async getCardDesignById(id: string): Promise<FirestoreCardDesign | null> {
    if (!isFirebaseConfigured) return null;
    const docRef = doc(db, "card_designs", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as FirestoreCardDesign;
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
    const snap = await getDocs(
      query(collection(db, "orders"), where("user_id", "==", userId), orderBy("created_at", "desc"))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreOrder));
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
    if (!isFirebaseConfigured) return null;
    const snap = await getDoc(doc(db, "users", userId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as FirestoreUserProfile;
  },

  async updateUserPoints(userId: string, addedPoints: number): Promise<void> {
    if (!isFirebaseConfigured) return;
    const userRef = doc(db, "users", userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const current = (snap.data().gamification_points || 0) + addedPoints;
      await updateDoc(userRef, { gamification_points: current });
    }
  },
};
