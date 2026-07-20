import type { BusyBlock, FreeSlot } from "../types";

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function durationMinutes(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}

export function overlaps(a: BusyBlock, b: BusyBlock): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Subtracts busy blocks from a [rangeStart, rangeEnd) window, returning the
 * remaining free slots in chronological order. Busy blocks may be unsorted
 * and overlapping.
 */
export function subtractBusyBlocks(
  rangeStart: Date,
  rangeEnd: Date,
  busyBlocks: BusyBlock[],
): FreeSlot[] {
  const sorted = [...busyBlocks]
    .filter((block) => block.end > rangeStart && block.start < rangeEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const freeSlots: FreeSlot[] = [];
  let cursor = rangeStart;

  for (const block of sorted) {
    const blockStart = block.start < rangeStart ? rangeStart : block.start;
    const blockEnd = block.end > rangeEnd ? rangeEnd : block.end;

    if (blockStart > cursor) {
      freeSlots.push({ start: cursor, end: blockStart });
    }
    if (blockEnd > cursor) {
      cursor = blockEnd;
    }
  }

  if (cursor < rangeEnd) {
    freeSlots.push({ start: cursor, end: rangeEnd });
  }

  return freeSlots;
}
