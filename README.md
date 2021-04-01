# Subtitles Node JS

Generate subtitles with Azure AI and Node JS.

## Config

You will want to edit the `config.json` based on your needs.

`videoFile`: name and location for your input video file.
`audioFile`: name and location for your output audio file used in an intermediary step, must be a `wav` file (Optional), defaults `test_audio.wav`.
`outputFile`: name and location for your output VTT file (Optional), defaults `transcript.vtt`.
`language`: language code for Azure to use (Optional), defaults `en-US`. https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support#speech-to-text
