'use server';

import { enrollSignature, getOwnSignaturePreviewUrl } from '../../../lib/data/signatures';

export async function enrollSignatureAction(formData: FormData) {
  try {
    await enrollSignature(formData);
    const { previewUrl, updatedAt } = await getOwnSignaturePreviewUrl();
    return { success: true, previewUrl, updatedAt };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save signature';
    return { error: msg };
  }
}
