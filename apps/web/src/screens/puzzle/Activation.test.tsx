import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { ok, refusal } from "../../test/fakes";
import { Activation } from "./Activation";

const decoder = vi.hoisted(() => ({ sees: null as string | null }));

vi.mock("./decodeQr", () => ({ decodeQr: () => decoder.sees }));

const PATH = { questName: "trail", puzzleName: "riddle" };

function activated() {
  return ok({ activationTime: "2026-11-08T12:00:00.000Z" });
}

function wrongCode() {
  return refusal("wrong-activation-code", "Incorrect code");
}

function cameraAttempt() {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] };
  return { stop, stream };
}

function show(paused = false) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Activation
        path={PATH}
        paused={paused}
        connectionId={() => "connection-1"}
      />
    </QueryClientProvider>
  );
}

/** Waits long enough for the scanner to have looked at a few frames. */
async function afterSomeFrames() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
}

function hideTab(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: hidden,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("Activation", () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  let camera: ReturnType<typeof cameraAttempt>;

  beforeEach(() => {
    decoder.sees = null;
    camera = cameraAttempt();
    getUserMedia = vi.fn().mockResolvedValue(camera.stream);
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(
      4
    );
    vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(
      1280
    );
    vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(
      720
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue({ width: 800, height: 450 }),
    } as never);
  });

  afterEach(() => {
    hideTab(false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts the rear camera by itself", async () => {
    show();

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(getUserMedia.mock.calls[0]?.[0]).toMatchObject({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    expect(screen.queryByLabelText("Activation code")).not.toBeInTheDocument();
  });

  it("sends a code as soon as it sees one, as ordinary text", async () => {
    const post = vi.spyOn(api, "POST").mockResolvedValue(activated() as never);
    decoder.sees = "riddle-code";
    show();

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/quests/{questName}/puzzles/{puzzleName}/activation",
        {
          params: { path: PATH },
          // So this page isn't sent its own puzzleActivated update.
          body: { activationCode: "riddle-code", connectionId: "connection-1" },
        }
      )
    );
  });

  it("sends a code it keeps seeing only once, so as not to use up attempts", async () => {
    const post = vi.spyOn(api, "POST").mockResolvedValue(wrongCode() as never);
    decoder.sees = "wrong-code";
    show();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect code"
    );
    await afterSomeFrames();

    expect(post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Incorrect code");
  });

  it("tries a different code after a wrong one", async () => {
    const post = vi.spyOn(api, "POST").mockResolvedValue(wrongCode() as never);
    decoder.sees = "wrong-code";
    show();
    await screen.findByRole("alert");

    decoder.sees = "other-code";

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.lastCall?.[1]).toMatchObject({
      body: { activationCode: "other-code" },
    });
  });

  it("tries the same code again after no answer, but not at once", async () => {
    const post = vi
      .spyOn(api, "POST")
      .mockRejectedValue(new TypeError("Failed to fetch"));
    decoder.sees = "riddle-code";
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't reach the server"
    );
    await afterSomeFrames();
    expect(post).toHaveBeenCalledTimes(1);

    const later = Date.now() + 6000;
    vi.spyOn(Date, "now").mockReturnValue(later);

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  });

  it("lets go of the camera when it leaves the screen", async () => {
    const { unmount } = show();
    await afterSomeFrames();

    unmount();

    expect(camera.stop).toHaveBeenCalled();
  });

  it("lets go of a camera that arrives after it has left", async () => {
    let grant = (_stream: unknown) => {};
    getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        grant = resolve;
      })
    );
    const { unmount } = show();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    unmount();
    grant(camera.stream);

    await waitFor(() => expect(camera.stop).toHaveBeenCalled());
  });

  it.each([
    ["refused", "NotAllowedError"],
    ["missing", "NotFoundError"],
    ["in use", "NotReadableError"],
  ])("falls back to typing when the camera is %s", async (_why, name) => {
    getUserMedia.mockRejectedValue(new DOMException("No", name));
    show();

    expect(await screen.findByLabelText("Activation code")).toBeVisible();
    expect(screen.getByText(/couldn't use your camera/)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("types from the start in a browser with no camera at all", async () => {
    vi.stubGlobal("navigator", { userAgent: "no camera" });
    show();

    expect(screen.getByLabelText("Activation code")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Scan the QR code instead" })
    ).not.toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("moves to typing with one tap, letting go of the camera", async () => {
    show();
    await afterSomeFrames();

    await userEvent.click(
      screen.getByRole("button", { name: "Enter the code instead" })
    );

    expect(screen.getByLabelText("Activation code")).toBeVisible();
    expect(camera.stop).toHaveBeenCalled();
  });

  it("moves back to scanning with one tap", async () => {
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: "Enter the code instead" })
    );
    getUserMedia.mockClear();

    await userEvent.click(
      screen.getByRole("button", { name: "Scan the QR code instead" })
    );

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(screen.queryByLabelText("Activation code")).not.toBeInTheDocument();
  });

  it("leaves the camera alone while the quest is paused", () => {
    show(true);

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Activation code")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Scan the QR code instead" })
    ).not.toBeInTheDocument();
  });

  it("lets go of the camera in the background, and starts again on return", async () => {
    show();
    await afterSomeFrames();

    hideTab(true);
    expect(camera.stop).toHaveBeenCalled();
    getUserMedia.mockClear();

    hideTab(false);

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
  });
});
