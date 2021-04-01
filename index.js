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

let rawConfig = fs.readFileSync("config.json");
let config = JSON.parse(rawConfig);

//This is the video you want to use to generate subtitles for.
let videoFile = config.videoFile;
//This audio file is generated before sending to Azure AI.
let audioFile = config.audioFile;

extractAudio({
  input: videoFile,
  output: audioFile,
  transform: (cmd) => {
    cmd.audioChannels(1).audioFrequency(16000);
  },
})
  .then(() => {
    console.log(`Extract Audio Done`);
  })
  .catch((e) => {
    console.log(`Extract Audio Error: ${e}`);
  });
