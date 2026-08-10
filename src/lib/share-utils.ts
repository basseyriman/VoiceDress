export const downloadAndSharePhoto = async (url: string, fileName = "voicedress-look.jpg") => {
  try {
    let objectUrl = url;
    let finalBlob: Blob;

    if (url.startsWith("idb:")) {
      const { loadBlob } = await import("@/lib/avatar-storage");
      const dataUrl = await loadBlob(url.replace("idb:", ""));
      if (!dataUrl) throw new Error("Could not load from IndexedDB");
      const res = await fetch(dataUrl);
      finalBlob = await res.blob();
    } else if (url.startsWith("data:")) {
      const res = await fetch(url);
      finalBlob = await res.blob();
    } else if (url.startsWith("blob:")) {
      const res = await fetch(url);
      finalBlob = await res.blob();
    } else {
      // 1. Fetch image as blob to avoid canvas CORS tainting on some browsers
      const response = await fetch(url);
      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);

      const img = new Image();
      img.src = objectUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas context");

      ctx.drawImage(img, 0, 0);

      // Elegant watermark
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(canvas.width - 240, canvas.height - 60, 220, 40, 20);
      } else {
        // Fallback for older Safari
        ctx.rect(canvas.width - 240, canvas.height - 60, 220, 40);
      }
      ctx.fill();

      ctx.font = "500 16px Inter, sans-serif";
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Styled by VoiceDress", canvas.width - 130, canvas.height - 40);

      // Convert to blob
      finalBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
          "image/jpeg",
          0.95
        );
      });
      URL.revokeObjectURL(objectUrl);
    }

    const file = new File([finalBlob], fileName, { type: "image/jpeg" });

    // Try native share (mobile) which opens native save/share sheet
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "My VoiceDress Look",
      });
    } else {
      // Fallback to desktop link download
      const dataUrl = URL.createObjectURL(finalBlob);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(dataUrl);
    }
  } catch (e) {
    console.error("Failed to download/share image", e);
    alert("Failed to download image. Please try again.");
    throw e;
  }
};
