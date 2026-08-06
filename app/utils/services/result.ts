/**
 * Services return results rather than throwing, so the HTTP routes and the RPC
 * entrypoint can each map failures to their own conventions (status codes vs.
 * thrown errors) without duplicating the rules that produced them.
 */
export interface ServiceError {
	code: string;
	message: string;
	/** HTTP status the REST adapter should use. */
	status: number;
}

export type ServiceResult<T> =
	{ ok: true; data: T } | { ok: false; error: ServiceError };

export function ok<T>(data: T): ServiceResult<T> {
	return { ok: true, data };
}

export function err<T = never>(
	code: string,
	message: string,
	status: number,
): ServiceResult<T> {
	return { ok: false, error: { code, message, status } };
}

/** Map a service result onto a JSON Response. */
export function toResponse<T>(result: ServiceResult<T>, successStatus = 200) {
	if (!result.ok) {
		return Response.json(
			{ error: result.error.message, code: result.error.code },
			{ status: result.error.status },
		);
	}
	return Response.json(result.data, { status: successStatus });
}

/** Unwrap a service result for RPC callers, who expect throws. */
export function unwrap<T>(result: ServiceResult<T>): T {
	if (!result.ok) {
		const error = new Error(result.error.message);
		error.name = result.error.code;
		throw error;
	}
	return result.data;
}
