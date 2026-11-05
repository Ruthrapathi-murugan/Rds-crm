import type { LineItemInput } from "@/lib/validations/finance";

/**
 * A blank line item for the quotation/invoice editor. Lives outside the
 * "use client" editor module so server pages can use the real object.
 */
export const EMPTY_LINE: LineItemInput = {
  service: "",
  description: "",
  sacCode: "",
  quantity: "1",
  unitPrice: "",
  discount: "",
  taxRate: "",
};
