import { IncomingMessage, ServerResponse } from 'node:http'
import { OpenTelemetryModule } from '@amplication/opentelemetry-nestjs'
import { Module } from '@nestjs/common'
import { ConfigModule as NestConfigModule } from '@nestjs/config'
import { APP_FILTER } from '@nestjs/core'
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup'
import { LoggerModule } from 'nestjs-pino'
import { AppController } from './app.controller'
import { AdminModule } from './modules/admin/admin.module'
import { AiModule } from './modules/ai/ai.module'
import { AuthModule } from './modules/auth/auth.module'
import { RolesModule } from './modules/auth/roles/roles.module'
import { BannersModule } from './modules/banners/banners.module'
import { ChatModule } from './modules/chat/chat.module'
import { CommunityModule } from './modules/community/community.module'
import { DbModule } from './modules/db/db.module'
import { EmailModule } from './modules/email/email.module'
import { ExampleModule } from './modules/example/example.module'
import { GeocodingModule } from './modules/geocoding/geocoding.module'
import { LandingModule } from './modules/landing/landing.module'
import { MediaModule } from './modules/media/media.module'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { OrdersModule } from './modules/orders/orders.module'
import { PaymentsModule } from './modules/payments/payments.module'
import { ProductsModule } from './modules/products/products.module'
import { PromoCodesModule } from './modules/promo-codes/promo-codes.module'
import { RatingsModule } from './modules/ratings/ratings.module'
import { SearchModule } from './modules/search/search.module'
import { SuppliersModule } from './modules/suppliers/suppliers.module'
import { TrainingModule } from './modules/training/training.module'
import { UsersModule } from './modules/users/users.module'
import { WalletModule } from './modules/wallet/wallet.module'

// Interface étendue pour les requêtes Express
interface ExpressRequest extends IncomingMessage {
  originalUrl?: string
}

// Interface étendue pour les réponses Express
interface ExpressResponse extends ServerResponse<IncomingMessage> {
  responseTime?: number
}

@Module({
  imports: [
    OpenTelemetryModule.forRoot(),
    SentryModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            levelFirst: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss',
            singleLine: true,
            messageFormat: false,
            ignore: 'pid,hostname,req,res,context,responseTime',
          },
        },
        autoLogging: true,
        serializers: {
          req: () => {
            return undefined // Don't log request details
          },
          res: () => {
            return undefined // Don't log response details
          },
        },
        // Filter out OpenAPI generator spam
        customReceivedMessage: (req: ExpressRequest) => {
          const url = req.originalUrl || req.url || ''
          // Skip logging for OpenAPI docs requests
          if (url.includes('/docs-json') || url.includes('/docs')) {
            return '' // Return false to skip logging this request
          }
          return `request received: ${req.method} ${url}`
        },
        customLogLevel: (req: ExpressRequest, res: ExpressResponse, error?: Error) => {
          if (res.statusCode >= 500 || error) {
            return 'error'
          }
          else if (res.statusCode >= 400) {
            return 'warn'
          }
          return 'info'
        },
        customSuccessMessage: (req: ExpressRequest, res: ExpressResponse) => {
          const originalUrl = req.originalUrl || req.url || ''
          // Skip logging for OpenAPI docs requests
          if (originalUrl.includes('/docs-json') || originalUrl.includes('/docs')) {
            return '' // Return false to skip logging this response
          }
          const method = req.method || ''
          const statusCode = res.statusCode
          const responseTime = res.responseTime || 0
          return `${method} ${originalUrl} ${statusCode} - ${responseTime}ms`
        },
        customErrorMessage: (req: ExpressRequest, res: ExpressResponse) => {
          const originalUrl = req.originalUrl || req.url || ''
          // Skip logging for OpenAPI docs requests
          if (originalUrl.includes('/docs-json') || originalUrl.includes('/docs')) {
            return '' // Return false to skip logging this response
          }
          const method = req.method || ''
          const statusCode = res.statusCode
          const responseTime = res.responseTime || 0
          return `${method} ${originalUrl} ${statusCode} - ${responseTime}ms`
        },
      },
    }),
    DbModule,
    AuthModule,
    EmailModule,
    AiModule,
    NestConfigModule,
    ExampleModule,
    SearchModule,
    BannersModule,
    LandingModule,
    GeocodingModule,
    PromoCodesModule,
    SuppliersModule,
    WalletModule,
    ProductsModule,
    OrdersModule,
    PaymentsModule,
    ChatModule,
    RatingsModule,
    CommunityModule,
    TrainingModule,
    AdminModule,
    RolesModule,
    UsersModule,
    MediaModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [{
    provide: APP_FILTER,
    useClass: SentryGlobalFilter,
  }],
})
export class AppModule {}
