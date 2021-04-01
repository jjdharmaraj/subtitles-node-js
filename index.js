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

/**
 * This sets the config up so that certain parameters are optional.
 *
 * @returns Config to use with optional parameters filled.
 */
function setupConfig() {
  let rawConfig = fs.readFileSync("config.json");
  let config = JSON.parse(rawConfig);

  //This is the video you want to use to generate subtitles for.
  let videoFile;
  //These are optional presets
  let audioFile, outputFile, language;

  return new Promise((resolve, reject) => {
    if (!config || !config.videoFile) {
      reject(`Either the config.json file is missing or
            videoFile is not specified in it.`);
    } else {
      videoFile = config.videoFile;
    }
    if (!config.audioFile) {
      audioFile = "test_audio.wav";
    } else {
      audioFile = config.audioFile;
    }
    if (!config.outputFile) {
      outputFile = "transcript.vtt";
    } else {
      outputFile = config.outputFile;
    }
    if (!config.language) {
      language = "en-US";
    } else {
      language = config.language;
    }
    resolve({ videoFile, audioFile, outputFile, language });
  });
}
/**
 * This gets the local audio file ready to send to Azure AI.
 *
 * @param {String} filename The audio file to stream to Azure AI.
 * @returns Creates an AudioConfig object representing the specified stream.
 */
function createAudioConfig(filename) {
  const pushStream = sdk.AudioInputStream.createPushStream();

  fs.createReadStream(filename)
    .on("data", (arrayBuffer) => {
      pushStream.write(arrayBuffer.slice());
    })
    .on("end", () => {
      pushStream.close();
    });

  return sdk.AudioConfig.fromStreamInput(pushStream);
}
/**
 * This does the heavy lifting of talking to Azure AI.
 *
 * https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support#speech-to-text
 *
 * @param {String} audiofilename The audio file to use for Azure AI.
 * @param {String} audioLanguage The language code for Azure to use.
 * @returns SpeechRecognizer constructor.
 */
function createRecognizer(audiofilename, audioLanguage) {
  const audioConfig = createAudioConfig(audiofilename);
  const speechConfig = sdk.SpeechConfig.fromSubscription(
    subscriptionKey,
    serviceRegion
  );
  speechConfig.speechRecognitionLanguage = audioLanguage;
  //   speechConfig.setProperty(
  //     sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
  //     "10000"
  //   ); // 10000ms

  return new sdk.SpeechRecognizer(speechConfig, audioConfig);
}

/**
 * This handles setting up Azure, sending to Azure, and writing a VTT file.
 *
 * @param {String} filename The audio file to use for Azure AI.
 * @param {String} outputFile Name and location for the VTT file.
 * @param {String} language The language code for Azure to use.
 * @returns Promise.
 */
function processFile(filename, outputFile, language) {
  return new Promise((resolve) => {
    const outputStream = fs.createWriteStream(outputFile);
    outputStream.once("open", () => {
      outputStream.write(`WEBVTT\r\n\r\n`);

      let recognizer = createRecognizer(filename, language);

      recognizer.recognized = (s, e) => {
        if (e.result.reason === sdk.ResultReason.NoMatch) {
          const noMatchDetail = sdk.NoMatchDetails.fromResult(e.result);
          console.log(
            "\r\n(recognized)  Reason: " +
              sdk.ResultReason[e.result.reason] +
              " | NoMatchReason: " +
              sdk.NoMatchReason[noMatchDetail.reason]
          );
        } else {
          console.log(
            `\r\n(recognized)  Reason: ${
              sdk.ResultReason[e.result.reason]
            } | Duration: ${e.result.duration} | Offset: ${e.result.offset}`
          );

          outputStream.write(`${e.result.offset}, ${e.result.duration}`);
          outputStream.write(`${e.result.text}\r\n\r\n`);
        }
      };

      recognizer.canceled = (s, e) => {
        let str = "(cancel) Reason: " + sdk.CancellationReason[e.reason];
        if (e.reason === sdk.CancellationReason.Error) {
          str += ": " + e.errorDetails;
        }

        console.log(str);
      };

      recognizer.speechEndDetected = (s, e) => {
        console.log(`(speechEndDetected) SessionId: ${e.sessionId}`);
        outputStream.close();
        recognizer.close();
        recognizer = undefined;
        resolve("Process file done.");
      };

      recognizer.startContinuousRecognitionAsync(
        () => {
          console.log("Recognition started");
        },
        (err) => {
          console.trace("err - " + err);
          outputStream.close();
          recognizer.close();
          recognizer = undefined;
        }
      );
    });
  });
}

/**
 * This is the main function for this file.
 */
let configData;

setupConfig()
  .then((data) => {
    configData = data;
    return extractAudio({
      input: configData.videoFile,
      output: configData.audioFile,
      transform: (cmd) => {
        cmd.audioChannels(1).audioFrequency(16000);
      },
    });
  })

  .then(() => {
    console.log(`Extract Audio Done`);
    return processFile(
      configData.audioFile,
      configData.outputFile,
      configData.language
    );
  })
  .then((processFileData) => {
    console.log(processFileData);
  })
  .catch((e) => {
    console.log(`Extract Audio Error: ${e}`);
  });
