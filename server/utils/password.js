const bcrypt = require('bcryptjs');

function hashPassword(plainPassword) {
    if (!plainPassword) {
        throw new Error('Plain password is required to generate a hash');
    }
    return bcrypt.hashSync(plainPassword, 12);
}

module.exports = { hashPassword };
