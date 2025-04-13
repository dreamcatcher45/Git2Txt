"use client";

import { useState, useEffect, useCallback } from "react";
import { getRepoFiles, GitHubFile } from "@/services/github";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Copy, Folder, File, Moon, Sun, Loader2, Github, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { encode } from "gpt-tokenizer";
import { Checkbox } from "@/components/ui/checkbox";
import { approximateTokenCount } from "@/lib/token-counter";
import { useSearchParams } from "next/navigation";

// Function to structure files into a directory format
const structureFiles = (files: GitHubFile[]) => {
  const root: { [key: string]: any } = {};

  files.forEach((file) => {
    const pathParts = file.path.split("/");
    let currentLevel = root;

    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (!currentLevel[part]) {
        currentLevel[part] = {
          type: "dir",
          children: {},
          path: pathParts.slice(0, i + 1).join("/"),
        };
      }
      currentLevel = currentLevel[part].children;
    }

    const fileName = pathParts[pathParts.length - 1];
    currentLevel[fileName] = { ...file, type: "file" };
  });

  return root;
};

// Helper function to get all file paths in a directory
const getAllFilePaths = (directory: { [key: string]: any }): string[] => {
  let paths: string[] = [];
  Object.values(directory).forEach((item) => {
    if (item.type === "file") {
      paths.push(item.path);
    } else if (item.type === "dir") {
      paths = [...paths, ...getAllFilePaths(item.children)];
    }
  });
  return paths;
};

