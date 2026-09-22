import { PrismaClient, DiscountType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PERMISSIONS = [
  "product.read", "product.create", "product.update", "product.delete",
  "inventory.read", "inventory.adjust",
  "order.read", "order.update", "order.cancel",
  "payment.read", "payment.verify",
  "shipping.read", "shipping.create", "shipping.update",
  "customer.read",
  "promotion.create", "promotion.update",
  "bank.manage", "audit.read",
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  "Super Admin": PERMISSIONS,
  Admin: PERMISSIONS,
  Manager: ["product.read","product.create","product.update","inventory.read","inventory.adjust","order.read","order.update","payment.read","payment.verify","shipping.read","shipping.create","shipping.update","customer.read"],
  CS: ["order.read","customer.read","payment.read","shipping.read"],
  Warehouse: ["product.read","inventory.read","inventory.adjust","order.read","shipping.read","shipping.create","shipping.update"],
  Marketing: ["product.read","promotion.create","promotion.update"],
  Finance: ["order.read","payment.read","payment.verify","bank.manage"],
  Customer: [],
};

const IMG = {
  tee: "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
  teeAlt: "https://images.unsplash.com/photo-1571455786673-9d9d6c194f90?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
  hoodie: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
  hoodieAlt: "https://images.unsplash.com/photo-1564557287817-3785e38ec1f5?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
  cargo: "https://images.unsplash.com/photo-1584865288642-42078afe6942?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
  sneaker: "https://images.unsplash.com/photo-1587563871167-1ee9c731aefb?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
  sneakerAlt: "https://images.unsplash.com/photo-1626379616459-b2ce1d9decbc?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
  cap: "https://images.unsplash.com/photo-1521369909029-2afed882baee?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
  varsity: "https://images.unsplash.com/photo-1663374723561-885d23959717?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
  tote: "https://images.unsplash.com/photo-1574365569389-a10d488ca3fb?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
  hero1: "https://images.unsplash.com/photo-1613915617430-8ab0fd7c6baf?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
  hero2: "https://images.unsplash.com/photo-1603189343302-e603f7add05a?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
};

async function main() {
  console.log("Seeding Gheverhan...");

  // Clean (dev only)
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.shipmentEvent.deleteMany(),
    prisma.shipmentItem.deleteMany(),
    prisma.shipment.deleteMany(),
    prisma.paymentEvent.deleteMany(),
    prisma.paymentConfirmation.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.orderStatusHistory.deleteMany(),
    prisma.orderAddress.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.reviewImage.deleteMany(),
    prisma.reviewVote.deleteMany(),
    prisma.review.deleteMany(),
    prisma.productAnswer.deleteMany(),
    prisma.productQuestion.deleteMany(),
    prisma.recentlyViewed.deleteMany(),
    prisma.wishlistItem.deleteMany(),
    prisma.wishlist.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.cart.deleteMany(),
    prisma.inventoryMovement.deleteMany(),
    prisma.inventory.deleteMany(),
    prisma.productImage.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.product.deleteMany(),
    prisma.brand.deleteMany(),
    prisma.category.deleteMany(),
    prisma.coupon.deleteMany(),
    prisma.promotion.deleteMany(),
    prisma.bankAccount.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.customerAddress.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.user.deleteMany(),
    prisma.permission.deleteMany(),
    prisma.role.deleteMany(),
  ]);

  // Permissions + roles
  const permMap: Record<string, string> = {};
  for (const key of PERMISSIONS) {
    const p = await prisma.permission.create({ data: { key, label: key } });
    permMap[key] = p.id;
  }
  const roleMap: Record<string, string> = {};
  for (const [name, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.create({
      data: {
        name,
        label: name,
        permissions: { create: perms.map((k) => ({ permissionId: permMap[k] })) },
      },
    });
    roleMap[name] = role.id;
  }

  // Users
  const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "Admin123!", 10);
  const admin = await prisma.user.create({
    data: {
      name: "Admin Gheverhan",
      email: (process.env.ADMIN_EMAIL || "admin@gheverhan.com").toLowerCase(),
      passwordHash: adminHash,
      roles: { create: { roleId: roleMap["Super Admin"] } },
    },
  });

  const custHash = await bcrypt.hash("Customer123!", 10);
  const customer = await prisma.user.create({
    data: {
      name: "Budi Santoso",
      email: "budi@example.com",
      phone: "08123456789",
      passwordHash: custHash,
      roles: { create: { roleId: roleMap["Customer"] } },
      customer: {
        create: {
          fullName: "Budi Santoso",
          phone: "08123456789",
          addresses: {
            create: {
              recipientName: "Budi Santoso",
              phone: "08123456789",
              line: "Jl. Merdeka No. 45, RT 03 RW 05",
              city: "Jakarta Selatan",
              province: "DKI Jakarta",
              postalCode: "12140",
              isDefault: true,
            },
          },
        },
      },
      cart: { create: {} },
      wishlist: { create: {} },
    },
  });

  // Categories
  const catData = [
    { name: "Pria", slug: "pria", iconKey: "shirt", sortOrder: 1 },
    { name: "Wanita", slug: "wanita", iconKey: "shirt", sortOrder: 2 },
    { name: "Sepatu", slug: "sepatu", iconKey: "footprints", sortOrder: 3 },
    { name: "Tas", slug: "tas", iconKey: "shopping-bag", sortOrder: 4 },
    { name: "Aksesoris", slug: "aksesoris", iconKey: "watch", sortOrder: 5 },
    { name: "Outerwear", slug: "outerwear", iconKey: "layers", sortOrder: 6 },
    { name: "Celana", slug: "celana", iconKey: "move-vertical", sortOrder: 7 },
    { name: "Topi", slug: "topi", iconKey: "hard-hat", sortOrder: 8 },
    { name: "Kacamata", slug: "kacamata", iconKey: "glasses", sortOrder: 9 },
  ];
  const cats: Record<string, string> = {};
  for (const c of catData) {
    const cat = await prisma.category.create({ data: c });
    cats[c.slug] = cat.id;
  }

  // Brands
  const brandData = [
    { name: "Gheverhan", slug: "gheverhan" },
    { name: "Nordika", slug: "nordika" },
    { name: "Urbanstate", slug: "urbanstate" },
    { name: "Monokrom", slug: "monokrom" },
  ];
  const brands: Record<string, string> = {};
  for (const b of brandData) {
    const brand = await prisma.brand.create({ data: b });
    brands[b.slug] = brand.id;
  }

  // Product factory
  type P = {
    name: string; slug: string; base: number; sale?: number; cat: string; brand: string;
    images: string[]; featured?: boolean; flash?: boolean; colors: string[]; sizes: string[];
    desc: string; rating: number; reviews: number;
  };
  const products: P[] = [
    { name: "Essential Tee", slug: "essential-tee", base: 189000, sale: 129000, cat: "pria", brand: "gheverhan", images: [IMG.tee, IMG.teeAlt], featured: true, flash: true, colors: ["Hitam", "Putih"], sizes: ["S","M","L","XL"], desc: "Kaos katun premium dengan potongan reguler. Nyaman untuk gaya harian.", rating: 4.8, reviews: 320 },
    { name: "Basic Hoodie", slug: "basic-hoodie", base: 299000, sale: 229000, cat: "pria", brand: "gheverhan", images: [IMG.hoodie, IMG.hoodieAlt], featured: true, flash: true, colors: ["Abu-abu", "Hitam"], sizes: ["M","L","XL"], desc: "Hoodie fleece hangat dengan kantong kanguru dan tali serut.", rating: 4.7, reviews: 214 },
    { name: "Cargo Pants", slug: "cargo-pants", base: 279000, sale: 199000, cat: "celana", brand: "urbanstate", images: [IMG.cargo], flash: true, colors: ["Hitam", "Olive"], sizes: ["28","30","32","34"], desc: "Celana cargo dengan banyak kantong fungsional dan bahan tahan lama.", rating: 4.6, reviews: 120 },
    { name: "Canvas Sneakers", slug: "canvas-sneakers", base: 499000, sale: 359000, cat: "sepatu", brand: "nordika", images: [IMG.sneaker, IMG.sneakerAlt], featured: true, flash: true, colors: ["Putih"], sizes: ["39","40","41","42","43"], desc: "Sneakers kanvas klasik dengan sol karet yang empuk.", rating: 4.9, reviews: 532 },
    { name: "Logo Cap", slug: "logo-cap", base: 129000, sale: 89000, cat: "topi", brand: "gheverhan", images: [IMG.cap], colors: ["Hitam", "Abu-abu"], sizes: ["All Size"], desc: "Topi baseball dengan bordir logo Gheverhan.", rating: 4.9, reviews: 412 },
    { name: "Varsity Jacket", slug: "varsity-jacket", base: 399000, sale: 299000, cat: "outerwear", brand: "urbanstate", images: [IMG.varsity], featured: true, colors: ["Navy", "Hitam"], sizes: ["M","L","XL"], desc: "Jaket varsity dengan aksen kulit sintetis dan rib elastis.", rating: 4.8, reviews: 321 },
    { name: "Oversize Tee", slug: "oversize-tee", base: 229000, sale: 159000, cat: "pria", brand: "monokrom", images: [IMG.teeAlt, IMG.tee], colors: ["Putih", "Hitam"], sizes: ["M","L","XL"], desc: "Kaos oversize dengan drop shoulder untuk tampilan streetwear.", rating: 4.9, reviews: 532 },
    { name: "Relaxed Shirt", slug: "relaxed-shirt", base: 249000, sale: 189000, cat: "pria", brand: "monokrom", images: [IMG.hoodieAlt], colors: ["Hitam"], sizes: ["M","L","XL"], desc: "Kemeja lengan pendek potongan relaxed berbahan adem.", rating: 4.7, reviews: 210 },
    { name: "Wide Leg Pants", slug: "wide-leg-pants", base: 299000, sale: 219000, cat: "celana", brand: "urbanstate", images: [IMG.cargo], colors: ["Hitam"], sizes: ["28","30","32"], desc: "Celana wide leg jatuh rapi dengan pinggang elastis.", rating: 4.6, reviews: 98 },
    { name: "Everyday Tote", slug: "everyday-tote", base: 179000, sale: 149000, cat: "tas", brand: "nordika", images: [IMG.tote], colors: ["Broken White"], sizes: ["One Size"], desc: "Tote bag kanvas tebal untuk kebutuhan harian.", rating: 4.5, reviews: 76 },
  ];

  const createdProducts: { id: string; slug: string; variantIds: string[] }[] = [];
  for (const p of products) {
    const product = await prisma.product.create({
      data: {
        name: p.name,
        slug: p.slug,
        description: p.desc,
        material: "100% katun premium / bahan pilihan.",
        careInstruction: "Cuci dengan air dingin. Jangan gunakan pemutih. Jemur terbalik.",
        shippingReturn: "Pengiriman 2-4 hari kerja. Retur 7 hari untuk barang belum dipakai.",
        basePrice: p.base,
        salePrice: p.sale,
        isFeatured: !!p.featured,
        isFlashSale: !!p.flash,
        ratingAvg: p.rating,
        reviewCount: p.reviews,
        categoryId: cats[p.cat],
        brandId: brands[p.brand],
        images: { create: p.images.map((url, i) => ({ url, alt: p.name, sortOrder: i })) },
      },
    });
    const variantIds: string[] = [];
    for (const color of p.colors) {
      for (const size of p.sizes) {
        const v = await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku: `${p.slug}-${color}-${size}`.toUpperCase().replace(/[^A-Z0-9-]/g, ""),
            color,
            size,
            inventory: { create: { onHand: 25, reserved: 0 } },
          },
        });
        variantIds.push(v.id);
      }
    }
    createdProducts.push({ id: product.id, slug: p.slug, variantIds });
  }

  // Bank accounts
  await prisma.bankAccount.createMany({
    data: [
      { bankName: "BCA", accountNumber: "1234567890", accountHolder: "PT Gheverhan Indonesia", displayName: "BCA - Gheverhan", isActive: true },
      { bankName: "Mandiri", accountNumber: "9876543210", accountHolder: "PT Gheverhan Indonesia", displayName: "Mandiri - Gheverhan", isActive: true },
    ],
  });

  // Coupon + promotion
  await prisma.coupon.create({
    data: { code: "GHEVER10", discountType: DiscountType.PERCENT, discountValue: 10, minSpend: 150000, maxDiscount: 50000, isActive: true },
  });
  await prisma.promotion.create({ data: { name: "Flash Sale Diskon 40%", bannerUrl: IMG.hero1, isActive: true } });

  // Reviews for a couple of products
  const tee = createdProducts.find((c) => c.slug === "essential-tee")!;
  await prisma.review.createMany({
    data: [
      { productId: tee.id, userId: customer.id, rating: 5, title: "Bahannya adem", body: "Kaos favorit, jahitan rapi dan nyaman dipakai seharian.", status: "PUBLISHED" },
      { productId: tee.id, userId: admin.id, rating: 4, title: "Worth it", body: "Sesuai ekspektasi, ukuran pas.", status: "PUBLISHED" },
    ],
  });
  await prisma.productQuestion.create({
    data: {
      productId: tee.id, userId: customer.id, body: "Apakah bahannya menerawang?",
      answers: { create: { userId: admin.id, body: "Tidak, bahan cukup tebal dan tidak menerawang.", isOfficial: true } },
    },
  });

  // Sample paid order for the customer (with shipment)
  const sneaker = createdProducts.find((c) => c.slug === "canvas-sneakers")!;
  const bank = await prisma.bankAccount.findFirst();
  const order = await prisma.order.create({
    data: {
      orderNumber: "GHV-DEMO-0001",
      userId: customer.id,
      status: "SHIPPED",
      paymentStatus: "PAID",
      subtotal: 359000,
      shippingCost: 20000,
      discount: 0,
      total: 379000,
      items: {
        create: {
          variantId: sneaker.variantIds[0],
          productName: "Canvas Sneakers",
          variantLabel: "Putih / 42",
          imageUrl: IMG.sneaker,
          unitPrice: 359000,
          quantity: 1,
          lineTotal: 359000,
        },
      },
      address: {
        create: {
          recipientName: "Budi Santoso", phone: "08123456789",
          line: "Jl. Merdeka No. 45", city: "Jakarta Selatan", province: "DKI Jakarta", postalCode: "12140",
        },
      },
      history: {
        create: [
          { toStatus: "PENDING_PAYMENT", note: "Order dibuat" },
          { fromStatus: "PENDING_PAYMENT", toStatus: "PAID", note: "Pembayaran diverifikasi" },
          { fromStatus: "PAID", toStatus: "PROCESSING", note: "Pesanan diproses" },
          { fromStatus: "PROCESSING", toStatus: "SHIPPED", note: "Dikirim" },
        ],
      },
      payment: {
        create: {
          provider: "manual", method: "bank_transfer", amount: 379000, status: "PAID", bankAccountId: bank!.id,
          confirmations: {
            create: {
              senderBank: "BCA", senderName: "Budi Santoso", amount: 379000,
              transferDate: new Date(), proofPath: "gheverhan/demo/proof.jpg", proofMime: "image/jpeg",
              status: "APPROVED",
            },
          },
        },
      },
      shipment: {
        create: {
          provider: "manual", courier: "J&T", service: "EZ", cost: 20000,
          trackingNumber: "JT1234567890", status: "SHIPPED", shippedDate: new Date(),
          events: {
            create: [
              { status: "PROCESSING", description: "Pesanan sedang disiapkan" },
              { status: "SHIPPED", description: "Paket diserahkan ke kurir (Resi: JT1234567890)" },
            ],
          },
        },
      },
    },
  });
  console.log("Created demo order", order.orderNumber);

  console.log("Seed done. Admin:", admin.email, "| Customer: budi@example.com");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
