import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CaptchaController } from './captcha.controller';
import { CaptchaService } from './captcha.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: false,
    }),
  ],
  controllers: [CaptchaController],
  providers: [CaptchaService],
})
export class CaptchaModule {}
