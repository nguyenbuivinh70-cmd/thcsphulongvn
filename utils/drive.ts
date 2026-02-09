
// utils/drive.ts
export const extractDriveFileId = (url: string): string => {
  if (!url) return '';

  // /file/d/<id>/
  let m = url.match(/\/file\/d\/([^\/?#]+)/);
  if (m?.[1]) return m[1];

  // ?id=<id>
  m = url.match(/[?&]id=([^&?#]+)/);
  if (m?.[1]) return m[1];

  // /uc?id=<id> or /thumbnail?id=<id>
  m = url.match(/\/(uc|thumbnail)\?[^#]*id=([^&?#]+)/);
  if (m?.[2]) return m[2];

  return '';
};

export const isDriveFolderUrl = (url: string): boolean => {
  if (!url) return false;
  return /drive\.google\.com\/drive\/.*\/folders\/|drive\.google\.com\/folders\//.test(url);
};

export const extractDriveFolderId = (url: string): string => {
  if (!url) return '';
  const m = url.match(/\/folders\/([^\/?#]+)/);
  return m?.[1] || '';
};

export const convertDriveUrl = (url: string): string => {
  if (!url) return url;
  if (!url.includes('drive.google.com')) return url;

  // Nếu là folder link thì không convert theo file
  if (isDriveFolderUrl(url)) return url;

  const fileId = extractDriveFileId(url);
  if (!fileId) return url;

  // Dùng link trực tiếp (ổn cho <img> và <video> trong web app)
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
};

/**
 * Chuyển đổi link Drive sang định dạng lh3 để hiển thị ảnh ổn định hơn
 * Dạng: https://lh3.googleusercontent.com/d/FILE_ID
 */
export const convertDriveImageToLh3 = (url: string): string => {
  if (!url) return url;
  if (!url.includes('drive.google.com')) return url;

  const fileId = extractDriveFileId(url);
  if (!fileId) return url;

  return `https://lh3.googleusercontent.com/d/${fileId}`;
};
