import { describe, expect, it } from "vitest";
import { canTransitionOrder, provisioningStatusLabel } from "@/lib/order-lifecycle";

describe("order lifecycle", () => {
  it("allows the paid fulfilment path", () => {
    expect(canTransitionOrder("PENDING_PAYMENT", "PAYMENT_CONFIRMED")).toBe(true);
    expect(canTransitionOrder("PAYMENT_CONFIRMED", "PROVISIONING")).toBe(true);
    expect(canTransitionOrder("PROVISIONING", "ACTIVE")).toBe(true);
  });

  it("allows recovery from failed fulfilment", () => {
    expect(canTransitionOrder("PROVISIONING", "FAILED")).toBe(true);
    expect(canTransitionOrder("FAILED", "PROVISIONING")).toBe(true);
  });

  it("rejects unsafe lifecycle jumps", () => {
    expect(canTransitionOrder("PENDING_PAYMENT", "ACTIVE")).toBe(false);
    expect(canTransitionOrder("REFUNDED", "ACTIVE")).toBe(false);
    expect(canTransitionOrder("ACTIVE", "PROVISIONING")).toBe(false);
  });

  it("treats repeated same-state delivery as idempotent", () => {
    expect(canTransitionOrder("PROVISIONING", "PROVISIONING")).toBe(true);
    expect(canTransitionOrder("ACTIVE", "ACTIVE")).toBe(true);
  });

  it("normalizes item fulfilment statuses", () => {
    expect(provisioningStatusLabel("PENDING")).toBe("PENDING");
    expect(provisioningStatusLabel("PROVISIONING")).toBe("PROVISIONING");
    expect(provisioningStatusLabel("PROVISIONED")).toBe("PROVISIONED");
    expect(provisioningStatusLabel("FAILED")).toBe("FAILED");
    expect(provisioningStatusLabel("UNKNOWN")).toBe("PENDING");
  });
});
