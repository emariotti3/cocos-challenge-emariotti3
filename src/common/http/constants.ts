/** HTTP-level constants shared by bootstrap, logging, metrics and tests. */

export const API_PREFIX = 'api';
export const API_VERSION = '1';
/** Served without the `/api/v1` prefix: operational endpoints for probes and scrapers. */
export const OPERATIONAL_ROUTES = ['health', 'health/live', 'health/ready', 'metrics'] as const;
/** Request paths that are not access-logged (probes and scrapes would drown the log). */
export const UNLOGGED_PATH_PREFIXES = ['/health', '/metrics'] as const;

/** Honored on the way in, echoed on the way out, and attached to every log line. */
export const REQUEST_ID_HEADER = 'x-request-id';
export const MAX_REQUEST_ID_LENGTH = 128;

/** `service` label on every metric and the name used by the dashboards. */
export const SERVICE_NAME = 'cocos-api';
