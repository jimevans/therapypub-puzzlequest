import { Schema, model } from 'mongoose';

const userSchema = new Schema({
    userName: {
        type: String,
        required: true,
        unique: true
    },
    displayName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        unique: true,
        required: true
    },
    sms: {
        type: String,
        default: ''
    },
    password: {
        type: String,
        required: true
    },
    authorizationLevel: {
        type: Number,
        default: 0
    }
});

const UserModel = model('User', userSchema);

export { UserModel }
