import * as vscode from 'vscode';
import { GoogleGenerativeAI } from "@google/generative-ai";

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('codepod.generatePodcast', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active text editor.');
      return;
    }

    const fileContent = editor.document.getText();
    const fileName = editor.document.fileName;

    const apiKey = vscode.workspace.getConfiguration('codepod').get('apiKey') as string;

    if (!apiKey) {
      vscode.window.showErrorMessage('Please set your Gemini API key in the settings.');
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `You are a podcast script writer that is extremely adept in coding. You understand nuances in code and areas where code issues could occur. You will make a podcast script about the code given and will add in natural umms, ahhs, etc. Also, you will add in interjections that are natural in a podcast. Lastly, you will give a high level overview of the code and then go into the nitty gritty details to find potential issues. Make sure that one host is questioning the other to come up with responses as to why things may work or not work. Lastly, write out only the script, with no music interludes and make each line either start with 'Host1:' or 'Host2:' \n\nCode:\n\`\`\`\n${fileContent}\n\`\`\``;

    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      const newDocument = await vscode.workspace.openTextDocument({ content: text, language: 'markdown' });
      vscode.window.showTextDocument(newDocument);

    } catch (error: any) {
      vscode.window.showErrorMessage(`Error generating podcast script: ${error.message}`);
      console.error(error);
    }
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}