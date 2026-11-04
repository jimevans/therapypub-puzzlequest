import { type InferSchemaType, Schema, Types, model } from "mongoose";

/**
 * The organization that runs the site today. The business runs every
 * experience itself for now, so every record belongs to this one; records
 * carry their organization so that hosting several later needs no data
 * migration.
 */
export const DEFAULT_ORGANIZATION_ID = new Types.ObjectId(
  "000000000000000000000001"
);

/** An organization that creates and runs puzzle experiences. */
const organizationSchema = new Schema(
  {
    /** The unique name of the organization. */
    name: {
      type: String,
      required: true,
      unique: true,
    },
    /** The name shown to people. */
    displayName: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

/** An organization as stored in the database. */
export type OrganizationData = InferSchemaType<typeof organizationSchema>;

export const OrganizationModel = model("Organization", organizationSchema);

/**
 * The organization field every record has. Records that don't say belong to
 * the default organization.
 */
export const organizationField = {
  type: Schema.Types.ObjectId,
  ref: "Organization",
  required: true,
  default: () => DEFAULT_ORGANIZATION_ID,
} as const;

/**
 * Makes sure the default organization exists, as it must before any record
 * can belong to it. Safe to call every time the application starts.
 */
export async function ensureDefaultOrganization(): Promise<void> {
  await OrganizationModel.updateOne(
    { _id: DEFAULT_ORGANIZATION_ID },
    { $setOnInsert: { name: "default", displayName: "PuzzleQuest" } },
    { upsert: true }
  );
}
