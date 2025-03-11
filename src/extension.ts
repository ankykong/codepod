import * as vscode from 'vscode';
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ElevenLabsClient } from 'elevenlabs';
import * as childProcess from 'child_process';
import * as util from 'util';
import { createWriteStream } from 'fs';

const execPromise = util.promisify(childProcess.exec);

async function convertScriptToAudio(script: string, apiKey: string, host1VoiceId: string, host2VoiceId: string): Promise<string> {
  try {
    const elevenlabs = new ElevenLabsClient({
      apiKey: apiKey
    });

    const tempDir = path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath || os.tmpdir(), 'codepod_audio');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const lines = script.split('\n').filter(line => line.trim().length > 0);

    let audioFiles: string[] = [];
    let currentIndex = 1;

    for (const line of lines) {
      let voiceId, host;

      if (line.startsWith('Host1:')) {
        voiceId = host1VoiceId;
        host = 'Host1';
      } else if (line.startsWith('Host2:')) {
        voiceId = host2VoiceId;
        host = 'Host2';
      } else {
        continue;
      }

      const text = line.substring(line.indexOf(':') + 1).trim();
      if (!text) continue; // Skip empty lines
      
      const audioFilePath = path.join(tempDir, `${currentIndex.toString().padStart(3, '0')}_${host}.mp3`);

      console.log(`Starting audio conversion for ${host} line: ${text.substring(0, 30)}...`);

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Processing audio for ${host} (part ${currentIndex})`,
        cancellable: false
      }, async (progress) => {
        try {
          progress.report({ message: "Generating audio with ElevenLabs..." });
          
          // Create a new Promise to handle the streaming and file writing
          await new Promise<void>((resolve, reject) => {
            elevenlabs.textToSpeech.convert(voiceId, {
              model_id: 'eleven_multilingual_v2',
              text: text,
              output_format: "mp3_44100_128",
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.5,
                use_speaker_boost: true,
                speed: 1.0,
              }
            })
            .then(audioStream => {
              progress.report({ message: "Writing audio file..." });
              const fileStream = createWriteStream(audioFilePath);
              
              audioStream.pipe(fileStream);
              
              fileStream.on('finish', () => {
                audioFiles.push(audioFilePath);
                progress.report({ message: "Audio part complete" });
                resolve();
              });
              
              fileStream.on('error', (err) => {
                console.error('Error writing audio file:', err);
                reject(err);
              });
            })
            .catch(err => {
              console.error('ElevenLabs API Error:', err);
              reject(err);
            });
          });
          
        } catch (elevenLabsError: any) {
          console.error('ElevenLabs API Error:', elevenLabsError);
          if (elevenLabsError.message) {
            vscode.window.showErrorMessage(`ElevenLabs Error: ${elevenLabsError.message}`);
          } else {
            vscode.window.showErrorMessage(`An unknown error occurred with ElevenLabs. Check the console for details.`);
          }
          throw elevenLabsError;
        }
      });

      currentIndex++;
    }

    if (audioFiles.length === 0) {
      throw new Error("No audio files were successfully created");
    }

    const finalAudioPath = path.join(tempDir, 'complete_conversation.mp3');
    await combineAudioFiles(audioFiles, finalAudioPath);

    vscode.window.showInformationMessage(`Complete podcast created at: ${finalAudioPath}`);
    vscode.env.openExternal(vscode.Uri.file(tempDir));

    // Clean up individual files after combining
    audioFiles.forEach(file => {
      try { fs.unlinkSync(file); } catch {}
    });

    return finalAudioPath;
  } catch (error: any) {
    console.error('General Error in convertScriptToAudio:', error);
    vscode.window.showErrorMessage(`Error converting script to audio: ${error.message}`);
    return '';
  }
}
async function combineAudioFiles(audioFilePaths: string[], outputPath: string): Promise<void> {
  try {
    // Create a file with a list of input files for ffmpeg
    const fileListPath = path.join(path.dirname(outputPath), 'filelist.txt');
    const fileListContent = audioFilePaths.map(filePath => `file '${filePath.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(fileListPath, fileListContent);

    console.log('Beginning audio combination with ffmpeg');
    // Run ffmpeg to concatenate the files
    await execPromise(`ffmpeg -f concat -safe 0 -i "${fileListPath}" -c copy "${outputPath}"`);
    console.log('FFmpeg command completed successfully');
    
    // Clean up the temporary file list
    fs.unlinkSync(fileListPath);
  } catch (error) {
    console.error('Error combining audio files:', error);
    throw new Error(`Failed to combine audio files: ${error}`);
  }
}

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('codepod.generatePodcast', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active text editor.');
      return;
    }

    // Get the selected text, or the entire document if nothing is selected
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    const fileContent = editor.document.getText(); //Keep this for the prompt
    const fileName = editor.document.fileName;

    const config = vscode.workspace.getConfiguration('codepod');
    const apiKey = config.get('apiKey') as string;
    const elevenLabsApiKey = config.get('elevenLabsApiKey') as string;
    const host1VoiceId = config.get('host1VoiceId') as string;
    const host2VoiceId = config.get('host2VoiceId') as string;

    if (!apiKey) {
      vscode.window.showErrorMessage('Please set your Gemini API key in the settings.');
      return;
    }

    if (!elevenLabsApiKey) {
      vscode.window.showErrorMessage('Please set your Eleven Labs API key in the settings.');
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // Use selectedText in the prompt, but handle the empty selection case
    let codeSnippet: string;
    if (selectedText.trim() !== "") {
        codeSnippet = selectedText;
    } else {
        codeSnippet = fileContent;
        vscode.window.showInformationMessage("No text selected, using entire file content.");
    }

    const prompt = `You are a podcast script writer that is extremely adept in coding. You understand nuances in code and areas where code issues could occur. You will make a podcast script about the code given and will add in natural umms, ahhs, etc. Also, you will add in interjections that are natural in a podcast. Lastly, you will give a high level overview of the code and then go into the nitty gritty details to find potential issues. Make sure that one host is questioning the other to come up with responses as to why things may work or not work. Lastly, write out only the script, with no music interludes and make each line either start with 'Host1:' or 'Host2:' \n\nCode:\n\`\`\`\n${codeSnippet}\n\`\`\``;

    try {
      // Show progress notification
      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Generating podcast",
        cancellable: false
      }, async (progress) => {
        progress.report({ message: "Generating script with Gemini..." });

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        // Display generated script
        const newDocument = await vscode.workspace.openTextDocument({ content: text, language: 'markdown' });
        vscode.window.showTextDocument(newDocument);

        // Convert script to audio
        progress.report({ message: "Converting script to audio with Eleven Labs..." });
        
        try {
          const finalAudioPath = await convertScriptToAudio(text, elevenLabsApiKey, host1VoiceId, host2VoiceId);
          progress.report({ message: "Conversation audio created!" });
        } catch (error: any) {
          vscode.window.showErrorMessage(`Audio conversion error: ${error.message}`);
          console.error('Audio conversion failed:', error);
        }
        
        return Promise.resolve();
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Error generating podcast: ${error.message}`);
      console.error(error);
    }
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}