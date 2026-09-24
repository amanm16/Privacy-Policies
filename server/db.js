'use strict';

const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

function connect(uri) {
  return mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
}

function disconnect() {
  return mongoose.disconnect();
}

function isConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { mongoose, connect, disconnect, isConnected };
