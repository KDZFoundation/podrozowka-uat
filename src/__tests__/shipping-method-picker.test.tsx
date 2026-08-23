import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ShippingMethodPicker from "@/components/checkout/ShippingMethodPicker";

describe("ShippingMethodPicker", () => {
  it("always presents the five explicit delivery methods", () => {
    render(<ShippingMethodPicker value="inpost_locker" onChange={vi.fn()} />);

    expect(screen.getByLabelText(/InPost Paczkomat 24\/7/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/InPost Kurier/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ORLEN Paczka/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Pocztex Kurier/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Pocztex Punkt/i)).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });
});
