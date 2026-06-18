/**
 * S3 audio upload with presigned URL generation.
 *
 * Replaces Firebase Storage. Audio files are uploaded privately;
 * access is granted via time-limited presigned URLs (15 min).
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({});
const BUCKET_NAME = process.env.AUDIO_BUCKET ?? "ghost-pay-audio";
const PRESIGN_EXPIRY_SECONDS = 15 * 60; // 15 minutes

/**
 * Upload an audio file to S3 (private) and return a presigned URL.
 */
export async function uploadConfirmationAudio(
  transactionId: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const key = `audio/confirm_${transactionId}.mp3`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    })
  );

  // Generate a presigned URL for the mobile app to download
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
    { expiresIn: PRESIGN_EXPIRY_SECONDS }
  );

  return url;
}
