import { Prisma, PrismaClient } from '@prisma/client';

type Blueprint = {
  noun: string;
  brands: string[];
  models: string[];
  configurations: string[];
  basePrice: number;
  priceStep: number;
  warrantyMonths: number;
  weightKg: number;
  dimensions: [number, number, number];
  features: string[];
  // Variant attribute the configurations belong to (defaults to "Configuration").
  attribute?: string;
  // Card blueprints only: speed class per model (parallel to `models`) and
  // the card type derived from the capacity. Both land in specsSummary, which
  // is what the storefront "specs" filter and facets read.
  speedClasses?: string[];
  cardType?: (capacity: string) => string;
};

const CAPACITY_ATTRIBUTE = 'Storage Capacity';
const sdType = (prefix: string) => (capacity: string) => (capacity === '32GB' ? `${prefix}SDHC` : `${prefix}SDXC`);

const BLUEPRINTS: Record<string, Blueprint> = {
  'sd-cards': { noun: 'SD Card', brands: ['sandisk', 'samsung', 'kingston', 'lexar', 'sony'], models: ['Extreme PRO', 'Ultra', 'EVO Plus', 'Canvas React', 'Professional 1800x'], configurations: ['128GB', '256GB', '512GB', '1TB'], attribute: CAPACITY_ATTRIBUTE, speedClasses: ['Class 10 / U3 / V30', 'Class 10 / U1', 'Class 10 / U3 / V30', 'Class 10 / U3 / V30', 'Class 10 / U3 / V60'], cardType: sdType(''), basePrice: 14.99, priceStep: 9, warrantyMonths: 120, weightKg: 0.01, dimensions: [10, 7, 1], features: ['fast photo and 4K video capture', 'shock, water and temperature resistance', 'high-speed transfer', 'lifetime limited warranty'] },
  'microsd-cards': { noun: 'microSD Card', brands: ['sandisk', 'samsung', 'kingston', 'lexar', 'pny'], models: ['Extreme', 'PRO Endurance', 'EVO Select', 'Canvas Go', 'Elite'], configurations: ['64GB', '128GB', '256GB', '512GB'], attribute: CAPACITY_ATTRIBUTE, speedClasses: ['Class 10 / U3 / V30 / A2', 'Class 10 / U3 / V30', 'Class 10 / U3 / A2', 'Class 10 / U3 / V30 / A2', 'Class 10 / U1 / A1'], cardType: sdType('micro'), basePrice: 8.99, priceStep: 7, warrantyMonths: 120, weightKg: 0.005, dimensions: [10, 7, 1], features: ['for phones, action cameras and drones', 'app performance rated', 'SD adapter included', 'lifetime limited warranty'] },
  'cf-cards': { noun: 'CompactFlash Card', brands: ['sandisk', 'lexar', 'transcend', 'kingston', 'sony'], models: ['Extreme PRO', 'Professional 1067x', 'CFX', 'Canvas Go Plus', 'Industrial'], configurations: ['32GB', '64GB', '128GB', '256GB'], attribute: CAPACITY_ATTRIBUTE, speedClasses: ['UDMA 7', 'UDMA 7', 'UDMA 7', 'UDMA 6', 'UDMA 6'], cardType: () => 'CompactFlash', basePrice: 24.99, priceStep: 14, warrantyMonths: 120, weightKg: 0.02, dimensions: [10, 7, 1], features: ['sustained write speeds for burst shooting', 'DSLR and video camera compatible', 'rugged build', 'lifetime limited warranty'] },
  'cfexpress-cards': { noun: 'CFexpress Card', brands: ['sandisk', 'prograde-digital', 'delkin-devices', 'lexar', 'sony'], models: ['Extreme PRO Type B', 'Cobalt Type B', 'Black Type B', 'Gold Type B', 'Tough Type B'], configurations: ['128GB', '256GB', '512GB', '1TB'], attribute: CAPACITY_ATTRIBUTE, speedClasses: ['VPG 400', 'VPG 400', 'VPG 400', 'VPG 200', 'VPG 400'], cardType: () => 'CFexpress Type B', basePrice: 79.99, priceStep: 45, warrantyMonths: 60, weightKg: 0.02, dimensions: [10, 7, 1], features: ['8K RAW video recording', 'PCIe / NVMe speeds', 'mirrorless and cinema camera ready', 'limited warranty'] },
  'card-readers': { noun: 'Card Reader', brands: ['sandisk', 'kingston', 'lexar', 'transcend', 'sony'], models: ['MobileMate', 'Workflow', 'Professional Dual Slot', 'Compact Reader', 'USB 3.2 Hub Reader'], configurations: ['USB-A', 'USB-C', 'Dual Slot', 'Multi-Slot'], basePrice: 9.99, priceStep: 8, warrantyMonths: 24, weightKg: 0.05, dimensions: [9, 5, 2], features: ['USB 3.2 transfer speeds', 'plug-and-play on Windows and macOS', 'compact travel design', 'UK warranty'] },
  'card-adapters': { noun: 'Card Adapter', brands: ['sandisk', 'kingston', 'lexar', 'transcend', 'pny'], models: ['microSD to SD', 'CF to SD', 'microSD to USB', 'SD to USB-C', 'CFexpress to USB'], configurations: ['Standard', 'Slim', 'Pro', 'Twin Pack'], basePrice: 4.99, priceStep: 3, warrantyMonths: 12, weightKg: 0.01, dimensions: [8, 5, 1], features: ['secure card fit', 'broad device compatibility', 'no drivers required', 'UK warranty'] },
  'card-cases': { noun: 'Card Case', brands: ['sandisk', 'lexar', 'delkin-devices', 'transcend', 'integral'], models: ['SD Wallet', 'microSD Keeper', 'CF Hard Case', 'Travel Organiser', 'Weatherproof Case'], configurations: ['4 Card', '8 Card', '12 Card', '24 Card'], basePrice: 5.99, priceStep: 3, warrantyMonths: 12, weightKg: 0.06, dimensions: [12, 8, 2], features: ['protects against dust and knocks', 'labelled card slots', 'lightweight carry design', 'UK warranty'] },
  'usb-flash-drives': { noun: 'USB Flash Drive', brands: ['sandisk', 'samsung', 'kingston', 'toshiba', 'integral'], models: ['Ultra Fit', 'Bar Plus', 'DataTraveler', 'TransMemory', 'Courier'], configurations: ['64GB', '128GB', '256GB', '512GB'], attribute: CAPACITY_ATTRIBUTE, basePrice: 7.99, priceStep: 6, warrantyMonths: 60, weightKg: 0.01, dimensions: [6, 2, 1], features: ['USB 3.2 speeds', 'compact low-profile design', 'password protection software', 'limited warranty'] },
};

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const money = (value: number) => Math.round(value * 100) / 100;

