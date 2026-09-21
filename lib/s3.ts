import fs from 'fs';
import path from 'path';
import { PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

export async function uploadBuffer(
  buffer: Buffer,
  fileName: string,
  contentType: string
): Promise<string> {
  const bucketName = process.env.AWS_BUCKET_NAME ?? '';
  const folderPrefix = process.env.AWS_FOLDER_PREFIX ?? '';

  // ONLY attempt S3 if valid AWS credentials AND bucket name are explicitly configured
  const hasAwsCredentials = Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    bucketName
  );

  if (hasAwsCredentials) {
    try {
      const region = process.env.AWS_REGION || 'us-east-1';
      const s3 = new S3Client({ region });
      const key = `${folderPrefix}public/tts-clips/${Date.now()}-${fileName}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        })
      );

      return `https://${bucketName}.s3.${region}.amazonaws.com/${key
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`;
    } catch (err) {
      console.warn('AWS S3 upload failed, falling back to local storage:', err);
    }
  }

  // Fallback: Store locally in public/uploads directory for development / AI Studio
  const publicDir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const safeFileName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = path.join(publicDir, safeFileName);
  await fs.promises.writeFile(filePath, buffer);

  return `/uploads/${safeFileName}`;
}

export async function deleteFile(cloud_storage_path: string): Promise<void> {
  const bucketName = process.env.AWS_BUCKET_NAME ?? '';
  const hasAwsCredentials = Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    bucketName
  );

  if (hasAwsCredentials) {
    try {
      const region = process.env.AWS_REGION || 'us-east-1';
      const s3 = new S3Client({ region });
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: cloud_storage_path,
        })
      );
      return;
    } catch (err: any) {
      console.error('Failed to delete S3 file:', err?.message);
    }
  }

  // Local fallback deletion
  try {
    if (cloud_storage_path.startsWith('/uploads/')) {
      const localPath = path.join(process.cwd(), 'public', cloud_storage_path);
      if (fs.existsSync(localPath)) {
        await fs.promises.unlink(localPath);
      }
    }
  } catch (err: any) {
    console.warn('Failed to delete local file:', err?.message);
  }
}
