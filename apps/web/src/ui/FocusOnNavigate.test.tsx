import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Outlet, RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { FocusOnNavigate, forgetShownPath } from "./FocusOnNavigate";

/** A screen whose heading appears only once it has loaded. */
function Slow() {
  const [loaded, setLoaded] = useState(false);
  return loaded ? (
    <h1>Loaded</h1>
  ) : (
    <button type="button" onClick={() => setLoaded(true)}>
      Load
    </button>
  );
}

/** Shows screens in a frame that moves focus, starting at /one. */
function show() {
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <FocusOnNavigate />
            <main>
              <Outlet />
            </main>
          </>
        ),
        children: [
          { path: "/one", element: <h1>One</h1> },
          { path: "/two", element: <h1>Two</h1> },
          { path: "/slow", element: <Slow /> },
        ],
      },
    ],
    { initialEntries: ["/one"] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  forgetShownPath();
});

describe("focus on navigating", () => {
  it("leaves the first screen to the browser", () => {
    show();

    expect(document.activeElement).toBe(document.body);
  });

  it("moves to the new screen's heading", async () => {
    const router = show();

    await act(() => router.navigate("/two"));

    const heading = screen.getByRole("heading", { name: "Two" });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute("tabindex", "-1");
  });

  it("waits for a heading still loading", async () => {
    const router = show();

    await act(() => router.navigate("/slow"));
    expect(document.activeElement).toBe(document.body);
    await act(async () => {
      screen.getByRole("button", { name: "Load" }).click();
    });

    expect(screen.getByRole("heading", { name: "Loaded" })).toHaveFocus();
  });
});

/** A form that gives way to its result when it's sent. */
function Replaced() {
  const [sent, setSent] = useState(false);
  return (
    <>
      <h1>The puzzle</h1>
      {sent ? (
        <p>Solved</p>
      ) : (
        <button type="button" onClick={() => setSent(true)}>
          Check answer
        </button>
      )}
    </>
  );
}

describe("keeping focus", () => {
  it("moves it to the heading when what had it leaves the page", async () => {
    const router = createMemoryRouter(
      [
        {
          element: (
            <>
              <FocusOnNavigate />
              <main>
                <Outlet />
              </main>
            </>
          ),
          children: [{ path: "/", element: <Replaced /> }],
        },
      ],
      { initialEntries: ["/"] }
    );
    render(<RouterProvider router={router} />);
    const button = screen.getByRole("button", { name: "Check answer" });
    button.focus();

    await act(async () => {
      button.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByRole("heading", { name: "The puzzle" })).toHaveFocus();
  });
});
