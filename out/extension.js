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
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const generative_ai_1 = require("@google/generative-ai");
function activate(context) {
    let disposable = vscode.commands.registerCommand('codepod.generatePodcast', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active text editor.');
            return;
        }
        const fileContent = editor.document.getText();
        const fileName = editor.document.fileName;
        const apiKey = vscode.workspace.getConfiguration('codepod').get('apiKey');
        if (!apiKey) {
            vscode.window.showErrorMessage('Please set your Gemini API key in the settings.');
            return;
        }
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const prompt = `You are a podcast script writer that is extremely adept in coding. You understand nuances in code and areas where code issues could occur. You will make a podcast script about the code given and will add in natural umms, ahhs, etc. Also, you will add in interjections that are natural in a podcast. Lastly, you will give a high level overview of the code and then go into the nitty gritty details to find potential issues. Make sure that one host is questioning the other to come up with responses as to why things may work or not work. Lastly, write out only the script, with no music interludes and make each line either start with 'Host1:' or 'Host2:' \n\nCode:\n\`\`\`\n${fileContent}\n\`\`\``;
        try {
            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.text();
            const newDocument = await vscode.workspace.openTextDocument({ content: text, language: 'markdown' });
            vscode.window.showTextDocument(newDocument);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error generating podcast script: ${error.message}`);
            console.error(error);
        }
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map