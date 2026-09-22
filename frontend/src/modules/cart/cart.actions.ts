"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { runAction } from "@/lib/action";
import * as cart from "./cart.service";

export async function addToCartAction(variantId: string, quantity = 1) {
  return runAction(async () => {
    const user = await requireUser();
    const view = await cart.addItem(user.id, variantId, quantity);
    revalidatePath("/cart");
    revalidatePath("/(storefront)", "layout");
    return view;
  });
}

export async function updateCartItemAction(itemId: string, quantity: number) {
  return runAction(async () => {
    const user = await requireUser();
    const view = await cart.updateItem(user.id, itemId, quantity);
    revalidatePath("/cart");
    return view;
  });
}

export async function removeCartItemAction(itemId: string) {
  return runAction(async () => {
    const user = await requireUser();
    const view = await cart.removeItem(user.id, itemId);
    revalidatePath("/cart");
    return view;
  });
}
