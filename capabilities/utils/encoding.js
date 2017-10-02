'use strict';

const base64 = text => {
  return new Buffer(text).toString('base64');
};

const forceEncode = (text, encoder) => {
  return new Buffer(text).toString(encoder);
};

module.exports = {
  base64,
  forceEncode
};
