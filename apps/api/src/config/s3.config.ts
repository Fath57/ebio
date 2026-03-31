import { S3Client } from '@aws-sdk/client-s3'
import { config } from './env.config'

export const s3Config = {
  endpoint: config.s3.endpoint,
  accessKey: config.s3.accessKey,
  secretKey: config.s3.secretKey,
  bucket: config.s3.bucket,
  region: config.s3.region,
  publicUrl: config.s3.publicUrl || `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com`,
}

export function createS3Client() {
  const options: ConstructorParameters<typeof S3Client>[0] = {
    region: s3Config.region,
    credentials: {
      accessKeyId: s3Config.accessKey,
      secretAccessKey: s3Config.secretKey,
    },
  }

  // Only set endpoint + forcePathStyle for non-AWS S3 (MinIO, R2, etc.)
  if (s3Config.endpoint) {
    options.endpoint = s3Config.endpoint
    options.forcePathStyle = true
  }

  return new S3Client(options)
}
