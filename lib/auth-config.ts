/** Public configuration only. The secret key belongs to the server environment. */
export const authConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
