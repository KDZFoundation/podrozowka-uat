import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../config";

export type RuntimeFeatureFlag = {
  key: string;
  name: string;
  description: string;
  is_enabled: boolean;
};

export type RuntimeGamificationConfig = {
  id: "default";
  points_per_unit: number;
  points_per_country: number;
  points_per_registration: number;
};

export type RuntimeGamificationTier = {
  id: string;
  name: string;
  min_points: number;
};

const numeric = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const DEFAULT_GAMIFICATION_CONFIG: RuntimeGamificationConfig = {
  id: "default",
  points_per_unit: 10,
  points_per_country: 50,
  points_per_registration: 100,
};

export const runtimeConfigService = {
  async getFeatureFlags(): Promise<RuntimeFeatureFlag[]> {
    if (!isFirebaseConfigured) return [];
    const snapshot = await getDocs(collection(db, "feature_flags"));
    return snapshot.docs.map((item) => {
      const data = item.data();
      return {
        key: typeof data.key === "string" ? data.key : item.id,
        name: typeof data.name === "string" ? data.name : item.id,
        description: typeof data.description === "string" ? data.description : "",
        is_enabled: data.is_enabled === true,
      };
    });
  },

  async setFeatureFlag(flag: RuntimeFeatureFlag): Promise<void> {
    await setDoc(doc(db, "feature_flags", flag.key), {
      ...flag,
      updated_at: serverTimestamp(),
    }, { merge: true });
  },

  async getGamificationConfig(): Promise<RuntimeGamificationConfig> {
    if (!isFirebaseConfigured) return DEFAULT_GAMIFICATION_CONFIG;
    const snapshot = await getDoc(doc(db, "gamification_config", "default"));
    if (!snapshot.exists()) return DEFAULT_GAMIFICATION_CONFIG;
    const data = snapshot.data();
    return {
      id: "default",
      points_per_unit: numeric(data.points_per_unit, DEFAULT_GAMIFICATION_CONFIG.points_per_unit),
      points_per_country: numeric(data.points_per_country, DEFAULT_GAMIFICATION_CONFIG.points_per_country),
      points_per_registration: numeric(data.points_per_registration, DEFAULT_GAMIFICATION_CONFIG.points_per_registration),
    };
  },

  async setGamificationConfig(config: Omit<RuntimeGamificationConfig, "id">): Promise<void> {
    await setDoc(doc(db, "gamification_config", "default"), {
      ...config,
      updated_at: serverTimestamp(),
    }, { merge: true });
  },

  async getGamificationTiers(): Promise<RuntimeGamificationTier[]> {
    if (!isFirebaseConfigured) return [];
    const snapshot = await getDocs(query(collection(db, "gamification_tiers"), orderBy("min_points", "asc")));
    return snapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        name: typeof data.name === "string" ? data.name : "Ranga",
        min_points: numeric(data.min_points, 0),
      };
    });
  },

  async setGamificationTier(tier: RuntimeGamificationTier): Promise<void> {
    await setDoc(doc(db, "gamification_tiers", tier.id), {
      name: tier.name,
      min_points: tier.min_points,
      updated_at: serverTimestamp(),
    }, { merge: true });
  },

  async deleteGamificationTier(id: string): Promise<void> {
    await deleteDoc(doc(db, "gamification_tiers", id));
  },
};
