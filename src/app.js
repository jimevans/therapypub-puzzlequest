import express from 'express';
const app = express();
const port = 3000;

import { config } from './config.js';

app.listen(port, () => {
  console.log(`Therapy Pub and Co. PuzzleQuest app listening on port ${port}!`);
  console.log('Environment:');
  for (const setting in config) {
    console.log(`${setting} = ${config[setting]}`);
  }
});
