import { Schema } from "mongoose";

/** Integer paise amount field. Rejects fractional and negative values. */
export function paiseField(options: { required?: boolean; default?: number; allowNegative?: boolean } = {}) {
  return {
    type: Number,
    required: options.required ?? false,
    default: options.default ?? 0,
    validate: {
      validator: (v: number) => Number.isSafeInteger(v) && (options.allowNegative || v >= 0),
      message: "Amount must be a whole, non-negative number of paise",
    },
  };
}

/** Integer basis points (0–10000) for tax and discount rates. */
export const basisPointsField = {
  type: Number,
  required: true,
  min: 0,
  max: 10_000,
  validate: { validator: Number.isSafeInteger, message: "Rate must be whole basis points" },
};

export const trimmedString = (maxlength: number, required = false) => ({
  type: String,
  trim: true,
  maxlength,
  required,
});

export const objectIdRef = (ref: string, required = false) => ({
  type: Schema.Types.ObjectId,
  ref,
  required,
});

/** Embedded communication-history entry shared by leads and customers. */
export const communicationSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["call", "whatsapp", "email", "meeting", "note"],
      required: true,
    },
    summary: trimmedString(2000, true),
    occurredAt: { type: Date, required: true },
    createdBy: objectIdRef("User", true),
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

/** Customer details copied onto a quotation or invoice at the time it is made. */
export const billingSnapshotSchema = new Schema(
  {
    name: trimmedString(200, true),
    businessName: trimmedString(200),
    email: trimmedString(200),
    phone: trimmedString(30),
    address: trimmedString(500),
    city: trimmedString(100),
    state: trimmedString(100),
    stateCode: trimmedString(2),
    gstin: trimmedString(15),
  },
  { _id: false },
);

/** A priced line on a quotation or invoice. All amounts are integer paise. */
export const lineItemSchema = new Schema(
  {
    service: objectIdRef("Service"),
    description: trimmedString(1000, true),
    sacCode: trimmedString(10),
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isSafeInteger, message: "Quantity must be a whole number" },
    },
    unitPricePaise: paiseField({ required: true }),
    discountPaise: paiseField(),
    taxRateBps: { ...basisPointsField, default: 0 },
    // Computed server-side; never accepted from the client.
    amountPaise: paiseField({ required: true }),
    taxablePaise: paiseField({ required: true }),
    cgstPaise: paiseField(),
    sgstPaise: paiseField(),
    igstPaise: paiseField(),
    totalPaise: paiseField({ required: true }),
  },
  { _id: false },
);

export const documentTotalsSchema = new Schema(
  {
    subtotalPaise: paiseField({ required: true }),
    discountPaise: paiseField(),
    taxablePaise: paiseField({ required: true }),
    cgstPaise: paiseField(),
    sgstPaise: paiseField(),
    igstPaise: paiseField(),
    taxPaise: paiseField(),
    totalPaise: paiseField({ required: true }),
  },
  { _id: false },
);
