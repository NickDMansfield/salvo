#! /usr/bin/env node

'use strict';

const program = require('commander');
const _ = require('lodash');
const fs = require('fs');
const cmd = require('node-cmd');
const Promise = require('bluebird');
const Client = require('node-rest-client').Client;
const rClient = new Client();
const util = require('util');
const xml2js = require('xml2js');
const email = require('./capabilities/email/email.js');
const textEditor = require('./capabilities/file/text.js');
const request = require('request');
const Time = require('time-js')
const encode = require('./capabilities/utils/encoding.js');

const storedValues = {
  datetimeRun: new Date().valueOf(),
  access_token:'TEMPORARY_TOKEN'
};
let logLevel = 0;
let showErrors = true;

const storedValues = {
  datetimeRun: new Date().valueOf(),
  curDir: process.cwd()
};

const smartLog = (string, lvlRequired) => {
  if (lvlRequired && logLevel >= lvlRequired) {
    console.log(string);
  }
};

const showErr = (string) => {
  if (showErrors) {
    console.log(string);
  }
};

const extractData = ((extractionData, method, extractionModifiers) => {
  let extractedData = null;
  if (method === 'string') {
    extractedData = extractionData;
  }
  if (method === 'object') {
    // This allows you to use nested paths via arrays
    // Example
    // _.get({some: {'nested.field': 123}}, ['some', 'nested.field']);
    // => 123
    extractedData = extractionModifiers.source === '$$all$$' ? extractionData : _.get(extractionData, extractionModifiers.source);
  }
  if (method === 'array') {
    extractedData = extractionModifiers.source === '$$all$$' ? extractionData : extractionData[extractionModifiers.source];
  }
  if (method === 'regex') {
    // There is an assumption that the first index will just be the match, and everything else is the capture
    const capRegex = new RegExp(extractionModifiers.source);
    const capturedRegex = capRegex.exec(extractionData);
    extractedData = capturedRegex;
    if (capturedRegex) {
      extractedData = extractionModifiers.regexIndex ? capturedRegex[extractionModifiers.regexIndex] : capturedRegex;
    }
  }
  if (extractionModifiers.forceType) {
    const forceType = extractionModifiers.forceType;
    if (forceType.toLowerCase() === 'number') {
      return Number(extractedData);
    }
    if (forceType.toLowerCase() === 'string') {
      return extractedData.toString();
    }
    if (forceType.toLowerCase() === 'jsonStringify') {
      return JSON.stringify(extractedData, 0, 2);
    }
  }
  return extractedData;
});

const captureData = (action, respSet) => {
  smartLog(`RESPSET: ${util.inspect(respSet, 0, 2)}`, 5);
  const data = (typeof respSet).toLowerCase() === 'object' ? respSet[0] : respSet;
  if (!action.capture) {
    // Terminate early if there is no capture data
    return false;
  }
  if (!Array.isArray(action.capture) && typeof action.capture === 'object') {
    // If a single object is passed in, we wrap it in an array for iterator-safe parsing
    action.capture = [action.capture];
  }
  for (const captureItem of action.capture) {
    // First, we get the proper data
    let foundData = null;
    foundData = extractData(data, captureItem.type, captureItem.extractionModifiers || { source: captureItem.source });

    // Now that the data is set, we save it
    if (captureItem.captureType === 'set') {
      if (captureItem.values) {
        // this is used when you want to save multiple values to the same stored object
        const objectWithProperties = {};
        for (const itemValue of captureItem.values) {
          objectWithProperties[itemValue.key] = extractData(data, itemValue.type, itemValue.extractionModifiers);
        }
      }
      storedValues[captureItem.target] = foundData;
    }
    if (captureItem.captureType === 'push') {
      if (!storedValues[captureItem.target]) {
        storedValues[captureItem.target] = [];
      }
      storedValues[captureItem.target].push(foundData);
    }
    smartLog(`STORED VALUES \r\n ${util.inspect(storedValues)}`, 3);
  }
  return true;
};

const updateVar = ((path, data, action) => {

  if (action === 'increment') {
    if (typeof storedValues[path] === 'string' || typeof storedValues[path] === 'undefined') {
      storedValues[path] = (storedValues[path] ? storedValues[path].toString() : '') + data;
    } else {
      storedValues[path] = Number(storedValues[path]) + data;
    }
  }

  if (action === 'increment-number') {
    storedValues[path] = Number(storedValues[path] || 0) + Number(data);
  }

  if (action === 'push') {
    if (!storedValues[path]) {
      storedValues[path] = [];
    }
    storedValues[path].push(data);
  }
  if (action === 'set') {
    storedValues[path] = data;
  }
});

