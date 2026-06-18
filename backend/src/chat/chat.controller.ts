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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';
import { CreateSessionDto, SendMessageDto } from './dto/chat.dto';

interface RequestWithUser extends Request {
  user: { id: string; email: string; name: string };
}

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // Session endpoints
  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  async createSession(
    @Request() req: RequestWithUser,
    @Body() dto: CreateSessionDto,
  ) {
    return this.chatService.createSession(req.user.id, dto);
  }

  @Get('sessions')
  async getSessions(
    @Request() req: RequestWithUser,
    @Query('projectId') projectId?: string,
  ) {
    return this.chatService.getSessions(req.user.id, projectId);
  }

  @Get('sessions/:id')
  async getSession(@Request() req: RequestWithUser, @Param('id') id: string) {
    return this.chatService.getSession(req.user.id, id);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  async deleteSession(
    @Request() req: RequestWithUser,
    @Param('id') id: string,
  ) {
    return this.chatService.deleteSession(req.user.id, id);
  }

  // Message endpoints
  @Post('sessions/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @Request() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(req.user.id, id, dto);
  }

  @Get('sessions/:id/messages')
  async getMessages(@Request() req: RequestWithUser, @Param('id') id: string) {
    return this.chatService.getMessages(req.user.id, id);
  }
}
