const { runWithOrg } = require('../lib/orgContext');

// Must run AFTER requireLogin, so req.session.user is guaranteed present.
// Wraps the rest of the request pipeline in the current company's context —
// every Prisma call made anywhere downstream (controller, service, nested
// service call) can read it via getOrgId(), with no need to pass it around.
function attachOrgContext(req, res, next) {
    const organizationId = req.session?.user?.organizationId;
    if (!organizationId) {
        return res.status(401).json({ message: 'Session missing organization context' });
    }
    runWithOrg(organizationId, next);
}

module.exports = { attachOrgContext };
