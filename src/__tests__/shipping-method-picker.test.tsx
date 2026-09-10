import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ShippingMethodPicker from "@/components/checkout/ShippingMethodPicker";

describe("ShippingMethodPicker", () => {
  it("groups delivery methods under their carriers", () => {
    const onChange = vi.fn();
    const { rerender } = render(<ShippingMethodPicker value="inpost_locker" onChange={onChange} />);

    expect(screen.getByRole("button", { name: /^InPost/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^ORLEN Paczka/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pocztex/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Paczkomat InPost/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/InPost Kurier/i)).toBeInTheDocument();

    rerender(<ShippingMethodPicker value="orlen_paczka" onChange={onChange} />);
    expect(screen.getByLabelText(/Punkt ORLEN Paczka/i)).toBeInTheDocument();

    rerender(<ShippingMethodPicker value="pocztex_point" onChange={onChange} />);
    expect(screen.getByLabelText(/Pocztex Kurier/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Pocztex Punkt/i)).toBeInTheDocument();
  });
});
