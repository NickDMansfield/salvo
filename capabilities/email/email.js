'use strict';
const nodeMailer = require('nodemailer');
const _ = require('lodash');

// NOTES
// Presently it only supports gmail

const login = ((service, user, pass) => {
// Create a SMTP transport object
  const transport = nodeMailer.createTransport({
    service,
    auth: {
      user,
      pass
    }
  });
  return transport;
});

const sendEmail = ((accountProperties, emailProperties, callback) => {
  const mailTransporter = login(accountProperties.service, accountProperties.user, accountProperties.pass);
  const email = emailProperties;
  if (Array.isArray(email.to)) {
    email.to = email.to.join(', ');
  }
  // Handle attachment conversion
  if (email.attachments && Array.isArray(email.attachments)) {
    email.attachments = _.map(email.attachments, attachment => {
      return { path: process.cwd() + '/' + attachment };
    });
  }
  return mailTransporter.sendMail(email, (error, info) => {
    if (error) {
      console.log(error);
    } else {
      return callback();
    }
  });
});
module.exports = {
  sendEmail
};
