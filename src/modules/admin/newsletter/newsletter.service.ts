import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { ListSubscribersQueryDto } from './dto/list-subscribers-query.dto';
import { SendNewsletterCampaignDto } from './dto/send-newsletter-campaign.dto';
import { EmailService } from '../../email/email.service';
import { newsletterCampaignEmail } from '../../email/email-templates';

@Injectable()
export class AdminNewsletterService {
  constructor(private readonly prisma: PrismaService, private readonly emailService: EmailService) {}

  async list(query: ListSubscribersQueryDto) {
    const page = query.page!;
    const perPage = query.perPage!;
    const where: Prisma.NewsletterSubscriberWhereInput = { unsubscribedAt: null, ...(query.q ? { email: { contains: query.q, mode: 'insensitive' } } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({ where, ...paginationSkipTake(page, perPage), orderBy: { createdAt: 'desc' } }),
      this.prisma.newsletterSubscriber.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }

  async sendCampaign(dto: SendNewsletterCampaignDto) {
    const subscribers = await this.prisma.newsletterSubscriber.findMany({
      where: { unsubscribedAt: null },
      select: { email: true, unsubscribeToken: true },
      orderBy: { id: 'asc' },
    });
    let sent = 0;
    let failed = 0;
    for (let index = 0; index < subscribers.length; index += 20) {
      const batch = subscribers.slice(index, index + 20);
      const results = await Promise.all(batch.map(async (subscriber) => {
        const email = newsletterCampaignEmail({ ...dto, unsubscribeToken: subscriber.unsubscribeToken });
        return this.emailService.send(subscriber.email, email.subject, email.html);
      }));
      sent += results.filter(Boolean).length;
      failed += results.filter((result) => !result).length;
    }
    return { total: subscribers.length, sent, failed };
  }
}
