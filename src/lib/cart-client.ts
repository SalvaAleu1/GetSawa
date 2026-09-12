"use client";

export type CartItem =
  | { kind: "DOMAIN_REGISTRATION"; domain: string; years: number; privacy: boolean; autoRenew: boolean }
  | { kind: "DOMAIN_RENEWAL"; domainId: string; years: number }
  | { kind: "DOMAIN_TRANSFER"; domain: string; authCode: string }
  | { kind: "PRODUCT"; sku: string; quantity: number; domainId?: string; configuration?: Record<string, string> };

const CART_KEY = "getsawa_cart_v1";

/**
 * The cart stores customer selections/configuration but never trusted prices.
 * Server checkout validates ownership/configuration and recomputes all prices.
 */
export function getCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToCart(item: CartItem) {
  const cart = getCart();
  cart.push(item);
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function removeFromCart(index: number) {
  const cart = getCart();
  cart.splice(index, 1);
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function clearCart() {
  localStorage.removeItem(CART_KEY);
}
