# Subtitles Node JS

Generate subtitles with Azure AI and Node JS.

After setting up the `.env` and changing `config.json`, use `yarn start` || `npm start` to get your subtitles.

## Environment Variables

Create a `.env` file based on `.env.example` with the appropriate information.

## Config

You will want to edit the `config.json` based on your needs.

`videoFile`: name and location for your input video file.
`audioFile`: name and location for your output audio file used in an intermediary step, must be a `wav` file (Optional), defaults `test_audio.wav`.
`vttOutputFile`: name and location for your output VTT file (Optional), defaults `transcript.vtt`.
`srtOutputFile`: name and location for your output SRT file (Optional), defaults `transcript.srt`.
`language`: language code for Azure to use (Optional), defaults `en-US`. https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support#speech-to-text

You also have an optional section to generate translated subtitles as well. It follows a similiar format as above except for the added needs for the language codes to translate to and where to put the files when done. If you do not want to the translator, then just remove the translate key and object from the `config.json` file

## Useful Links

1. https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/overview
2. https://docs.microsoft.com/en-us/azure/cognitive-services/translator/quickstart-translator?tabs=nodejs#translate-text
3. https://docs.microsoft.com/en-us/azure/cognitive-services/translator/language-support#text-translation
4. https://ffmpeg.org/download.html#build-windows
5. https://www.gyan.dev/ffmpeg/builds/
6. https://github.com/papnkukn/subsrt
