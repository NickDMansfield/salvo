/* eslint-disable indent */
'use strict';

const Client = require('node-rest-client').Client;
const rClient = new Client();

const smartLog = (string, lvlRequired) => {
      console.log(string);
  };

    const makeRestCall = callProps => {
        const requestArgs = {
        data: callProps.data, // data passed to REST method (only useful in POST, PUT or PATCH methods)
        path: callProps.path, // path substitution var
        parameters: callProps.parameters, // this is serialized as URL parameters
        headers: callProps.headers, // request headers
        requestConfig: callProps.requestConfig || {
            timeout: 300000,
            keepAlive: true,
        },
        responseConfig: callProps.responseConfig || { timeout: 300000 },
        };

        return new Promise(callFinished => {
        if (callProps.attachment) {
            const formData = {};
            formData[callProps.attachment.fileName] = fs.createReadStream(
            callProps.attachment.filePath
            );
            return request.post(
            { url: callProps.target, formData, headers: callProps.headers },
            (err, httpResult) => {
                if (err) {
                showErr(`Error sending file: ${err}`);
                }
                // -The httpResult comes in the format { statusCode: 200, body: "bodyData" }
                // -Body comes back as a string, so we parse it before passing it on, to maintain
                //    consistency with other call's behavior
                smartLog(`upload result: ${httpResult.body}`, 3);
                return callFinished([JSON.parse(httpResult.body)]);
            }
            );
        }
        if (callProps.method.toLowerCase() === 'get') {
            return rClient.get(callProps.target, requestArgs, (data, response) => {
            //    smartLog(`CALL DATA get= ${data}`);
            return callFinished([data, response]);
            });
        }
        const req = rClient.post(
            callProps.target,
            requestArgs,
            (data, response) => {
            smartLog(`CALL DATA get= ${JSON.stringify(data)}`, 5);
            return callFinished([data, response]);
            }
        );
        req.on('error', err => {
            showErr(`Request sending error: ${err}`);
        });
        return req;
        }).then(responseSet => {
        return responseSet;
        });
    };

const sendSlackMessageViaWebHook = function (webHookUrl, messageText) {
    makeRestCall({
        data: {
            text: messageText,
        },
        target: webHookUrl,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
          }
    });
};

module.exports = {
    sendSlackMessageViaWebHook
};

/*
const { WebClient } = require('@slack/web-api');

// Read a token from the environment variables
const token = process.env.SLACK_TOKEN;

// Initialize
const web = new WebClient(token);
const conversationId = '...';

  // Post a message to the channel, and await the result.
  // Find more arguments and details of the response: https://api.slack.com/methods/chat.postMessage
  const result = await web.chat.postMessage({
    text: 'Hello world!',
    channel: conversationId,
  });
*/
