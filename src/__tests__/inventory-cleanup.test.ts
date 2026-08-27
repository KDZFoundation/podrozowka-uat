import { describe, expect, it } from "vitest";
import { buildWarehouseCleanupPlan, type CleanupDocument } from "@/integrations/firebase/services/inventoryCleanup";

const record = (id: string, data: Record<string, unknown> = {}): CleanupDocument => ({ id, data });

describe("warehouse test-data cleanup", () => {
  it("removes the complete warehouse graph but preserves ecommerce POD data", () => {
    const plan = buildWarehouseCleanupPlan({
      stockOrders: [record("warehouse-order")],
      stockBatches: [
        record("warehouse-batch", { source_type: "stock", production_order_id: "warehouse-order" }),
        record("pod-batch", { source_type: "pod", order_id: "customer-order" }),
      ],
      inventoryUnits: [
        record("warehouse-unit", { stock_batch_id: "warehouse-batch" }),
        record("pod-unit", { stock_batch_id: "pod-batch", order_id: "customer-order" }),
      ],
      printJobs: [
        record("warehouse-job", { stock_production_order_id: "warehouse-order", stock_batch_id: "warehouse-batch" }),
        record("pod-job", { order_id: "customer-order" }),
      ],
      printJobItems: [
        record("warehouse-item", { print_job_id: "warehouse-job", inventory_unit_id: "warehouse-unit" }),
        record("pod-item", { print_job_id: "pod-job", inventory_unit_id: "pod-unit" }),
      ],
      unitEvents: [
        record("warehouse-event", { inventory_unit_id: "warehouse-unit" }),
        record("pod-event", { inventory_unit_id: "pod-unit" }),
      ],
      movements: [
        record("warehouse-movement", { inventory_unit_id: "warehouse-unit", stock_batch_id: "warehouse-batch" }),
        record("pod-movement", { inventory_unit_id: "pod-unit", stock_batch_id: "pod-batch" }),
      ],
    });

    expect(Array.from(plan.stockOrderIds)).toEqual(["warehouse-order"]);
    expect(Array.from(plan.stockBatchIds)).toEqual(["warehouse-batch"]);
    expect(Array.from(plan.inventoryUnitIds)).toEqual(["warehouse-unit"]);
    expect(Array.from(plan.printJobIds)).toEqual(["warehouse-job"]);
    expect(Array.from(plan.printJobItemIds)).toEqual(["warehouse-item"]);
    expect(Array.from(plan.unitEventIds)).toEqual(["warehouse-event"]);
    expect(Array.from(plan.movementIds)).toEqual(["warehouse-movement"]);
  });

  it("also removes orphaned warehouse orders and batches left by the former cleanup", () => {
    const plan = buildWarehouseCleanupPlan({
      stockOrders: [record("orphan-order")],
      stockBatches: [record("orphan-batch", { source_type: "stock", production_order_id: "orphan-order" })],
      inventoryUnits: [],
      printJobs: [],
      printJobItems: [],
      unitEvents: [],
      movements: [],
    });

    expect(plan.stockOrderIds.has("orphan-order")).toBe(true);
    expect(plan.stockBatchIds.has("orphan-batch")).toBe(true);
    expect(plan.inventoryUnitIds.size).toBe(0);
  });
});
