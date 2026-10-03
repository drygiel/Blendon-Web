// What other features ask of an open pie menu, filled in by the pie menu runtime.
export const PieRegistry = {
  isOpen: () => false,
  /** Offers a numpad digit to the open menu; true when the menu owns it. */
  tryAccelerator: (_digit: number) => false,
};
