
function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
        data: null,
      });
    }

    const userRole = req.user.role.toUpperCase();

    const normalizedAllowedRoles = allowedRoles.map((role) =>
      role.toUpperCase()
    );

    if (!normalizedAllowedRoles.includes(userRole)) {
      return res.status(403).json({
        status: false,
        message: "You do not have permission to access this resource",
        data: null,
      });
    }

    next();
  };
}

module.exports = authorizeRole;