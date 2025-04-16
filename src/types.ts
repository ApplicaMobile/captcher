import * as puppeteer from 'puppeteer';

export interface FormInputDto {
  region: string;
  comuna: string;
  manzana: string;
  predio: string;
}

export interface SessionData {
  sessionId: string;
  captchaUrl: string;
  captchaBase64: string;
  browser: puppeteer.Browser;
  page: puppeteer.Page;
  createdAt: Date;
}
