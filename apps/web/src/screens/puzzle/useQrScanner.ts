import { type RefObject, useEffect, useEffectEvent, useRef } from "react";

/** How often to look at the camera's picture: quick, but not every frame. */
const SCAN_INTERVAL_MS = 150;

/** Frames are shrunk to this width, which is plenty, and much faster to read. */
const MAXIMUM_WIDTH = 800;

/** The picture the camera has, once it has started. */
function hasPicture(video: HTMLVideoElement): boolean {
  return video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0;
}

/**
 * Whether this browser can offer a camera at all. It can't on a page that isn't
 * secure, or in an in-app browser that doesn't allow it.
 * @returns true if it's worth trying
 */
export function canScan(): boolean {
  return (
    "mediaDevices" in navigator && "getUserMedia" in navigator.mediaDevices
  );
}

/**
 * Reads QR codes from the camera for as long as the component is on screen.
 * Frames are read on the phone and never leave it.
 * @param onCode called with what a code says, on every frame it's seen in
 * @param onUnavailable called if the camera can't be used: refused, missing, or
 *  in use by something else
 * @returns the ref to put on the video element that shows the camera's picture
 */
export function useQrScanner(
  onCode: (code: string) => void,
  onUnavailable: () => void
): RefObject<HTMLVideoElement | null> {
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeSeen = useEffectEvent(onCode);
  const cameraUnavailable = useEffectEvent(onUnavailable);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const canvas = document.createElement("canvas");
    let context: CanvasRenderingContext2D | null = null;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Which start is current, so that one overtaken by leaving the page or by a
    // later start knows to give up its camera.
    let currentStart = 0;

    function stopCamera() {
      currentStart++;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      if (video) {
        video.srcObject = null;
      }
    }

    function scan(decode: (image: ImageData) => string | null) {
      if (video && hasPicture(video)) {
        const scale = Math.min(1, MAXIMUM_WIDTH / video.videoWidth);
        const width = Math.round(video.videoWidth * scale);
        const height = Math.round(video.videoHeight * scale);
        canvas.width = width;
        canvas.height = height;
        context ??= canvas.getContext("2d", { willReadFrequently: true });
        context?.drawImage(video, 0, 0, width, height);
        const image = context?.getImageData(0, 0, width, height);
        const code = image && decode(image);
        if (code) {
          codeSeen(code);
        }
      }
      timer = setTimeout(() => scan(decode), SCAN_INTERVAL_MS);
    }

    async function startCamera() {
      const thisStart = ++currentStart;
      try {
        const [{ decodeQr }, camera] = await Promise.all([
          import("./decodeQr"),
          navigator.mediaDevices.getUserMedia({
            video: {
              // "ideal", so that a laptop's only camera still works.
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          }),
        ]);
        if (thisStart !== currentStart || !video) {
          camera.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = camera;
        video.srcObject = camera;
        await video.play();
        if (thisStart === currentStart) {
          scan(decodeQr);
        }
      } catch {
        if (thisStart === currentStart) {
          stopCamera();
          cameraUnavailable();
        }
      }
    }

    // A phone takes the camera away from a page in the background, so let go of
    // it, and start again on coming back.
    function followVisibility() {
      if (document.hidden) {
        stopCamera();
      } else if (!stream) {
        void startCamera();
      }
    }

    document.addEventListener("visibilitychange", followVisibility);
    void startCamera();
    return () => {
      document.removeEventListener("visibilitychange", followVisibility);
      stopCamera();
    };
  }, []);

  return videoRef;
}
