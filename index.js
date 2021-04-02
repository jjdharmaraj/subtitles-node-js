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

const rawConfig = fs.readFileSync("config.json");
const config = JSON.parse(rawConfig);

const subsrt = require("subsrt");

//Used for Azure Translator
const axios = require("axios").default;
const { v4: uuidv4 } = require("uuid");

/**
 * This sets the config up so that certain parameters are optional.
 *
 * @returns Config to use with optional parameters filled.
 */
function setupConfig() {
  //This is the video you want to use to generate subtitles for.
  let videoFile;
  //These are optional presets
  let audioFile, vttOutputFile, srtOutputFile, language;

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
    if (!config.vttOutputFile) {
      vttOutputFile = "transcript.vtt";
    } else {
      vttOutputFile = config.vttOutputFile;
    }
    if (!config.srtOutputFile) {
      srtOutputFile = "transcript.srt";
    } else {
      srtOutputFile = config.srtOutputFile;
    }
    if (!config.language) {
      language = "en-US";
    } else {
      language = config.language;
    }
    resolve({ videoFile, audioFile, vttOutputFile, srtOutputFile, language });
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
 * This parses the time from Azure into something more usable.
 *
 * https://www.w3.org/TR/webvtt1/
 * https://developer.mozilla.org/en-US/docs/Web/API/WebVTT_API
 *
 * @param {Number} nano Time sent from Azure
 * @returns String to be used for the time in the file.
 */
function parseTime(nano) {
  var hour = Math.floor(nano / 36000000000);
  var temp = nano % 36000000000;
  var minute = Math.floor(temp / 600000000);
  var temp2 = temp % 600000000;
  var second = Math.floor(temp2 / 10000000);
  var mil = temp2 % 10000000;
  hour = hour.toString();
  minute = minute.toString();
  second = second.toString();
  mil = mil.toString().slice(0, 3); //cuts off insignificant digits
  return `${hour}:${minute}:${second}.${mil}`;
}

/**
 * This handles setting up Azure, sending to Azure, and writing a VTT file.
 *
 * @param {String} filename The audio file to use for Azure AI.
 * @param {String} vttOutputFile Name and location for the VTT file.
 * @param {String} language The language code for Azure to use.
 * @returns Promise.
 */
function processVttFile(filename, vttOutputFile, language) {
  return new Promise((resolve) => {
    const outputStream = fs.createWriteStream(vttOutputFile);
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

          outputStream.write(
            `${parseTime(e.result.offset)} --> ${parseTime(
              e.result.offset + e.result.duration
            )}\r\n`
          );
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
 * This converts the VTT to SRT.
 *
 * https://github.com/papnkukn/subsrt
 *
 * @param {String} vttFilename Name and location for the VTT file.
 * @param {String} srtFileName Name and location for the SRT file.
 * @returns Success and location for the VTT and SRT file.
 */
function createSrtFile(vttFilename, srtFileName) {
  return new Promise((resolve) => {
    let vttContent = fs.readFileSync(vttFilename, "utf8");

    let srt = subsrt.convert(vttContent, { format: "srt" });

    fs.writeFileSync(srtFileName, srt);

    resolve(`VTT and SRT Files have been created at
    ${vttFilename} and ${srtFileName}`);
  });
}
/**
 * This just creates a SRT Array.
 *
 * @param {String} srtFileName Location of either a subtitle file.
 * @returns SRT array to be used for other methods.
 */
function createSrtArray(srtFileName) {
  //Read a .srt file
  let content = fs.readFileSync(srtFileName, "utf8");

  //Parse the content
  let options = { verbose: true };
  let srtArray = subsrt.parse(content, options);

  return srtArray;
}
/**
 * This generates the VTT and SRT files in one shot.
 *
 * @param {Array} srtArray SRT Array
 * @param {String} vttFilename Name and location for the VTT file.
 * @param {String} srtFileName Name and location for the SRT file.
 * @returns Locations of the files created.
 */
function createVttAndSrtFilesFromArray(srtArray, vttFilename, srtFileName) {
  //Build the WebVTT content
  let vttContent = subsrt.build(srtArray, { format: "vtt" });
  //Write content to .vtt file
  fs.writeFileSync(vttFilename, vttContent);

  //Build the SRT content
  let srtContent = subsrt.build(srtArray, { format: "srt" });
  //Write content to .srt file
  fs.writeFileSync(srtFileName, srtContent);

  return `VTT and SRT Files have been created at
    ${vttFilename} and ${srtFileName}`;
}
/**
 * This does the heavy lifting of sending to Azure translate.
 *
 * https://github.com/MicrosoftTranslator/Text-Translation-API-V3-NodeJS/blob/master/Translate.js
 * https://docs.microsoft.com/en-us/azure/cognitive-services/translator/language-support#text-translation
 *
 * @param {Array} srtArray SRT Array to be translated.
 * @param {Array} languageCodeArray Languages to translate to.
 * @param {String} originalLanguageCode The original language for the transcript.
 * @returns Object with just the text and languages.
 */
function translateSrtArray(srtArray, languageCodeArray, originalLanguageCode) {
  const subscriptionKey = process.env.AZURE_TRANSLATOR_SUBSCRIPTION_KEY;
  const endpoint = "https://api.cognitive.microsofttranslator.com";

  // Add your location, also known as region. The default is global.
  // This is required if using a Cognitive Services resource.
  const location = process.env.AZURE_TRANSLATOR_SERVICE_REGION;

  return new Promise((resolve, reject) => {
    let azureTranslatorTextArray = [];

    srtArray.forEach((obj) => {
      azureTranslatorTextArray.push({ text: obj.text });
    });

    axios({
      baseURL: endpoint,
      url: "/translate",
      method: "post",
      headers: {
        "Ocp-Apim-Subscription-Key": subscriptionKey,
        "Ocp-Apim-Subscription-Region": location,
        "Content-type": "application/json",
        "X-ClientTraceId": uuidv4().toString(),
      },
      params: {
        "api-version": "3.0",
        from: originalLanguageCode,
        to: languageCodeArray,
      },
      data: azureTranslatorTextArray,
      responseType: "json",
    })
      .then((response) => {
        // console.log(JSON.stringify(response.data, null, 4));
        let languageCodeObj = {};
        languageCodeArray.forEach((languageCode) => {
          languageCodeObj[languageCode] = [];
        });
        let responseArray = response.data;
        responseArray.forEach((responseObj) => {
          //this doesn't account for multiple languages at once
          let translationsArray = responseObj.translations;
          //there is another array in translations
          translationsArray.forEach((t) => {
            languageCodeObj[t.to].push({ text: t.text });
          });
        });

        resolve(languageCodeObj);
      })
      .catch((e) => {
        reject(e);
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
    return processVttFile(
      configData.audioFile,
      configData.vttOutputFile,
      configData.language
    );
  })
  .then((processVttFileData) => {
    console.log(processVttFileData);
    return createSrtFile(configData.vttOutputFile, configData.srtOutputFile);
  })
  .then((createSrtFileData) => {
    console.log(createSrtFileData);
    if (config.translate) {
      let srtArray = createSrtArray(configData.srtOutputFile);
      let languageCodesArray = Object.keys(config.translate);
      return translateSrtArray(
        srtArray,
        languageCodesArray,
        configData.language
      )
        .then((d) => {
          languageCodesArray.forEach((languageCode) => {
            let tempArray = [];
            let textArray = d[languageCode];
            let tempSrtArray = srtArray;
            textArray.forEach((textObj, index) => {
              let tempObj = tempSrtArray[index];
              tempObj.text = textObj.text;
              tempObj.content = textObj.text;
              tempArray.push(tempObj);
            });
            let translationLocations = createVttAndSrtFilesFromArray(
              tempArray,
              config.translate[languageCode].vttOutputFile,
              config.translate[languageCode].srtOutputFile
            );
            console.log(translationLocations);
          });
        })
        .catch((e) => {
          console.log(`Translate Error: ${e}`);
        });
    }
  })
  .catch((e) => {
    console.log(`Extract Audio Error: ${e}`);
  });
