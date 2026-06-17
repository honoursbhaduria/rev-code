import { Module, Global } from '@nestjs/common';
import { UploadSecurityService } from './upload-security.service';
import { SecretScannerService } from './secret-scanner.service';

@Global()
@Module({
  providers: [UploadSecurityService, SecretScannerService],
  exports: [UploadSecurityService, SecretScannerService],
})
export class SecurityModule {}
