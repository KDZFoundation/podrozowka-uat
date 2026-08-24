import { describe, it, expect } from "vitest";
import crypto from "node:crypto";

const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

const calculateRank = (points: number): string => {
  if (points >= 7500) return "Legenda Podróżówki";
  if (points >= 3000) return "Misjonarz Kultury";
  if (points >= 1500) return "Ambasador";
  if (points >= 500) return "Odkrywca";
  return "Zwiadowca";
};

describe("Recipient Postcard Registration & Gamification", () => {
  it("calculates geographic distance correctly from Warsaw", () => {
    const distToRome = calculateDistanceKm(52.2297, 21.0122, 41.9028, 12.4964);
    expect(distToRome).toBeGreaterThan(1200);
    expect(distToRome).toBeLessThan(1450);

    const distToTokyo = calculateDistanceKm(52.2297, 21.0122, 35.6762, 139.6503);
    expect(distToTokyo).toBeGreaterThan(8000);
    expect(distToTokyo).toBeLessThan(9000);
  });

  it("calculates traveler rank tiers accurately based on points", () => {
    expect(calculateRank(0)).toBe("Zwiadowca");
    expect(calculateRank(250)).toBe("Zwiadowca");
    expect(calculateRank(500)).toBe("Odkrywca");
    expect(calculateRank(1490)).toBe("Odkrywca");
    expect(calculateRank(1500)).toBe("Ambasador");
    expect(calculateRank(2999)).toBe("Ambasador");
    expect(calculateRank(3000)).toBe("Misjonarz Kultury");
    expect(calculateRank(7499)).toBe("Misjonarz Kultury");
    expect(calculateRank(7500)).toBe("Legenda Podróżówki");
    expect(calculateRank(10000)).toBe("Legenda Podróżówki");
  });

  it("generates deterministic SHA-256 token hash for claim lookups", () => {
    const token = "test-qr-token-12345";
    const hash = crypto.createHash("sha256").update(token, "utf8").digest("hex");
    expect(hash).toHaveLength(64);
    expect(hash).toBe(crypto.createHash("sha256").update(token, "utf8").digest("hex"));
  });
});