function upcFor(sequence: number): string {
  const body = `950${String(sequence).padStart(8, '0')}`.slice(0, 11);
  const sum = body.split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

export function validateProductBlueprints(expectedCategories = 8, productsPerCategory = 20) {
  const slugs = Object.keys(BLUEPRINTS);
  if (slugs.length !== expectedCategories) throw new Error(`Expected ${expectedCategories} product blueprints, found ${slugs.length}.`);
  const productSlugs = new Set<string>();
  const skus = new Set<string>();
  const upcs = new Set<string>();
  let sequence = 1;
  let standardProducts = 0;
  let variableProducts = 0;
  let variants = 0;
  for (const [slug, blueprint] of Object.entries(BLUEPRINTS)) {
    const count = blueprint.models.length * blueprint.configurations.length;
    if (count !== productsPerCategory) throw new Error(`${slug} generates ${count} products instead of ${productsPerCategory}.`);
    if (blueprint.features.length < 4) throw new Error(`${slug} needs at least four product features.`);
    for (let modelIndex = 0; modelIndex < blueprint.models.length; modelIndex += 1) {
      for (let configIndex = 0; configIndex < blueprint.configurations.length; configIndex += 1) {
        const isVariable = (modelIndex * blueprint.configurations.length + configIndex) % 2 === 1;
        const brandSlug = blueprint.brands[(modelIndex + configIndex) % blueprint.brands.length];
        const productSlug = `${slug}-${slugify(`${brandSlug} ${blueprint.models[modelIndex]} ${blueprint.configurations[configIndex]}`)}`;
        const sku = `SDS-${slug.slice(0, 4).toUpperCase()}-${String(sequence).padStart(4, '0')}`;
        const upc = upcFor(sequence);
        if (productSlugs.has(productSlug)) throw new Error(`Duplicate generated product slug: ${productSlug}`);
        if (skus.has(sku)) throw new Error(`Duplicate generated SKU: ${sku}`);
        if (upcs.has(upc)) throw new Error(`Duplicate generated UPC: ${upc}`);
        productSlugs.add(productSlug);
        skus.add(sku);
        upcs.add(upc);
        if (isVariable) {
          variableProducts += 1;
          variants += blueprint.configurations.length;
        } else {
          standardProducts += 1;
          variants += 1;
        }
        sequence += 1;
      }
    }
  }
  const products = slugs.length * productsPerCategory;
  if (productSlugs.size !== products || skus.size !== products || upcs.size !== products) {
    throw new Error('Generated product identifiers are incomplete.');
  }
  if (standardProducts !== products / 2 || variableProducts !== products / 2 || variants !== slugs.length * 50) {
    throw new Error(`Expected ${products / 2} standard products, ${products / 2} variable products and ${slugs.length * 50} variants; generated ${standardProducts}, ${variableProducts} and ${variants}.`);
  }
  return { categories: slugs.length, products, standardProducts, variableProducts, variants, seoRecords: products };
}

export async function seedProducts(prisma: PrismaClient) {
  const expected = validateProductBlueprints();

  const [categories, brands, suppliers, condition, taxRate] = await Promise.all([
    prisma.category.findMany({ where: { deletedAt: null, status: 'ACTIVE' } }),
    prisma.brand.findMany({ where: { status: 'ACTIVE' } }),
    prisma.supplier.findMany({ where: { status: 'ACTIVE' }, orderBy: { id: 'asc' } }),
    prisma.productCondition.findUniqueOrThrow({ where: { slug: 'new' } }),
    prisma.taxRate.findUniqueOrThrow({ where: { title: 'Standard' } }),
  ]);
  const categoryBySlug = new Map(categories.map((item) => [item.slug, item]));
  const brandBySlug = new Map(brands.map((item) => [item.slug, item]));
  const missing = Object.keys(BLUEPRINTS).filter((slug) => !categoryBySlug.has(slug));
  if (missing.length) throw new Error(`Missing active categories required by product seed: ${missing.join(', ')}`);
  if (suppliers.length === 0) throw new Error('At least one active supplier is required before seeding products.');
  const attributes = new Map<string, { id: number }>();
  const attributeFor = async (title: string) => {
    if (!attributes.has(title)) {
      const slug = slugify(title);
      attributes.set(title, await prisma.productAttribute.findFirst({ where: { slug, deletedAt: null } })
        .then((existing) => existing ?? prisma.productAttribute.create({ data: { title, slug, inputType: 'SELECT', isFilterable: true } })));
    }
    return attributes.get(title)!;
  };
  const shippingMethods = await prisma.shippingMethod.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });

  let sequence = 1;
  let created = 0;
  let updated = 0;
  for (const [categorySlug, blueprint] of Object.entries(BLUEPRINTS)) {
    const category = categoryBySlug.get(categorySlug)!;
    const configurationAttribute = await attributeFor(blueprint.attribute ?? 'Configuration');
    for (let modelIndex = 0; modelIndex < blueprint.models.length; modelIndex += 1) {
      for (let configIndex = 0; configIndex < blueprint.configurations.length; configIndex += 1) {
        const isVariable = (modelIndex * blueprint.configurations.length + configIndex) % 2 === 1;
        const brandSlug = blueprint.brands[(modelIndex + configIndex) % blueprint.brands.length];
        const brand = brandBySlug.get(brandSlug);
        if (!brand) throw new Error(`Missing brand ${brandSlug} required by ${categorySlug}.`);
        const supplier = suppliers[(sequence - 1) % suppliers.length];
        const model = blueprint.models[modelIndex];
        const configuration = blueprint.configurations[configIndex];
        const title = `${brand.title} ${model} ${configuration}`;
        const slug = `${categorySlug}-${slugify(title)}`;
        const retailPrice = money(blueprint.basePrice + modelIndex * blueprint.priceStep + configIndex * blueprint.priceStep * 0.42);
        const salePrice = sequence % 4 === 0 ? money(retailPrice * 0.9) : null;
        const upc = upcFor(sequence);
        const sku = `SDS-${categorySlug.slice(0, 4).toUpperCase()}-${String(sequence).padStart(4, '0')}`;
        const mpn = `${brandSlug.slice(0, 3).toUpperCase()}-${slugify(model).slice(0, 8).toUpperCase()}-${configIndex + 1}`;
        const shortDescription = `${configuration} ${blueprint.noun.toLowerCase()} with ${blueprint.features.slice(0, 2).join(' and ')}.`;
        const description = `${title} is a carefully specified ${blueprint.noun.toLowerCase()} for UK photographers, videographers and everyday users. It combines ${blueprint.features.join(', ')} in a practical retail-ready package.\n\nThe ${configuration} configuration is selected for dependable everyday use and straightforward installation. Check that your camera or device supports this card type and speed class before ordering.\n\nSupplied through an established UK technology distributor, this item includes a ${blueprint.warrantyMonths}-month manufacturer or return-to-base warranty and a 30-day change-of-mind return window, subject to the store returns policy.`;
        const metaTitle = `${title} | Buy Online at SD Shop`.slice(0, 70);
        const metaDescription = `Shop the ${title} in the UK. ${shortDescription} Includes UK delivery, clear specifications and a ${blueprint.warrantyMonths}-month warranty.`.slice(0, 160);
        const data: Prisma.ProductUncheckedCreateInput = {
          categoryId: category.id, brandId: brand.id, supplierId: supplier.id, productConditionId: condition.id, taxRateId: taxRate.id,
          title, slug, sku, mpn, gtin: `00${upc}`, upc, shortDescription, description,
          specsSummary: { category: category.title, catalogueType: isVariable ? 'Variable product' : 'Standard product', productType: blueprint.noun, brand: brand.title, model, configuration, ...(blueprint.attribute ? { [blueprint.attribute]: configuration } : {}), ...(blueprint.speedClasses ? { 'Speed Class': blueprint.speedClasses[modelIndex] } : {}), ...(blueprint.cardType ? { 'Card Type': blueprint.cardType(configuration) } : {}), availableConfigurations: isVariable ? blueprint.configurations : [configuration], keyFeatures: blueprint.features, warranty: `${blueprint.warrantyMonths} months`, condition: 'New', countryOfSale: 'United Kingdom' },
          warrantyMonths: blueprint.warrantyMonths,
          allowCustomization: false,
          customizationInstructions: null,
          costPrice: money(retailPrice * 0.72), minimumOrderQuantity: 1, stockLocation: `WH-A-${String((sequence % 12) + 1).padStart(2, '0')}`,
          receiveLowStockAlert: true, outOfStockBehavior: 'DENY', inStockLabel: 'In stock – UK dispatch', outOfStockLabel: 'Temporarily unavailable',
          availabilityDate: new Date('2026-08-31T00:00:00.000Z'), deliveryTimeMode: 'CUSTOM', inStockDeliveryTime: '1–3 working days', outOfStockDeliveryTime: 'Usually available within 7–14 working days',
          additionalShippingCost: blueprint.weightKg >= 10 ? 9.99 : blueprint.weightKg >= 5 ? 4.99 : 0,
          isReturnable: true, returnableDays: 30, status: 'ACTIVE', isFeatured: sequence % 10 === 0, isTopProduct: sequence % 20 === 1,
          isIndexable: true, metaTitle, metaDescription, seoTags: [category.title.toLowerCase(), blueprint.noun.toLowerCase(), brand.title.toLowerCase(), configuration.toLowerCase(), 'uk delivery'],
          offlineRedirectBehavior: 'NOT_FOUND', redirectTargetCategoryId: null, deletedAt: null,
        };
        const existing = await prisma.product.findFirst({ where: { slug, deletedAt: null }, select: { id: true } });
        const product = existing
          ? await prisma.product.update({ where: { id: existing.id }, data })
          : await prisma.product.create({ data });
        await prisma.$executeRaw`UPDATE products SET product_type = CAST(${isVariable ? 'VARIABLE' : 'STANDARD'} AS "ProductType") WHERE id = ${product.id}`;
        existing ? updated += 1 : created += 1;

        const variantOptions = isVariable ? blueprint.configurations : ['Default'];
        const desiredVariantSlugs = variantOptions.map((option) => isVariable ? `${slug}-option-${slugify(option)}` : `${slug}-default`);
        await prisma.productVariant.updateMany({
          where: { productId: product.id, slug: { startsWith: `${slug}-`, notIn: desiredVariantSlugs } },
          data: { status: 'INACTIVE', deletedAt: new Date() },
        });
        for (let optionIndex = 0; optionIndex < variantOptions.length; optionIndex += 1) {
          const option = variantOptions[optionIndex];
          const variantSlug = desiredVariantSlugs[optionIndex];
          const optionPrice = isVariable ? money(retailPrice + (optionIndex - configIndex) * blueprint.priceStep * 0.18) : retailPrice;
          const safeOptionPrice = Math.max(0.99, optionPrice);
          const optionSalePrice = salePrice === null ? null : money(safeOptionPrice * 0.9);
          const variantData = {
            productId: product.id, title: option, slug: variantSlug,
            barcode: isVariable ? upcFor(10000 + sequence * 10 + optionIndex) : upc,
            price: safeOptionPrice, salePrice: optionSalePrice,
            stockQty: 8 + ((sequence + optionIndex) * 7) % 43, lowStockThreshold: 5, weightKg: blueprint.weightKg,
            lengthCm: blueprint.dimensions[0], widthCm: blueprint.dimensions[1], heightCm: blueprint.dimensions[2],
            isDefault: !isVariable || optionIndex === configIndex, status: 'ACTIVE' as const, deletedAt: null,
          };
          const existingVariant = await prisma.productVariant.findFirst({ where: { slug: variantSlug }, select: { id: true } });
          const variant = existingVariant
            ? await prisma.productVariant.update({ where: { id: existingVariant.id }, data: variantData })
            : await prisma.productVariant.create({ data: variantData });
          if (isVariable) {
            const configurationValue = await prisma.productAttributeValue.upsert({
              where: { attributeId_value: { attributeId: configurationAttribute.id, value: option } },
              update: {},
              create: { attributeId: configurationAttribute.id, value: option, sortOrder: optionIndex + 1 },
            });
            await prisma.productVariantAttribute.upsert({
              where: { productVariantId_attributeId: { productVariantId: variant.id, attributeId: configurationAttribute.id } },
              update: { attributeValueId: configurationValue.id },
              create: { productVariantId: variant.id, attributeId: configurationAttribute.id, attributeValueId: configurationValue.id },
            });
          } else {
            await prisma.productVariantAttribute.deleteMany({
              where: { productVariantId: variant.id, attributeId: configurationAttribute.id },
            });
          }
        }
        for (const shippingMethod of shippingMethods) {
          await prisma.productShippingMethod.upsert({
            where: { productId_shippingMethodId: { productId: product.id, shippingMethodId: shippingMethod.id } },
            update: {},
            create: { productId: product.id, shippingMethodId: shippingMethod.id },
          });
        }

        const faqCount = await prisma.productFaq.count({ where: { productId: product.id } });
        if (faqCount === 0) {
          await prisma.productFaq.createMany({ data: [
            { productId: product.id, question: `Is the ${title} supplied for UK use?`, answer: 'Yes. This listing is intended for the UK market and ships with UK warranty cover.', sortOrder: 1 },
            { productId: product.id, question: 'What warranty and returns cover is included?', answer: `The product includes a ${blueprint.warrantyMonths}-month warranty and is returnable within 30 days, subject to the published warranty and returns terms.`, sortOrder: 2 },
          ] });
        }
        sequence += 1;
      }
    }
  }
  if (sequence - 1 !== expected.products) throw new Error(`Generated ${sequence - 1} products instead of ${expected.products}.`);
  return { ...expected, created, updated };
}
