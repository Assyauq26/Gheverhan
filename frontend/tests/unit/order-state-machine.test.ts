import { describe, it, expect } from "vitest";
import { canTransitionOrder, ORDER_TRANSITIONS } from "@/modules/orders/domain/state-machine";

describe("order state machine", () => {
  it("allows the happy path", () => {
    expect(canTransitionOrder("PENDING_PAYMENT", "PAID")).toBe(true);
    expect(canTransitionOrder("PAID", "PROCESSING")).toBe(true);
    expect(canTransitionOrder("PROCESSING", "PACKED")).toBe(true);
    expect(canTransitionOrder("PACKED", "SHIPPED")).toBe(true);
    expect(canTransitionOrder("SHIPPED", "DELIVERED")).toBe(true);
    expect(canTransitionOrder("DELIVERED", "COMPLETED")).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransitionOrder("PENDING_PAYMENT", "SHIPPED")).toBe(false);
    expect(canTransitionOrder("COMPLETED", "PENDING_PAYMENT")).toBe(false);
    expect(canTransitionOrder("PAID", "DELIVERED")).toBe(false);
  });

  it("supports exception states", () => {
    expect(canTransitionOrder("PENDING_PAYMENT", "EXPIRED")).toBe(true);
    expect(canTransitionOrder("PROCESSING", "CANCELLED")).toBe(true);
    expect(canTransitionOrder("SHIPPED", "REFUNDED")).toBe(true);
  });

  it("keeps terminal states terminal", () => {
    expect(ORDER_TRANSITIONS.COMPLETED).toEqual([]);
    expect(ORDER_TRANSITIONS.EXPIRED).toEqual([]);
    expect(ORDER_TRANSITIONS.REFUNDED).toEqual([]);
  });
});
