import { collection, deleteDoc, doc, getDocs, query, updateDoc, where, writeBatch } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";

export async function deleteCardDesignCascade(
  id: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const [orders, units, stockBatches] = await Promise.all([
      getDocs(collection(db, "orders")),
      getDocs(query(collection(db, "inventory_units"), where("card_design_id", "==", id))),
      getDocs(query(collection(db, "stock_batches"), where("card_design_id", "==", id))),
    ]);
    const hasOrders = orders.docs.some((order) => {
      const items = order.data().items;
      return Array.isArray(items) && items.some((item) => item && typeof item === "object" && (item as Record<string, unknown>).design_id === id);
    });

    if (hasOrders) {
      // Cannot hard-delete card design because customer orders exist for it.
      // Deactivate it instead so it is hidden from shop & creator.
      await updateDoc(doc(db, "card_designs", id), { active: false, is_active: false, updated_at: new Date().toISOString() });

      return {
        success: true,
        message:
          "Wzór kartki posiada powiązane zamówienia w historii – został pomyślnie oznaczony jako nieaktywny, aby zachować spójność historii zakupów.",
      };
    }

    const batch = writeBatch(db);
    units.docs.forEach((unit) => batch.delete(unit.ref));
    stockBatches.docs.forEach((stockBatch) => batch.delete(stockBatch.ref));
    batch.delete(doc(db, "card_designs", id));
    await batch.commit();

    return { success: true, message: "Wzór kartki został pomyślnie usunięty." };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
