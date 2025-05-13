import { CaptchaService } from './src/captcha.service';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// Input de ejemplo (Rancagua, ver README)
const formInput = {
  region: '06',
  comuna: '06101',
  manzana: '500',
  predio: '295',
};

const BATCH_SIZE = 10;
const OUTPUT_DIR = path.join(process.cwd(), 'batch-test-diagnostics');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

async function main() {
  const configService = new ConfigService();
  const captchaService = new CaptchaService(configService);
  const results: any[] = [];

  for (let i = 0; i < BATCH_SIZE; i++) {
    console.log(`\n[${i + 1}/${BATCH_SIZE}] Ejecutando prueba...`);
    const result: any = { attempt: i + 1, success: false };
    try {
      // Paso 1: Obtener captcha
      const session = await captchaService.processForm(formInput);
      result.sessionId = session.sessionId;
      result.captchaUrl = session.captcha;

      // Paso 2: Ejecutar el flujo robusto de interpretación+submit+refresco
      const sessionData = captchaService.getSessionData(session.sessionId);
      if (!sessionData) throw new Error('No se encontró la sesión para solveAndDownloadPDFWithFullRetry');
      const pdfBuffer = await captchaService.solveAndDownloadPDFWithFullRetry(sessionData);
      result.success = true;
      // Guardar PDF si quieres (opcional)
      const pdfPath = path.join(OUTPUT_DIR, `pdf_${i + 1}.pdf`);
      fs.writeFileSync(pdfPath, pdfBuffer);
      result.pdfPath = pdfPath;
      console.log(`[${i + 1}] Éxito ✅`);
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      console.error(`[${i + 1}] Error ❌:`, result.error);
      // Guardar HTML y screenshot si hay error
      try {
        if (result.sessionId) {
          const sessionData = captchaService.getSessionData(result.sessionId);
          if (sessionData && sessionData.page) {
            const html = await sessionData.page.content();
            const htmlPath = path.join(OUTPUT_DIR, `error_${i + 1}.html`);
            fs.writeFileSync(htmlPath, html);
            result.htmlPath = htmlPath;
            const screenshotPath = path.join(OUTPUT_DIR, `error_${i + 1}.png`);
            await sessionData.page.screenshot({ path: screenshotPath });
            result.screenshotPath = screenshotPath;
          }
        }
      } catch (diagError) {
        result.diagnosticError = diagError instanceof Error ? diagError.message : String(diagError);
      }
    }
    results.push(result);
  }

  // Guardar resumen
  const summary = {
    total: BATCH_SIZE,
    success: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  };
  const summaryPath = path.join(OUTPUT_DIR, 'batch-test-results.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\nResumen guardado en: ${summaryPath}`);
  console.log(`Éxitos: ${summary.success} / ${BATCH_SIZE}`);
  console.log(`Errores: ${summary.failed} / ${BATCH_SIZE}`);
}

main().catch(e => {
  console.error('Error fatal en batch-test:', e);
  process.exit(1);
}); 