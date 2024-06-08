import express from 'express';
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import cookieParser from 'cookie-parser';
app.use(cookieParser());

import { config } from './config.js';
const mongodb = config.PQ_MONGODB_URI;

import mongoose from 'mongoose';
mongoose.set('strictQuery', false);
mongoose.connect(mongodb);

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

import { userRouter } from './routes/users.js';
app.use('/users', userRouter);

app.listen(port, () => {
    console.log(
        `Therapy Pub and Co. PuzzleQuest app listening on port ${port}!`
    );
});
