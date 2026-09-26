import { prisma } from "@/lib/prisma";
import { effectivePrice } from "@/lib/money";
import { available } from "@/modules/inventory/inventory.service";
import { HttpError } from "@/lib/response";

async function findCart(userId: string) {
  return prisma.cart.findUnique({ where: { userId } });
}

export async function getOrCreateCart(userId: string) {
  const existing = await findCart(userId);
  if (existing) return existing;
  return prisma.cart.create({ data: { userId } });
}

/** Server-authoritative unit price for a variant. */
function unitPriceFor(variant: {
  price: number | null;
  salePrice: number | null;
  product: { basePrice: number; salePrice: number | null };
}): number {
  if (variant.price != null) {
    return effectivePrice(variant.price, variant.salePrice);
  }
  return effectivePrice(variant.product.basePrice, variant.product.salePrice);
}

export async function getCartView(userId: string) {
  // A read of an empty cart must stay read-only. Cart creation is deferred to
  // the first mutation (add-to-cart), avoiding a DB write on every cart visit.
  // Load the cart and its lines in one relational query; the previous version
  // first loaded Cart and then issued a separate CartItem query.
  const cart = await prisma.cart.findUnique({
    where: { userId },
    select: {
      id: true,
      items: {
        select: {
          id: true,
          variantId: true,
          quantity: true,
          createdAt: true,
          variant: {
            select: {
              color: true,
              size: true,
              price: true,
              salePrice: true,
              inventory: { select: { onHand: true, reserved: true } },
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  basePrice: true,
                  salePrice: true,
                  images: {
                    select: { url: true },
                    orderBy: { sortOrder: "asc" },
                    take: 1,
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!cart) return { cartId: null, lines: [], subtotal: 0, count: 0 };

  const lines = cart.items.map((it) => {
    const unitPrice = unitPriceFor(it.variant);
    const stock = it.variant.inventory
      ? available(it.variant.inventory.onHand, it.variant.inventory.reserved)
      : 0;
    return {
      id: it.id,
      variantId: it.variantId,
      quantity: it.quantity,
      unitPrice,
      lineTotal: unitPrice * it.quantity,
      inStock: stock >= it.quantity,
      availableStock: stock,
      product: {
        id: it.variant.product.id,
        name: it.variant.product.name,
        slug: it.variant.product.slug,
        image: it.variant.product.images[0]?.url ?? null,
      },
      variantLabel: [it.variant.color, it.variant.size].filter(Boolean).join(" / ") || "Default",
    };
  });

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  return { cartId: cart.id, lines, subtotal, count };
}

export async function addItem(userId: string, variantId: string, quantity = 1) {
  const cart = await getOrCreateCart(userId);
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { inventory: true },
  });
  if (!variant) throw new HttpError("Varian tidak ditemukan", 404);

  const existing = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
  });
  const desired = (existing?.quantity ?? 0) + quantity;
  const stock = variant.inventory
    ? available(variant.inventory.onHand, variant.inventory.reserved)
    : 0;
  if (desired > stock) throw new HttpError("Stok tidak mencukupi", 409);

  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    create: { cartId: cart.id, variantId, quantity },
    update: { quantity: desired },
  });
  return getCartView(userId);
}

export async function updateItem(userId: string, itemId: string, quantity: number) {
  const cart = await findCart(userId);
  if (!cart) throw new HttpError("Keranjang tidak ditemukan", 404);

  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
    include: { variant: { include: { inventory: true } } },
  });
  if (!item) throw new HttpError("Item tidak ditemukan", 404);
  if (quantity <= 0) {
    await prisma.cartItem.delete({ where: { id: itemId } });
    return getCartView(userId);
  }
  const stock = item.variant.inventory
    ? available(item.variant.inventory.onHand, item.variant.inventory.reserved)
    : 0;
  if (quantity > stock) throw new HttpError("Stok tidak mencukupi", 409);
  await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
  return getCartView(userId);
}

export async function removeItem(userId: string, itemId: string) {
  const cart = await findCart(userId);
  if (!cart) return { cartId: null, lines: [], subtotal: 0, count: 0 };
  await prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
  return getCartView(userId);
}

export async function cartCount(userId: string): Promise<number> {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    select: { items: { select: { quantity: true } } },
  });
  return cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;
}
