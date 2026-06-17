import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty({ message: 'Project name is required' })
  @MaxLength(200, { message: 'Project name must be at most 200 characters' })
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000, { message: 'Description must be at most 1000 characters' })
  description?: string;
}

export class UpdateProjectDto {
  @IsString()
  @IsOptional()
  @MaxLength(200, { message: 'Project name must be at most 200 characters' })
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000, { message: 'Description must be at most 1000 characters' })
  description?: string;
}
