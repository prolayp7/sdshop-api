import { IsString, Length } from 'class-validator';

export class UnsubscribeNewsletterDto {
  @IsString()
  @Length(20, 100)
  token: string;
}