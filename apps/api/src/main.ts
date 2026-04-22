import { createOpenApiDocument, ZodSerializationExceptionFilter, ZodValidationExceptionFilter } from '@lonestone/nzoth/server'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder } from '@nestjs/swagger'
import { apiReference } from '@scalar/nestjs-api-reference'
import * as express from 'express'
import { join } from 'node:path'
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino'
import { AppModule } from './app.module'
import { config } from './config/env.config'
import { initialiazeTelemetry } from './instrument'

const PREFIX = '/api'

async function bootstrap() {
  // Initialize telemetry
  initialiazeTelemetry()

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  })

  // Use Pino logger
  app.useLogger(app.get(Logger))

  // Adding error details to the logs
  // https://github.com/iamolegga/nestjs-pino?tab=readme-ov-file#expose-stack-trace-and-error-class-in-err-property
  app.useGlobalInterceptors(new LoggerErrorInterceptor())

  // Registering custom exception filter for the Nzoth package
  app.useGlobalFilters(
    new ZodValidationExceptionFilter(),
    new ZodSerializationExceptionFilter(),
  )

  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      // If is routes of better auth, next
      if (req.originalUrl.startsWith(`${PREFIX}/auth`)) {
        return next()
      }
      // If is stripe webhook, we need the raw body
      if (req.originalUrl.startsWith(`${PREFIX}/payments/webhook/stripe`)) {
        return express.raw({ type: 'application/json' })(req, res, next)
      }
      // Else, apply the express json middleware
      express.json()(req, res, next)
    },
  )

  // Serve static files (logo for email templates, etc.)
  app.use('/static', express.static(join(__dirname, '..', 'public')))

  const LAN_IP_PATTERN = /^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      if (config.betterAuth.trustedOrigins.includes(origin)) return cb(null, true)
      if (config.env !== 'production' && LAN_IP_PATTERN.test(origin)) return cb(null, true)
      return cb(new Error(`Origin ${origin} not allowed`), false)
    },
    credentials: true,
  })

  app.setGlobalPrefix(PREFIX)

  if (config.env === 'development') {
    const swaggerConfig = new DocumentBuilder()
      .setOpenAPIVersion('3.1.0')
      .setTitle('eBio API')
      .setDescription('API du marketplace eBio')
      .setVersion('1.0')
      .addTag('ebio')
      .build()

    const document = createOpenApiDocument(app, swaggerConfig)

    app.use(
      `${PREFIX}/docs.json`,
      (_: express.Request, res: express.Response) => {
        res.json(document)
      },
    )

    app.use(
      `${PREFIX}/docs`,
      apiReference({
        url: `${PREFIX}/docs.json`,
      }),
    )
  }

  app.enableShutdownHooks()
  await app.listen(config.api.port)
}

bootstrap()
