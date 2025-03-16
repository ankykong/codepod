"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const generative_ai_1 = require("@google/generative-ai");
const openai_1 = __importDefault(require("openai"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const ollama_1 = __importDefault(require("ollama"));
const elevenlabs_1 = require("elevenlabs");
const sdk_2 = require("@deepgram/sdk");
const PlayHT = __importStar(require("playht"));
const cartesia_js_1 = require("@cartesia/cartesia-js");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const childProcess = __importStar(require("child_process"));
const util = __importStar(require("util"));
const fs_1 = require("fs");
const execPromise = util.promisify(childProcess.exec);
// Define AI provider types
var AIProvider;
(function (AIProvider) {
    AIProvider["GEMINI"] = "gemini";
    AIProvider["OPENAI"] = "openai";
    AIProvider["OLLAMA"] = "ollama";
    AIProvider["CLAUDE"] = "claude";
})(AIProvider || (AIProvider = {}));
// Define Voice provider types
var VoiceProvider;
(function (VoiceProvider) {
    VoiceProvider["ELEVENLABS"] = "elevenlabs";
    VoiceProvider["DEEPGRAM"] = "deepgram";
    VoiceProvider["PLAYHT"] = "playht";
    VoiceProvider["CARTESIA"] = "cartesia";
})(VoiceProvider || (VoiceProvider = {}));
// Function to generate a sanitized filename based on source file and timestamp
function generatePodcastFilename(sourceFileName) {
    const baseName = path.basename(sourceFileName, path.extname(sourceFileName));
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `podcast_${baseName}_${timestamp}`;
}
// Main function to convert script to audio using the selected voice provider
async function convertScriptToAudio(script, config, podcastName) {
    const voiceProvider = config.get('voiceProvider') || VoiceProvider.ELEVENLABS;
    switch (voiceProvider) {
        case VoiceProvider.ELEVENLABS:
            return await convertScriptWithElevenLabs(script, config.get('elevenLabsApiKey'), config.get('host1VoiceId'), config.get('host2VoiceId'), podcastName);
        case VoiceProvider.DEEPGRAM:
            return await convertScriptWithDeepgram(script, config.get('deepgramApiKey'), config.get('deepgramHost1VoiceId'), config.get('deepgramHost2VoiceId'), podcastName);
        case VoiceProvider.PLAYHT:
            return await convertScriptWithPlayHT(script, config.get('playhtApiKey'), config.get('playhtUserId'), config.get('playhtHost1VoiceId'), config.get('playhtHost2VoiceId'), podcastName);
        case VoiceProvider.CARTESIA:
            return await convertScriptWithCartesia(script, config.get('cartesiaApiKey'), config.get('cartesiaHost1VoiceId'), config.get('cartesiaHost2VoiceId'), podcastName);
        default:
            throw new Error(`Unsupported voice provider: ${voiceProvider}`);
    }
}
// Helper function to convert the stream to an audio buffer
async function getAudioBufferFromStream(stream) {
    const reader = stream.getReader();
    const chunks = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        chunks.push(value);
    }
    const dataArray = chunks.reduce((acc, chunk) => new Uint8Array([...acc, ...chunk]), new Uint8Array(0));
    return Buffer.from(dataArray.buffer);
}
// Deepgram implementation
async function convertScriptWithDeepgram(script, apiKey, host1VoiceId, host2VoiceId, podcastName) {
    try {
        const deepgram = (0, sdk_2.createClient)(apiKey);
        const tempDir = path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath || os.tmpdir(), 'codepod_audio');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const lines = script.split('\n').filter(line => line.trim().length > 0);
        let audioFiles = [];
        let currentIndex = 1;
        for (const line of lines) {
            let voiceId, host;
            if (line.startsWith('Host1:')) {
                voiceId = host1VoiceId;
                host = 'Host1';
            }
            else if (line.startsWith('Host2:')) {
                voiceId = host2VoiceId;
                host = 'Host2';
            }
            else {
                continue;
            }
            const text = line.substring(line.indexOf(':') + 1).trim();
            if (!text)
                continue; // Skip empty lines
            const audioFilePath = path.join(tempDir, `${currentIndex.toString().padStart(3, '0')}_${host}.mp3`);
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Processing audio for ${host} (part ${currentIndex})`,
                cancellable: false
            }, async (progress) => {
                try {
                    progress.report({ message: "Generating audio with Deepgram..." });
                    // Using updated Deepgram speak API
                    const response = await deepgram.speak.request({ text }, {
                        model: "aura-asteria-en",
                        voice: voiceId
                    });
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
                    }
                    else {
                        throw new Error("Failed to get audio stream from Deepgram");
                    }
                }
                catch (deepgramError) {
                    console.error('Deepgram API Error:', deepgramError);
                    if (deepgramError.message) {
                        vscode.window.showErrorMessage(`Deepgram Error: ${deepgramError.message}`);
                    }
                    else {
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
            try {
                fs.unlinkSync(file);
            }
            catch { }
        });
        return finalAudioPath;
    }
    catch (error) {
        console.error('General Error in convertScriptWithDeepgram:', error);
        vscode.window.showErrorMessage(`Error converting script to audio: ${error.message}`);
        return '';
    }
}
// Cartesia implementation
async function convertScriptWithCartesia(script, apiKey, host1VoiceId, host2VoiceId, podcastName) {
    try {
        const cartesia = new cartesia_js_1.CartesiaClient({ apiKey });
        const tempDir = path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath || os.tmpdir(), 'codepod_audio');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const lines = script.split('\n').filter(line => line.trim().length > 0);
        let audioFiles = [];
        let currentIndex = 1;
        for (const line of lines) {
            let voiceId, host;
            if (line.startsWith('Host1:')) {
                voiceId = host1VoiceId;
                host = 'Host1';
            }
            else if (line.startsWith('Host2:')) {
                voiceId = host2VoiceId;
                host = 'Host2';
            }
            else {
                continue;
            }
            const text = line.substring(line.indexOf(':') + 1).trim();
            if (!text)
                continue; // Skip empty lines
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
                }
                catch (cartesiaError) {
                    console.error('Cartesia API Error:', cartesiaError);
                    if (cartesiaError.message) {
                        vscode.window.showErrorMessage(`Cartesia Error: ${cartesiaError.message}`);
                    }
                    else {
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
            try {
                fs.unlinkSync(file);
            }
            catch { }
        });
        return finalAudioPath;
    }
    catch (error) {
        console.error('General Error in convertScriptWithCartesia:', error);
        vscode.window.showErrorMessage(`Error converting script to audio: ${error.message}`);
        return '';
    }
}
// ElevenLabs implementation (existing code)
async function convertScriptWithElevenLabs(script, apiKey, host1VoiceId, host2VoiceId, podcastName) {
    try {
        const elevenlabs = new elevenlabs_1.ElevenLabsClient({
            apiKey: apiKey
        });
        const tempDir = path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath || os.tmpdir(), 'codepod_audio');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const lines = script.split('\n').filter(line => line.trim().length > 0);
        let audioFiles = [];
        let currentIndex = 1;
        for (const line of lines) {
            let voiceId, host;
            if (line.startsWith('Host1:')) {
                voiceId = host1VoiceId;
                host = 'Host1';
            }
            else if (line.startsWith('Host2:')) {
                voiceId = host2VoiceId;
                host = 'Host2';
            }
            else {
                continue;
            }
            const text = line.substring(line.indexOf(':') + 1).trim();
            if (!text)
                continue; // Skip empty lines
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
                    await new Promise((resolve, reject) => {
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
                            const fileStream = (0, fs_1.createWriteStream)(audioFilePath);
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
                }
                catch (elevenLabsError) {
                    console.error('ElevenLabs API Error:', elevenLabsError);
                    if (elevenLabsError.message) {
                        vscode.window.showErrorMessage(`ElevenLabs Error: ${elevenLabsError.message}`);
                    }
                    else {
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
            try {
                fs.unlinkSync(file);
            }
            catch { }
        });
        return finalAudioPath;
    }
    catch (error) {
        console.error('General Error in convertScriptWithElevenLabs:', error);
        vscode.window.showErrorMessage(`Error converting script to audio: ${error.message}`);
        return '';
    }
}
// PlayHT implementation
async function convertScriptWithPlayHT(script, apiKey, userId, host1VoiceId, host2VoiceId, podcastName) {
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
        let audioFiles = [];
        let currentIndex = 1;
        for (const line of lines) {
            let voiceId, host;
            if (line.startsWith('Host1:')) {
                voiceId = host1VoiceId;
                host = 'Host1';
            }
            else if (line.startsWith('Host2:')) {
                voiceId = host2VoiceId;
                host = 'Host2';
            }
            else {
                continue;
            }
            const text = line.substring(line.indexOf(':') + 1).trim();
            if (!text)
                continue; // Skip empty lines
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
                    await new Promise((resolve, reject) => {
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
                }
                catch (playhtError) {
                    console.error('PlayHT API Error:', playhtError);
                    if (playhtError.message) {
                        vscode.window.showErrorMessage(`PlayHT Error: ${playhtError.message}`);
                    }
                    else {
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
            try {
                fs.unlinkSync(file);
            }
            catch { }
        });
        return finalAudioPath;
    }
    catch (error) {
        console.error('General Error in convertScriptWithPlayHT:', error);
        vscode.window.showErrorMessage(`Error converting script to audio: ${error.message}`);
        return '';
    }
}
async function combineAudioFiles(audioFilePaths, outputPath) {
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
    }
    catch (error) {
        console.error('Error combining audio files:', error);
        throw new Error(`Failed to combine audio files: ${error}`);
    }
}
// Function to generate script using Gemini
async function generateScriptWithGemini(prompt, apiKey, model = "gemini-2.0-flash") {
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({ model: model });
    const result = await genModel.generateContent(prompt);
    return result.response.text();
}
// Function to generate script using OpenAI
async function generateScriptWithOpenAI(prompt, apiKey, model = 'gpt-4o') {
    const openai = new openai_1.default({ apiKey });
    const response = await openai.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
    });
    return response.choices[0]?.message?.content || '';
}
// Function to generate script using Ollama
async function generateScriptWithOllama(prompt, model = 'llama3') {
    try {
        const response = await ollama_1.default.generate({
            model: model,
            prompt: prompt,
        });
        return response.response;
    }
    catch (error) {
        console.error('Ollama API Error:', error);
        throw error;
    }
}
// Function to generate script using Claude
async function generateScriptWithClaude(prompt, apiKey, model = 'claude-3-5-sonnet-latest') {
    try {
        const client = new sdk_1.default({
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
        }
        else {
            // Handle the case where there's no text property
            console.log('Content block does not contain text:', contentBlock);
            return ''; // or some appropriate default value
        }
    }
    catch (error) {
        console.error('Claude API Error:', error);
        throw error;
    }
}
function activate(context) {
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
        const aiProvider = config.get('aiProvider') || AIProvider.GEMINI;
        // Get provider-specific API keys and models
        const geminiApiKey = config.get('geminiApiKey');
        const geminiModel = config.get('geminiModel') || 'gemini-2.0-flash';
        const openaiApiKey = config.get('openaiApiKey');
        const openaiModel = config.get('openaiModel') || 'gpt-4o';
        const ollamaModel = config.get('ollamaModel') || 'llama3';
        const claudeApiKey = config.get('claudeApiKey');
        const claudeModel = config.get('claudeModel') || 'claude-3-5-sonnet-latest';
        // Get ElevenLabs configuration
        const elevenLabsApiKey = config.get('elevenLabsApiKey');
        const host1VoiceId = config.get('host1VoiceId');
        const host2VoiceId = config.get('host2VoiceId');
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
        let codeSnippet;
        if (selectedText.trim() !== "") {
            codeSnippet = selectedText;
        }
        else {
            codeSnippet = fileContent;
            vscode.window.showInformationMessage("No text selected, using entire file content.");
        }
        // Get the custom prompt from configuration
        const customPromptTemplate = config.get('customPrompt') ||
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
                }
                catch (error) {
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
                }
                else {
                    // If no workspace folder, just show the unsaved document
                    vscode.window.showTextDocument(scriptDocument);
                }
                // Convert script to audio with the custom filename
                progress.report({ message: "Converting script to audio with Eleven Labs..." });
                try {
                    const finalAudioPath = await convertScriptToAudio(text, vscode.workspace.getConfiguration('codepod'), podcastName);
                    progress.report({ message: `Podcast "${podcastName}" created!` });
                }
                catch (error) {
                    vscode.window.showErrorMessage(`Error converting script to audio: ${error.message}`);
                }
            });
        }
        catch (error) {
            console.error('Error in podcast generation:', error);
            vscode.window.showErrorMessage(`Error generating podcast: ${error.message}`);
        }
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map