'use strict';

const getAuthString = authData => {
  const user = authData.user;
  const pw = authData.pw;
  return new Buffer(`${user}:${pw}`).toString('base64');
};

module.exports = {
  getAuthString
};
