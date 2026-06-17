import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateProviderDto {
  @IsString()
  @IsNotEmpty({ message: 'Provider name is required' })
  @MaxLength(100, { message: 'Name must be at most 100 characters' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Base URL is required' })
  @MaxLength(500)
  baseUrl: string;

  @IsString()
  @IsOptional()
  apiKey?: string;

  @IsString()
  @IsNotEmpty({ message: 'Model name is required' })
  @MaxLength(200)
  model: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class UpdateProviderDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  baseUrl?: string;

  @IsString()
  @IsOptional()
  apiKey?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  model?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
