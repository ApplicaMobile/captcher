import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { FormInputDto, SessionData, SubmitCaptchaDto } from './types';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CaptchaService {
  private sessions: SessionData[] = [];
  private readonly SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private readonly logger = new Logger(CaptchaService.name);
  private readonly PDF_DIR = path.join(process.cwd(), 'pdfs');

  constructor() {
    // Crear el directorio de PDFs si no existe
    if (!fs.existsSync(this.PDF_DIR)) {
      fs.mkdirSync(this.PDF_DIR);
    }
  }

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
        timeout: 15000,
      }),
      page.click('input[name="button"][onclick="FormCheck(formrol)"]'),
    ]);

    // Verificar la URL actual
    const currentUrl2 = page.url();
    console.log('URL actual después de la redirección:', currentUrl2);

    // Verificar el contenido de la página
    // const pageContent = await page.content();
    // console.log('Contenido de la página:', pageContent);

    // Etapa 2: Esperar que la nueva página cargue y obtener el captcha
    console.log('Etapa 2: Esperando página del captcha...');

    try {
      await page.waitForSelector('#imgcapt', {
        visible: true,
        timeout: 10000,
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

      console.log('Etapa 3: Fin.');

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

  getSessionData(sessionId: string): SessionData | undefined {
    return this.sessions.find((session) => session.sessionId === sessionId);
  }

  async submitCaptchaAndGetPDF(dto: SubmitCaptchaDto): Promise<Buffer> {
    
    const session = this.getSessionData(dto.sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    try {
      this.logger.log('Starting PDF generation process...');
      // Input captcha value
      this.logger.log('Typing captcha value...');
      await session.page.type('input[name="txt_code"]', dto.captchaValue);
      this.logger.log('Captcha value typed successfully');

      // Configurar el listener para la ventana emergente antes de hacer clic
      const popupPromise = new Promise<Buffer>((resolve, reject) => {
        const popupHandler = (popup: puppeteer.Page | null) => {
          void (async () => {
            if (!popup) {
              this.logger.error('Popup window failed to open');
              reject(new Error('Failed to open popup window'));
              return;
            }

            try {
              this.logger.log('Waiting for popup to load...');
              await popup.waitForFunction(
                () => {
                  return document.readyState === 'complete';
                },
                { timeout: 30000 },
              );
              this.logger.log('Popup loaded successfully');
              await new Promise((resolve) => setTimeout(resolve, 1000));

              // Verificar si hay un mensaje de error
              const errorMessage = await popup.evaluate(() => {
                const errorElement = document.querySelector('.error-message');
                return errorElement ? errorElement.textContent : null;
              });

              if (errorMessage) {
                this.logger.error(`Error message found: ${errorMessage}`);
                throw new Error(`SII Error: ${errorMessage}`);
              }

              this.logger.log('Generating PDF from popup...');
              const pdfData = await popup.pdf({
                format: 'A4',
                printBackground: true,
              });
              // Guardar el PDF en el sistema de archivos
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              const filename = `certificado_${timestamp}.pdf`;
              const filepath = path.join(this.PDF_DIR, filename);
              fs.writeFileSync(filepath, pdfData);
              this.logger.log(`PDF saved to: ${filepath}`);
              // Log del tamaño del PDF
              this.logger.log(`PDF size: ${pdfData.length} bytes`);

              this.logger.log('PDF generated successfully');

              resolve(Buffer.from(pdfData));
            } catch (error) {
              this.logger.error('Error in popup handler:', error);
              reject(error instanceof Error ? error : new Error(String(error)));
            } finally {
              this.logger.log('Closing popup window...');
              await popup.close();
            }
          })();
        };

        session.page.once('popup', popupHandler);
      });

      // Hacer clic en el botón
      this.logger.log('Clicking submit button...');
      await session.page.click('input[name="b1"]');
      this.logger.log('Submit button clicked successfully');

      // Esperar a que se complete la operación
      this.logger.log('Waiting for PDF generation to complete...');
      const pdfBuffer = await popupPromise;
      this.logger.log('PDF generation completed successfully');

      // Limpiar la sesión
      this.logger.log('Cleaning up session...');
      // await this.cleanupSession(session.sessionId);
      this.logger.log('Session cleaned up successfully');

      return pdfBuffer;
    } catch (error) {
      this.logger.error('Error in PDF generation process:', error);
      if (session) {
        await this.cleanupSession(session.sessionId);
      }
      throw new Error(
        `Failed to get PDF: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async cleanupSession(sessionId: string): Promise<void> {
    const session = this.getSessionData(sessionId);
    if (session) {
      try {
        await session.browser.close();
      } catch (error) {
        this.logger.error('Error closing browser:', error);
      }
      this.sessions = this.sessions.filter((s) => s.sessionId !== sessionId);
    }
  }
}
