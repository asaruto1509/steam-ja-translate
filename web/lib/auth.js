'use strict';

function checkCredentials(user, pass, expectedUser, expectedPass) {
  return typeof user === 'string' && typeof pass === 'string'
    && user === expectedUser && pass === expectedPass;
}

function parseBasicAuthHeader(header) {
  var match = /^Basic (.+)$/.exec(header || '');
  if (!match) return null;
  var decoded = Buffer.from(match[1], 'base64').toString('utf8');
  var sep = decoded.indexOf(':');
  if (sep === -1) return { user: decoded, pass: '' };
  return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
}

function createBasicAuthMiddleware(expectedUser, expectedPass) {
  return function (req, res, next) {
    var creds = parseBasicAuthHeader(req.headers.authorization);
    if (creds && checkCredentials(creds.user, creds.pass, expectedUser, expectedPass)) {
      next();
      return;
    }
    res.set('WWW-Authenticate', 'Basic realm="dashboard"');
    res.status(401).send('Authentication required');
  };
}

module.exports = {
  checkCredentials: checkCredentials,
  createBasicAuthMiddleware: createBasicAuthMiddleware
};
