import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CaptchaService } from './captcha.service';
import { FormInputDto } from './types';

@Controller('captcha')
export class CaptchaController {
  constructor(private readonly captchaService: CaptchaService) {}

  @Post('submit')
  async handleForm(@Body() body: FormInputDto) {
    return this.captchaService.processForm(body);
  }

  @Get('session/:sessionId')
  getSession(@Param('sessionId') sessionId: string) {
    return this.captchaService.getSessionData(sessionId);
  }
}
