// extension.js
const vscode = require('vscode');
const axios = require('axios');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('CodePod activation started');
    vscode.window.showInformationMessage('CodePod is activating');

    process.nextTick(() => console.log('CodePod activation process.nextTick executed'));

    
    try {
        // Register the command to send the file to Gemini
        const disposable = vscode.commands.registerCommand('codepod.sendFile', handleSendFile);
        
        // Add the command to subscriptions
        context.subscriptions.push(disposable);
        
        // Log successful registration
        console.log('CodePod command registered successfully: codepod.sendFile');
        
        // Create a status bar item to show the extension is active
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.text = "$(broadcast) CodePod";
        statusBarItem.tooltip = "Send current file to Gemini";
        statusBarItem.command = 'codepod.sendFile';
        statusBarItem.show();
        
        // Add status bar item to subscriptions
        context.subscriptions.push(statusBarItem);
        
        // Show notification that extension is ready
        vscode.window.showInformationMessage('CodePod extension is ready');
    } catch (error) {
        // Log any errors during activation
        console.error('Error activating CodePod:', error);
        vscode.window.showErrorMessage(`CodePod activation error: ${error.message}`);
    }

    console.log('CodePod activation function completed execution');
    return context;
}
/**
 * Handler for the sendFile command
 */
async function handleSendFile() {
    try {
        // Log command execution
        console.log('Executing codepod.sendFile command');
        
        // Get the active text editor
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        // Get the entire document text
        const document = editor.document;
        const text = document.getText();
        
        // Check if the text is empty
        if (!text) {
            vscode.window.showErrorMessage('File is empty');
            return;
        }

        // Get the API key from settings
        const config = vscode.workspace.getConfiguration('codepod');
        const apiKey = config.get('apiKey');
        
        if (!apiKey) {
            vscode.window.showErrorMessage('Gemini API key not found. Please add it in settings.');
            vscode.commands.executeCommand('workbench.action.openSettings', 'codepod.apiKey');
            return;
        }

        // Show progress notification
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Sending to Gemini",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Sending file content..." });
            
            // Send the content to Gemini API
            const response = await sendToGemini(text, apiKey);
            
            // Show the response in a new tab
            await showGeminiResponse(response);
            
            return Promise.resolve();
        });
    } catch (error) {
        console.error('Error executing sendFile command:', error);
        vscode.window.showErrorMessage(`Error: ${error.message}`);
    }
}

/**
 * Sends the text to Gemini API
 * @param {string} text - The text content to send
 * @param {string} apiKey - The Gemini API key
 * @returns {Promise<string>} - The response from Gemini
 */
async function sendToGemini(text, apiKey) {
    try {
        // Log API request (without sensitive data)
        console.log('Sending request to Gemini API');
        
        // Gemini API endpoint
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        
        // Request body
        const data = {
            contents: [
                {
                    parts: [
                        {
                            text: text
                        }
                    ]
                }
            ]
        };
        
        // Send request to Gemini
        const response = await axios.post(url, data);
        
        // Log API response (structure only)
        console.log('Received response from Gemini API');
        
        // Extract and return the response text
        if (response.data && 
            response.data.candidates && 
            response.data.candidates[0] && 
            response.data.candidates[0].content && 
            response.data.candidates[0].content.parts && 
            response.data.candidates[0].content.parts[0]) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('Unexpected response format from Gemini API');
        }
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        throw new Error(`Failed to get response from Gemini: ${error.message}`);
    }
}

/**
 * Shows the Gemini response in a new editor tab
 * @param {string} response - The response from Gemini
 */
async function showGeminiResponse(response) {
    try {
        // Create a new untitled document
        const document = await vscode.workspace.openTextDocument({
            content: response,
            language: 'markdown'
        });
        
        // Show the document
        await vscode.window.showTextDocument(document, { preview: false });
    } catch (error) {
        console.error('Error displaying response:', error);
        vscode.window.showErrorMessage(`Error displaying response: ${error.message}`);
    }
}

// Export only once at the end of the file
module.exports = {
    activate
}