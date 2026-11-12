/** RFC 7807 problem details body (application/problem+json). */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  /** Stable machine-readable error code, e.g. `INSUFFICIENT_FUNDS`. */
  code: string;
  /** Per-field validation errors (only for 400 VALIDATION_ERROR). */
  errors?: { path: string; message: string }[];
  requestId?: string;
  [extension: string]: unknown;
}

export const problemTypeFor = (code: string): string =>
  `/problems/${code.toLowerCase().replace(/_/g, '-')}`;
