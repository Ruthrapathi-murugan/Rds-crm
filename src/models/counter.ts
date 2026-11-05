import { Schema } from "mongoose";
import { defineModel } from "./model";

/** Atomic sequences for human-readable numbers (LD-00001, RDS/26-27/0001, …). */
const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 },
});

export const CounterModel = defineModel("Counter", counterSchema);
