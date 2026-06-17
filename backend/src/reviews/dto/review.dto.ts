import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ArrayMinSize,
} from 'class-validator';

export class CreateReviewDto {
  @IsUUID('4', { message: 'projectId must be a valid UUID' })
  @IsNotEmpty({ message: 'Project ID is required' })
  projectId: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one file must be selected' })
  @IsString({ each: true })
  fileIds: string[];

  @IsString()
  @IsNotEmpty({ message: 'Review mode is required' })
  reviewMode: string;

  @IsString()
  @IsNotEmpty({ message: 'Review title is required' })
  title: string;

  @IsString()
  @IsOptional()
  providerId?: string;
}
