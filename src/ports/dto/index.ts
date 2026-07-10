/**
 * Callback-action tags for the Active-list inline buttons, encoded as
 * `<tag>:<reminderId>` in callback_data (≤ 64 bytes, sad §8). Shared between the
 * list handler that renders them (T6) and the router that routes them (T7/T8).
 * `SOURCE` and `DELETE` reuse the existing fired-reminder source/resolve actions.
 */
export const LIST_CALLBACK = {
  CANCEL: "cancel",
  SOURCE: "source",
  DELETE: "delete",
} as const;
