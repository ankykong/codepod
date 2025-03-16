import * as vscode from 'vscode';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import ollama from 'ollama';
import { ElevenLabsClient } from 'elevenlabs';
import { createClient } from '@deepgram/sdk';
import * as PlayHT from 'playht';
import { CartesiaClient } from '@cartesia/cartesia-js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as childProcess from 'child_process';
import * as util from 'util';
import { createWriteStream } from 'fs';

const execPromise = util.promisify(childProcess.exec);

// Define AI provider types
enum AIProvider {
  GEMINI = 'gemini',
  OPENAI = 'openai',
  OLLAMA = 'ollama',
  CLAUDE = 'claude'
}

// Define Voice provider types
enum VoiceProvider {
  ELEVENLABS = 'elevenlabs',
  DEEPGRAM = 'deepgram',
  PLAYHT = 'playht',
  CARTESIA = 'cartesia'
}

// Function to generate a sanitized filename based on source file and timestamp
function generatePodcastFilename(sourceFileName: string): string {
  const baseName = path.basename(sourceFileName, path.extname(sourceFileName));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `podcast_${baseName}_${timestamp}`;
}

// Main function to convert script to audio using the selected voice provider
async function convertScriptToAudio(script: string, config: any, podcastName: string): Promise<string> {
  const voiceProvider = config.get('voiceProvider') as VoiceProvider || VoiceProvider.ELEVENLABS;
  
  switch (voiceProvider) {
    case VoiceProvider.ELEVENLABS:
      return await convertScriptWithElevenLabs(
        script, 
        config.get('elevenLabsApiKey') as string,
        config.get('host1VoiceId') as string,
        config.get('host2VoiceId') as string,
        podcastName
      );
    case VoiceProvider.DEEPGRAM:
      return await convertScriptWithDeepgram(
        script,
        config.get('deepgramApiKey') as string,
        config.get('deepgramHost1VoiceId') as string,
        config.get('deepgramHost2VoiceId') as string,
        podcastName
      );
    case VoiceProvider.PLAYHT:
      return await convertScriptWithPlayHT(
        script,
        config.get('playhtApiKey') as string,
        config.get('playhtUserId') as string,
        config.get('playhtHost1VoiceId') as string,
        config.get('playhtHost2VoiceId') as string,
        podcastName
      );
    case VoiceProvider.CARTESIA:
      return await convertScriptWithCartesia(
        script,
        config.get('cartesiaApiKey') as string,
        config.get('cartesiaHost1VoiceId') as string,
        config.get('cartesiaHost2VoiceId') as string,
        podcastName
      );
    default:
      throw new Error(`Unsupported voice provider: ${voiceProvider}`);
  }
}
// Helper function to convert the stream to an audio buffer
async function getAudioBufferFromStream(stream: ReadableStream): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  const dataArray = chunks.reduce(
    (acc, chunk) => new Uint8Array([...acc, ...chunk]),
    new Uint8Array(0)
  );
  
  return Buffer.from(dataArray.buffer);
}
// Deepgram implementation
async function convertScriptWithDeepgram(script: string, apiKey: string, host1VoiceId: string, host2VoiceId: string, podcastName: string): Promise<string> {
  try {
    const deepgram = createClient(apiKey);
    
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

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Processing audio for ${host} (part ${currentIndex})`,
        cancellable: false
      }, async (progress) => {
        try {
          progress.report({ message: "Generating audio with Deepgram..." });
          
          // Using updated Deepgram speak API
          const response = await deepgram.speak.request(
            { text }, 
            { 
              model: "aura-asteria-en", 
              voice: voiceId 
            }
          );
          
          progress.report({ message: "Writing audio file..." });
          
          // Get the audio stream from the response
          const stream = await response.getStream();
          if (stream) {
            // Convert stream to buffer
            const audioBuffer = await getAudioBufferFromStream(stream);

            progress.report({ message: "Writing audio file..." });
            fs.writeFileSync(audioFilePath, audioBuffer);

            audioFiles.push(audioFilePath);
            progress.report({ message: "Audio part complete" });
          } else {
            throw new Error("Failed to get audio stream from Deepgram");
          }
          
        } catch (deepgramError: any) {
          console.error('Deepgram API Error:', deepgramError);
          if (deepgramError.message) {
            vscode.window.showErrorMessage(`Deepgram Error: ${deepgramError.message}`);
          } else {
            vscode.window.showErrorMessage(`An unknown error occurred with Deepgram. Check the console for details.`);
          }
          throw deepgramError;
        }
      });

      currentIndex++;
    }

    if (audioFiles.length === 0) {
      throw new Error("No audio files were successfully created");
    }

    const finalAudioPath = path.join(tempDir, `${podcastName}.mp3`);
    await combineAudioFiles(audioFiles, finalAudioPath);

    vscode.window.showInformationMessage(`Complete podcast created at: ${finalAudioPath}`);
    vscode.env.openExternal(vscode.Uri.file(tempDir));

    // Clean up individual files after combining
    audioFiles.forEach(file => {
      try { fs.unlinkSync(file); } catch {}
    });

    return finalAudioPath;
  } catch (error: any) {
    console.error('General Error in convertScriptWithDeepgram:', error);
    vscode.window.showErrorMessage(`Error converting script to audio: ${error.message}`);
    return '';
  }
}



// Cartesia implementation
async function convertScriptWithCartesia(script: string, apiKey: string, host1VoiceId: string, host2VoiceId: string, podcastName: string): Promise<string> {
  try {
    const cartesia = new CartesiaClient({ apiKey });
    
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

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Processing audio for ${host} (part ${currentIndex})`,
        cancellable: false
      }, async (progress) => {
        try {
          progress.report({ message: "Generating audio with Cartesia..." });
          
          // Using Cartesia's TTS API
          const response = await cartesia.tts.bytes({
            modelId: "sonic-2",
            transcript: text,
            voice: {
              mode: "id",
              id: voiceId,
            },
            language: "en",
            outputFormat: {
              container: "wav",
              sampleRate: 44100,
              encoding: "pcm_f32le",
            },
          });
          
          progress.report({ message: "Writing audio file..." });
          fs.writeFileSync(audioFilePath, new Uint8Array(response));
          
          audioFiles.push(audioFilePath);
          progress.report({ message: "Audio part complete" });
          
        } catch (cartesiaError: any) {
          console.error('Cartesia API Error:', cartesiaError);
          if (cartesiaError.message) {
            vscode.window.showErrorMessage(`Cartesia Error: ${cartesiaError.message}`);
          } else {
            vscode.window.showErrorMessage(`An unknown error occurred with Cartesia. Check the console for details.`);
          }
          throw cartesiaError;
        }
      });

      currentIndex++;
    }

    if (audioFiles.length === 0) {
      throw new Error("No audio files were successfully created");
    }

    const finalAudioPath = path.join(tempDir, `${podcastName}.mp3`);
    await combineAudioFiles(audioFiles, finalAudioPath);

    vscode.window.showInformationMessage(`Complete podcast created at: ${finalAudioPath}`);
    vscode.env.openExternal(vscode.Uri.file(tempDir));

    // Clean up individual files after combining
    audioFiles.forEach(file => {
      try { fs.unlinkSync(file); } catch {}
    });

    return finalAudioPath;
  } catch (error: any) {
    console.error('General Error in convertScriptWithCartesia:', error);
    vscode.window.showErrorMessage(`Error converting script to audio: ${error.message}`);
    return '';
  }
}


