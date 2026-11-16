/**
 * Compresses an image file by resizing it to a maximum width/height
 * while preserving PNG transparency (alpha channel).
 * Defaults to 'image/png' so transparent PNGs never turn into black-background JPEGs.
 */
export function compressImage(
  file: File,
  maxWidth = 400,
  maxHeight = 400,
  quality = 0.9,
  outputMimeType: "image/png" | "image/webp" | "image/jpeg" = "image/png"
): Promise<File> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // If the original file is already PNG within target bounds and under 1MB, return as-is to keep exact alpha channel
        if (
          outputMimeType === "image/png" &&
          file.type === "image/png" &&
          width <= maxWidth &&
          height <= maxHeight &&
          file.size <= 1024 * 1024
        ) {
          resolve(file);
          return;
        }

        const canvas = document.createElement("canvas");

        // Calculate new dimensions preserving aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) {
          resolve(file);
          return;
        }

        // Clear canvas explicitly to guarantee transparent alpha background
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const ext = outputMimeType === "image/png" ? "png" : outputMimeType === "image/webp" ? "webp" : "jpg";
        const baseName = file.name.replace(/\.[^/.]+$/, "") || "logo";
        const outputFileName = `${baseName}.${ext}`;

        // Convert canvas image to Blob preserving image/png transparency
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], outputFileName, {
                type: outputMimeType,
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          outputMimeType,
          outputMimeType === "image/png" ? undefined : quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses an image file and returns a promise resolving with the base64 data URL.
 * Defaults to 'image/png' to preserve transparency.
 */
export function compressImageToBase64(
  file: File,
  maxWidth = 400,
  maxHeight = 400,
  quality = 0.9,
  outputMimeType: "image/png" | "image/webp" | "image/jpeg" = "image/png"
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("File is not an image"));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const base64 =
          outputMimeType === "image/png"
            ? canvas.toDataURL("image/png")
            : canvas.toDataURL(outputMimeType, quality);
        resolve(base64);
      };
      img.onerror = () => reject(new Error("Image loading failed"));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error("File reading failed"));
    reader.readAsDataURL(file);
  });
}
