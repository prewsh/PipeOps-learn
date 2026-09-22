/**
 * One place where a failed read becomes a failure.
 *
 * Supabase returns `{ data, error }` rather than throwing, and this data layer
 * used to drop the error and fall back to `[]` or `null`. A database outage,
 * an expired connection or a broken policy therefore rendered as "no modules
 * yet", "no announcements" or an empty task list — indistinguishable from the
 * legitimate empty states, and impossible to page on.
 *
 * AGENTS.md section 8: fail loudly server-side, degrade gracefully client-side.
 * These are Server Components, so throwing reaches the nearest error boundary
 * and the participant sees something went wrong, which is the truth.
 *
 * The thrown message is deliberately vague; the detail goes to the server log.
 * Never log emails, tokens, OTPs or signed URLs (AGENTS.md section 7), so only
 * the error code, the Postgres message and the caller's own label are written.
 */

type QueryError = { message: string; code?: string; details?: string | null };

/** `error` is optional so that a short-circuit like
 *  `ids.length ? await supabase… : { data: [] }` still type-checks — there was
 *  no query, so there is no error to inspect. */
type QueryResult<T> = { data: T; error?: QueryError | null };

export class DataError extends Error {
  readonly context: string;
  readonly code: string | undefined;

  constructor(context: string, cause: QueryError) {
    super(`Could not load ${context}.`);
    this.name = "DataError";
    this.context = context;
    this.code = cause.code;
  }
}

/** Returns the rows, or throws. `data` may still legitimately be null for a
 *  `.maybeSingle()` — absence is an answer, an error is not. */
export function unwrap<T>({ data, error }: QueryResult<T>, context: string): T {
  if (error) {
    console.error(
      `[data] ${context} failed: ${error.code ?? "unknown"} ${error.message}` +
        (error.details ? ` (${error.details})` : ""),
    );
    throw new DataError(context, error);
  }
  return data;
}

/** For `{ count: 'exact', head: true }` reads, where the payload is the count. */
export function unwrapCount(
  result: { count: number | null; error: QueryError | null },
  context: string,
): number {
  if (result.error) {
    console.error(
      `[data] ${context} failed: ${result.error.code ?? "unknown"} ${result.error.message}`,
    );
    throw new DataError(context, result.error);
  }
  return result.count ?? 0;
}