const makeRestCall = callProps => {
  const requestArgs = {
    data: callProps.data, // data passed to REST method (only useful in POST, PUT or PATCH methods)
    path: callProps.path, // path substitution var
    parameters: callProps.parameters, // this is serialized as URL parameters
    headers: callProps.headers, // request headers
    requestConfig: callProps.requestConfig || { timeout: 300000, keepAlive: true },
    responseConfig: callProps.responseConfig || { timeout: 300000 }
  };

  return new Promise(callFinished => {
    if (callProps.attachment) {
      const formData = {};
      formData[callProps.attachment.fileName] = fs.createReadStream(callProps.attachment.filePath);
      return request.post({ url: callProps.target, formData, headers: callProps.headers }, (err, httpResult) => {
        if (err) {
          showErr(`Error sending file: ${err}`);
        }
        // -The httpResult comes in the format { statusCode: 200, body: "bodyData" }
        // -Body comes back as a string, so we parse it before passing it on, to maintain
        //    consistency with other call's behavior
          smartLog(`upload result: ${httpResult.body}`, 3);
        return callFinished([JSON.parse(httpResult.body)]);
      });
    }
    if (callProps.method.toLowerCase() === 'get') {
      return rClient.get(callProps.target, requestArgs, (data, response) => {
    //    smartLog(`CALL DATA get= ${data}`);
        return callFinished([data, response]);
      });
    }
    const req = rClient.post(callProps.target, requestArgs, (data, response) => {
          smartLog(`CALL DATA get= ${(data)}`, 5);
      return callFinished([data, response]);
    });
    req.on('error', err => {
      showErr(`Request sending error: ${err}`);
    });
    return req;
  })
  .then(responseSet => {
    return responseSet;
  });
};

const areConditionsMet = conditionsArr => {
  for (const condition of conditionsArr) {
    if (condition.type) {
      if (condition.type === 'does-var-equal') {
        if (storedValues[condition.varName] !== condition.checkValue) {
          return false;
        }
      }
      if (condition.type === 'does-var-not-equal') {
        if (storedValues[condition.varName] === condition.checkValue) {
          return false;
        }
      }
    } else if (eval(condition) !== true) {
      // Note that this can be exploited if raw text is used in a conditional and
      // entered by a malicious outsider
      return false;
    }
  }
  return true;
};

const substituteValues = _object => {
  // We make a copy of it, as doing otherwise prevents iterations from being substituted with a single operation
  const object = JSON.parse(JSON.stringify(_object));
  for (let objProp in object) {
    if ((typeof object[objProp]).toLowerCase() === 'object') {
      object[objProp] = substituteValues(object[objProp]);
    } else if (typeof object[objProp] === 'string') {
      const valKeys = Object.keys(storedValues);
      for (let zz = 0; zz < valKeys.length; ++zz) {
        const matchWord = valKeys[zz];
        const storedValue = typeof storedValues[matchWord] === 'object' ? JSON.stringify(storedValues[matchWord]) : storedValues[matchWord];
        // Handle replacements of text with variables
        let wIndex = object[objProp].indexOf('}>}' + matchWord + '{<{');
        while (wIndex != -1) {
        //  smartLog(`match found in string ${object[objProp]} \r\n for word ${matchWord}`);
          object[objProp] = object[objProp].split('}>}' + matchWord + '{<{').join(storedValue);
        //  smartLog(`replaced string ${object[objProp]} \r\n for word ${matchWord}`);
          wIndex = object[objProp].indexOf('}>}' + matchWord + '{<{');
        }

        let eStartIndex = object[objProp].indexOf('}b64}');
        let eEndIndex = object[objProp].indexOf('{b64{');

        while (eStartIndex !== -1 && eEndIndex !== -1) {
        //  smartLog(`match found in string ${object[objProp]} \r\n for word ${matchWord}`);
        const chunk1 = object[objProp].substring(0, eStartIndex);
        const chunk2 = object[objProp].substring(eStartIndex, eEndIndex);
        // We use  the +5 to account for the length of the delimiter
        const chunk3 = object[objProp].substring(eEndIndex + 5);

          object[objProp] = chunk1 + encode.base64(chunk2) + chunk3;
        //  smartLog(`replaced string ${object[objProp]} \r\n for word ${matchWord}`);
          eStartIndex = object[objProp].indexOf('}b64}');
          eEndIndex = object[objProp].indexOf('{b64{');
        }
      }
    }
  }
  //smartLog(`returning: ${JSON.stringify(object)}`);
  return object;
};

