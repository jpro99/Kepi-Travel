/**
 * KEPI_DESIGN_LAW M32 — security checkpoints are permanently approximate.
 *
 * A security-screening area has no ground-truth coordinate in any public
 * indoor-mapping source (OSM tags none anywhere; Apple's IMDF standard
 * deliberately excludes the screening area as security policy). So Kepi renders
 * security as a soft "approximate area" (never a sharp pin) and shows this
 * disclaimer, verbatim and un-buried, wherever a checkpoint is the destination —
 * identically for every airport. The copy lives here as a single source of truth
 * so it can never drift, be softened, or be dropped in one place but not another.
 */

/** Short tag appended to a security marker's on-map label. */
export const SECURITY_APPROX_TAG = "approx. area";

/** Full, mandatory disclaimer shown wherever a security checkpoint is surfaced. */
export const SECURITY_APPROX_DISCLAIMER =
  "Approximate security screening area — exact checkpoint location and lane setup can change without notice. Follow posted airport signage.";
