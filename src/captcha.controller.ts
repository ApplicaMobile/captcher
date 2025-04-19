import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CaptchaService } from './captcha.service';
import { FormInputDto, SubmitCaptchaDto } from './types';

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

  @Post('pdf')
  async getPDF(@Body() body: SubmitCaptchaDto) {
    const pdfBuffer = await this.captchaService.submitCaptchaAndGetPDF(body);
    return {
      pdf: pdfBuffer.toString('base64'),
      contentType: 'application/pdf',
    };
  }
}
