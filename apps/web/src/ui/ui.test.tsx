import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { TextField } from "./TextField";

describe("Button", () => {
  it("does its action when pressed", async () => {
    const onPress = vi.fn();
    render(<Button onPress={onPress}>Solve</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Solve" }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("can be pressed from the keyboard", async () => {
    const onPress = vi.fn();
    render(<Button onPress={onPress}>Solve</Button>);

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does nothing while disabled", async () => {
    const onPress = vi.fn();
    render(
      <Button isDisabled onPress={onPress}>
        Solve
      </Button>
    );

    await userEvent.click(screen.getByRole("button", { name: "Solve" }));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Solve" })).toBeDisabled();
  });
});

describe("TextField", () => {
  it("is labelled, and reports what's typed", async () => {
    const onChange = vi.fn();
    render(<TextField label="Answer" onChange={onChange} />);

    await userEvent.type(screen.getByLabelText("Answer"), "lamp");

    expect(onChange).toHaveBeenLastCalledWith("lamp");
  });

  it("connects its description to the field", () => {
    render(<TextField label="Answer" description="One word" />);

    expect(screen.getByLabelText("Answer")).toHaveAccessibleDescription(
      "One word"
    );
  });

  it("shows its error, connected to the field, and is marked invalid", () => {
    render(<TextField label="Answer" errorMessage="That's not it" />);

    const field = screen.getByLabelText("Answer");
    expect(field).toBeInvalid();
    expect(field).toHaveAccessibleDescription("That's not it");
  });

  it("isn't marked invalid without an error", () => {
    render(<TextField label="Answer" />);

    expect(screen.getByLabelText("Answer")).toBeValid();
  });
});

describe("Banner", () => {
  it("announces a notice politely", () => {
    render(<Banner>Paused</Banner>);

    expect(screen.getByRole("status")).toHaveTextContent("Paused");
  });

  it("announces a problem at once", () => {
    render(<Banner tone="danger">Failed</Banner>);

    expect(screen.getByRole("alert")).toHaveTextContent("Failed");
  });
});
