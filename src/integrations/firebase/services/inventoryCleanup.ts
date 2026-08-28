export interface CleanupDocument {
  id: string;
  data: Record<string, unknown>;
}

export interface InventoryCleanupDocuments {
  stockOrders: CleanupDocument[];
  stockBatches: CleanupDocument[];
  inventoryUnits: CleanupDocument[];
  printJobs: CleanupDocument[];
  printJobItems: CleanupDocument[];
  unitEvents: CleanupDocument[];
  movements: CleanupDocument[];
}

export interface InventoryCleanupPlan {
  stockOrderIds: Set<string>;
  stockBatchIds: Set<string>;
  inventoryUnitIds: Set<string>;
  printJobIds: Set<string>;
  printJobItemIds: Set<string>;
  unitEventIds: Set<string>;
  movementIds: Set<string>;
}

const stringValue = (value: unknown) => typeof value === "string" ? value : "";

/**
 * Selects the complete Firestore graph created by internal warehouse orders.
 * Online POD batches and their units are deliberately excluded.
 */
export const buildWarehouseCleanupPlan = (documents: InventoryCleanupDocuments): InventoryCleanupPlan => {
  const stockOrderIds = new Set(documents.stockOrders.map((item) => item.id));
  const stockBatchIds = new Set(
    documents.stockBatches
      .filter((item) => (
        stringValue(item.data.source_type).toLowerCase() === "stock"
        || stockOrderIds.has(stringValue(item.data.production_order_id))
      ))
      .map((item) => item.id),
  );
  const inventoryUnitIds = new Set(
    documents.inventoryUnits
      .filter((item) => stockBatchIds.has(stringValue(item.data.stock_batch_id)))
      .map((item) => item.id),
  );
  const printJobIds = new Set(
    documents.printJobs
      .filter((item) => (
        stockOrderIds.has(stringValue(item.data.stock_production_order_id))
        || stockBatchIds.has(stringValue(item.data.stock_batch_id))
      ))
      .map((item) => item.id),
  );
  const printJobItemIds = new Set(
    documents.printJobItems
      .filter((item) => (
        printJobIds.has(stringValue(item.data.print_job_id))
        || inventoryUnitIds.has(stringValue(item.data.inventory_unit_id))
      ))
      .map((item) => item.id),
  );
  const unitEventIds = new Set(
    documents.unitEvents
      .filter((item) => inventoryUnitIds.has(stringValue(item.data.inventory_unit_id)))
      .map((item) => item.id),
  );
  const movementIds = new Set(
    documents.movements
      .filter((item) => (
        inventoryUnitIds.has(stringValue(item.data.inventory_unit_id))
        || stockBatchIds.has(stringValue(item.data.stock_batch_id))
      ))
      .map((item) => item.id),
  );

  return {
    stockOrderIds,
    stockBatchIds,
    inventoryUnitIds,
    printJobIds,
    printJobItemIds,
    unitEventIds,
    movementIds,
  };
};
