import { applyDecorators, CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor, SetMetadata, UseInterceptors } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, mergeMap, Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { RevalidationService, RevalidationTarget } from './revalidation.service';

export type RevalidationContext = { params: Record<string, string>; body: Record<string, unknown>; result: unknown; prisma: PrismaService };
export type RevalidationResolver = (context: RevalidationContext) => RevalidationTarget | Promise<RevalidationTarget>;
const RESOLVER = 'revalidation:resolver';

export const Revalidates = (resolver: RevalidationResolver) => applyDecorators(SetMetadata(RESOLVER, resolver), UseInterceptors(RevalidateInterceptor));

@Injectable()
export class RevalidateInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Revalidation');

  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService, private readonly revalidation: RevalidationService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const resolver = this.reflector.get<RevalidationResolver | undefined>(RESOLVER, context.getHandler());
    if (!resolver) return next.handle();
    const request = context.switchToHttp().getRequest<{ params?: Record<string, string>; body?: Record<string, unknown> }>();
    const label = `${context.getClass().name}.${context.getHandler().name}${request.params?.id ? ` id=${request.params.id}` : ''}`;
    const resolve = async (result: unknown): Promise<RevalidationTarget> => {
      try {
        return await resolver({ params: request.params ?? {}, body: request.body ?? {}, result, prisma: this.prisma });
      } catch (error) {
        this.logger.error(`[REVALIDATION] context=${label} status=failed error=could not work out tags: ${error instanceof Error ? error.message : String(error)}`);
        return {};
      }
    };
    return from(resolve(undefined)).pipe(mergeMap((before) => next.handle().pipe(mergeMap(async (result) => {
      const after = await resolve(result);
      const tags = [...new Set([...(before.tags ?? []), ...(after.tags ?? [])])];
      const paths = [...new Set([...(before.paths ?? []), ...(after.paths ?? [])])];
      void this.revalidation.revalidate({ tags, paths }, label);
      return result;
    }))));
  }
}