// ElevenLabs implementation (existing code)
async function convertScriptWithElevenLabs(script: string, apiKey: string, host1VoiceId: string, host2VoiceId: string, podcastName: string): Promise<string> {
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

    const finalAudioPath = path.join(tempDir, `${podcastName}.mp3`);
    await combineAudioFiles(audioFiles, finalAudioPath);

    vscode.window.showInformationMessage(`Complete podcast created at: ${finalAudioPath}`);
    vscode.env.openExternal(vscode.Uri.file(tempDir));

    // Clean up individual files after combining
    audioFiles.forEach(file => {
      try { fs.unlinkSync(file); } catch {}
    });

    return finalAudioPath;
  } catch (error: any) {
    console.error('General Error in convertScriptWithElevenLabs:', error);
    vscode.window.showErrorMessage(`Error converting script to audio: ${error.message}`);
    return '';
  }
}
// PlayHT implementation
async function convertScriptWithPlayHT(script: string, apiKey: string, userId: string, host1VoiceId: string, host2VoiceId: string, podcastName: string): Promise<string> {
  try {
    // Initialize PlayHT with API key and user ID
    PlayHT.init({
      apiKey: apiKey,
      userId: userId,
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

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Processing audio for ${host} (part ${currentIndex})`,
        cancellable: false
      }, async (progress) => {
        try {
          progress.report({ message: "Generating audio with PlayHT..." });
          
          // Create a file stream
          const fileStream = fs.createWriteStream(audioFilePath);
          
          // Stream audio from text using PlayHT
          const stream = await PlayHT.stream(text, {
            voiceEngine: 'Play3.0-mini',
            voiceId: voiceId,
            outputFormat: 'mp3',
          });
          
          // Return a promise that resolves when the stream is finished
          await new Promise<void>((resolve, reject) => {
            progress.report({ message: "Writing audio file..." });
            
            stream.pipe(fileStream);
            
            fileStream.on('finish', () => {
              audioFiles.push(audioFilePath);
              progress.report({ message: "Audio part complete" });
              resolve();
            });
            
            fileStream.on('error', (err) => {
              console.error('Error writing audio file:', err);
              reject(err);
            });
            
            stream.on('error', (err) => {
              console.error('Error streaming audio:', err);
              reject(err);
            });
          });
          
        } catch (playhtError: any) {
          console.error('PlayHT API Error:', playhtError);
          if (playhtError.message) {
            vscode.window.showErrorMessage(`PlayHT Error: ${playhtError.message}`);
          } else {
            vscode.window.showErrorMessage(`An unknown error occurred with PlayHT. Check the console for details.`);
          }
          throw playhtError;
        }
      });

      currentIndex++;
    }

    if (audioFiles.length === 0) {
      throw new Error("No audio files were successfully created");
    }

    const finalAudioPath = path.join(tempDir, `${podcastName}.mp3`);
    await combineAudioFiles(audioFiles, finalAudioPath);

    vscode.window.showInformationMessage(`Complete podcast created at: ${finalAudioPath}`);
    vscode.env.openExternal(vscode.Uri.file(tempDir));

    // Clean up individual files after combining
    audioFiles.forEach(file => {
      try { fs.unlinkSync(file); } catch {}
    });

    return finalAudioPath;
  } catch (error: any) {
    console.error('General Error in convertScriptWithPlayHT:', error);
    vscode.window.showErrorMessage(`Error converting script to audio: ${error.message}`);
    return '';
  }
}async function combineAudioFiles(audioFilePaths: string[], outputPath: string): Promise<void> {
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

// Function to generate script using Gemini
async function generateScriptWithGemini(prompt: string, apiKey: string, model: string = "gemini-2.0-flash"): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model: model });
  const result = await genModel.generateContent(prompt);
  return result.response.text();
}

// Function to generate script using OpenAI
async function generateScriptWithOpenAI(prompt: string, apiKey: string, model: string = 'gpt-4o'): Promise<string> {
  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  });
  
  return response.choices[0]?.message?.content || '';
}

// Function to generate script using Ollama
async function generateScriptWithOllama(prompt: string, model: string = 'llama3'): Promise<string> {
  try {
    const response = await ollama.generate({
      model: model,
      prompt: prompt,
    });
    
    return response.response;
  } catch (error) {
    console.error('Ollama API Error:', error);
    throw error;
  }
}

// Function to generate script using Claude
async function generateScriptWithClaude(prompt: string, apiKey: string, model: string = 'claude-3-5-sonnet-latest'): Promise<string> {
  try {
    const client = new Anthropic({
      apiKey: apiKey,
    });
    
    const message = await client.messages.create({
      model: model,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });
    
      const contentBlock = message.content[0];
      if ('text' in contentBlock) {
        return contentBlock.text;
      } else {
        // Handle the case where there's no text property
        console.log('Content block does not contain text:', contentBlock);
        return ''; // or some appropriate default value
      }
  } catch (error) {
    console.error('Claude API Error:', error);
    throw error;
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
    
    // Generate a unique podcast name based on the source file
    const podcastName = generatePodcastFilename(fileName);

    const config = vscode.workspace.getConfiguration('codepod');
    
    // Get AI provider configuration
    const aiProvider = config.get('aiProvider') as AIProvider || AIProvider.GEMINI;
    
    // Get provider-specific API keys and models
    const geminiApiKey = config.get('geminiApiKey') as string;
    const geminiModel = config.get('geminiModel') as string || 'gemini-2.0-flash';
    
    const openaiApiKey = config.get('openaiApiKey') as string;
    const openaiModel = config.get('openaiModel') as string || 'gpt-4o';
    
    const ollamaModel = config.get('ollamaModel') as string || 'llama3';
    
    const claudeApiKey = config.get('claudeApiKey') as string;
    const claudeModel = config.get('claudeModel') as string || 'claude-3-5-sonnet-latest';
    
    // Get ElevenLabs configuration
    const elevenLabsApiKey = config.get('elevenLabsApiKey') as string;
    const host1VoiceId = config.get('host1VoiceId') as string;
    const host2VoiceId = config.get('host2VoiceId') as string;

    // Validate required API keys based on selected provider
    let missingKey = false;
    switch (aiProvider) {
      case AIProvider.GEMINI:
        if (!geminiApiKey) {
          vscode.window.showErrorMessage('Please set your Gemini API key in the settings.');
          missingKey = true;
        }
        break;
      case AIProvider.OPENAI:
        if (!openaiApiKey) {
          vscode.window.showErrorMessage('Please set your OpenAI API key in the settings.');
          missingKey = true;
        }
        break;
      case AIProvider.CLAUDE:
        if (!claudeApiKey) {
          vscode.window.showErrorMessage('Please set your Claude API key in the settings.');
          missingKey = true;
        }
        break;
      // Ollama doesn't require an API key
      case AIProvider.OLLAMA:
        break;
    }

    if (!elevenLabsApiKey) {
      vscode.window.showErrorMessage('Please set your Eleven Labs API key in the settings.');
      missingKey = true;
    }

    if (missingKey) {
      return;
    }

    // Use selectedText in the prompt, but handle the empty selection case
    let codeSnippet: string;
    if (selectedText.trim() !== "") {
        codeSnippet = selectedText;
    } else {
        codeSnippet = fileContent;
        vscode.window.showInformationMessage("No text selected, using entire file content.");
    }

      // Get the custom prompt from configuration
      const customPromptTemplate = config.get('customPrompt') as string || 
        "You are a podcast script writer that is extremely adept in coding. You understand nuances in code and areas where code could occur. You will make a podcast script about the code given and will add in natural umms, ahhs, etc. Also, you will add in interjections that are natural in a podcast. Lastly, you will give a high level overview of the code and then go into the nitty gritty details to find potential issues. Make sure that one host is questioning the other to come up with responses as to why things may work or not work. Lastly, write out only the script, with no music interludes and make each line either start with 'Host1:' or 'Host2:'";

      // Replace {code} placeholder or append code if no placeholder exists
      const prompt = customPromptTemplate.includes("{code}") 
        ? customPromptTemplate.replace("{code}", `\`\`\`\n${codeSnippet}\n\`\`\``)
        : `${customPromptTemplate}\n\nCode:\n\`\`\`\n${codeSnippet}\n\`\`\``;

    try {
      // Show progress notification
      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Generating podcast",
        cancellable: false
      }, async (progress) => {
        progress.report({ message: `Generating script with ${aiProvider}...` });

        let text = '';
        
        // Generate script based on selected AI provider
        try {
          switch (aiProvider) {
            case AIProvider.GEMINI:
              text = await generateScriptWithGemini(prompt, geminiApiKey, geminiModel);
              break;
            case AIProvider.OPENAI:
              text = await generateScriptWithOpenAI(prompt, openaiApiKey, openaiModel);
              break;
            case AIProvider.OLLAMA:
              text = await generateScriptWithOllama(prompt, ollamaModel);
              break;
            case AIProvider.CLAUDE:
              text = await generateScriptWithClaude(prompt, claudeApiKey, claudeModel);
              break;
            default:
              throw new Error(`Unsupported AI provider: ${aiProvider}`);
          }
        } catch (error: any) {
          vscode.window.showErrorMessage(`Error generating script with ${aiProvider}: ${error.message}`);
          throw error;
        }

        // Display generated script with custom filename
        const scriptDocument = await vscode.workspace.openTextDocument({ 
          content: text, 
          language: 'markdown' 
        });
        
        // Save the script with the custom filename
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (workspaceFolder) {
          const scriptPath = path.join(workspaceFolder, 'codepod_scripts');
          if (!fs.existsSync(scriptPath)) {
            fs.mkdirSync(scriptPath, { recursive: true });
          }
          
          const scriptFilePath = path.join(scriptPath, `${podcastName}.md`);
          fs.writeFileSync(scriptFilePath, text);
          
          // Open the saved script file
          const savedScriptDocument = await vscode.workspace.openTextDocument(scriptFilePath);
          vscode.window.showTextDocument(savedScriptDocument);
        } else {
          // If no workspace folder, just show the unsaved document
          vscode.window.showTextDocument(scriptDocument);
        }

        // Convert script to audio with the custom filename
        progress.report({ message: "Converting script to audio with Eleven Labs..." });
        
        try {
          const finalAudioPath = await convertScriptToAudio(text, vscode.workspace.getConfiguration('codepod'), podcastName);
          progress.report({ message: `Podcast "${podcastName}" created!` });
        } catch (error: any) {
          vscode.window.showErrorMessage(`Error converting script to audio: ${error.message}`);
        }
      });
    } catch (error: any) {
      console.error('Error in podcast generation:', error);
      vscode.window.showErrorMessage(`Error generating podcast: ${error.message}`);
    }
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}