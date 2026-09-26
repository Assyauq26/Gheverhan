"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { runAction } from "@/lib/action";
import * as cart from "./cart.service";

export async function addToCartAction(variantId: string, quantity = 1) {
  return runAction(async () => {
    const user = await requireUser();
    const view = await cart.addItem(user.id, variantId, quantity);
    // Keep the server-rendered cart badge correct after a quick add. The
    // client action already receives the updated cart view, so quantity
    // updates/removals below do not need another cache invalidation.
    revalidatePath("/(storefront)", "layout");
    return view;
  });
}

export async function updateCartItemAction(itemId: string, quantity: number) {
  return runAction(async () => {
    const user = await requireUser();
    return cart.updateItem(user.id, itemId, quantity);
  });
}

export async function removeCartItemAction(itemId: string) {
  return runAction(async () => {
    const user = await requireUser();
    return cart.removeItem(user.id, itemId);
  });
}
