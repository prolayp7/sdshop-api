import { Global, Module } from '@nestjs/common';
import { RevalidationService } from './revalidation.service';
import { RevalidateInterceptor } from './revalidates.decorator';

@Global()
@Module({ providers: [RevalidationService, RevalidateInterceptor], exports: [RevalidationService, RevalidateInterceptor] })
export class RevalidationModule {}