import { PrismaService } from '../../prisma/prisma.service';
import { CacheTags } from './cache-tags';
import type { RevalidationTarget } from './revalidation.service';

type Db = PrismaService;
export const target = (...tags: string[]): RevalidationTarget => ({ tags });

async function categoryChainSlugs(prisma: Db, categoryId: number | null): Promise<string[]> {
  const slugs: string[] = [];
  for (let id = categoryId, depth = 0; id && depth < 10; depth += 1) {
    const category = await prisma.category.findUnique({ where: { id }, select: { slug: true, parentId: true } });
    if (!category) break;
    slugs.push(category.slug);
    id = category.parentId;
  }
  return slugs;
}

export async function productTarget(prisma: Db, productIds: (number | null | undefined)[]): Promise<RevalidationTarget> {
  const ids = [...new Set(productIds.filter((id): id is number => Number.isInteger(id) && (id as number) > 0))];
  const tags: string[] = [CacheTags.products, CacheTags.brands, CacheTags.homepage];
  if (!ids.length) return { tags };
  const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, categoryId: true, brand: { select: { slug: true } } } });
  for (const product of products) {
    tags.push(CacheTags.product(product.id), CacheTags.productSlug(product.slug));
    if (product.brand) tags.push(CacheTags.brandSlug(product.brand.slug));
    tags.push(...(await categoryChainSlugs(prisma, product.categoryId)).map(CacheTags.categorySlug));
  }
  return { tags };
}

export async function categoryTarget(prisma: Db, categoryIds: (number | null | undefined)[]): Promise<RevalidationTarget> {
  const ids = categoryIds.filter((id): id is number => Number.isInteger(id) && (id as number) > 0);
  const categories = ids.length ? await prisma.category.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true } }) : [];
  return { tags: [CacheTags.categories, CacheTags.menus, CacheTags.homepage, CacheTags.products, ...categories.flatMap((category) => [CacheTags.category(category.id), CacheTags.categorySlug(category.slug)])] };
}

export async function brandTarget(prisma: Db, brandIds: (number | null | undefined)[]): Promise<RevalidationTarget> {
  const ids = brandIds.filter((id): id is number => Number.isInteger(id) && (id as number) > 0);
  const brands = ids.length ? await prisma.brand.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true } }) : [];
  return { tags: [CacheTags.brands, CacheTags.products, CacheTags.categories, CacheTags.homepage, ...brands.flatMap((brand) => [CacheTags.brand(brand.id), CacheTags.brandSlug(brand.slug)])] };
}

export async function pageTarget(prisma: Db, pageIds: (number | null | undefined)[]): Promise<RevalidationTarget> {
  const ids = pageIds.filter((id): id is number => Number.isInteger(id) && (id as number) > 0);
  const pages = ids.length ? await prisma.page.findMany({ where: { id: { in: ids } }, select: { slug: true } }) : [];
  return { tags: pages.map((page) => CacheTags.cmsPageSlug(page.slug)) };
}

export async function reviewTarget(prisma: Db, reviewId: number): Promise<RevalidationTarget> {
  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { productId: true } });
  return productTarget(prisma, [review?.productId]);
}

export async function mediaTarget(prisma: Db, media: { ownerType?: unknown; ownerId?: unknown } | null | undefined): Promise<RevalidationTarget> {
  const ownerId = Number(media?.ownerId);
  if (!media || !Number.isInteger(ownerId) || ownerId <= 0) return { tags: [] };
  switch (media.ownerType) {
    case 'PRODUCT': return productTarget(prisma, [ownerId]);
    case 'PRODUCT_VARIANT': {
      const variant = await prisma.productVariant.findUnique({ where: { id: ownerId }, select: { productId: true } });
      return productTarget(prisma, [variant?.productId]);
    }
    case 'CATEGORY': return categoryTarget(prisma, [ownerId]);
    case 'BRAND': return brandTarget(prisma, [ownerId]);
    case 'PAGE': return pageTarget(prisma, [ownerId]);
    case 'REVIEW': return reviewTarget(prisma, ownerId);
    case 'HERO_SLIDE': case 'BANNER': return target(CacheTags.homepage);
    case 'TESTIMONIAL': return target(CacheTags.testimonials, CacheTags.homepage);
    default: return { tags: [] };
  }
}