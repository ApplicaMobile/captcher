import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { FormInputDto, SessionData, SubmitCaptchaDto } from './types';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CaptchaService {
  private sessions: SessionData[] = [];
  private readonly SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private readonly logger = new Logger(CaptchaService.name);
  private readonly PDF_DIR = path.join(process.cwd(), 'pdfs');
  private readonly openai: OpenAI;

  constructor(private configService: ConfigService) {
    // Crear el directorio de PDFs si no existe
    if (!fs.existsSync(this.PDF_DIR)) {
      fs.mkdirSync(this.PDF_DIR);
    }

    // Inicializar OpenAI
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async processForm(input: FormInputDto) {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080',
      ],
      protocolTimeout: 60000, // Reducido de 300000 (5 min) a 60000 (1 min)
    });
    const page = await browser.newPage();

    // Configurar timeouts de navegación
    page.setDefaultNavigationTimeout(30000); // Reducido de 60000 a 30000
    page.setDefaultTimeout(30000); // Reducido de 60000 a 30000

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
    try {
      await Promise.all([
        page.waitForNavigation({
          waitUntil: 'networkidle0',
          timeout: 30000, // Increased from 15000 to 30000
        }),
        page.click('input[name="button"][onclick="FormCheck(formrol)"]'),
      ]);
    } catch (error) {
      this.logger.error('Error during form submission:', error);
      await browser.close();
      throw new Error(`Form submission failed: ${error.message}`);
    }

    // Verificar la URL actual
    const currentUrl2 = page.url();
    console.log('URL actual después de la redirección:', currentUrl2);

    // Verificar el contenido de la página
    // const pageContent = await page.content();
    // console.log('Contenido de la página:', pageContent);

    // Etapa 2: Esperar que la nueva página cargue y obtener el captcha
    console.log('Etapa 2: Esperando página del captcha...');

    try {
      // Verificar que estamos en la página correcta
      if (!currentUrl2.includes('brc201.sh')) {
        throw new Error(`Unexpected URL after form submission: ${currentUrl2}`);
      }

      // Esperar a que la página se cargue completamente
      await page.waitForFunction(() => document.readyState === 'complete', {
        timeout: 30000,
      });

      // Intentar localizar el captcha con un timeout más largo
      const captchaElement = await page.waitForSelector('#imgcapt', {
        visible: true,
        timeout: 30000,
      });

      if (!captchaElement) {
        throw new Error('Captcha element not found after page load');
      }

      // Capturar el captcha
      const captchaSrc = await page.$eval(
        '#imgcapt',
        (img: HTMLImageElement) => img.src,
      );

      // Verificar que tenemos una URL válida del captcha
      if (!captchaSrc) {
        throw new Error('Failed to get captcha image source');
      }

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
      await session.page.type('input[name="txt_code"]', dto.captchaValue);

      const popupPromise = new Promise<Buffer>((resolve, reject) => {
        const popupHandler = async (popup: puppeteer.Page | null): Promise<void> => {
          if (!popup) {
            reject(new Error('Failed to open popup window'));
            return;
          }

          try {
            popup.setDefaultNavigationTimeout(60000); // Reducido de 180000 a 60000
            popup.setDefaultTimeout(60000); // Reducido de 180000 a 60000

            this.logger.log('Waiting for popup navigation...');
            
            await popup
              .waitForNavigation({
                waitUntil: 'networkidle0',
                timeout: 60000, // Reducido de 180000 a 60000
              })
              .catch(() => {
                this.logger.log('Navigation timeout, continuing...');
              });

            const waitForFrames = async (maxAttempts = 5): Promise<puppeteer.Frame[]> => { // Reducido de 10 a 5 intentos
              for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                this.logger.log(
                  `Frame check attempt ${attempt}/${maxAttempts}`,
                );
                const frames = popup.frames();
                if (frames.length > 0) {
                  return frames;
                }
                await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1000)); // Reducido de 2000 a 1000
              }
              return [];
            };

            const frames = await waitForFrames();
            this.logger.log(`Found ${frames.length} frames`);

            // Configurar interceptación de requests para capturar URLs de PDF
            const pdfUrls = new Set<string>();
            await popup.setRequestInterception(true);
            popup.on('request', request => {
              const url = request.url();
              if (url.includes('.pdf') || url.includes('brc410.sh')) {
                this.logger.log('Intercepted potential PDF URL:', url);
                pdfUrls.add(url);
              }
              request.continue();
            });

            for (const frame of frames) {
              try {
                const url = frame.url();
                this.logger.log(`Checking frame URL: ${url}`);

                // Verificar si es una URL de PDF directa o una URL de brc410.sh
                if (url.includes('.pdf') || url.includes('brc410.sh')) {
                  this.logger.log('Found potential PDF URL in frame, attempting download...');
                  try {
                    const response = await session.page.evaluate(async (pdfUrl) => {
                      const resp = await fetch(pdfUrl, {
                        method: 'GET',
                        credentials: 'include',  // Incluir cookies
                        headers: {
                          'Accept': 'application/pdf'
                        }
                      });
                      if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
                      const buffer = await resp.arrayBuffer();
                      return Array.from(new Uint8Array(buffer));
                    }, url);

                    if (response && response.length) {
                      const pdfBuffer = Buffer.from(response);
                      this.logger.log('PDF obtained directly from URL');
                      resolve(pdfBuffer);
                      return;
                    }
                  } catch (downloadError) {
                    this.logger.warn('Direct download failed:', downloadError);
                  }
                }

                // Buscar el visor de PDF o elementos relacionados
                const viewerInfo = await frame.evaluate(() => {
                  const elements = {
                    pdfViewer: document.querySelector('pdf-viewer'),
                    embed: document.querySelector('embed[type="application/pdf"]'),
                    object: document.querySelector('object[type="application/pdf"]'),
                    iframe: document.querySelector('iframe[src*=".pdf"], iframe[src*="brc410.sh"]'),
                    links: Array.from(document.querySelectorAll('a[href*=".pdf"], a[href*="brc410.sh"]'))
                  };

                  return {
                    hasPdfViewer: !!elements.pdfViewer,
                    hasEmbed: !!elements.embed,
                    hasObject: !!elements.object,
                    hasIframe: !!elements.iframe,
                    linkUrls: elements.links.map(a => (a as HTMLAnchorElement).href),
                    embedSrc: (elements.embed as HTMLEmbedElement)?.src,
                    objectData: (elements.object as HTMLObjectElement)?.data,
                    iframeSrc: (elements.iframe as HTMLIFrameElement)?.src
                  };
                });

                this.logger.log('Viewer info:', viewerInfo);

                if (viewerInfo.hasPdfViewer || viewerInfo.hasEmbed || viewerInfo.hasObject || viewerInfo.hasIframe) {
                  this.logger.log('Found PDF viewer or related elements in frame');
                  
                  const pdfData = await frame.evaluate(async () => {
                    // Intentar obtener el PDF del visor
                    const viewer = document.querySelector('pdf-viewer') as any;
                    if (viewer?.getFileBlob) {
                      try {
                        const blob = await viewer.getFileBlob();
                        return Array.from(new Uint8Array(await blob.arrayBuffer()));
                      } catch (e) {
                        console.error('Error getting blob from viewer:', e);
                      }
                    }

                    // Intentar obtener el PDF de otros elementos
                    const sources = [
                      (document.querySelector('embed[type="application/pdf"]') as HTMLEmbedElement)?.src,
                      (document.querySelector('object[type="application/pdf"]') as HTMLObjectElement)?.data,
                      (document.querySelector('iframe[src*=".pdf"], iframe[src*="brc410.sh"]') as HTMLIFrameElement)?.src,
                      ...(Array.from(document.querySelectorAll('a[href*=".pdf"], a[href*="brc410.sh"]'))
                        .map(a => (a as HTMLAnchorElement).href))
                    ].filter(Boolean);

                    for (const source of sources) {
                      try {
                        const response = await fetch(source, {
                          credentials: 'include',
                          headers: {
                            'Accept': 'application/pdf'
                          }
                        });
                        if (response.ok) {
                          const buffer = await response.arrayBuffer();
                          return Array.from(new Uint8Array(buffer));
                        }
                      } catch (e) {
                        console.error('Error fetching from source:', e);
                      }
                    }

                    return null;
                  });

                  if (pdfData) {
                    const pdfBuffer = Buffer.from(pdfData);
                    this.logger.log('PDF obtained from viewer or related elements');
                    resolve(pdfBuffer);
                    return;
                  }
                }

                // Si encontramos URLs en los elementos pero no pudimos obtener el PDF, intentar descargarlas
                if (viewerInfo.linkUrls.length > 0) {
                  for (const url of viewerInfo.linkUrls) {
                    try {
                      const response = await session.page.evaluate(async (pdfUrl) => {
                        const resp = await fetch(pdfUrl, {
                          credentials: 'include',
                          headers: {
                            'Accept': 'application/pdf'
                          }
                        });
                        if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
                        const buffer = await resp.arrayBuffer();
                        return Array.from(new Uint8Array(buffer));
                      }, url);

                      if (response && response.length) {
                        const pdfBuffer = Buffer.from(response);
                        this.logger.log('PDF obtained from link URL');
                        resolve(pdfBuffer);
                        return;
                      }
                    } catch (downloadError) {
                      this.logger.warn(`Failed to download from link URL ${url}:`, downloadError);
                    }
                  }
                }
              } catch (frameError) {
                this.logger.warn(
                  `Error processing frame: ${frameError instanceof Error ? frameError.message : String(frameError)}`,
                );
                continue;
              }
            }

            // Si no encontramos el PDF en los frames, intentar con las URLs interceptadas
            if (pdfUrls.size > 0) {
              this.logger.log('Attempting to download from intercepted URLs...');
              for (const url of pdfUrls) {
                try {
                  const response = await session.page.evaluate(async (pdfUrl) => {
                    const resp = await fetch(pdfUrl, {
                      credentials: 'include',
                      headers: {
                        'Accept': 'application/pdf'
                      }
                    });
                    if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
                    const buffer = await resp.arrayBuffer();
                    return Array.from(new Uint8Array(buffer));
                  }, url);

                  if (response && response.length) {
                    const pdfBuffer = Buffer.from(response);
                    this.logger.log('PDF obtained from intercepted URL');
                    resolve(pdfBuffer);
                    return;
                  }
                } catch (downloadError) {
                  this.logger.warn(`Failed to download from intercepted URL ${url}:`, downloadError);
                }
              }
            }

            // Si llegamos aquí, no pudimos encontrar el PDF
            reject(new Error('Could not find PDF content in any frame or popup'));
          } catch (error) {
            this.logger.error('Error in popup handler:', error);
            try {
              await popup.close();
            } catch (closeError) {
              this.logger.warn('Error closing popup after error:', closeError);
            }
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        };

        session.page.once('popup', popupHandler);
      });

      this.logger.log('Clicking submit button...');
      let clickSuccess = false;
      for (let attempt = 1; attempt <= 3 && !clickSuccess; attempt++) {
        try {
          // Wait for network idle first
          await session.page.waitForNetworkIdle({ timeout: 15000 }).catch(() => { // Reducido de 30000 a 15000
            this.logger.warn('Network idle timeout, continuing anyway...');
          });

          // Try multiple selector strategies
          const button = await Promise.race([
            session.page.waitForSelector('input[name="b1"]', { visible: true, timeout: 15000 }), // Reducido de 30000 a 15000
            session.page.waitForSelector('input[type="submit"]', { visible: true, timeout: 15000 }), // Reducido de 30000 a 15000
            session.page.waitForSelector('button[type="submit"]', { visible: true, timeout: 15000 }) // Reducido de 30000 a 15000
          ]).catch(() => null);

          if (button) {
            // Try clicking directly first
            await button.click({ delay: 100 }).catch(async () => {
              // If direct click fails, try JavaScript click
              await session.page.evaluate(() => {
                const elements = [
                  document.querySelector('input[name="b1"]'),
                  document.querySelector('input[type="submit"]'),
                  document.querySelector('button[type="submit"]')
                ] as (HTMLInputElement | HTMLButtonElement | null)[];
                const button = elements.find(el => el);
                if (button) (button as HTMLElement).click();
              });
            });
            clickSuccess = true;
            this.logger.log('Submit button clicked successfully');
            break;
          }

          await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1000)); // Reducido de 2000 a 1000
        } catch (clickError) {
          this.logger.warn(
            `Click attempt ${attempt} failed:`,
            clickError instanceof Error ? clickError.message : String(clickError),
          );
          if (attempt === 3) {
            throw new Error(
              `Failed to click submit button after ${attempt} attempts`,
            );
          }
          await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1000));
        }
      }

      const pdfBuffer = await popupPromise;
      this.logger.log('PDF generation completed successfully');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `certificado_${timestamp}.pdf`;
      const filepath = path.join(this.PDF_DIR, filename);
      fs.writeFileSync(filepath, pdfBuffer);
      this.logger.log(`PDF saved to: ${filepath}`);

      return pdfBuffer;
    } catch (error) {
      this.logger.error('Error in PDF generation process:', error);
      await this.cleanupSession(session.sessionId);
      throw new Error(
        `Failed to get PDF: ${error instanceof Error ? error.message : String(error)}`,
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

  async interpretCaptchaWithGPT(base64Image: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-2024-04-09',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Por favor, interpreta esta imagen de CAPTCHA y devuelve SOLO los 4 dígitos numéricos que ves en ella. Responde ÚNICAMENTE con los números, sin texto adicional.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 10,
      });

      const result = response.choices[0]?.message?.content?.trim() || '';
      // Validar que la respuesta sea 4 dígitos numéricos
      if (/^\d{4}$/.test(result)) {
        return result;
      } else {
        throw new Error(
          'La respuesta de ChatGPT no es un número de 4 dígitos válido',
        );
      }
    } catch (error) {
      this.logger.error('Error al interpretar el CAPTCHA con ChatGPT:', error);
      throw new Error(`Error al interpretar el CAPTCHA: ${error.message}`);
    }
  }
}
