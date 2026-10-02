import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../../common/admin/permissions.decorator';
import { CreateProductAttributeDto } from './dto/create-product-attribute.dto';
import { CreateProductAttributeValueDto } from './dto/create-product-attribute-value.dto';
import { UpdateProductAttributeDto } from './dto/update-product-attribute.dto';
import { UpdateProductAttributeValueDto } from './dto/update-product-attribute-value.dto';
import { ProductAttributesService } from './product-attributes.service';
import { Revalidates } from '../../../revalidation/revalidates.decorator';
import { onProductAttributes } from '../../../revalidation/resolvers';

@Controller('admin/product-attributes')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('products.manage')
export class ProductAttributesController {
  constructor(private readonly service: ProductAttributesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  @Revalidates(onProductAttributes)
  @HttpCode(201)
  create(@Body() dto: CreateProductAttributeDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Revalidates(onProductAttributes)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductAttributeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Revalidates(onProductAttributes)
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.service.remove(id);
  }

  @Post(':id/values')
  @Revalidates(onProductAttributes)
  @HttpCode(201)
  createValue(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateProductAttributeValueDto,
  ) {
    return this.service.createValue(id, dto);
  }

  @Revalidates(onProductAttributes) @Patch(':id/values/:valueId')
  updateValue(@Param('id', ParseIntPipe) id: number, @Param('valueId', ParseIntPipe) valueId: number, @Body() dto: UpdateProductAttributeValueDto) {
    return this.service.updateValue(id, valueId, dto);
  }

  @Delete(':id/values/:valueId')
  @Revalidates(onProductAttributes)
  @HttpCode(204)
  async removeValue(@Param('id', ParseIntPipe) id: number, @Param('valueId', ParseIntPipe) valueId: number): Promise<void> {
    await this.service.removeValue(id, valueId);
  }
}