const runAction = (actions, callback, _runCount) => {
    const runCount = _runCount || 0;
    let action = JSON.parse(JSON.stringify(actions[runCount]));
    const backupAction = JSON.parse(JSON.stringify(action));
    action = substituteValues(action);
    smartLog(`action res:${JSON.stringify(action)} `, 2);
    return new Promise(preDelay => {
      setTimeout(function () {
      //  smartLog(`Pre-action delay finished for ${action.name}`);
        // Execute action depending on type
        preDelay();
      }, action.pre_delay || 0);
    })
    .then(() => {
      return new Promise(actionPromise => {
        if (action.conditions) {
          if (!areConditionsMet(action.conditions)) {
            // Terminate early if conditions are unmet
            return actionPromise();
          }
        }
        if (action.type === 'terminal') {
          let terminalCommand = action.values.text;
          if (action.values.arguments && action.values.arguments.length > 0) {
            // Check for and assign arguments
            for (let zz = 0; zz < action.values.arguments.length; ++zz) {
              terminalCommand += ' ' + action.values.arguments[zz].key + action.values.arguments[zz].value;
            }
          }
          smartLog(`TERMINAL COMMAND: ${terminalCommand}`, 3);
          return cmd.get(terminalCommand, (err, resp) => {
            smartLog(`NODE res:${(resp)} `, 3);
            if (action.capture && action.capture.length > 0) {
              captureData(action, resp);
            }
            return actionPromise();
          });
        }

        if (action.type === 'set-var') {
          updateVar(action.values.target, action.values.data, action.values.action);
          return actionPromise();
        }

        if (action.type === 'print-statement') {
          console.log(action.values.text);
          return actionPromise();
        }

        if (action.type === 'replace-file-text') {
          return textEditor.editText(`${process.cwd()}/${action.values.fileLocation}`, action.values.replacements)
          .then(() => {
            return actionPromise();
          });
        }

        if (action.type === 'send-email') {
          return email.sendEmail(action.values.accountProperties, action.values.emailProperties, actionPromise)
        }

        if (action.type === 'web-call') {
          return makeRestCall(action.values)
          .then(resp => {
            captureData(action, resp);
            return actionPromise();
          });
        }
        if (action.type === 'make-file') {
          return new Promise(resolve2 => {
            let writeData = action.values.data;
            const dataOperations = _.map(action.values.dataOperations, op => {
              return op.toLowerCase();
            });

            if (dataOperations.indexOf('jsonstringify') > -1) {
              writeData = JSON.stringify(writeData);
            }
            return fs.writeFile(`${process.cwd()}/${action.values.fileLocation}`, writeData, () => {
              return resolve2();
            });
          })
          .then(() => {
            return actionPromise();
          });
        }
        if (action.type === 'update-file') {
          return new Promise(resolve2 => {
            const dataOperations = _.map(action.values.dataOperations, op => {
              return op.toLowerCase();
            });
            if (!fs.existsSync(`${process.cwd()}/${action.values.fileLocation}`)) {
              if (!action.values.fileType || action.values.fileType === 'text') {
                // We check this as auto-file creation only supports text
                return fs.writeFile(`${process.cwd()}/${action.values.fileLocation}`, action.values.data, () => {
                  return resolve2();
                });
              }
              showErr(`Exiting this step early, as the file does not exist at location : \r\n ${process.cwd()}/${action.values.fileLocation}`);
            }
            return new Promise(resolveRead => {
              return fs.readFile(`${process.cwd()}/${action.values.fileLocation}`, 'utf8', (err, _readData) => {
                if (err) {
                  return false;
                }
                const readData = _readData;
                let writeData = readData || '';
                smartLog(readData, 4);
                if (dataOperations.indexOf('jsonstringify') > -1) {
                  writeData = JSON.stringify(readData);
                }

                if (action.values.fileType.toLowerCase() === 'xml') {
                  const xmlBuilder = new xml2js.Builder();
                  const xmlParser = new xml2js.Parser(action.values.parseParameters || {});
                  return xmlParser.parseString(readData, (err2, parsedXML) => {
                    if (err2) {
                      showErr(`Error reading file:  ${err2}`);
                      return resolveRead(false);
                    }
                    for (let zz = 0; zz < action.values.data.length; ++zz) {
                      const dataToInsert = action.values.data[zz];
                      _.set(parsedXML, dataToInsert.path, dataToInsert.value);
                    }
                    return resolveRead(xmlBuilder.buildObject(parsedXML));
                  });
                }

                if (action.values.fileType.toLowerCase() === 'json') {
                  const readDataObj = JSON.parse(readData);
                  for (let zz = 0; zz < action.values.data.length; ++zz) {
                    const dataToInsert = action.values.data[zz];
                    _.set(readDataObj, dataToInsert.path, dataToInsert.value);
                  }
                  return resolveRead(JSON.stringify(readDataObj, 0, 2));
                }
              // Assumes text if no other type is supplied
                if (action.values.dataOperations && action.values.dataOperations.indexOf('append') >= 0) {
                  writeData += action.values.data;
                } else {
                  writeData = action.values.data;
                }
                return resolveRead(writeData);
              });
            })
            .then(writeData => {
              if (!writeData) {
                resolve2();
              }
              smartLog(`DATA TO  WRITE \r\n ${writeData}`, 4);
              return fs.writeFile(`${process.cwd()}/${action.values.fileLocation}`, writeData, () => {
                return resolve2();
              });
            });
          })
          .then(() => {
            return actionPromise();
          });
        }
        return actionPromise();
      })
      .then(() => {
        setTimeout(function() {
        //  smartLog(`Post-delay finished for ${action.name}`);
          if (runCount < actions.length - 1) {
            actions[runCount] = backupAction;
            return runAction(actions, callback, runCount + 1)
          }
          else {
            return callback();
          }
        }, action.post_delay || 0);
      });
    });
};

