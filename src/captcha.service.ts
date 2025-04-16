import { Injectable, NotFoundException } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { FormInputDto, SessionData } from './types';

@Injectable()
export class CaptchaService {
  private sessions: SessionData[] = [];

  async processForm(input: FormInputDto) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto('https://zeus.sii.cl/avalu_cgi/br/brc110.sh');
    const currentUrl1 = page.url();
    console.log('URL actual después de la redirección:', currentUrl1);

    // Completar valores del formulario
    await page.select('select[name="region"]', input.region);
    await page.select('select[name="comuna"]', input.comuna);
    await page.type('input[name="manzana"]', input.manzana);
    await page.type('input[name="predio"]', input.predio);

    // Etapa 1: Enviar el formulario y esperar la redirección
    console.log('Etapa 1: Enviando formulario...');
    await Promise.all([
      page.waitForNavigation({
        waitUntil: 'networkidle0',
        timeout: 10000,
      }),
      page.click('input[name="button"][onclick="FormCheck(formrol)"]'),
    ]);

    // Verificar la URL actual
    const currentUrl2 = page.url();
    console.log('URL actual después de la redirección:', currentUrl2);

    // Verificar el contenido de la página
    const pageContent = await page.content();
    console.log('Contenido de la página:', pageContent);

    // Etapa 2: Esperar que la nueva página cargue y obtener el captcha
    console.log('Etapa 2: Esperando página del captcha...');

    try {
      await page.waitForSelector('#imgcapt', {
        visible: true,
        timeout: 5000,
      });

      // Capturar el captcha
      const captchaSrc = await page.$eval(
        '#imgcapt',
        (img: HTMLImageElement) => img.src,
      );

      // Descargar la imagen y convertirla a base64
      const imageBuffer = await page.evaluate(async (src) => {
        const response = await fetch(src);
        const buffer = await response.arrayBuffer();
        return Array.from(new Uint8Array(buffer));
      }, captchaSrc);

      const base64Captcha = Buffer.from(imageBuffer).toString('base64');

      // Generar un ID único para la sesión
      const sessionId = Math.random().toString(36).substring(2, 15);

      // Crear y almacenar la sesión en el array
      const sessionData: SessionData = {
        sessionId,
        captchaUrl: captchaSrc,
        captchaBase64: base64Captcha,
        browser,
        page,
        createdAt: new Date(),
      };
      this.sessions.push(sessionData);

      return {
        sessionId,
        captcha: captchaSrc,
        captchaBase64: base64Captcha,
      };
    } catch (error) {
      console.error('Error al buscar el captcha:', error);
      await browser.close();
      throw error;
    }
  }

  getSessionData(sessionId: string) {
    const session = this.sessions.find((s) => s.sessionId === sessionId);
    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }
    return {
      captcha: session.captchaUrl,
      captchaBase64: session.captchaBase64,
    };
  }

  private cleanupOldSessions() {
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutos
    const now = new Date();
    this.sessions = this.sessions.filter((session) => {
      if (now.getTime() - session.createdAt.getTime() > SESSION_TIMEOUT) {
        session.browser.close();
        return false;
      }
      return true;
    });
  }
}
