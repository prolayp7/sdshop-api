import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { CatalogAlertsService } from './catalog-alerts.service';
import { SettingsModule } from '../admin/settings/settings.module';

@Global()
@Module({
  imports: [SettingsModule],
  providers: [EmailService, CatalogAlertsService],
  exports: [EmailService, CatalogAlertsService],
})
export class EmailModule {}