const runOperation = (_operation, callback, _runCount, iterationOptions) => {
  const operation = JSON.parse(JSON.stringify(_operation));
  substituteValues(operation);
  let runCount = _runCount || 0;
  // This lets us use the run as a variable
  storedValues.runCount = runCount;
  let timeout = 0;
  if (operation.run_at) {
    const nowTime = Number(new Date());
    const runTime = new Time(operation.run_at).isValid() ? Number(new Time(operation.run_at).nextDate()) : new Date(operation.run_at);
    if (runTime > nowTime) {
      timeout = (runTime - nowTime);
    }
  }
  if (iterationOptions.type === 'do-while') {
    if (areConditionsMet(iterationOptions.conditions)) {
      runCount = 0;
    } else {
      iterationOptions.iterations = 0;
    }
  }
  if (runCount >= iterationOptions.iterations) {
    // Finishes the operation loop set for the current op
    return setTimeout(function() {
    //  smartLog(`Finished operation delay for ${operation.name}`);
      callback();
    }, operation.post_delay_op || 0);
  }
  if (iterationOptions.type && iterationOptions.iteratorObjects) {
    // Store the current iteratee as a variable to be used in the subsequent actions
    storedValues[iterationOptions.iteratee] = iterationOptions.iteratorObjects[runCount];
    if (iterationOptions.type === 'for-each-file') {
      storedValues.iteratedFile = iterationOptions.iteratorObjects[runCount].file;
      storedValues[iterationOptions.iteratee] = iterationOptions.iteratorObjects[runCount].filePath;
      storedValues.iteratedDir = iterationOptions.iteratorObjects[runCount].directory;
    }
  }
  setTimeout(function () {
    // smartLog(`Finished pre-loop delay for ${operation.name}`)
  return new Promise(iterationFinished => {
    runAction(operation.actions, iterationFinished, 0);
  })
  .then(() => {
    setTimeout(function() {
    //  smartLog(`Finished post delay(loop) for operation ${operation.name}`);
      if (runCount < iterationOptions.iterations) {
        return runOperation(operation, callback, runCount + 1, iterationOptions);
      }
      callback();
    }, operation.post_delay_loop || 0);
  });
  }, operation.pre_delay_loop || timeout || 0);
};

program
  .version('0.0.1')
  .option('-t, --target <target>', 'Define target')
  .parse(process.argv);

if (!program.target) {
  showErr('No salvo file specified.  Please provide a relative file path with the -t parameter');
  process.exit();
}

