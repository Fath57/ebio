import { SetMetadata } from '@nestjs/common'

export const Public = (): ReturnType<typeof SetMetadata> => SetMetadata('isPublic', true)
