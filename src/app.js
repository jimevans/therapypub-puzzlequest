import express from 'express';
const app = express();
const port = 3000;

import { config } from './config.js';
const mongodb = config.PQ_MONGODB_URI;

import mongoose from 'mongoose';
mongoose.set('strictQuery', false);
mongoose.connect(mongodb, { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

app.listen(port, () => {
  console.log(`Therapy Pub and Co. PuzzleQuest app listening on port ${port}!`);
  console.log('Environment:');
  for (const setting in config) {
    console.log(`${setting} = ${config[setting]}`);
  }
});
