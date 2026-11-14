/** Chat messages allowed per day (UTC), counted per IP and per signed-in wallet. Shared by the server and the landing page. */
export const CHAT_PER_DAY = 200;

/**
 * Of those, how many may use the Partner tier: its model costs about 20 times the others, so it
 * gets a smaller budget of its own. Counted per IP and per wallet too.
 */
export const PARTNER_PER_DAY = 20;
