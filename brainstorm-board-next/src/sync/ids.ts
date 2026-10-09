/** A board's share id: 128 random bits, URL safe. Knowing it grants access. */
export function newShareId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const isShareId = (id: string) => /^[A-Za-z0-9_-]{20,}$/.test(id);
