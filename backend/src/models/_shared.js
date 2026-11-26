const mongoose = require("mongoose");

// JSON output identical to what Prisma returned:
//   - `id` (string) instead of `_id`
//   - no `__v`
//   - ObjectId foreign keys (userId, hackathonId, ...) serialise as plain strings
const jsonOptions = {
  virtuals: true,
  versionKey: false,
  transform(doc, ret) {
    const { _id, id, ...rest } = ret;
    return { id: _id ? _id.toString() : id, ...rest };
  },
};

function createSchema(definition, options = {}) {
  return new mongoose.Schema(definition, {
    versionKey: false,
    toJSON: jsonOptions,
    toObject: jsonOptions,
    ...options,
  });
}

// MongoDB has no foreign keys. Postgres used to reject a row that pointed at a
// missing user / hackathon / team, so we re-create that guarantee here.
// A failure surfaces as a ValidationError (same place a Prisma P2003 used to land).
function refExists(modelName) {
  return {
    validator: async (value) =>
      (await mongoose.model(modelName).exists({ _id: value })) !== null,
    message: (props) => `${modelName} referenced by ${props.path} does not exist`,
  };
}

module.exports = { createSchema, refExists };
