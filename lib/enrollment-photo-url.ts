/** Browser URL for an enrollment row (served by API — works when public/ static path fails). */
export function enrollmentPhotoApiUrl(photoId: number): string {
  return `/api/admin/face-enrollment/photo?id=${photoId}`;
}
