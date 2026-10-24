import { Capacitor, registerPlugin } from '@capacitor/core';

export type NativeGalleryPhoto = { id: string; name: string; album: string; dateAdded: number; thumbnail?: string };
type NativeGalleryPlugin = {
  getPhotos: () => Promise<{ photos: NativeGalleryPhoto[] }>;
  getImage: (options: { id: string }) => Promise<{ dataUrl: string; name?: string }>;
};
const NativeGallery = registerPlugin<NativeGalleryPlugin>('NativeGallery');
export const isNativeGalleryAvailable = (): boolean => Capacitor.isNativePlatform();

function dataUrlToFile(dataUrl: string, name = 'photo.jpg'): File {
  const [metadata, encoded] = dataUrl.split(',');
  if (!metadata || !encoded) throw new Error('The selected photo data was incomplete.');
  const mimeType = metadata.match(/data:(.*?);/)?.[1] || 'image/jpeg';
  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: mimeType });
}
export async function loadNativeGalleryPhotos(): Promise<NativeGalleryPhoto[]> {
  const result = await NativeGallery.getPhotos();
  return Array.isArray(result.photos) ? result.photos : [];
}
export async function loadNativeGalleryImage(photo: NativeGalleryPhoto): Promise<File> {
  const result = await NativeGallery.getImage({ id: photo.id });
  if (!result.dataUrl) throw new Error('The selected photo could not be loaded.');
  return dataUrlToFile(result.dataUrl, result.name || photo.name || 'photo.jpg');
}
