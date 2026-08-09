/** D1 rejects any statement binding more than this many parameters. */
export const D1_MAX_BOUND_PARAMS = 100;

/**
 * How many rows of a given width fit in one statement.
 *
 * Derived rather than hardcoded per call site: a batch size written against
 * today's column count silently becomes invalid the moment a column is added,
 * and the failure is a runtime error on whatever row happens to cross the cap.
 */
export function batchSizeForColumns(columns: number): number {
	return Math.max(1, Math.floor(D1_MAX_BOUND_PARAMS / columns));
}
