import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

interface FormInputDto {
  region: string;
  comuna: string;
  manzana: string;
  predio: string;
  primeravez?: string;
  COMUCON?: string;
  OPCION?: string;
  AMB?: string;
}

@Injectable()
export class CaptchaService {
  private sessionStore = new Map<string, { captchaUrl: string }>();

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

    // Intentar con diferentes selectores
    try {
      await page.waitForSelector('#imgcapt', {
        visible: true,
        timeout: 5000,
      });

      // Capturar el captcha y session_id
      const captchaSrc = await page.$eval(
        '#imgcapt',
        (img: HTMLImageElement) => img.src,
      );
      const cookies = await page.cookies();
      const sessionCookie = cookies.find((c) => c.name === 'session_id');

      const sessionId = sessionCookie?.value ?? '';
      this.sessionStore.set(sessionId, { captchaUrl: captchaSrc });

      await browser.close();

      return {
        sessionId,
        captcha: captchaSrc,
      };
    } catch (error) {
      console.error('Error al buscar el captcha:', error);
      throw error;
    }
  }
}
