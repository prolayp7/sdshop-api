import { Controller, Get, Param, ParseIntPipe, Query, DefaultValuePipe } from '@nestjs/common';
import { StorefrontProductsService } from './storefront-products.service';
import { ListStorefrontProductsQueryDto } from './dto/list-storefront-products-query.dto';
import { CompatibleProductsQueryDto } from './dto/compatible-products-query.dto';

@Controller('products')
export class StorefrontProductsController {
  constructor(private readonly productsService: StorefrontProductsService) {}

  @Get()
  list(@Query() query: ListStorefrontProductsQueryDto) {
    return this.productsService.list(query);
  }

  // Simple, honest "recommended for you": real best-sellers, not a fake
  // personalisation score. Used by rails with no stronger signal to go on
  // (empty basket, account overview, the sign-in page).
  @Get('recommended')
  recommended(@Query('limit', new DefaultValuePipe(4), ParseIntPipe) limit: number) {
    return this.productsService.bestSellers(Math.min(limit, 12));
  }

  @Get(':slug/compatible')
  compatible(@Param('slug') slug: string, @Query() query: CompatibleProductsQueryDto) {
    return this.productsService.compatibleProducts(slug, query);
  }

  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.productsService.bySlug(slug);
  }
}
