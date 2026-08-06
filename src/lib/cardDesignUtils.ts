import { supabase } from "@/integrations/supabase/client";

export async function deleteCardDesignCascade(
  id: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    // 1. Delete associated card_design_images
    await supabase.from("card_design_images").delete().eq("card_design_id", id);

    // 2. Check if order_items exist for this design
    const { data: orderItems } = await supabase
      .from("order_items")
      .select("id")
      .eq("card_design_id", id)
      .limit(1);

    if (orderItems && orderItems.length > 0) {
      // Cannot hard-delete card design because customer orders exist for it.
      // Deactivate it instead so it is hidden from shop & creator.
      const { error: updateError } = await supabase
        .from("card_designs")
        .update({ active: false })
        .eq("id", id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      return {
        success: true,
        message:
          "Wzór kartki posiada powiązane zamówienia w historii – został pomyślnie oznaczony jako nieaktywny, aby zachować spójność historii zakupów.",
      };
    }

    // 3. Delete inventory_units referencing this design
    await supabase.from("inventory_units").delete().eq("card_design_id", id);

    // 4. Delete stock_batches referencing this design
    await supabase.from("stock_batches").delete().eq("card_design_id", id);

    // 5. Delete the card_design row itself
    const { error: deleteError } = await supabase.from("card_designs").delete().eq("id", id);

    if (deleteError) {
      // Fallback: mark active = false if delete fails for another FK reason
      await supabase.from("card_designs").update({ active: false }).eq("id", id);
      return {
        success: true,
        message: `Wzór został oznaczony jako nieaktywny (${deleteError.message}).`,
      };
    }

    return { success: true, message: "Wzór kartki został pomyślnie usunięty." };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
