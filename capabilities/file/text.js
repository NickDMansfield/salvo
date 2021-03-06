'use strict';
const _ = require('lodash');
const fs = require('fs');
const Promise = require('bluebird');

const getFileText = ((fileLocation, replacements, cb) => {
  return fs.readFile(`${fileLocation}`, 'utf8', (err, readData) => {
    if (err) {
      return cb(err);
    }
    if (replacements && Array.isArray(replacements)) {
      // Only do this if there is a replacements object and it isn't parsing the cb instead
      return cb(null, replaceText(readData, replacements));
    }
    return cb(null, readData);
  });
});

const replaceAll = ((str, find, replace) => {
  return str.replace(new RegExp(find, 'g'), replace);
});

const replaceText = ((text, replacements) => {
  // replacements should be an array of objects
  let editText = text;
  for (let replacementIndex = 0; replacementIndex < replacements.length; ++replacementIndex) {
    editText = replaceAll(editText, replacements[replacementIndex].searchString, replacements[replacementIndex].replaceString);
  }
  return editText;
});

const editText = ((fileLocation, replacements) => {
  const replace = require('replace-in-file');
  console.log(`REPLACEMENTS: \r\n ${JSON.stringify(replacements, 0, 2)}`);
  const options = {
    // Single file or glob
    files: fileLocation,

    // Replacement to make (string or regex)
    from: Array.isArray(replacements) ? _.map(replacements, 'from') : replacements.from,
    to: Array.isArray(replacements) ? _.map(replacements, 'to') : replacements.to,
    // Specify if empty/invalid file paths are allowed (defaults to false)
    // If set to true these paths will fail silently and no error will be thrown.
    allowEmptyPaths: false,
    // Character encoding for reading/writing files (defaults to utf-8)
    encoding: 'utf8',
  };
  return replace(options)
  .then(changedFiles => {
    console.log('Modified files:', changedFiles.join(', '));
    return true
  })
  .catch(error => {
    console.error('Error occurred:', error);
  });
});

const fixSlashes = function(str, slash) {
  return str.replace('/', slash).replace('\\', slash);
}

module.exports = {
  getFileText,
  editText,
  replaceText,
  fixSlashes
};
