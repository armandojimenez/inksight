import { INestApplication } from '@nestjs/common';
import { setupApp } from '@/common/setup-app';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';

/**
 * Wraps setupApp() and re-adds filter/interceptor for integration tests.
 *
 * Integration tests import feature modules (not AppModule), so the DI-registered
 * APP_FILTER / APP_INTERCEPTOR / APP_GUARD providers are not active.
 * This helper ensures consistent behaviour without importing AppModule.
 */
export function setupTestApp(app: INestApplication): void {
  setupApp(app);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
}