const salvoScript = require(`${process.cwd()}/${program.target}`);
// Requires format -t './filename'
smartLog(`Beginning salvo ${salvoScript.name}`, 2);
return new Promise(preloadsLoaded => {
  if (salvoScript.logLevel) {
    logLevel = salvoScript.logLevel;
  }
  if (!salvoScript.preloads) {
    return preloadsLoaded([]);
  }
  return Promise.map(salvoScript.preloads, preloadFile => {
    // Loads each pre-salvo file.  Format requires './filename'
    return require(`${process.cwd()}/${preloadFile}`);
  })
  .then(preloads => {
    return preloadsLoaded(preloads);
  });
})
.then(_loadedFiles => {
  let loadedFiles = _loadedFiles;
  smartLog(`Loaded values: ${JSON.stringify(loadedFiles)}`, 2);
  return new Promise(resolve => {
    if (!loadedFiles) {
      // To avoid loop errors, we set it to an empty array
      loadedFiles = [];
    }
    for (const loadedData of loadedFiles) {
      let dataObject = loadedData;
      if (loadedData.hasOwnProperty('default')) {
        // File was a JS file so properties are accessed through default property
        dataObject = loadedData.default;
      }
      for (const key of Object.keys(dataObject)) {
        storedValues[key] = dataObject[key];
      }
    }
//    smartLog(`preserved values: ${JSON.stringify(storedValues)}`);
    resolve();
  })
  .then(() => {
    // Preload values are loaded in and now we can begin operations
    return Promise.each(salvoScript.operations, _operation => {
      // Handle each operation in turn
      let operation = JSON.parse(JSON.stringify(_operation));
      operation = substituteValues(operation);
      smartLog(`Beginning operation ${operation.name}`, 2);
      smartLog(`Operation Properties: ${JSON.stringify(operation)}`, 3)
      return new Promise(opResolve => {
        // Make a promise to handle pre-operation timing delay in each object
        const iterationOptions = { iterations: operation.iterations };
        if (typeof operation.iterations === 'object') {
          if (operation.iterations.type === 'for-each-file') {
          // Loop over each item in a directory
            return fs.readdir(process.cwd() + '/' + operation.iterations.directory, (err, _items) => {
              let items = _items;
              if (operation.iterations.excludeFiles && Array.isArray(operation.iterations.excludeFiles)) {
                items = _.filter(_items, item => {
                  return operation.iterations.excludeFiles.indexOf(item) < 0;
                });
              }
              iterationOptions.iterations = items.length;
              iterationOptions.type = operation.iterations.type;
              iterationOptions.iteratorObjects = _.map(items, item => {
                return { filePath: operation.iterations.directory + '/' + item,
                  file: item,
                  directory: operation.iterations.directory
                };
              });
              iterationOptions.iteratee = operation.iterations.iteratee;
              setTimeout(() => {
                // The following code executes after the pre-operation delay
            //    smartLog(`Finished pre-operation delay on ${operation.name}`);
                  // Run once for each iteration
                runOperation(operation, opResolve, 0, iterationOptions);
              }, operation.pre_delay_op || 0);
            });
          }

          if (operation.iterations.type === 'for-each-in-array') {
          // Loop over each item in a directory
            iterationOptions.iterations = typeof operation.iterations.sourceArray === 'string' ? JSON.parse(operation.iterations.sourceArray).length : operation.iterations.sourceArray.length;
            iterationOptions.type = operation.iterations.type;
            iterationOptions.iteratorObjects = typeof operation.iterations.sourceArray === 'string' ? JSON.parse(operation.iterations.sourceArray) : operation.iterations.sourceArray;
            iterationOptions.iteratee = operation.iterations.iteratee;
            setTimeout(() => {
              // The following code executes after the pre-operation delay
          //    smartLog(`Finished pre-operation delay on ${operation.name}`);
                // Run once for each iteration
              runOperation(operation, opResolve, 0, iterationOptions);
            }, operation.pre_delay_op || 0);
          }

          if (operation.iterations.type === 'do-while') {
          // Loop over each item in a directory
            iterationOptions.iterations = 1;
            iterationOptions.type = operation.iterations.type;
            iterationOptions.conditions = operation.iterations.conditions;
            setTimeout(() => {
              // The following code executes after the pre-operation delay
          //    smartLog(`Finished pre-operation delay on ${operation.name}`);
                // Run once for each iteration
              runOperation(operation, opResolve, 0, iterationOptions);
            }, operation.pre_delay_op || 0);
          }
        } else {
          // If nothing else is defined, we assume it is a number
          setTimeout(() => {
            // The following code executes after the pre-operation delay
          //  smartLog(`Finished pre-operation delay on ${operation.name}`);
              // Run once for each iteration
            runOperation(operation, opResolve, 0, iterationOptions);
          }, operation.pre_delay_op || 0);
        }
      });
    })
    .then(() => {
      smartLog('All ops finished', 1);
      process.exit();
    });
  });
});
