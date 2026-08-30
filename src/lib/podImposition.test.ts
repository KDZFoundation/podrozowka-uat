import { describe, expect, it } from "vitest";
import {
  CURRENT_POSTCARD_PRINT_FORMAT,
  planPodImposition,
  type PodPrintFormatConfig,
} from "./podImposition";

const portraitFormat: PodPrintFormatConfig = {
  version: 1,
  print_format_id: "portrait-105x148-v1",
  sheetWidthMm: 320,
  sheetHeightMm: 450,
  netWidthMm: 105,
  netHeightMm: 148,
  bleedMm: 3,
  orientation: "portrait",
  marginsMm: { top: 6, right: 6, bottom: 6, left: 6 },
  gapsMm: { horizontal: 4, vertical: 4 },
  duplexMode: "flip_on_short_edge",
};

const items = (count: number, printFormatId = CURRENT_POSTCARD_PRINT_FORMAT.print_format_id) => (
  Array.from({ length: count }, (_, index) => ({ id: `item-${index}`, print_format_id: printFormatId }))
);

describe("planPodImposition", () => {
  it.each([
    [0, 0],
    [1, 1],
    [7, 1],
    [8, 1],
    [9, 2],
    [15, 2],
    [16, 2],
  ])("plans %i current-format items on %i sheets", (count, expectedSheets) => {
    const plan = planPodImposition(items(count), [CURRENT_POSTCARD_PRINT_FORMAT]);
    expect(plan.itemCount).toBe(count);
    expect(plan.sheetCount).toBe(expectedSheets);
    if (count > 0) {
      expect(plan.groups[0]).toMatchObject({ columns: 2, rows: 4, slotsPerSheet: 8 });
    } else {
      expect(plan.groups).toEqual([]);
    }
  });

  it("preserves the current short-edge back-slot mapping", () => {
    const group = planPodImposition(items(8), [CURRENT_POSTCARD_PRINT_FORMAT]).groups[0];
    expect(group.placements.map(({ frontSlot, backSlot }) => [frontSlot, backSlot])).toEqual([
      [0, 6], [1, 7], [2, 4], [3, 5], [4, 2], [5, 3], [6, 0], [7, 1],
    ]);
  });

  it("returns the current format geometry without changing PDF positions", () => {
    const group = planPodImposition(items(8), [CURRENT_POSTCARD_PRINT_FORMAT]).groups[0];
    expect(group).toMatchObject({
      netWidthMm: 148,
      netHeightMm: 105,
      grossWidthMm: 154,
      grossHeightMm: 111,
      columns: 2,
      rows: 4,
    });
    expect(group.placements[0].frontCoordinates).toEqual({
      artwork: { x: 6, y: 3, width: 154, height: 111 },
      trim: { x: 9, y: 6, width: 148, height: 105 },
    });
    expect(group.placements[7].frontCoordinates.artwork).toEqual({ x: 160, y: 336, width: 154, height: 111 });
    expect(group.placements[0].backCoordinates).toEqual(group.placements[6].frontCoordinates);
  });

  it("calculates a different grid from a second format configuration", () => {
    const group = planPodImposition(items(5, portraitFormat.print_format_id), [portraitFormat]).groups[0];
    expect(group).toMatchObject({
      netWidthMm: 105,
      netHeightMm: 148,
      grossWidthMm: 111,
      grossHeightMm: 154,
      columns: 2,
      rows: 2,
      slotsPerSheet: 4,
      sheetCount: 2,
    });
    expect(group.placements[1].frontCoordinates.artwork).toEqual({ x: 121, y: 6, width: 111, height: 154 });
    expect(group.placements.slice(0, 4).map(({ backSlot }) => backSlot)).toEqual([2, 3, 0, 1]);
  });

  it("mirrors columns for long-edge duplex on a portrait sheet", () => {
    const longEdgeFormat: PodPrintFormatConfig = {
      ...portraitFormat,
      print_format_id: "portrait-105x148-long-edge-v1",
      duplexMode: "flip_on_long_edge",
    };
    const group = planPodImposition(items(4, longEdgeFormat.print_format_id), [longEdgeFormat]).groups[0];
    expect(group.placements.map(({ backSlot }) => backSlot)).toEqual([1, 0, 3, 2]);
  });

  it("splits mixed physical formats into separate imposition groups", () => {
    const ordered = [
      { id: "a", print_format_id: CURRENT_POSTCARD_PRINT_FORMAT.print_format_id },
      { id: "b", print_format_id: portraitFormat.print_format_id },
      { id: "c", print_format_id: CURRENT_POSTCARD_PRINT_FORMAT.print_format_id },
    ];
    const plan = planPodImposition(ordered, [CURRENT_POSTCARD_PRINT_FORMAT, portraitFormat]);
    expect(plan.groups.map((group) => [group.printFormatId, group.placements.map((placement) => placement.item.id)])).toEqual([
      [CURRENT_POSTCARD_PRINT_FORMAT.print_format_id, ["a", "c"]],
      [portraitFormat.print_format_id, ["b"]],
    ]);
    expect(plan.groups[0].placements.map((placement) => placement.sequenceIndex)).toEqual([0, 2]);
    expect(plan.sheetCount).toBe(2);
  });

  it("does not assign duplicate front or back slots within a sheet", () => {
    const plan = planPodImposition(items(16), [CURRENT_POSTCARD_PRINT_FORMAT]);
    for (const group of plan.groups) {
      for (let sheetIndex = 0; sheetIndex < group.sheetCount; sheetIndex += 1) {
        const placements = group.placements.filter((placement) => placement.sheetIndex === sheetIndex);
        expect(new Set(placements.map((placement) => placement.frontSlot)).size).toBe(placements.length);
        expect(new Set(placements.map((placement) => placement.backSlot)).size).toBe(placements.length);
      }
    }
  });

  it("is stable for the same ordered input", () => {
    const ordered = items(9);
    expect(planPodImposition(ordered, [CURRENT_POSTCARD_PRINT_FORMAT]))
      .toEqual(planPodImposition(ordered, [CURRENT_POSTCARD_PRINT_FORMAT]));
  });
});
