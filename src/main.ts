import { NestFactory } from '@nestjs/core';
import { CaptchaModule } from './captcha.module';

async function bootstrap() {
  const app = await NestFactory.create(CaptchaModule);
  app.enableCors();
  await app.listen(process.env.PORT ?? 3002);
}
bootstrap();
