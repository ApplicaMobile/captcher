import { Body, Controller, Post } from '@nestjs/common';
import { CaptchaService } from './captcha.service';
import { FormInputDto } from './types';

@Controller('captcha')
export class CaptchaController {
  constructor(private readonly captchaService: CaptchaService) {}

  @Post('submit')
  async handleForm(@Body() body: FormInputDto) {
    return this.captchaService.processForm(body);
  }
}
