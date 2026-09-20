import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client, getBucketConfig } from "./aws-config";

export async function uploadBuffer(
  buffer: Buffer,
  fileName: string,
  contentType: string
): Promise<string> {
  const s3 = createS3Client();
  const { bucketName, folderPrefix } = getBucketConfig();
  const key = `${folderPrefix}public/tts-clips/${Date.now()}-${fileName}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const region = (await s3.config.region?.()) ?? 'us-east-1';
  return `https://${bucketName}.s3.${region}.amazonaws.com/${key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

export async function deleteFile(cloud_storage_path: string): Promise<void> {
  try {
    const s3 = createS3Client();
    const { bucketName } = getBucketConfig();
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: cloud_storage_path,
      })
    );
  } catch (err: any) {
    console.error('Failed to delete S3 file:', err?.message);
  }
}
