export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const allowed = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
    const mime = (file.type || "").toLowerCase();
    if (!allowed.has(mime)) {
      reject(new Error("Please choose a PNG, JPG, or WEBP image."));
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      reject(new Error("Image must be 50 MB or smaller."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read image."));
    };
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}
