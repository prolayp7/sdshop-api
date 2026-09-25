import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { seedProducts } from './seed-products';

const prisma = new PrismaClient();

async function main() {
  // Roles & permissions
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'Super Admin' },
    update: {},
    create: { name: 'Super Admin', description: 'Full access to every admin capability' },
  });

  const permissionKeys = [
    'products.manage',
    'orders.manage',
    'orders.refund',
    'content.manage',
    'settings.manage',
    'reports.view',
    'customers.manage',
    'media.manage',
    'shipping.manage',
    'admins.manage',
    'marketing.manage',
    'reviews.moderate',
    'gift_cards.manage',
    'notifications.manage',
  ];
  for (const key of permissionKeys) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: superAdminRole.id, permissionId: permission.id },
    });
  }

  // Super Admin user
  const seedAdminEmail = process.env.SEED_ADMIN_EMAIL ?? 'superadmin@ukshop.test';
  const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const existingSuperAdmin = await prisma.adminUser.findFirst({
    where: { email: seedAdminEmail, deletedAt: null },
  });
  if (!existingSuperAdmin) {
    const passwordHash = await bcrypt.hash(seedAdminPassword, 10);
    await prisma.adminUser.create({
      data: {
        email: seedAdminEmail,
        passwordHash,
        name: 'Super Admin',
        roleId: superAdminRole.id,
      },
    });
  }

  // Product conditions
  const conditionTitles = ['New', 'Refurbished', 'Open Box', 'Used'];
  for (const title of conditionTitles) {
    await prisma.productCondition.upsert({
      where: { slug: title.toLowerCase().replace(/\s+/g, '-') },
      update: {},
      create: { title, slug: title.toLowerCase().replace(/\s+/g, '-') },
    });
  }

  // Tax rates
  const standardVat = await prisma.taxRate.upsert({
    where: { title: 'Standard' },
    update: {},
    create: { title: 'Standard', ratePercent: 20.0, isDefault: true },
  });
  await prisma.taxRate.upsert({
    where: { title: 'Reduced' },
    update: {},
    create: { title: 'Reduced', ratePercent: 5.0 },
  });
  await prisma.taxRate.upsert({
    where: { title: 'Zero-rated' },
    update: {},
    create: { title: 'Zero-rated', ratePercent: 0.0 },
  });

  // Shipping methods
  const royalMailExisting = await prisma.shippingMethod.findFirst({ where: { title: 'Royal Mail Tracked 48' } });
  if (!royalMailExisting) {
    await prisma.shippingMethod.create({
      data: {
        title: 'Royal Mail Tracked 48',
        carrier: 'Royal Mail',
        rateType: 'FLAT',
        flatRate: 4.99,
        freeOverAmount: 75,
        estimatedDaysMin: 2,
        estimatedDaysMax: 3,
      },
    });
  }
  const dhlExisting = await prisma.shippingMethod.findFirst({ where: { title: 'DHL Next Day' } });
  if (!dhlExisting) {
    await prisma.shippingMethod.create({
      data: {
        title: 'DHL Next Day',
        carrier: 'DHL',
        rateType: 'FLAT',
        flatRate: 9.99,
        estimatedDaysMin: 1,
        estimatedDaysMax: 1,
      },
    });
  }

  // Category tree (subset from requirement.md)
  // Note: Category.slug is no longer a Prisma `@unique` field (it's enforced via a
  // partial unique index scoped to live rows instead, so soft-deleted slugs can be
  // reused - see the schema_review_fixes migration), so it can't be used in an
  // `upsert`/`findUnique` where-clause. Fall back to findFirst + conditional create.
  const findOrCreateCategory = (where: { slug: string }, create: Parameters<typeof prisma.category.create>[0]['data']) =>
    prisma.category.findFirst({ where: { ...where, deletedAt: null } }).then((existing) =>
      existing ?? prisma.category.create({ data: create }),
    );

  const memoryCards = await findOrCreateCategory(
    { slug: 'memory-cards' },
    { title: 'Memory Cards', slug: 'memory-cards', sortOrder: 1 },
  );
  const accessories = await findOrCreateCategory(
    { slug: 'accessories' },
    { title: 'Accessories', slug: 'accessories', sortOrder: 2 },
  );
  for (const [index, [title, slug]] of ([
    ['SD Cards', 'sd-cards'],
    ['microSD Cards', 'microsd-cards'],
    ['CF Cards', 'cf-cards'],
    ['CFexpress Cards', 'cfexpress-cards'],
  ] as const).entries()) {
    await findOrCreateCategory({ slug }, { title, slug, parentId: memoryCards.id, sortOrder: index + 1 });
  }
  for (const [index, [title, slug]] of ([
    ['Card Readers', 'card-readers'],
    ['Card Adapters', 'card-adapters'],
    ['Card Cases', 'card-cases'],
    ['USB Flash Drives', 'usb-flash-drives'],
  ] as const).entries()) {
    await findOrCreateCategory({ slug }, { title, slug, parentId: accessories.id, sortOrder: index + 1 });
  }

  // Brands
  for (const title of [
    'SanDisk',
    'Samsung',
    'Kingston',
    'Lexar',
    'Sony',
    'PNY',
    'Transcend',
    'Western Digital',
    'ProGrade Digital',
    'Delkin Devices',
    'Integral',
    'Toshiba',
  ]) {
    await prisma.brand.upsert({
      where: { slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') },
      update: { title, status: 'ACTIVE' },
      create: { title, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') },
    });
  }

  // Suppliers
  const suppliers = [
    { title: 'TD SYNNEX UK', slug: 'td-synnex-uk', description: 'UK technology distributor for hardware, software, and cloud products.' },
    { title: 'Ingram Micro UK', slug: 'ingram-micro-uk', description: 'Technology product and supply-chain distributor.' },
    { title: 'Exertis UK', slug: 'exertis-uk', description: 'UK distributor for computing, components, and consumer technology.' },
    { title: 'CMS Distribution', slug: 'cms-distribution', description: 'Specialist distributor for business and consumer technologies.' },
    { title: 'Westcoast', slug: 'westcoast', description: 'UK distributor for computing hardware, software, and services.' },
  ];
  for (const supplier of suppliers) {
    await prisma.supplier.upsert({
      where: { slug: supplier.slug },
      update: { title: supplier.title, description: supplier.description, status: 'ACTIVE' },
      create: supplier,
    });
  }

  /* // Demo product + variant (superseded by the complete 620-product catalogue seed)
  // Product.slug and ProductVariant.slug are likewise no longer `@unique` (same partial-index
  // reasoning as Category.slug above), so use findFirst-or-create here too.
  const graphicsCards = await prisma.category.findFirstOrThrow({ where: { slug: 'graphics-cards' } });
  const nvidia = await prisma.brand.findUniqueOrThrow({ where: { slug: 'nvidia' } });
  const newCondition = await prisma.productCondition.findUniqueOrThrow({ where: { slug: 'new' } });
  const demoProduct = await prisma.product.findFirst({ where: { slug: 'nvidia-geforce-rtx-4070' } }).then(
    (existing) =>
      existing ??
      prisma.product.create({
        data: {
          categoryId: graphicsCards.id,
          brandId: nvidia.id,
          productConditionId: newCondition.id,
          taxRateId: standardVat.id,
          title: 'NVIDIA GeForce RTX 4070',
          slug: 'nvidia-geforce-rtx-4070',
          shortDescription: '12GB GDDR6X graphics card',
          status: 'ACTIVE',
        },
      }),
  );
  const demoVariantExisting = await prisma.productVariant.findFirst({ where: { slug: 'nvidia-geforce-rtx-4070-12gb' } });
  if (!demoVariantExisting) {
    await prisma.productVariant.create({
      data: {
        productId: demoProduct.id,
        title: '12GB',
        slug: 'nvidia-geforce-rtx-4070-12gb',
        price: 549.99,
        stockQty: 25,
        isDefault: true,
      },
    });
  }
  */

  const productSeedResult = await seedProducts(prisma);
  console.log(
    `Product catalogue: ${productSeedResult.products} products across ${productSeedResult.categories} categories ` +
      `(${productSeedResult.created} created, ${productSeedResult.updated} updated).`,
  );

  // Settings
  await prisma.setting.upsert({
    where: { key: 'default_vat_rate_percent' },
    update: {},
    create: { key: 'default_vat_rate_percent', value: 20 },
  });
  await prisma.setting.upsert({
    where: { key: 'allowed_shipping_countries' },
    update: {},
    create: { key: 'allowed_shipping_countries', value: ['GB'] },
  });

  // Header menu
  const headerMenu = await prisma.menu.upsert({
    where: { slug: 'header' },
    update: {},
    create: { name: 'Header', slug: 'header', location: 'HEADER' },
  });
  const existingMemoryCardsItem = await prisma.menuItem.findFirst({
    where: { menuId: headerMenu.id, label: 'Memory Cards' },
  });
  if (!existingMemoryCardsItem) {
    await prisma.menuItem.create({
      data: { menuId: headerMenu.id, label: 'Memory Cards', categoryId: memoryCards.id, sortOrder: 1 },
    });
  }

  // Footer menu - link columns, admin-editable (column titles are top-level
  // items, their links are child items). Only created when missing so admin
  // edits survive re-seeding.
  const footerMenu = await prisma.menu.upsert({
    where: { slug: 'footer' },
    update: {},
    create: { name: 'Footer', slug: 'footer', location: 'FOOTER' },
  });
  if ((await prisma.menuItem.count({ where: { menuId: footerMenu.id } })) === 0) {
    const footerColumns: { title: string; links: { label: string; href: string }[] }[] = [
    { title: 'Shop by Category', links: [{ label: 'SD Cards (UHS-I & UHS-II)', href: '/category?cat=SD%20Cards' }, { label: 'microSD Cards', href: '/category?cat=microSD%20Cards' }, { label: 'CFexpress Type A & B', href: '/category?cat=CFexpress%20Cards' }, { label: 'Cinema SSD & Enclosures', href: '/category?q=SSD' }, { label: 'Card Readers & Hubs', href: '/category?cat=Card%20Readers' }, { label: 'Adapters & Accessories', href: '/category?cat=Card%20Adapters' }, { label: 'All Products', href: '/category' }] },
    { title: 'Trade & Pro', links: [{ label: 'Pro Account', href: '/account' }, { label: 'Creator Deals', href: '/category?deals=1' }, { label: 'Bulk & Studio Orders', href: '/pages/bulk-orders' }, { label: 'Corporate Inquiries', href: '/pages/corporate-inquiries' }, { label: 'GST Invoice Support', href: '/pages/gst-invoicing' }, { label: 'Express Dispatch', href: '/pages/shipping' }] },
    { title: 'Customer Support', links: [{ label: 'Track Your Order', href: '/account?tab=orders' }, { label: 'Returns & Refunds', href: '/pages/returns' }, { label: 'Warranty & Service', href: '/pages/warranty' }, { label: 'Delivery Information', href: '/pages/shipping' }, { label: 'Frequently Asked Questions', href: '/faqs' }, { label: 'Contact Support', href: '/pages/contact' }] },
    { title: 'Guides & Tools', links: [{ label: 'Buying Guides', href: '/blog' }, { label: 'Compare Products', href: '/compare' }, { label: 'Find V90 SD Cards', href: '/category?q=V90' }, { label: 'CFexpress Finder', href: '/category?q=CFexpress' }, { label: 'Choose a Card Reader', href: '/category?q=reader' }, { label: 'Storage FAQs', href: '/faqs' }] },
    ];
    for (const [columnIndex, column] of footerColumns.entries()) {
      const parent = await prisma.menuItem.create({ data: { menuId: footerMenu.id, label: column.title, sortOrder: columnIndex + 1 } });
      for (const [linkIndex, link] of column.links.entries()) {
        await prisma.menuItem.create({ data: { menuId: footerMenu.id, parentId: parent.id, label: link.label, href: link.href, sortOrder: linkIndex + 1 } });
      }
    }
  }

  // Homepage merchandising - demo content so the storefront home page has
  // something real to render (Day 6 will replace this with production content
  // entered through the admin panel).
  //
  // Hero slides drive the bytevex storefront's hero carousel (formerly a
  // hardcoded SLIDES array in designs/bytevex/Hero.tsx) - reseed with content
  // matching that hardcoded array exactly (only if still at the stale
  // PC-parts placeholder from initial bootstrap) so the storefront looks
  // identical until an admin actually edits a slide.
  const oldPlaceholderSlide = await prisma.heroSlide.findFirst({ where: { headline: 'Radeon RX 9070 XT graphics, ready to perform' } });
  const heroSlideCount = await prisma.heroSlide.count();
  if (heroSlideCount === 0 || oldPlaceholderSlide) {
    if (oldPlaceholderSlide) await prisma.heroSlide.deleteMany({});
    await prisma.heroSlide.createMany({
      data: [
        { eyebrow: 'NEW GEN PRO MEDIA · BUILT FOR CREATORS', headline: 'Sustained speed.', headlineHighlight: 'Zero dropped frames.', subheading: 'Choose memory cards by format, capacity and speed class. Find dependable media for cameras, drones and demanding creative workflows.', ctaLabel: 'Shop SD cards', ctaUrl: '/category?cat=SD%20Cards', secondaryCtaLabel: 'Find a card for your device', secondaryCtaUrl: '#device-finder', showcaseLabel: 'PRO MEDIA / CAMERA READY', badgeLabel: 'ULTRA PRO', metrics: [{ label: 'FORMAT', value: 'SD · microSD' }, { label: 'SPEED CLASS', value: 'V30 — V90' }, { label: 'CAPACITY', value: '64 GB — 1 TB' }, { label: 'WORKFLOW', value: '4K · 8K' }], productName: 'BYTEVEX Ultra Pro 256GB', productSubline: 'Built for uninterrupted capture.', specs: ['256 GB', 'V30 · A2', '4K READY'], visualKind: 'sd', visualCapacity: '256', visualRating: 'V30 · A2', visualCompanionKind: 'micro', visualCompanionCapacity: '128', sortOrder: 1 },
        { eyebrow: 'COMPACT FORMAT · SERIOUS PERFORMANCE', headline: 'Small card.', headlineHighlight: 'Big possibilities.', subheading: 'Reliable microSD media for drones, action cameras and handheld devices. Choose the capacity and speed your next shoot demands.', ctaLabel: 'Shop microSD cards', ctaUrl: '/category?cat=microSD%20Cards', secondaryCtaLabel: 'Find a card for your device', secondaryCtaUrl: '#device-finder', showcaseLabel: 'PRO MEDIA / CAMERA READY', badgeLabel: 'ULTRA PRO', metrics: [{ label: 'FORMAT', value: 'microSDXC' }, { label: 'SPEED CLASS', value: 'V30 · A2' }, { label: 'CAPACITY', value: '128 GB — 1 TB' }, { label: 'WORKFLOW', value: 'DRONE · ACTION' }], productName: 'BYTEVEX microSD Ultra 256GB', productSubline: 'Capture more from every angle.', specs: ['256 GB', 'V30 · A2', '4K READY'], visualKind: 'micro', visualCapacity: '256', visualRating: 'V30 · A2', visualCompanionKind: 'sd', visualCompanionCapacity: '128', sortOrder: 2 },
        { eyebrow: 'PRO WORKFLOWS · HIGH-BITRATE READY', headline: 'Keep rolling.', headlineHighlight: 'At full speed.', subheading: 'Move into demanding cinema and mirrorless workflows with high-throughput CFexpress media built for long takes and fast transfers.', ctaLabel: 'Shop CFexpress', ctaUrl: '/category?cat=CFexpress%20Cards', secondaryCtaLabel: 'Find a card for your device', secondaryCtaUrl: '#device-finder', showcaseLabel: 'PRO MEDIA / CAMERA READY', badgeLabel: 'ULTRA PRO', metrics: [{ label: 'FORMAT', value: 'CFexpress' }, { label: 'RATING', value: 'VPG 400' }, { label: 'CAPACITY', value: '256 · 512 GB' }, { label: 'WORKFLOW', value: 'CINEMA · RAW' }], productName: 'BYTEVEX CFexpress Pro 512GB', productSubline: 'Made for demanding capture.', specs: ['512 GB', 'VPG 400', 'RAW READY'], visualKind: 'cf', visualCapacity: '512', visualRating: 'VPG 400', visualCompanionKind: 'cf', visualCompanionCapacity: '256', sortOrder: 3 },
        { eyebrow: 'FROM CAMERA TO EDIT · WITHOUT WAITING', headline: 'Finish the shot.', headlineHighlight: 'Keep the flow.', subheading: 'Pair your cards with fast, dependable readers and spend less time moving files between camera, studio and edit suite.', ctaLabel: 'Shop card readers', ctaUrl: '/category?cat=Card%20Readers%20%26%20Hubs', secondaryCtaLabel: 'Find a card for your device', secondaryCtaUrl: '#device-finder', showcaseLabel: 'PRO MEDIA / CAMERA READY', badgeLabel: 'READER PRO', metrics: [{ label: 'FORMAT', value: 'MULTI-CARD' }, { label: 'INTERFACE', value: 'USB-C' }, { label: 'TRANSFER', value: '10 GB/S' }, { label: 'WORKFLOW', value: 'INGEST · EDIT' }], productName: 'BYTEVEX Reader Pro', productSubline: 'Get to the edit faster.', specs: ['USB-C', '10 Gb/s', 'PRO INGEST'], visualKind: 'reader', visualCapacity: 'USB-C', visualRating: '10 Gb/s', visualCompanionKind: 'sd', visualCompanionCapacity: '256', sortOrder: 4 },
      ],
    });
  }
  const oldPlaceholderBadge = await prisma.heroTrustBadge.findFirst({ where: { label: 'Free UK next-day delivery' } });
  const heroBadgeCount = await prisma.heroTrustBadge.count();
  if (heroBadgeCount === 0 || oldPlaceholderBadge) {
    if (oldPlaceholderBadge) await prisma.heroTrustBadge.deleteMany({});
    await prisma.heroTrustBadge.createMany({
      data: [
        { label: 'Format-first shopping', icon: 'shield-check', sortOrder: 1 },
        { label: 'Clear product specifications', icon: 'package-check', sortOrder: 2 },
        { label: 'Help choosing media', icon: 'headphones', sortOrder: 3 },
        { label: 'Delivery options at checkout', icon: 'truck', sortOrder: 4 },
      ],
    });
  }

  const findOrCreateBanner = (slug: string, create: Parameters<typeof prisma.banner.create>[0]['data']) =>
    prisma.banner.findFirst({ where: { slug } }).then((existing) => existing ?? prisma.banner.create({ data: create }));
  await findOrCreateBanner('home-memory-cards', {
    title: 'Memory Cards', slug: 'home-memory-cards', linkType: 'CATEGORY', categoryId: memoryCards.id, position: 'home-top', displayOrder: 1,
  });
  await findOrCreateBanner('home-accessories', {
    title: 'Accessories', slug: 'home-accessories', linkType: 'CATEGORY', categoryId: accessories.id, position: 'home-top', displayOrder: 2,
  });

  const findOrCreateFeaturedSection = (slug: string, create: Parameters<typeof prisma.featuredSection.create>[0]['data']) =>
    prisma.featuredSection.findFirst({ where: { slug } }).then((existing) => existing ?? prisma.featuredSection.create({ data: create }));
  await findOrCreateFeaturedSection('new-arrivals', { title: 'New Arrivals', slug: 'new-arrivals', sectionType: 'NEWLY_ADDED', sortOrder: 1 });
  await findOrCreateFeaturedSection('best-sellers', { title: 'Best Sellers', slug: 'best-sellers', sectionType: 'BEST_SELLER', sortOrder: 2 });
  await findOrCreateFeaturedSection('top-rated', { title: 'Top Rated', slug: 'top-rated', sectionType: 'TOP_RATED', sortOrder: 3 });

  // Homepage section ordering/visibility - seeded to match the storefront's
  // existing default layout so nothing moves visually until an admin
  // reorders or hides something from the admin panel.
  const homepageSectionCount = await prisma.homepageSection.count();
  if (homepageSectionCount === 0) {
    await prisma.homepageSection.createMany({
      data: [
        { type: 'HERO', label: 'Hero carousel', sortOrder: 0, config: { cards: [
          { kicker: 'Save up to £220', heading: 'Weekend component deals', description: 'CPUs, memory kits and NVMe drives reduced until Sunday midnight.', ctaLabel: 'See all deals', href: '/category?deals=1', image: '/images/products/Vengeance DDR5 RGB Memory Modules.webp' },
          { kicker: 'Build service', heading: 'Custom PC configurator', description: 'Pick parts with compatibility checks and wattage estimates.', ctaLabel: 'Start a build', href: '/category?cat=Computers', image: '/images/products/NZXT H5 Flow RGB Showcase.webp' },
        ] } },
        { type: 'TRUST_STRIP', label: 'Trust strip', sortOrder: 1 },
        { type: 'DEALS', label: "Today's deals", sortOrder: 2 },
        { type: 'FEATURED_PRODUCTS', label: 'Best sellers', sortOrder: 3, config: { slug: 'best-sellers' } },
        { type: 'NEW_ARRIVALS', label: 'New arrivals', sortOrder: 4 },
        { type: 'BRANDS', label: 'Shop by brand', sortOrder: 5 },
        { type: 'BANNERS', label: 'Promotional banners', sortOrder: 6, config: { position: 'home-top' } },
        { type: 'TESTIMONIALS', label: 'Customer testimonials', sortOrder: 7 },
        { type: 'BLOG_HIGHLIGHTS', label: 'Latest from the blog', sortOrder: 8 },
        { type: 'FAQS', label: 'Frequently asked questions', sortOrder: 9 },
        { type: 'NEWSLETTER', label: 'Newsletter signup', sortOrder: 10, config: { heading: 'Get restock alerts & deal notifications', body: 'One email a week, mostly about stock drops and price cuts. No spam.' } },
      ],
    });
  }
  // bytevex's hero dispatch bar + trust line moved from hardcoded JSX into
  // the HERO section's config - merge these keys into the existing row
  // (created above, or from an earlier seed run) without touching `cards`.
  const heroSection = await prisma.homepageSection.findFirst({ where: { type: 'HERO' } });
  if (heroSection && (heroSection.config as Record<string, unknown> | null)?.dispatchText === undefined) {
    await prisma.homepageSection.update({
      where: { id: heroSection.id },
      data: { config: { ...(heroSection.config as object), dispatchEnabled: true, dispatchText: 'Performance media for every capture', dispatchDescription: 'Explore SD, microSD, CFexpress and high-speed readers.', trustLine: 'TRUSTED BY CREATORS. ENGINEERED FOR MORE.' } },
    });
  }

  // Added in a follow-up batch, once these types existed - findFirst-or-
  // create per type (rather than another count()===0 guard) so this runs
  // safely against a DB that already has the first 11 rows seeded.
  const findOrCreateHomepageSection = (type: Parameters<typeof prisma.homepageSection.create>[0]['data']['type'], data: Omit<Parameters<typeof prisma.homepageSection.create>[0]['data'], 'type'>) =>
    prisma.homepageSection.findFirst({ where: { type } }).then((existing) => existing ?? prisma.homepageSection.create({ data: { type, ...data } }));
  await findOrCreateHomepageSection('CATEGORY_SHOWCASE', { label: 'Shop by category', sortOrder: 11 });
  await findOrCreateHomepageSection('SHOP_BY_NEED', { label: 'Shop by need', sortOrder: 12 });
  await findOrCreateHomepageSection('GAMING_SHOWCASE', { label: 'Level up your gaming', sortOrder: 13 });
  await findOrCreateHomepageSection('LAPTOP_SHOWCASE', { label: 'Laptops for work, study & play', sortOrder: 14 });
  await findOrCreateHomepageSection('BUYING_GUIDES', { label: 'Buying guides', sortOrder: 15 });
  await findOrCreateHomepageSection('SEO_INTRO', { label: 'SEO intro & special offer', sortOrder: 16 });

  // Blog & static CMS pages - demo content for the storefront's content pages.
  const blogCategory = await prisma.blogCategory.upsert({
    where: { slug: 'buying-guides' },
    update: {},
    create: { title: 'Buying Guides', slug: 'buying-guides' },
  });
  const author = await prisma.author.findFirst({ where: { name: 'UK Computer Shop Team' } }).then((existing) =>
    existing ?? prisma.author.create({ data: { name: 'UK Computer Shop Team', role: 'Editorial' } }),
  );
  const findOrCreateBlogPost = (slug: string, create: Parameters<typeof prisma.blogPost.create>[0]['data']) =>
    prisma.blogPost.findFirst({ where: { slug } }).then((existing) => existing ?? prisma.blogPost.create({ data: create }));
  await findOrCreateBlogPost('choosing-your-first-graphics-card', {
    title: 'Choosing your first graphics card',
    slug: 'choosing-your-first-graphics-card',
    excerpt: 'A plain-English guide to VRAM, wattage and what actually matters for 1080p and 1440p gaming.',
    content:
      'Picking a graphics card can feel overwhelming with so many model numbers and marketing terms flying around. Start with your monitor: its resolution and refresh rate tell you roughly how much GPU power you need.\n\nFor 1080p at 60Hz, a mid-range card is plenty. For 1440p or high-refresh gaming, look at cards with more VRAM and a higher power draw - just make sure your power supply can keep up.\n\nCheck the recommended PSU wattage on the product page before you buy, and use our compatibility checks on the product page to confirm your case and power supply will work together.',
    blogCategoryId: blogCategory.id,
    authorId: author.id,
    status: 'PUBLISHED',
    publishedAt: new Date(),
    isFeatured: true,
  });
  await findOrCreateBlogPost('building-a-quiet-pc', {
    title: 'Building a quiet PC without sacrificing performance',
    slug: 'building-a-quiet-pc',
    excerpt: 'Case airflow, fan curves and cooler choice - the three things that actually determine how loud your PC is.',
    content:
      'A quiet PC comes down to three things: case airflow, fan quality, and how hard your components have to work to stay cool.\n\nStart with a case that has good airflow rather than the most RGB. Pair it with larger, slower-spinning fans rather than small fast ones - bigger fans move the same air at a lower pitch.\n\nFinally, a well-sized cooler for your CPU means your fans rarely need to spin up in the first place.',
    blogCategoryId: blogCategory.id,
    authorId: author.id,
    status: 'PUBLISHED',
    publishedAt: new Date(),
  });

  const findOrCreatePage = (slug: string, create: Parameters<typeof prisma.page.create>[0]['data']) =>
    prisma.page.findFirst({ where: { slug } }).then((existing) => existing ?? prisma.page.create({ data: create }));
  await findOrCreatePage('about-us', {
    slug: 'about-us',
    title: 'About UK Computer Shop',
    status: 'PUBLISHED',
    contentBlocks: 'We are an independent UK retailer based in Manchester, building and shipping PCs and components since day one.\n\nOur warehouse and workshop are open Monday to Saturday, and our team tests every custom build before it ships.',
  });

  // Homepage FAQ section - was PC-parts placeholder content; bytevex's
  // homepage FAQ cards now read live from this category (was previously a
  // hardcoded array in designs/bytevex/Home.tsx), so reseed with content
  // matching the real BYTEVEX business (only if still at the old placeholder).
  const oldFaqCategory = await prisma.faqCategory.findFirst({ where: { name: 'Delivery & Returns' } });
  const deliveryFaqCategory = oldFaqCategory
    ? await prisma.faqCategory.update({ where: { id: oldFaqCategory.id }, data: { name: 'Help & Technical Inquiries' } })
    : await prisma.faqCategory.findFirst({ where: { name: 'Help & Technical Inquiries' } }).then((existing) =>
      existing ?? prisma.faqCategory.create({ data: { name: 'Help & Technical Inquiries', sortOrder: 1 } }),
    );
  const faqCount = await prisma.faq.count({ where: { faqCategoryId: deliveryFaqCategory.id } });
  if (faqCount === 0 || oldFaqCategory) {
    if (oldFaqCategory) await prisma.faq.deleteMany({ where: { faqCategoryId: deliveryFaqCategory.id } });
    await prisma.faq.createMany({
      data: [
        { faqCategoryId: deliveryFaqCategory.id, question: 'How do I verify if my camera requires UHS-II or V90?', answer: "Check your camera's manual for maximum recording bitrate. Any video mode above 400 Mbps (50 MB/s), such as 4K All-Intra or 8K, strictly mandates a V90 card. Using a V30 card will lead to recording automatically halting after 3-5 seconds.", sortOrder: 1 },
        { faqCategoryId: deliveryFaqCategory.id, question: 'Do BYTEVEX cards carry official warranty in India?', answer: 'Yes, all BYTEVEX cards carry a 5-Year Indian Replacement Warranty. In case of any defect, we offer free doorstep reverse-pickup via BlueDart across all Indian PIN codes and express replacement within 48 hours of receipt.', sortOrder: 2 },
        { faqCategoryId: deliveryFaqCategory.id, question: 'Can I claim GST Input Tax Credit on my order?', answer: 'Absolutely. Enter your Company Name and 15-digit GSTIN at checkout. You will immediately receive a tax-compliant GST e-invoice showing 18% IGST or CGST+SGST break-up for seamless input credit reconciliation.', sortOrder: 3 },
        { faqCategoryId: deliveryFaqCategory.id, question: 'What if the card is incompatible with my device?', answer: 'We provide a 7-day hassle-free compatibility exchange guarantee. If you accidentally purchase an incompatible card for your drone or camera, our Bangalore support center will swap it for the correct spec with zero restocking fee.', sortOrder: 4 },
      ],
    });
  }

  const testimonialCount = await prisma.testimonial.count();
  if (testimonialCount === 0) {
    await prisma.testimonial.createMany({
      data: [
        { name: 'Daniel H.', title: 'Verified buyer', quote: 'Ordered Tuesday afternoon, arrived Wednesday morning. Genuinely well packaged.', stars: 5, sortOrder: 1 },
        { name: 'Priya S.', title: 'Verified buyer', quote: 'Spec sheet matched the product to the letter, which is more than I can say for other retailers.', stars: 5, sortOrder: 2 },
        { name: 'Mark T.', title: 'Verified buyer', quote: 'No complaints about performance, and support answered my question the same day.', stars: 4, sortOrder: 3 },
      ],
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
