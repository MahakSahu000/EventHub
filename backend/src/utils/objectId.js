// Prisma returned `null` (-> 404) for any unknown id string.
// Mongoose throws a CastError for strings that are not valid ObjectIds,
// so every lookup by id is guarded with this helper to keep the same behaviour.
function isValidId(id) {
  return typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
}

module.exports = { isValidId };
