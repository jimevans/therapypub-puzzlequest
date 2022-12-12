import { Schema, model } from 'mongoose';

const hintSchema = new Schema({
    text: {
        type: String,
        default: "",
        required: true
    },
    order: {
        type: Number,
        required: true,
        default: 0
    },
    solutionWarning: {
        type: Boolean,
        required: true,
        default: false
    },
    timePenalty: {
        type: Number,
        required: true,
        default: 0
    }
});

const puzzleSchema = new Schema({
    name: {
        type: String,
        default: "",
        required: true,
        unique: true
    },
    displayName: {
        type: String,
        default: true
    },
    type: {
        type: Number,
        default: 0
    },
    text: {
        type: String,
        default: ""
    },
    solutionKeyword: {
        type: String,
        default: "",
        required: true
    },
    solutionDisplayText: {
        type: String,
        default: "",
        required: true
    },
    resourcePath: {
        type: String,
        default: ""
    },
    activationCode: {
        type: String,
        default: "",
        required: true
    },
    hints: [hintSchema]
});

const PuzzleModel = model('Puzzle', puzzleSchema);

export { PuzzleModel }
