import type { AuthenticatedRequest } from './auth.guard'
import { TypedBody } from '@lonestone/nzoth/server'
import {
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from './auth.guard'
import { BiometricService } from './biometric.service'
import { biometricEnrollSchema, biometricVerifySchema } from './contracts/auth.contract'

/**
 * A throttle, not a security boundary.
 *
 * The secret is 32 random bytes, so guessing it is out of reach whatever the
 * rate; what this stops is an open endpoint being hammered into the database.
 * In memory because the API runs as one process — move it to Redis the day it
 * runs as several, or each will allow its own share.
 */
const MAX_ATTEMPTS = 10
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000
const attempts = new Map<string, { count: number, resetAt: number }>()

function tooManyAttempts(deviceId: string): boolean {
  const now = Date.now()
  const current = attempts.get(deviceId)

  if (!current || current.resetAt <= now) {
    attempts.set(deviceId, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS })
    return false
  }

  current.count += 1
  return current.count > MAX_ATTEMPTS
}

function forgetAttempts(deviceId: string): void {
  attempts.delete(deviceId)
}

/**
 * Not under `/auth`: Better Auth is mounted on `/api/auth/*` as a catch-all
 * middleware and answers before Nest's router ever sees the request. The
 * app's own sign-in lives under `otp-auth`, and this belongs with it.
 */
@Controller('otp-auth/biometric')
export class BiometricController {
  constructor(private readonly biometric: BiometricService) {}

  /**
   * Trusts the phone that is asking, which must already be signed in.
   *
   * The secret comes back exactly once. Nothing later can read it again, so
   * the app stores it in the keystore before it does anything else.
   */
  @UseGuards(AuthGuard)
  @Post('enroll')
  async enroll(
    @Req() req: AuthenticatedRequest,
    @TypedBody(biometricEnrollSchema) body: { deviceId: string, label: string },
  ) {
    const device = await this.biometric.enroll(req.session.user.id, body.deviceId, body.label)
    return {
      id: device.id,
      label: device.label,
      secret: device.secret,
    }
  }

  /** Opens a session from a device that holds the secret. No session needed. */
  @Post('verify')
  async verify(
    @TypedBody(biometricVerifySchema) body: { deviceId: string, secret: string },
  ) {
    if (tooManyAttempts(body.deviceId)) {
      throw new HttpException('Trop de tentatives, réessayez plus tard', HttpStatus.TOO_MANY_REQUESTS)
    }

    const result = await this.biometric.verify(body.deviceId, body.secret)
    if (!result) {
      // One wording for every refusal: an unknown device and a wrong secret
      // must not be told apart.
      throw new UnauthorizedException('Connexion par empreinte impossible sur cet appareil')
    }

    forgetAttempts(body.deviceId)
    return {
      accessToken: result.accessToken,
      user: {
        id: result.user.id,
        name: result.user.name,
        phone: result.user.phone ?? null,
        role: result.user.role,
      },
    }
  }

  @UseGuards(AuthGuard)
  @Get('devices')
  async devices(
    @Req() req: AuthenticatedRequest,
    @Query('deviceId') deviceId?: string,
  ) {
    return { devices: await this.biometric.list(req.session.user.id, deviceId ?? null) }
  }

  @UseGuards(AuthGuard)
  @Delete('devices/:id')
  async revoke(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.biometric.revoke(req.session.user.id, id)
    return { revoked: true }
  }
}
