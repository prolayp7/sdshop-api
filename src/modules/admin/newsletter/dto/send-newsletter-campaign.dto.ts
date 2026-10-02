import { IsString, Length, Matches } from 'class-validator';

export class SendNewsletterCampaignDto {
  @IsString()
  @Length(1, 160)
  @Matches(/^[^\r\n]+$/)
  subject: string;

  @IsString()
  @Length(1, 5000)
  message: string;
}