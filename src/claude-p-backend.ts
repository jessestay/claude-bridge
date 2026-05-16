import { spawn } from "child_process";

export interface ClaudePResponse {
  response: string;
  sessionId: string;
}

export async function queryClaudeP(
  message: string,
  sessionId: string,
  timeoutMs: number = 30000,
): Promise<ClaudePResponse> {
  return new Promise((resolve, reject) => {
    const args = ["-e", "claude", "-p", "--output-format", "json", "--session-id", sessionId];
    const proc = spawn("wsl", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`claude -p timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn claude -p: ${err.message}`));
    });

    proc.on("close", (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        reject(new Error(`claude -p exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        const text =
          parsed.result !== undefined
            ? String(parsed.result)
            : parsed.response !== undefined
              ? String(parsed.response)
              : stdout.trim();
        resolve({ response: text, sessionId });
      } catch {
        // If not JSON, use raw stdout
        if (stdout.trim()) {
          resolve({ response: stdout.trim(), sessionId });
        } else {
          reject(new Error(`claude -p returned empty output. stderr: ${stderr}`));
        }
      }
    });

    // Send message to stdin
    proc.stdin.write(message);
    proc.stdin.end();
  });
}
