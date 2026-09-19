import { IsEmail, IsString, MaxLength } from 'class-validator';

export class TrackOrderDto {
  @IsString()
  @MaxLength(40)
  orderNumber!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;
}
