import { model, models, type InferSchemaType, type Model, type Schema, type Types } from "mongoose";

/** Registers a model once; reuses it across hot reloads and warm invocations. */
export function defineModel<TSchema extends Schema>(name: string, schema: TSchema) {
  return ((models[name] as Model<InferSchemaType<TSchema>> | undefined) ??
    model(name, schema)) as Model<InferSchemaType<TSchema>>;
}

/** Shape of a document returned by `.lean()`. */
export type LeanDoc<TSchema extends Schema> = InferSchemaType<TSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};
