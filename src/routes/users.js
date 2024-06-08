import express from 'express';
import * as UserController from '../controllers/user.controller.js';
import tokenAuthentication from '../middleware/tokenAuthentication.js';

const userRouter = express.Router();
userRouter.get('/list', tokenAuthentication, UserController.list);
userRouter.post('/register', UserController.register);
userRouter.post('/login', UserController.login);

export { userRouter };