// Recursive component to render directory structure
const DirectoryView = ({
  directory,
  selectedFiles,
  toggleFileSelection,
  toggleFolderSelection,
}: {
  directory: { [key: string]: any };
  selectedFiles: string[];
  toggleFileSelection: (path: string) => void;
  toggleFolderSelection: (path: string, checked: boolean) => void;
}) => {
  return (
    <div>
      {Object.entries(directory)
        .sort(([, a], [, b]) => {
          if (a.type === "dir" && b.type !== "dir") {
            return -1;
          }
          if (a.type !== "dir" && b.type === "dir") {
            return 1;
          }
          return 0;
        })
        .map(([name, item]) => (
          <div key={name} className="ml-2 mb-1 mt-1">
            {item.type === "dir" ? (
              <div>
                <div className="flex items-center space-x-2 py-1">
                  <Checkbox
                    id={item.path}
                    checked={getAllFilePaths(item.children).every((path) => 
                      selectedFiles.includes(path)
                    )}
                    onCheckedChange={(checked) =>
                      toggleFolderSelection(item.path, checked as boolean)
                    }
                    className="my-1"
                  />
                  <Label
                    htmlFor={item.path}
                    className="flex items-center space-x-1"
                  >
                    <Folder className="h-4 w-4" />
                    <span>{name}</span>
                  </Label>
                </div>
                <DirectoryView
                  directory={item.children}
                  selectedFiles={selectedFiles}
                  toggleFileSelection={toggleFileSelection}
                  toggleFolderSelection={toggleFolderSelection}
                />
              </div>
            ) : (
              <div className="flex items-center space-x-2 py-1">
                <Checkbox
                  id={item.path}
                  checked={selectedFiles.includes(item.path)}
                  onCheckedChange={() => toggleFileSelection(item.path)}
                  className="my-1"
                />
                <Label
                  htmlFor={item.path}
                  className="flex items-center space-x-1"
                >
                  <File className="h-4 w-4" />
                  <span>{name}</span>
                </Label>
              </div>
            )}
          </div>
        ))}
    </div>
  );
};

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [repoName, setRepoName] = useState("");
  const [files, setFiles] = useState<GitHubFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [includePath, setIncludePath] = useState(false);
  const [minified, setMinified] = useState(false);
  const [outputText, setOutputText] = useState("");
  const { toast } = useToast();
  const [structuredDir, setStructuredDir] = useState<{ [key: string]: any }>(
    {}
  );
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedTheme = localStorage.getItem("theme") as
        | "light"
        | "dark"
        | null;
      setTheme(storedTheme || "light");
    }
  }, []);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      if (typeof window !== "undefined") {
        localStorage.setItem("theme", "dark");
      }
    } else {
      document.documentElement.classList.remove("dark");
      if (typeof window !== "undefined") {
        localStorage.setItem("theme", "light");
      }
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  useEffect(() => {
    if (files.length > 0) {
      const structured = structureFiles(files);
      setStructuredDir(structured);
    }
  }, [files]);

  useEffect(() => {
    if (selectedFiles.length > 0) {
      const combinedText = combineFiles();
      setOutputText(combinedText);
    } else {
      setOutputText("");
    }
  }, [selectedFiles, includePath, minified, files]);

  const getRepoNameFromUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      if (pathParts.length >= 2) {
        return `${pathParts[0]}/${pathParts[1]}`;
      }
    } catch (e) {}
    return "";
  };

  const fetchFiles = async () => {
    if (!repoUrl) {
      toast({
        title: "Error",
        description: "Please enter a repository URL.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const fetchedFiles = await getRepoFiles(repoUrl);
      setFiles(fetchedFiles);
      setSelectedFiles([]); // Reset selections on new fetch
      setRepoName(getRepoNameFromUrl(repoUrl));
    } catch (error: any) {
      console.error("Error fetching files:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch repository files.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFileSelection = (path: string) => {
    setSelectedFiles((prev) => {
      if (prev.includes(path)) {
        return prev.filter((p) => p !== path);
      } else {
        return [...prev, path];
      }
    });
  };

  const toggleFolderSelection = (folderPath: string, checked: boolean) => {
    const folderFiles = files.filter((file) =>
      file.path.startsWith(folderPath + "/")
    );
    const folderFilePaths = folderFiles.map((file) => file.path);

    setSelectedFiles((prev) => {
      if (checked) {
        // Add all files in the folder
        return [
          ...prev,
          ...folderFilePaths.filter((path) => !prev.includes(path)),
        ];
      } else {
        // Remove all files in the folder
        return prev.filter((path) => !folderFilePaths.includes(path));
      }
    });
  };

  const selectAllFiles = () => {
    const allFilePaths = files.map((file) => file.path);
    setSelectedFiles(allFilePaths);
  };

  const excludeAllFiles = () => {
    setSelectedFiles([]);
  };

  const combineFiles = () => {
    let combined = "";
    selectedFiles.forEach((filePath) => {
      const file = files.find((f) => f.path === filePath);
      if (file) {
        let fileContent = file.content;
        if (minified) {
          fileContent = fileContent.replace(/\s+/g, " ").trim();
        }
        if (includePath) {
          combined += `[path:${file.path}]\n${fileContent}\n\n`;
        } else {
          combined += `${fileContent}\n\n`;
        }
      }
    });
    return combined.trim();
  };

  const downloadTxtFile = () => {
    const element = document.createElement("a");
    const file = new Blob([outputText], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `${repoName.replace("/", "_")}.txt`;
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(outputText);
    toast({
      title: "Copied!",
      description: "Text copied to clipboard.",
    });
  };

  const [tokenCount, setTokenCount] = useState(0);

  useEffect(() => {
    const updateTokenCount = async () => {
      const count = await approximateTokenCount(outputText);
      setTokenCount(count);
    };

    updateTokenCount();
  }, [outputText, minified]);

  return (
    <div className="min-h-screen flex flex-col">
      <div
        className={cn(
          "w-full transition-all duration-1000 ease-in-out transform",
          files.length > 0
            ? "-translate-y-full opacity-0"
            : "translate-y-0 opacity-100"
        )}
      >
        <div className="text-center py-12 md:py-20 space-y-4 md:space-y-6 px-4">
          <h1 className="text-6xl md:text-9xl font-bold tracking-tight dark:text-white text-black">
            Git
            <span className="inline-block rotate-[10deg] text-transparent text-[1.2em] [-webkit-text-stroke:4px_#f35839] md:[-webkit-text-stroke:8px_#f35839]">
              2
            </span>
            Txt
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
            Convert Git repos to structured text for AI, with minification
            <span className="hidden md:inline"><br /></span>
            <span className="md:hidden"> </span>
            to save tokens.
          </p>
        </div>
      </div>

      <div
        className={cn(
          "container mx-auto p-4 space-y-4 transition-all duration-1000 ease-in-out transform absolute inset-x-0",
          files.length > 0 
            ? "translate-y-0 pt-2 md:px-[10%] md:pt-12" 
            : "translate-y-[40vh] md:translate-y-[50vh]"
        )}
      >
        <div
          className={cn(
            "transition-all duration-1000 ease-in-out transform",
            files.length > 0
              ? "w-full"
              : "w-full max-w-xl mx-auto px-4 md:px-0"
          )}
        >
          <Card className="w-full transition-all duration-1000 ease-in-out">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Git Repository to Text</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    window.open("https://github.com/dreamcatcher45/Git2Txt", "_blank")
                  }
                >
                  <Github className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={toggleTheme}>
                  {theme === "light" ? (
                    <Moon className="h-4 w-4" />
                  ) : (
                    <Sun className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <CardDescription>
                Enter a public Git repository URL to fetch its file structure.
              </CardDescription>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="url"
                  placeholder="https://github.com/user/repo"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={fetchFiles}
                  className="bg-primary hover:brightness-90 text-primary-foreground whitespace-nowrap"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Fetching...
                    </>
                  ) : (
                    "Fetch Files"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {files.length > 0 && (
          <div 
            className={cn(
              "grid grid-cols-1 gap-2 animate-in fade-in duration-1000 slide-in-from-bottom-4 mt-2",
              "[animation-delay:500ms]"
            )}
          >
            <Card className="col-span-1">
              <CardHeader>
                <CardTitle>File Selection</CardTitle>
                <CardDescription>
                  Select files to convert to text.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    {repoName || "No repository selected"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="select-all"
                      checked={selectedFiles.length === files.length}
                      onCheckedChange={(checked) =>
                        checked ? selectAllFiles() : excludeAllFiles()
                      }
                    />
                    <Label htmlFor="select-all" className="text-sm">
                      Select all files
                    </Label>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <DirectoryView
                      directory={structuredDir}
                      selectedFiles={selectedFiles}
                      toggleFileSelection={toggleFileSelection}
                      toggleFolderSelection={toggleFolderSelection}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="col-span-1 animate-in fade-in duration-500 slide-in-from-bottom-4 [animation-delay:200ms]">
                <CardHeader>
                  <CardTitle>Selection Summary</CardTitle>
                  <CardDescription>
                    Summary of selected files and options.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p>Selected Files: {selectedFiles.length}</p>
                  <p>Approximate Token Count: {tokenCount}</p>
                  <div className="flex items-center space-x-2 my-2">
                    <Switch
                      id="include-path"
                      checked={includePath}
                      onCheckedChange={(checked) => setIncludePath(checked)}
                    />
                    <Label htmlFor="include-path">Include File Path</Label>
                  </div>
                  <div className="flex items-center space-x-2 my-2">
                    <Switch
                      id="minify"
                      checked={minified}
                      onCheckedChange={async (checked) => {
                        setMinified(checked);
                      }}
                    />
                    <Label htmlFor="minify">Minify</Label>
                  </div>
                  <div className="rounded-md bg-muted/50 p-4 text-sm mt-4">
                    <p>
                      Tip: Exclude files like package-lock.json and other
                      irrelevant files to save tokens and improve context
                      quality.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-1 animate-in fade-in duration-500 slide-in-from-bottom-4 [animation-delay:400ms]">
                <CardHeader>
                  <CardTitle>Output</CardTitle>
                  <CardDescription>Combined text output.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Textarea
                    className="min-h-[150px]"
                    readOnly
                    value={outputText}
                  />
                  <div className="flex space-x-2">
                    <Button onClick={copyToClipboard}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                    <Button variant="secondary" onClick={downloadTxtFile}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
        <Toaster />
      </div>
    </div>
  );
}
