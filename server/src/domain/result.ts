export type Result<Value, Failure> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly failure: Failure };

export const succeed = <Value>(value: Value): Result<Value, never> => ({
  ok: true,
  value,
});

export const fail = <Failure>(failure: Failure): Result<never, Failure> => ({
  ok: false,
  failure,
});

/**
 * The Frame degrades one zone at a time: a dead Met Office should not cost you
 * the train times. Anything that renders a zone takes the Result, not the value.
 */
export const valueOr = <Value, Failure, Fallback>(
  result: Result<Value, Failure>,
  fallback: Fallback,
): Value | Fallback => (result.ok ? result.value : fallback);
