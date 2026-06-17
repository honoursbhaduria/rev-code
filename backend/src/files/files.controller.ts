import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FilesService, FileTreeNode } from './files.service';

interface RequestWithUser extends Request {
  user: { id: string; email: string; name: string };
}

@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // IDOR Protection: userId passed to verify project ownership
  @Post('upload-zip/:projectId')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async uploadZip(
    @Request() req: RequestWithUser,
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.filesService.uploadZip(projectId, file, req.user.id);
  }

  // IDOR Protection: userId passed to verify project ownership
  @Post('upload/:projectId')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('files', 50, { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadFiles(
    @Request() req: RequestWithUser,
    @Param('projectId') projectId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.filesService.uploadFiles(projectId, files, req.user.id);
  }

  // IDOR Protection: userId passed to verify project ownership
  @Get('tree/:projectId')
  async getFileTree(
    @Request() req: RequestWithUser,
    @Param('projectId') projectId: string,
  ): Promise<FileTreeNode[]> {
    return this.filesService.getFileTree(projectId, req.user.id);
  }

  // IDOR Protection: userId passed to verify file -> project -> user chain
  @Get(':id/content')
  async getFileContent(
    @Request() req: RequestWithUser,
    @Param('id') id: string,
  ) {
    return this.filesService.getFileContent(id, req.user.id);
  }

  // IDOR Protection: userId passed to verify ownership before deletion
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteFile(
    @Request() req: RequestWithUser,
    @Param('id') id: string,
  ) {
    return this.filesService.deleteFile(id, req.user.id);
  }

  // Security scan results for a project
  @Get('security-report/:projectId')
  async getSecurityReport(
    @Request() req: RequestWithUser,
    @Param('projectId') projectId: string,
  ) {
    return this.filesService.getSecurityReport(projectId, req.user.id);
  }
}
