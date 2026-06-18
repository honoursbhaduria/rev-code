import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/review.dto';

interface RequestWithUser extends Request {
  user: { id: string; email: string; name: string };
}

@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // Rate limit AI reviews: max 5 per minute to prevent abuse
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Request() req: RequestWithUser, @Body() dto: CreateReviewDto) {
    return this.reviewsService.createReview(req.user.id, dto);
  }

  @Get()
  async findAll(
    @Request() req: RequestWithUser,
    @Query('projectId') projectId?: string,
    @Query('search') search?: string,
  ) {
    return this.reviewsService.getReviews(req.user.id, projectId, search);
  }

  @Get(':id')
  async findOne(@Request() req: RequestWithUser, @Param('id') id: string) {
    return this.reviewsService.getReviewDetail(req.user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Request() req: RequestWithUser, @Param('id') id: string) {
    return this.reviewsService.deleteReview(req.user.id, id);
  }
}
