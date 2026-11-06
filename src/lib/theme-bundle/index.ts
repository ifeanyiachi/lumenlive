/**
 * Self-contained theme / stage-layout bundles (`.lumtheme`). See {@link ./bundle}
 * for the format and the pure build/parse boundary, {@link ./stage-refs} for
 * stage-layout media handling, and {@link ./io} for the store-facing
 * orchestration.
 *
 * The barrel deliberately re-exports only the pure boundary; `./io` (which reads
 * the stores) is imported directly from `@/lib/theme-bundle/io`, matching
 * `@/lib/schedule-bundle`.
 */

export * from "./bundle"
export * from "./stage-refs"
