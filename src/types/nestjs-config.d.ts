declare module '@nestjs/config' {
  export class ConfigService {
    get<T>(key: string): T;
  }

  export const ConfigModule: {
    forRoot(options: { isGlobal?: boolean }): any;
  };
}
