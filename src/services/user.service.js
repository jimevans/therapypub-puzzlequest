import User from '../models/user.model.js';

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import config from '../config.js';

export async function getUserByUserName(name) {
    let user = await User.findOne({ userName: name }).lean();
    if (user === null) {
        return { 'error': `No user with user name ${name} found` };
    }
    return { 'status': 'success', 'user': user };
};

export async function deleteUser(name) {
    let result = await User.findOneAndDelete({userName: name});
    console.log(result);
    return { 'status': 'success' };
};

export async function createUser(user) {
    const userExists = await User.find({userName: user.userName}).length !== 0;
    if (userExists) {
        return { 'error': `User with user name ${user.userName} already exists` };
    }
    let authLevel = user.authorizationLevel || 0;
    if (User.count() === 0) {
        // First user created must be an admin user
        authLevel = 1;
    }
    const password = await bcrypt.hash(user.password, 10);
    try {
        let newUser = new User({
            userName: user.userName,
            displayName: user.displayName || user.userName,
            password: password,
            email: user.email.toLowerCase(),
            sms: user.sms || '',
            authorizationLevel: authLevel
        });
        await newUser.save();
    } catch (err) {
        return { 'error': `New user not created - ${err}` };
    }
    return { 'status': 'success' }
};

export async function updateUser(user) {
    let foundUser = await User.findOne({ userName: user.userName });
    if (foundUser === null) {
        return { 'error': `No user with user name ${user.userName} found` };
    }
    foundUser.displayName = userData.displayName || foundUser.displayName;
    if (userData.password) {
        const password = await bcrypt.hash(userData.password, 10);
        foundUser.password = password;
    }
    foundUser.email = user.email.toLowerCase() || foundUser.email;
    foundUser.sms = user.sms || foundUser.sms;
    foundUser.authorizationLevel = user.authorizationLevel || foundUser.authorizationLevel;
    await foundUser.save();
    return { 'status': 'success' };
};

export async function authenticate(userName, password) {
    const user = await User.findOne({ userName: userName }).lean();
    if (user === null) {
        return { 'error': `No user with user name ${userName} found` };
    }
    if (!(await bcrypt.compare(password, user.password))) {
        return { 'error': `Password for user ${userName} does not match` };
    }
    let token = jwt.sign(
        {
            userName: user.userName,
            displayName: user.displayName,
            email: user.email,
            sms: user.sms,
            authorizationLevel: user.authorizationLevel
        },
        config.PQ_SECRET_KEY,
        { 
            expiresIn: '2h'
        }
    );
    return { 'status': 'success', 'token': token };
};
