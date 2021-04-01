require("dotenv").config();
const fs = require("fs");

const extractAudio = require("ffmpeg-extract-audio");
const ffmpeg = require("fluent-ffmpeg");
if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

const sdk = require("microsoft-cognitiveservices-speech-sdk");
//https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/overview
const subscriptionKey = process.env.AZURE_SPEECH_SUBSCRIPTION_KEY;
//https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/regions
const serviceRegion = process.env.AZURE_SPEECH_SERVICE_REGION;

function envTest() {
  console.log(
    `subscriptionKey: ${subscriptionKey}, serviceRegion: ${serviceRegion}`
  );
}

envTest();
