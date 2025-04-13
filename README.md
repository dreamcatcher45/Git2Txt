# Git2txt

Git2txt is a web application that allows you to convert public GitHub repositories into text files, making it easy to use codebases as context for Large Language Models (LLMs).

## Description

Git2txt simplifies the process of preparing GitHub repository content for LLM consumption. It provides a user-friendly interface to fetch, select, and format code files from any public GitHub repository, with features like file selection, path inclusion, and text minification.

## Features

- 🔍 Fetch any public GitHub repository
- 📁 Interactive directory tree visualization
- ✅ Selective file inclusion/exclusion
- 📝 Flexible output formatting options:
  - Include/exclude file paths
  - Minification option to reduce token usage
- 📊 Real-time token count estimation
- 💾 Export options:
  - Copy to clipboard
  - Download as TXT file
- 🌓 Dark/Light theme support
- 📱 Responsive design

## Technologies Used

- Next.js
- TypeScript
- Tailwind CSS
- Shadcn/ui Components
- GPT Tokenizer

## Usage

1. Visit the application
2. Enter a public GitHub repository URL
3. Wait for the repository files to load
4. Select the files you want to include
   - Use checkboxes to select individual files
   - Use folder checkboxes to select/deselect all files in a directory
5. Configure output options:
   - Toggle "Include File Path" to add file paths in the output
   - Toggle "Minify" to reduce whitespace
6. View the token count estimation
7. Copy the result to clipboard or download as a TXT file

## Getting Started

```bash
# Clone the repository
git clone https://github.com/dreamcatcher45/git2txt.git

# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:9002](http://localhost:9002) with your browser to see the result.

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
