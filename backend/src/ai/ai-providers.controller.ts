import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiProvidersService } from './ai-providers.service';
import { CreateProviderDto, UpdateProviderDto } from './dto/provider.dto';

interface RequestWithUser extends Request {
  user: { id: string; email: string; name: string };
}

@UseGuards(JwtAuthGuard)
@Controller('ai-providers')
export class AiProvidersController {
  constructor(private readonly aiProvidersService: AiProvidersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Request() req: RequestWithUser,
    @Body() dto: CreateProviderDto,
  ) {
    return this.aiProvidersService.create(req.user.id, dto);
  }

  @Get()
  async findAll(@Request() req: RequestWithUser) {
    return this.aiProvidersService.findAll(req.user.id);
  }

  @Get('default')
  async getDefault(@Request() req: RequestWithUser) {
    return this.aiProvidersService.getDefaultProvider(req.user.id);
  }

  @Get(':id')
  async findOne(@Request() req: RequestWithUser, @Param('id') id: string) {
    return this.aiProvidersService.findOne(req.user.id, id);
  }

  @Patch(':id')
  async update(
    @Request() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateProviderDto,
  ) {
    return this.aiProvidersService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Request() req: RequestWithUser, @Param('id') id: string) {
    return this.aiProvidersService.delete(req.user.id, id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  async testConnection(
    @Request() req: RequestWithUser,
    @Param('id') id: string,
  ) {
    return this.aiProvidersService.testConnection(req.user.id, id);
  }
}
