# Gemini File Sender

A Visual Studio Code extension that allows you to send the entire contents of your current file to the Gemini AI API and view the response.

## Features

- Send the entire content of your active file to Gemini with a single command
- View Gemini's response in a new tab
- Supports all file types

## Installation

### From VSIX file

1. Download the `.vsix` file from the releases page
2. Open VS Code
3. Go to the Extensions view (Ctrl+Shift+X)
4. Click the "..." at the top-right of the Extensions view
5. Select "Install from VSIX..."
6. Choose the downloaded `.vsix` file

### From source code

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `vsce package` to create a `.vsix` file
4. Follow the steps above to install the extension from the `.vsix` file

## Setup

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/)
2. Open VS Code settings (File > Preferences > Settings)
3. Search for "Gemini Sender"
4. Enter your API key in the "API Key" field

## Usage

1. Open any file in VS Code
2. Right-click in the editor to open the context menu
3. Select "Send File to Gemini"
4. Wait for the response (a notification will show progress)
5. The response will open in a new tab as markdown

## Requirements

- Visual Studio Code 1.60.0 or higher
- Internet connection to access the Gemini API
- Valid Gemini API key

## Known Issues

- Large files may take longer to process or exceed the API's token limit
- API rate limits may apply depending on your Gemini API usage plan

## Release Notes

### 0.1.0

- Initial release
- Basic functionality to send file content to Gemini
- Display response in a new tab

## Privacy Notice

This extension sends the entire content of your active file to the Gemini API. Please ensure you do not send sensitive or private information.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
