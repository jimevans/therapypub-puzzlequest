import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Announcement, useAnnouncement } from "./Announcement";

function Count({ count }: { count: number }) {
  const message = useAnnouncement({ count }, (previous, current) =>
    current.count > previous.count ? `Now ${current.count}` : null
  );
  return <Announcement message={message} />;
}

describe("announcements", () => {
  it("say nothing at first, then what changed, and keep it", () => {
    const { rerender } = render(<Count count={1} />);
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("");

    rerender(<Count count={2} />);
    expect(region).toHaveTextContent("Now 2");

    rerender(<Count count={1} />);
    expect(region).toHaveTextContent("Now 2");
  });

  it("are read out but not shown", () => {
    render(<Count count={1} />);

    expect(screen.getByRole("status").className).toMatch(/announcement/);
  });
});
