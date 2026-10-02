import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { Revalidates } from '../../revalidation/revalidates.decorator';
import { onPage } from '../../revalidation/resolvers';
import { CreatePageDto, UpdatePageDto } from './dto/page.dto';
import { PagesService } from './pages.service';

@Controller('admin/pages')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('content.manage')
export class PagesController {
	constructor(private readonly service: PagesService) {}

	@Get() list() { return this.service.list(); }
	@Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }
	@Revalidates(onPage) @Post() @HttpCode(201) create(@Body() dto: CreatePageDto) { return this.service.create(dto); }
	@Revalidates(onPage) @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePageDto) { return this.service.update(id, dto); }
	@Revalidates(onPage) @Delete(':id') @HttpCode(204) async remove(@Param('id', ParseIntPipe) id: number): Promise<void> { await this.service.remove(id); }
}
