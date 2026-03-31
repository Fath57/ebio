import { SetMetadata } from '@nestjs/common'

export const Roles = (...roles: string[]): ReturnType<typeof SetMetadata> => SetMetadata('roles', roles)
